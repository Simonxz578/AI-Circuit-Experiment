import {CircuitSchema,type CircuitDocument} from '../../src/circuit/schema';
import {normalizeRecognition,normalizeVisualInventory,type VisualInventory} from '../../src/circuit/recognition';
import {solve} from '../../src/circuit/solver';
import {applyOperations,OperationsSchema} from '../../src/circuit/operations';
import {parsePrompt,coachPrompt,inventoryAuditPrompt,editorExtensions} from './prompts';
import {reconcileVisualInventory} from './visualAudit';
import type {ContactRaster,ContactCandidate,ContactRegion} from '../../src/circuit/contactVision';

export type Progress={stage:string;attempt:number};
export type Outcome={status:number;body:Record<string,unknown>};
type Options={key:string;text:string;image?:string;imageDetail?:string;diagramImage?:string;diagramRegion?:ContactRegion;knownInventory?:VisualInventory;contactRaster?:ContactRaster;contactCandidates?:ContactCandidate[];document?:CircuitDocument;requestId:string;signal?:AbortSignal;consume:()=>Promise<boolean>;onProgress?:(progress:Progress)=>void;onCandidates?:(primary:CircuitDocument|null,audit:VisualInventory|null,reviewer?:CircuitDocument|VisualInventory|null)=>void};
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

/** Text/chat recover once. Images separate full-page inventory, cropped topology and pixel checks within three calls. */
async function runSingleInference(options:Options&{inventoryAudit?:boolean;maxAttempts?:number;fast?:boolean;recoverTruncation?:boolean}):Promise<Outcome>{
 const {key,text,image,document,requestId,signal,onProgress}=options,chat=!!document,start=Date.now();
 let code='INVALID_OUTPUT',repair='';
 for(let attempt=1;attempt<=(options.maxAttempts??2);attempt++){
  if(signal?.aborted)return failure('CANCELLED','已取消本次识别。',499,requestId);
  if(attempt===2){if(Date.now()-start>110000)break;if(!await options.consume())break;}
  onProgress?.({stage:attempt===1?(chat?'正在结合当前电路处理问题':'正在识别元件与节点连接'):'首轮结果未完整通过核验，正在自动恢复一次',attempt});
  const content:unknown[]=[{type:'text',text:chat?JSON.stringify({request:text,currentCircuit:{measurements:document.measurements,title:document.title,nodes:document.nodes.map(n=>n.id),components:document.components.map(({id,type,a,b,value,closed,parameters,terminals})=>({id,type,a,b,value,closed,parameters,terminals}))},solver:solve(document)}):text||'提取这张图的实际电路拓扑。开关断开和未知参数都正常保留，不需要计算题目答案。'}];
  const cropped=!chat&&!options.inventoryAudit&&!!options.diagramImage&&!!options.diagramRegion;
  if(image)content.push({type:'image_url',image_url:{url:cropped?options.diagramImage!:image,detail:'high'}});
  if(options.knownInventory&&!options.inventoryAudit)content.push({type:'text',text:'完整原题中独立读取的元件标号与明确给定参数（null保持未知；这不是计算结果，不包含题干后续开关操作）。请按图核对元件并保留这些值，只追踪实际端子与回线：'+JSON.stringify(options.knownInventory.components.map(({id,type,value,labelVisible,parameters,rawValue,rawUnit})=>({id,type,value,labelVisible,parameters,rawValue,rawUnit})))});
  if(options.imageDetail){content.push({type:'text',text:'下一张是同一原图的电路局部放大细节。请实际查看开关触点是否接触：水平刀片接到另一端为闭合，斜刀片离开另一端为断开。完整接线与给定值仍读取第一张；不要执行正文中的后续操作。'});content.push({type:'image_url',image_url:{url:options.imageDetail,detail:'high'}});}
  if(options.contactCandidates?.length){const region=options.diagramRegion;const candidates=options.contactCandidates.map((c,index)=>({candidateIndex:index,pivot:cropped?{x:Math.round((c.pivot.x-region!.x)/region!.width*1000),y:Math.round((c.pivot.y-region!.y)/region!.height*1000)}:{x:Math.round(c.pivot.x),y:Math.round(c.pivot.y)}})).filter(c=>c.pivot.x>=0&&c.pivot.x<=1000&&c.pivot.y>=0&&c.pivot.y<=1000);content.push({type:'text',text:'像素程序发现的圆形位置候选，相对于本条第一张图归一化0..1000（可能包括文字圆洞，不表示通断或元件ID）：'+JSON.stringify(candidates)+'。观察真正的开关标号，选对应candidateIndex，不要按列表顺序猜。'});}
  if(repair)content.push({type:'text',text:`上一次返回需要修正：${repair}。请简洁返回完整JSON，先追踪真实节点；不要计算实验答案。`});
  const timerAbort=new AbortController(),remaining=120000-(Date.now()-start),attemptTimeout=Math.min(attempt===1?75000:45000,remaining);
  const timer=setTimeout(()=>timerAbort.abort(),attemptTimeout);let phase='connect';
  try{
   let system=chat?coachPrompt+editorExtensions:options.inventoryAudit?inventoryAuditPrompt:parsePrompt;
   if(!chat&&!options.inventoryAudit&&options.contactCandidates?.length)system+='\n本次特别规则优先于上面的通用开关格式：已有像素候选，switch仅返回id、type、a、b、value:null、labelVisible和candidateIndex。省略closed和stateObservation，不分析通断、不重新估算坐标。初始通断由像素程序判断。仍要保留开关两端不同节点和全部元件，不合并闭合开关。';
   if(!chat&&!options.inventoryAudit&&options.knownInventory)system+='\n紧凑输出：只返回title、nodes、components中id/type/a/b/value，spdt额外保留terminals/parameters，普通switch保留candidateIndex。不要重复rawValue/rawUnit/evidence/measurements等元数据，不写题干摘要或长解释，它们已由独立元件读取阶段保留。';
   const upstream=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'system',content:system},{role:'user',content}],response_format:{type:'json_object'},thinking:{type:options.fast?'disabled':'enabled'},reasoning_effort:'low',max_tokens:options.recoverTruncation?20000:chat?5000:options.inventoryAudit?7000:12000}),signal:signal?AbortSignal.any([signal,timerAbort.signal]):timerAbort.signal});
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
   console.info(JSON.stringify({event:'ai_attempt',requestId,pass:options.inventoryAudit?'inventory-audit':'primary',strategy:options.fast?'direct-vision':'focused-review',attempt,finishReason:finishReason??'missing',durationMs:Date.now()-start,promptTokens:data.usage?.prompt_tokens,completionTokens:data.usage?.completion_tokens}));
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
    let next:CircuitDocument|null=null;try{if(ops.data.length)next=applyOperations(document,ops.data);}catch{code='INVALID_GRAPH';repair='修改后的元件ID或节点引用无效';continue;}
    const solved=next?solve(next):null;return {status:200,body:{reply:r.reply+(solved?.ok&&solved.totalCurrent!==null?`\n修改草案求解：总电流 ${Number(solved.totalCurrent.toPrecision(5))} A。确认应用后更新实验。`:''),document:next,...meta}};
   }
   let graph:CircuitDocument;
   try{graph=normalizeRecognition(result,image?'image':'text');}catch{code='INVALID_GRAPH';repair='元件ID、a/b节点引用或数值单位没有通过核验；同一节点ID需一致，未知数值用null';continue;}
   const solution=solve(graph),uncertain=[...graph.uncertainties];
   if(!solution.ok&&!graph.components.some(c=>['source','resistor','rheostat'].includes(c.type)&&c.value===null))uncertain.push(solution.reason??'接线需要核验。');
   if(solution.ok&&solution.totalCurrent!==null&&solution.totalCurrent<1e-10&&graph.components.some(c=>c.type==='source'&&c.value!==null&&c.value!==0)&&!graph.components.some(c=>['switch','fuse'].includes(c.type)&&!c.closed))uncertain.push('当前识别未形成导通回路，请对照原图核验回线与节点。');
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
 if(!options.image||options.document)return runSingleInference(options);
 const started=Date.now();let calls=1;
 const reserve=async()=>{if(calls>=3||options.signal?.aborted)return false;calls++;return options.consume();};
 options.onProgress?.({stage:'正在识别接线，并独立核对元件与触点',attempt:1});
 const second=await runSingleInference({...options,text:'独立读取图中元件与明确给定值，将开关标号对应到候选序号。不要追踪节点、判断通断或求解题目。'+(options.text?'用户补充题目数据：'+options.text:''),inventoryAudit:true,fast:true,maxAttempts:1,consume:reserve,onProgress:undefined});
 const observed=second.status===200?second.body.inventory as VisualInventory:null;
 options.onProgress?.({stage:'正在核对实际接线与图中触点',attempt:2});
 const first=await reserve()?await runSingleInference({...options,text:'只将原始电路图转换成实际元件端子连接。不要解题或执行后续操作。',knownInventory:observed??undefined,fast:false,maxAttempts:1,consume:reserve,onProgress:undefined}):failure('CANCELLED','本次识别未完成。',499,options.requestId);
 if(options.signal?.aborted)return failure('CANCELLED','已取消本次识别。',499,options.requestId);
 const parsed=first.status===200?CircuitSchema.safeParse(first.body.document):null;let graph=parsed?.success?parsed.data:null,inventory=(second?.status===200?second.body.inventory:null) as VisualInventory|null,reviewer:CircuitDocument|VisualInventory|null=null;
 let doc=graph?reconcileVisualInventory(graph,inventory,options.contactRaster,options.contactCandidates):null;
 const scopeOnly=doc&&doc.verification?.inventoryMatched&&doc.components.filter(c=>c.type==='switch').every(c=>c.stateSource==='diagram')&&doc.components.some(c=>['lamp','led','capacitor','inductor','diode','ac_source','unsupported'].includes(c.type));
 if((!doc||doc.verification?.status!=='matched'&&!scopeOnly)&&!['AUTH','BALANCE','CONTENT_FILTER'].includes(String(first.body.code))&&await reserve()){
  options.onProgress?.({stage:'发现识别分歧，正在针对原图复核一次',attempt:calls});
  const needsGraph=!graph||doc?.verification?.topologyGuard==='open-path',request=needsGraph?'请仅对照原图重新追踪元件两端和回线，不求解题目，不新增不存在的导线。'+(graph?'上轮候选即使全部开关闭合也没有电源回路；候选不是答案，请核对并修正其中错误的端子：'+JSON.stringify({nodes:graph.nodes.map(n=>n.id),components:graph.components.map(({id,type,a,b})=>({id,type,a,b}))}):''):'仅重新核对元件、独立数值和开关候选序号，不追踪接线，不判断通断，不求解题目。';
  const review=await runSingleInference({...options,text:request,knownInventory:observed??undefined,inventoryAudit:!needsGraph,fast:false,recoverTruncation:!graph&&first.body.code==='OUTPUT_TRUNCATED',maxAttempts:1,consume:reserve,onProgress:undefined});
  if(review.status===200){if(needsGraph){const candidate=CircuitSchema.safeParse(review.body.document);if(candidate.success){graph=candidate.data;reviewer=graph;doc=reconcileVisualInventory(graph,inventory,options.contactRaster,options.contactCandidates);}}
   else{const verified=review.body.inventory as VisualInventory;reviewer=verified;const revised=reconcileVisualInventory(graph!,verified,options.contactRaster,options.contactCandidates);if(revised.verification?.status==='matched'||!inventory){doc=revised;inventory=verified;}}}
 }
 options.onCandidates?.(graph,(second?.status===200?second.body.inventory:null) as VisualInventory|null,reviewer);
 if(!doc)return first;
 options.onProgress?.({stage:'正在完成触点像素和参数核验',attempt:calls});
 return {status:200,body:{document:doc,model:'deepseek-flash',requestId:options.requestId,durationMs:Date.now()-started,attempts:calls,topologyStrategy:options.diagramImage?'reasoned-diagram':'reasoned-original'}};
}
