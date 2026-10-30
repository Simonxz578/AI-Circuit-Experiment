import {CircuitSchema,type CircuitDocument} from '../../src/circuit/schema';
import {normalizeRecognition} from '../../src/circuit/recognition';
import {solve} from '../../src/circuit/solver';
import {applyOperations,OperationsSchema} from '../../src/circuit/operations';
import {parsePrompt,coachPrompt} from './prompts';

export type Progress={stage:string;attempt:number};
export type Outcome={status:number;body:Record<string,unknown>};
type Options={key:string;text:string;image?:string;document?:CircuitDocument;requestId:string;signal?:AbortSignal;consume:()=>Promise<boolean>;onProgress?:(progress:Progress)=>void};
const failure=(code:string,error:string,status:number,requestId:string,retryable=false):Outcome=>({status,body:{code,error,requestId,retryable}});
const messages:Record<string,{status:number;text:string}>={
 TIMEOUT:{status:504,text:'识别等待超时。图片已保留，请点击重试；这不表示电路过于复杂。'},
 EMPTY_OUTPUT:{status:502,text:'AI本次没有返回可用的识别结果。图片已保留，请重试。'},
 OUTPUT_TRUNCATED:{status:502,text:'AI的识别结果没有完整返回。图片已保留，请重试，或只截取电路和题干。'},
 UPSTREAM_INTERRUPTED:{status:503,text:'AI推理服务暂时繁忙，识别被中断。请稍后重试。'},
 INVALID_GRAPH:{status:422,text:'识别出的元件或连接还未通过核验。请补充不清楚的连接；这不表示不支持多开关电路。'},
 INVALID_OUTPUT:{status:502,text:'AI返回的识别结果格式不完整，已保留当前实验，请重试。'},
 NETWORK:{status:502,text:'服务器与AI服务的连接暂时中断，图片已保留，请稍后重试。'}
};

/** At most two paid attempts; every attempt counts against the persistent quota. */
export async function runInference(options:Options):Promise<Outcome>{
 const {key,text,image,document,requestId,signal,onProgress}=options,chat=!!document,start=Date.now();
 let code='INVALID_OUTPUT',repair='';
 for(let attempt=1;attempt<=2;attempt++){
  if(signal?.aborted)return failure('CANCELLED','已取消本次识别。',499,requestId);
  if(attempt===2){if(Date.now()-start>110000)break;if(!await options.consume())break;}
  onProgress?.({stage:attempt===1?(chat?'正在结合当前电路处理问题':'正在识别元件与节点连接'):'首轮结果未完整通过核验，正在自动恢复一次',attempt});
  const content:unknown[]=[{type:'text',text:chat?JSON.stringify({request:text,currentCircuit:{title:document.title,nodes:document.nodes.map(n=>n.id),components:document.components.map(({id,type,a,b,value,closed})=>({id,type,a,b,value,closed}))},solver:solve(document)}):text||'提取这张图的实际电路拓扑。开关断开和未知参数都正常保留，不需要计算题目答案。'}];
  if(image)content.push({type:'image_url',image_url:{url:image,detail:'high'}});
  if(repair)content.push({type:'text',text:`上一次返回需要修正：${repair}。请简洁返回完整JSON，先追踪真实节点；不要计算实验答案。`});
  const timerAbort=new AbortController(),remaining=120000-(Date.now()-start),attemptTimeout=Math.min(attempt===1?75000:45000,remaining);
  const timer=setTimeout(()=>timerAbort.abort(),attemptTimeout);let phase='connect';
  try{
   const upstream=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'system',content:chat?coachPrompt:parsePrompt},{role:'user',content}],response_format:{type:'json_object'},thinking:{type:'enabled'},reasoning_effort:'low',max_tokens:attempt===1?6000:9000}),signal:signal?AbortSignal.any([signal,timerAbort.signal]):timerAbort.signal});
   if(!upstream.ok){
    const status=upstream.status;
    if(status===401||status===403)return failure('AUTH','AI服务授权失效，请联系维护者；当前实验与图片已保留。',502,requestId);
    if(status===402)return failure('BALANCE','AI服务余额不足；你仍可使用本地示例和调参。',503,requestId);
    if(status===429||status>=500){code='UPSTREAM_INTERRUPTED';repair='推理服务暂时繁忙，请重新返回完整结果';continue;}
    return failure('UPSTREAM_REQUEST','AI服务未接受此次请求，请换一张清晰的电路截图后重试。',502,requestId);
   }
   phase='decode';
   let data:{model?:string;choices?:{finish_reason?:string;message?:{content?:string}}[];usage?:{prompt_tokens?:number;completion_tokens?:number}};
   try{data=await upstream.json();}catch{code='INVALID_OUTPUT';repair='返回的响应不完整';continue;}
   if(!data||typeof data!=='object'||Array.isArray(data)){code='INVALID_OUTPUT';repair='响应结构不是有效对象';continue;}
   const choice=data.choices?.[0],finishReason=choice?.finish_reason;
   console.info(JSON.stringify({event:'ai_attempt',requestId,attempt,finishReason:finishReason??'missing',durationMs:Date.now()-start,promptTokens:data.usage?.prompt_tokens,completionTokens:data.usage?.completion_tokens}));
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
