import {sanitizeCoachHistory,coachAllowsEdits,type CoachTurn} from '../../src/circuit/coachContext';
import {selectAnswerFill} from '../../src/circuit/answerFill';
import {answerCircuit,asksToSolve,asksToFill} from '../../src/circuit/answer';
import {CircuitSchema,type CircuitDocument} from '../../src/circuit/schema';
import {normalizeRecognition,normalizeVisualInventory,type VisualInventory} from '../../src/circuit/recognition';
import {solve} from '../../src/circuit/solver';
import {applyOperations,OperationsSchema} from '../../src/circuit/operations';
import {parsePrompt,coachPrompt,inventoryAuditPrompt,editorExtensions} from './prompts';
import {alignComponentIds} from './visualAudit';
import {reconcileVisionConsensus} from './visionConsensus';
import type {ContactRaster,ContactCandidate,ContactRegion} from '../../src/circuit/contactVision';

export type Progress={stage:string;attempt:number};
export type Outcome={status:number;body:Record<string,unknown>};
type Options={key:string;text:string;problemText?:string;history?:CoachTurn[];selectedId?:string;needsReview?:boolean;deadline?:number;image?:string;imageDetail?:string;diagramImage?:string;diagramRegion?:ContactRegion;knownInventory?:VisualInventory;contactRaster?:ContactRaster;contactCandidates?:ContactCandidate[];document?:CircuitDocument;requestId:string;signal?:AbortSignal;consume:()=>Promise<boolean>;onProgress?:(progress:Progress)=>void;onCandidates?:(primary:CircuitDocument|null,audit:VisualInventory|null,reviewer?:CircuitDocument|VisualInventory|null)=>void};
const failure=(code:string,error:string,status:number,requestId:string,retryable=false):Outcome=>({status,body:{code,error,requestId,retryable}});
const messages:Record<string,{status:number;text:string}>={
 TIMEOUT:{status:504,text:'识别等待超时。图片已保留，请点击重试；这不表示电路过于复杂。'},
 EMPTY_OUTPUT:{status:502,text:'AI本次没有返回可用的识别结果。图片已保留，请重试。'},
 OUTPUT_TRUNCATED:{status:502,text:'AI的识别结果没有完整返回。图片已保留，请重试，或只截取电路和题干。'},
 UPSTREAM_INTERRUPTED:{status:503,text:'AI推理服务暂时繁忙，识别被中断。请稍后重试。'},
 PROVIDER_RATE_LIMIT:{status:503,text:'DeepSeek 服务暂时限流，请稍后重试。'},
 INVALID_GRAPH:{status:422,text:'识别出的元件或连接还未通过核验。请补充不清楚的连接；这不表示不支持多开关电路。'},
 INVALID_OUTPUT:{status:502,text:'AI返回的识别结果格式不完整，已保留当前实验，请重试。'},
 NETWORK:{status:502,text:'服务器与AI服务的连接暂时中断，图片已保留，请稍后重试。'}
};

/** Text/chat recover once; image passes run independently and reconcile before acceptance. */
async function runSingleInference(options:Options&{inventoryAudit?:boolean;maxAttempts?:number;fast?:boolean;recoverTruncation?:boolean;topologyOnly?:boolean;independentGraph?:boolean;effort?:'low'|'high'}):Promise<Outcome>{
 const {key,text,image,document,requestId,signal,onProgress}=options,chat=!!document,start=Date.now();
 let code='INVALID_OUTPUT',repair='';
 for(let attempt=1;attempt<=(options.maxAttempts??2);attempt++){
  if(signal?.aborted)return failure('CANCELLED','已取消本次识别。',499,requestId);
  if(attempt===2){if(Date.now()-start>110000)break;if(!await options.consume())break;}
  onProgress?.({stage:attempt===1?(chat?'正在结合当前电路处理问题':'正在识别元件与节点连接'):'首轮结果未完整通过核验，正在自动恢复一次',attempt});
  const content:unknown[]=[{type:'text',text:chat?JSON.stringify({request:text,recentConversation:sanitizeCoachHistory(options.history),focusedComponentId:options.selectedId,candidateNeedsReview:options.needsReview===true,originalProblemText:options.problemText??document.problemText,currentCircuit:{measurements:document.measurements,title:document.title,nodes:document.nodes.map(n=>n.id),components:document.components.map(({id,type,a,b,value,closed,parameters,terminals})=>({id,type,a,b,value,closed,parameters,terminals}))},solver:solve(document)}):text||'提取这张图的实际电路拓扑。开关断开和未知参数都正常保留，不需要计算题目答案。'}];
  const cropped=!chat&&!options.inventoryAudit&&!options.independentGraph&&!!options.diagramImage&&!!options.diagramRegion;
  if(image)content.push({type:'image_url',image_url:{url:cropped?options.diagramImage!:image,detail:'high'}});
  if(options.knownInventory&&!options.inventoryAudit)content.push({type:'text',text:'完整原题中独立读取的元件标号与明确给定参数（null保持未知；这不是计算结果，不包含题干后续开关操作）。请按图核对元件并保留这些值，只追踪实际端子与回线：'+JSON.stringify(options.knownInventory.components.map(({id,type,value,labelVisible,parameters,rawValue,rawUnit})=>({id,type,value,labelVisible,parameters,rawValue,rawUnit})))});
  if(options.independentGraph&&options.diagramImage){content.push({type:'text',text:'下一张是同一题目的完整电路区域放大图，核对全部支路、带方向元件和回线。数值仍只取原图明确给定值，不从条件推导。'});content.push({type:'image_url',image_url:{url:options.diagramImage,detail:'high'}});}
  if(options.imageDetail&&!options.independentGraph&&!options.inventoryAudit){content.push({type:'text',text:'下一张是同一原图的电路局部放大细节。请实际查看开关触点是否接触：水平刀片接到另一端为闭合，斜刀片离开另一端为断开。完整接线与给定值仍读取第一张；不要执行正文中的后续操作。'});content.push({type:'image_url',image_url:{url:options.imageDetail,detail:'high'}});}
  if(options.contactCandidates?.length){const region=options.diagramRegion;const candidates=options.contactCandidates.map((c,index)=>({candidateIndex:index,pivot:cropped?{x:Math.round((c.pivot.x-region!.x)/region!.width*1000),y:Math.round((c.pivot.y-region!.y)/region!.height*1000)}:{x:Math.round(c.pivot.x),y:Math.round(c.pivot.y)}})).filter(c=>c.pivot.x>=0&&c.pivot.x<=1000&&c.pivot.y>=0&&c.pivot.y<=1000);content.push({type:'text',text:'像素程序发现的圆形位置候选，相对于本条第一张图归一化0..1000（可能包括文字圆洞，不表示通断或元件ID）：'+JSON.stringify(candidates)+'。观察真正的开关标号，选对应candidateIndex，不要按列表顺序猜。'});}
  if(repair)content.push({type:'text',text:`上一次返回需要修正：${repair}。请简洁返回完整JSON，先追踪真实节点；不要计算实验答案。`});
  const timerAbort=new AbortController(),remaining=Math.min(120000-(Date.now()-start),(options.deadline??Infinity)-Date.now()),attemptTimeout=Math.min(attempt===1?75000:45000,remaining);
  if(remaining<=0)return failure('TIMEOUT',messages.TIMEOUT.text,504,requestId,true);
  const timer=setTimeout(()=>timerAbort.abort(),attemptTimeout);let phase='connect';
  try{
   let system=chat?coachPrompt+editorExtensions:options.inventoryAudit?inventoryAuditPrompt:parsePrompt;
   if(!chat&&!options.inventoryAudit&&options.contactCandidates?.length)system+='\n本次特别规则优先于上面的通用开关格式：已有像素候选，switch仅返回id、type、a、b、value:null、labelVisible和candidateIndex。省略closed和stateObservation，不分析通断、不重新估算坐标。初始通断由像素程序判断。仍要保留开关两端不同节点和全部元件，不合并闭合开关。';
   if(!chat&&!options.inventoryAudit&&options.knownInventory)system+='\n紧凑输出：只返回title、nodes、components中id/type/a/b/value，spdt额外保留terminals/parameters，普通switch保留candidateIndex。不要重复rawValue/rawUnit/evidence/measurements等元数据，不写题干摘要或长解释，它们已由独立元件读取阶段保留。';
   if(options.topologyOnly||options.independentGraph)system+='\n每个器件visibleLabel填写实际印出的器件标号原文，没有则null；4k等是数值不是标号。电表圆内A/V仅类型不是唯一编号，未标号电表使用A1/VM1。斜箭头穿过电池是可调电源，不是双掷开关。';
   if(options.inventoryAudit)system+='\nuncertainties只能记录看不清的元件类型、标号、数值、单位或开关候选对应，不能判断接线或支路；接线由另外任务独立追踪。必须完整读取题干中的每条已知电流、电压及其对应的开关条件到measurements，即使元件的value未知也不能遗漏测量条件。例“只闭合S1时R1电流0.3A，再闭合S2后0.5A”应保留两条R1/current，条件分别S1:true,S2:false及S1:true,S2:true；绝不据此计算电源或电阻。保留图上单独印出的C、K、R等实际标号，不能自行加1。每个器件给visibleLabel为确实印出的唯一器件标号原文，没有则null；电表圆圈内A/V只是器件符号不是编号，4k等是数值不是R编号。未标号电表A1/VM1并visibleLabel:null；未标号R按上到下左到右，不能虚构R1字样。斜箭头穿过电池代表可调电源，不是开关；没有实际开关不要输出关于找不到开关候选或接线的uncertainties。';
   if(options.topologyOnly)system+='\n本次只追踪图中端子连接：输出最简title/nodes/components/confidence/uncertainties，components仅id/type/a/b/value:null/labelVisible/visibleLabel，spdt保留terminals/parameters.throw，switch保留candidateIndex。所有value都用null；图中数值由独立读取任务核对，不要从文字或数值推导节点，不输出measurements或长解释。';
   if(options.independentGraph)system+='\n你是独立的接线核验者，未收到其他候选答案。先从电源负极沿每一条连续导线反向追踪全部器件端子，再核对正极回路、分流/汇流和仪表跨接。返回紧凑完整JSON，只含title/nodes/components/confidence/uncertainties；每个元件id/type/a/b/value/labelVisible，以及确实可见的rawValue/rawUnit和parameters。未知value:null，不能推算。开关后续操作不改变图示接线。';
   const upstream=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'system',content:system},{role:'user',content}],response_format:{type:'json_object'},thinking:{type:options.fast?'disabled':'enabled'},reasoning_effort:options.effort??'low',max_tokens:options.recoverTruncation?20000:chat?5000:options.inventoryAudit?9000:options.topologyOnly?8000:14000}),signal:signal?AbortSignal.any([signal,timerAbort.signal]):timerAbort.signal});
   if(!upstream.ok){
    const status=upstream.status;
    if(status===401||status===403)return failure('AUTH','AI服务授权失效，请联系维护者；当前实验与图片已保留。',502,requestId);
    if(status===402)return failure('BALANCE','AI服务余额不足；你仍可使用本地示例和调参。',503,requestId);
    if(status===429){code='PROVIDER_RATE_LIMIT';repair='提供者暂时限流，请重新返回完整结果';continue;}
    if(status>=500){code='UPSTREAM_INTERRUPTED';repair='推理服务暂时繁忙，请重新返回完整结果';continue;}
    return failure('UPSTREAM_REQUEST','AI服务未接受此次请求，请换一张清晰的电路截图后重试。',502,requestId);
   }
   phase='decode';
   let data:{model?:string;choices?:{finish_reason?:string;message?:{content?:string}}[];usage?:{prompt_tokens?:number;completion_tokens?:number}};
   try{data=await upstream.json();}catch{code='INVALID_OUTPUT';repair='返回的响应不完整';continue;}
   if(!data||typeof data!=='object'||Array.isArray(data)){code='INVALID_OUTPUT';repair='响应结构不是有效对象';continue;}
   const choice=data.choices?.[0],finishReason=choice?.finish_reason;
   console.info(JSON.stringify({event:'ai_attempt',requestId,pass:options.inventoryAudit?'inventory-audit':options.independentGraph?'independent-topology':'primary',strategy:options.fast?'direct-vision':'focused-review',attempt,finishReason:finishReason??'missing',durationMs:Date.now()-start,promptTokens:data.usage?.prompt_tokens,completionTokens:data.usage?.completion_tokens}));
   if(finishReason==='length'){code='OUTPUT_TRUNCATED';repair='输出被截断，只保留最简完整节点与元件JSON';continue;}
   if(['aborted','insufficient_system_resource'].includes(finishReason??'')){code='UPSTREAM_INTERRUPTED';repair='上次生成在模型端中断';continue;}
   if(finishReason==='content_filter')return failure('CONTENT_FILTER','AI服务没有处理这张图片。请只截取电路题区域后重试。',422,requestId);
   const body=choice?.message?.content;
   if(body!==null&&body!==undefined&&typeof body!=='string'){code='INVALID_OUTPUT';repair='正文必须是JSON字符串';continue;}
   const raw=body?.trim();
   if(!raw){code='EMPTY_OUTPUT';repair='没有返回JSON正文，请输出完整电路JSON而非空白';continue;}
   let result:unknown;try{result=JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{code='INVALID_OUTPUT';repair='JSON格式不完整';continue;}
   onProgress?.({stage:'已收到识别结果，正在核验端子连接与参数',attempt});
   const meta={model:data.model??'deepseek-flash',durationMs:Date.now()-start,requestId,attempts:attempt};
   if(options.inventoryAudit){try{return {status:200,body:{inventory:normalizeVisualInventory(result),...meta}};}catch{code='INVALID_OUTPUT';repair='只返回元件id、type、独立value和开关candidateIndex列表';continue;}}
   if(chat){
    const r=result as {reply?:unknown;operations?:unknown};
    if(!r||typeof r.reply!=='string'||r.reply.length>5000){code='INVALID_OUTPUT';repair='回复必须包含reply和operations';continue;}
    const ops=OperationsSchema.safeParse(r.operations??[]);if(!ops.success){code='INVALID_GRAPH';repair='operations字段不符合允许的操作格式';continue;}
    if(ops.data.length&&!coachAllowsEdits(text)){code='INVALID_OUTPUT';repair='用户只要求读取、解释或核对，不允许修改。重新回答用户的原问题，operations必须为空数组，不声称修改已完成';continue;}
    let next:CircuitDocument|null=null;try{if(ops.data.length&&coachAllowsEdits(text))next=applyOperations(document,ops.data);}catch{code='INVALID_GRAPH';repair='修改后的元件ID或节点引用无效';continue;}
    const solved=next?solve(next):null;return {status:200,body:{reply:r.reply+(solved?.ok&&solved.totalCurrent!==null?`\n修改草案求解：总电流 ${Number(solved.totalCurrent.toPrecision(5))} A。确认应用后更新实验。`:''),document:next,...meta}};
   }
   let graph:CircuitDocument;
   try{graph=normalizeRecognition(result,image?'image':'text');}catch{code='INVALID_GRAPH';repair='元件ID、a/b节点引用或数值单位没有通过核验；同一节点ID需一致，未知数值用null';continue;}
   const solution=solve(graph),uncertain=[...graph.uncertainties];
   if(!solution.ok&&!graph.components.some(c=>['source','resistor','rheostat'].includes(c.type)&&c.value===null))uncertain.push(solution.reason??'接线需要核验。');
   if(solution.ok&&solution.totalCurrent!==null&&solution.totalCurrent<1e-10&&graph.components.every(c=>['source','resistor','rheostat','switch','fuse','wire','ammeter','voltmeter'].includes(c.type))&&graph.components.some(c=>c.type==='source'&&c.value!==null&&c.value!==0)&&!graph.components.some(c=>['switch','fuse'].includes(c.type)&&!c.closed))uncertain.push('当前识别未形成导通回路，请对照原图核验回线与节点。');
   return {status:200,body:{document:CircuitSchema.parse({...graph,uncertainties:[...new Set(uncertain)].slice(0,16)}),...meta}};
  }catch(e){
   if(signal?.aborted)return failure('CANCELLED','已取消本次识别。',499,requestId);
   const name=e instanceof Error?e.name:'';
   code=timerAbort.signal.aborted||name==='TimeoutError'||name==='AbortError'?'TIMEOUT':phase==='connect'?'NETWORK':'INVALID_OUTPUT';repair=code==='TIMEOUT'?'上一次识别等待超时，请简洁输出拓扑JSON':code==='NETWORK'?'上一次服务连接中断':'上一次响应结构不完整';
   console.info(JSON.stringify({event:'ai_attempt_error',requestId,attempt,code,durationMs:Date.now()-start}));
  }finally{clearTimeout(timer);}
 }
 const message=messages[code]??messages.INVALID_OUTPUT;return failure(code,message.text,message.status,requestId,true);
}

export async function runInference(options:Options):Promise<Outcome>{
 if(options.document&&asksToSolve(options.text)){
  if(options.needsReview)return {status:200,body:{reply:'请先对照原图确认识别中的接线和初始开关状态，再让我计算；这样不会把识别草图当成已确认的电路。',document:null,autoApply:false,requestId:options.requestId}};
  let doc=options.document,result=answerCircuit(doc);
  if(options.image&&(!result.document||doc.components.some(c=>c.valueSource==='user'))){
   const extracted=await runSingleInference({...options,document:undefined,text:'只提取原题的明确元件参数、已知测量及对应开关条件；待求量留空，不计算答案。'+(options.problemText??''),inventoryAudit:true,fast:true,maxAttempts:1});
   const inventory=extracted.body.inventory as VisualInventory|undefined;
   if(inventory?.measurements?.length){
    const conflicts=inventory.components.filter(c=>c.value!==null).some(c=>{const current=doc.components.find(v=>v.id===c.id);return current&&current.value!==null&&Math.abs(current.value-c.value!)>1e-8;});
    if(conflicts)return {status:200,body:{reply:'当前参数与原题给定值不同。请先恢复原题参数，再让我按原题解答。',document:null,autoApply:false,requestId:options.requestId}};
    const valid=inventory.measurements.filter(m=>doc.components.some(c=>c.id===m.targetId)&&Object.keys(m.conditions).every(id=>doc.components.some(c=>c.id===id&&c.type==='switch')));
    doc=CircuitSchema.parse({...doc,measurements:[...doc.measurements,...valid.filter(m=>!doc.measurements.some(v=>v.id===m.id))],components:doc.components.map(c=>{const given=inventory.components.find(v=>v.id===c.id&&v.type===c.type);return c.value===null&&given?.value!=null?{...c,value:given.value,valueSource:'given'}:asksToFill(options.text)&&c.valueSource==='user'&&given?.value===null&&['source','resistor','rheostat'].includes(c.type)?{...c,value:null,valueSource:'unknown'}:c;})});result=answerCircuit(doc);
   }
  }
  const fill=asksToFill(options.text);
  if(fill&&result.document){const selected=selectAnswerFill(options.document,result.document,options.text,options.selectedId);if(selected.error)return {status:200,body:{reply:selected.error,document:null,autoApply:false,requestId:options.requestId}};result={...result,document:selected.document,reply:result.reply+(selected.restricted?' 本次仅填写 '+selected.targetIds.join('、')+'。':'')};}
  return {status:200,body:{reply:result.reply+(result.document&&fill?' 已填入右侧，可继续调参。':result.document?' 如需填入，请说“帮我解题并填入答案”。':''),document:fill?result.document:null,autoApply:!!result.document&&fill,requestId:options.requestId}};
 }

 if(!options.image||options.document)return runSingleInference(options);
 const started=Date.now();let calls=0;
 const reserve=async()=>{if(calls>=4||options.signal?.aborted)return false;const first=calls++===0;return first||options.consume();};
 const unavailable=()=>failure('CANCELLED','本次识别未完成。',499,options.requestId);
 const pass=async(extra:Parameters<typeof runSingleInference>[0])=>await reserve()?runSingleInference({...extra,deadline:started+115000}):unavailable();
 options.onProgress?.({stage:'正在并行读取题目、追踪接线并独立复核',attempt:1});
 // No output from one pass is given to another: three tasks overlap network and model time.
 const [ocr,primary,independent]=await Promise.all([
  pass({...options,text:'独立读取图中元件、明确给定值和每个测量条件，将开关标号对应到候选序号。不追踪节点、不解题。'+(options.text?'用户补充题目数据：'+options.text:''),inventoryAudit:true,fast:true,maxAttempts:1,onProgress:undefined}),
  pass({...options,text:'只追踪原始电路图的元件端子和连续导线，保留每个支路及回线。不求解、不填数值。',topologyOnly:true,fast:false,maxAttempts:1,onProgress:undefined}),
  pass({...options,text:'独立核对原始电路图的所有真实端子、支路、极性和明确数值。不求解题目，不执行后续操作。'+(options.text?'用户补充数据（不能据此改变图示初态）：'+options.text:''),independentGraph:true,fast:false,maxAttempts:1,onProgress:undefined})
 ]);
 if(options.signal?.aborted)return unavailable();
 const readGraph=(out:Outcome)=>{const d=out.status===200?CircuitSchema.safeParse(out.body.document):null;return d?.success?d.data:null;};
 let inventory=ocr.status===200?ocr.body.inventory as VisualInventory:null;
 let graph=readGraph(primary),other=readGraph(independent),reviewer:CircuitDocument|VisualInventory|null=other;
 let doc=graph?reconcileVisionConsensus(graph,other,inventory,options.contactRaster,options.contactCandidates):other?reconcileVisionConsensus(other,null,inventory,options.contactRaster,options.contactCandidates):null;
 if((!doc||!doc.verification?.topologyMatched||!inventory)&&![ocr,primary,independent].some(out=>['AUTH','BALANCE','CONTENT_FILTER'].includes(String(out.body.code)))){
  options.onProgress?.({stage:'发现核验分歧，正在对照原图检查具体接线',attempt:4});
  if(!inventory){
   const retry=await pass({...options,text:'重新独立读取原图元件、明确给定数值及测量条件，不求解，不追踪节点。'+options.text,inventoryAudit:true,fast:false,recoverTruncation:ocr.body.code==='OUTPUT_TRUNCATED',maxAttempts:1,onProgress:undefined});
   if(retry.status===200){inventory=retry.body.inventory as VisualInventory;reviewer=inventory;}
  }else{
   const retry=await pass({...options,text:'从原图重新逐线核对接点和每个元件端子，重点区分跨线不相连、旁路、电表支路、电源极性和第三接点。不要假设所有元件串联，不求解。'+(options.text?'用户补充：'+options.text:''),independentGraph:true,fast:false,effort:'high',recoverTruncation:primary.body.code==='OUTPUT_TRUNCATED'||independent.body.code==='OUTPUT_TRUNCATED',maxAttempts:1,onProgress:undefined});
   const checked=readGraph(retry);reviewer=checked??reviewer;
   if(checked){if(graph&&alignComponentIds(graph,checked)){other=checked;}else if(other&&alignComponentIds(other,checked)){graph=other;other=checked;}else if(!graph){graph=checked;}}
  }
  doc=graph?reconcileVisionConsensus(graph,other,inventory,options.contactRaster,options.contactCandidates):other?reconcileVisionConsensus(other,null,inventory,options.contactRaster,options.contactCandidates):null;
 }
 options.onCandidates?.(graph,inventory,reviewer);
 if(!doc)return [primary,independent,ocr].find(out=>out.status!==200)??failure('INVALID_GRAPH',messages.INVALID_GRAPH.text,422,options.requestId,true);
 options.onProgress?.({stage:'正在完成接线、触点像素和数值一致性核验',attempt:calls});
 return {status:200,body:{document:doc,model:'deepseek-flash',requestId:options.requestId,durationMs:Date.now()-started,attempts:calls,topologyStrategy:'parallel-independent-vision'}};
}
