import {CircuitSchema,type CircuitDocument} from './circuit/schema';
import {RecognitionCache,recognitionKey} from './circuit/recognitionCache';
import {prepareVisionInput} from './imageDetail';
import {coachNeedsImage,sanitizeCoachHistory,type CoachTurn} from './circuit/coachContext';
const recognitionCache=new RecognitionCache();
const base=import.meta.env.VITE_API_URL??'';
export type ApiProgress={stage:string;attempt:number};
export class ApiError extends Error{
 constructor(message:string,public code='SERVICE_UNAVAILABLE',public status=0,public requestId?:string){super(message);this.name='ApiError';}
}
function errorFrom(data:Record<string,unknown>,status:number):ApiError{
 return new ApiError(typeof data.error==='string'?data.error:'识别服务暂时不可用，请稍后重试。',typeof data.code==='string'?data.code:'SERVICE_UNAVAILABLE',status,typeof data.requestId==='string'?data.requestId:undefined);
}
export async function decodeResponse(response:Response,onProgress?:(p:ApiProgress)=>void):Promise<any>{
 if(!response.headers.get('Content-Type')?.includes('application/x-ndjson')){
  let result;try{result=await response.json();}catch{throw new ApiError('服务响应未完整返回，原图与当前电路已保留，请重试。','INCOMPLETE_RESPONSE');}
  if(!response.ok)throw errorFrom(result,response.status);return result;
 }
 const reader=response.body?.getReader();if(!reader)throw new ApiError('识别结果传输未完成，请重试。','INCOMPLETE_RESPONSE');
 const decoder=new TextDecoder();let buffer='',bytes=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;bytes+=value.length;
   if(bytes>1_000_000)throw new ApiError('识别结果超过接收上限，请只保留题目与电路区域后重试。','RESPONSE_TOO_LARGE');
   buffer+=decoder.decode(value,{stream:true});let newline;
   while((newline=buffer.indexOf('\n'))!==-1){
    const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(!line)continue;
    let event;try{event=JSON.parse(line);}catch{throw new ApiError('识别结果格式未完整返回，请重试。','INCOMPLETE_RESPONSE');}
    if(event.type==='progress'&&event.data&&typeof event.data.stage==='string')onProgress?.({stage:event.data.stage,attempt:Number(event.data.attempt)||1});
    if(event.type==='error')throw errorFrom(event.data??{},Number(event.status)||502);
    if(event.type==='result')return event.data;
   }
  }
  throw new ApiError('识别结果传输中途结束，原图已保留，请直接点击重试。','INCOMPLETE_RESPONSE');
 }finally{reader.releaseLock();}
}
export async function requestApi(path:string,body:unknown,signal?:AbortSignal,onProgress?:(p:ApiProgress)=>void){
 const timeout=AbortSignal.timeout(135000);
 try{
  const response=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,timeout]):timeout});
  return await decodeResponse(response,onProgress);
 }catch(error){
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(timeout.aborted||(error as Error).name==='TimeoutError')throw new ApiError('识别等待超过两分钟。原图已保留，请稍后直接重试。','TIMEOUT',504);
  if(error instanceof ApiError)throw error;
  throw new ApiError('网页暂时未能连上实验服务。原图和当前电路已保留，请稍后重试。','BROWSER_NETWORK');
 }
}
export async function parseCircuit(text:string,image:string|undefined,signal:AbortSignal,onProgress?:(p:ApiProgress)=>void,options?:{force?:boolean}){
 const visionPromise=image?prepareVisionInput(image):Promise.resolve({});const key=await recognitionKey(text,image);if(signal.aborted)throw new DOMException('Cancelled','AbortError');
 if(!options?.force){const cached=recognitionCache.get(key);if(cached){onProgress?.({stage:'复用本次已核验的识别结果，正在规整电路',attempt:0});return cached;}}
 const vision=await visionPromise;if(signal.aborted)throw new DOMException('Cancelled','AbortError');
 const r=await requestApi('parse',{text,image,...vision},signal,onProgress),parsed=CircuitSchema.safeParse(r.document);
 if(!parsed.success)throw new ApiError('识别结果未通过本地连接核验，当前实验已保留，请重试。','INVALID_GRAPH',422);
 const result={document:parsed.data,durationMs:r.durationMs as number,model:r.model as string,cached:false};recognitionCache.put(key,result);return result;
}
export async function askCoach(text:string,document:CircuitDocument,signal:AbortSignal,context?:{image?:string;problemText?:string;history?:CoachTurn[];selectedId?:string;needsReview?:boolean}){const history=sanitizeCoachHistory(context?.history);const r=await requestApi('chat',{text,document,history,...(context?.problemText?{problemText:context.problemText}:{}),...(context?.selectedId&&document.components.some(c=>c.id===context.selectedId)?{selectedId:context.selectedId}:{}),...(context?.needsReview?{needsReview:true}:{}),...(coachNeedsImage(text,history)&&context?.image?{image:context.image}:{})},signal);return {reply:r.reply as string,autoApply:r.autoApply===true,document:r.document?CircuitSchema.parse(r.document):null};}
export async function health(){try{const r=await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(5000)});return r.ok&&((await r.json()) as {ai:boolean}).ai;}catch{return false;}}
