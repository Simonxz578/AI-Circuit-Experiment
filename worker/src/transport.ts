import type {Outcome,Progress} from './inference';

/** Heartbeats keep the connection active without exposing model reasoning or inventing progress. */
export function streamInference(run:(progress:(p:Progress)=>void,signal:AbortSignal)=>Promise<Outcome>,headers:Record<string,string>,requestId:string):Response{
 const abort=new AbortController(),encoder=new TextEncoder();let closed=false;
 let heartbeat:ReturnType<typeof setInterval>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
 const stop=()=>{if(heartbeat!==undefined)clearInterval(heartbeat);if(deadline!==undefined)clearTimeout(deadline);};
 const stream=new ReadableStream<Uint8Array>({
  start(controller){
   const send=(event:unknown)=>{if(!closed)controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));};
   const finish=(outcome:Outcome)=>{if(closed)return;stop();send({type:outcome.status===200?'result':'error',status:outcome.status,data:outcome.body});closed=true;controller.close();};
   send({type:'progress',data:{stage:'服务端已接收，准备识别',attempt:1},requestId});
   heartbeat=setInterval(()=>send({type:'heartbeat',requestId}),8000);
   deadline=setTimeout(()=>{abort.abort();finish({status:504,body:{code:'TIMEOUT',error:'识别等待超过两分钟，请稍后重试；原图与当前电路已保留。',requestId,retryable:true}});},125000);
   void run(p=>send({type:'progress',data:p,requestId}),abort.signal).then(finish).catch(()=>finish({status:503,body:{code:'SERVICE_UNAVAILABLE',error:'识别服务暂时不可用，图片与当前电路已保留，请重试。',requestId,retryable:true}}));
  },
  cancel(){closed=true;stop();abort.abort();}
 });
 return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','X-Request-ID':requestId}});
}
