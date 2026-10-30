import {DurableObject} from 'cloudflare:workers';
import {CircuitSchema} from '../../src/circuit/schema';
import {runInference} from './inference';
import {streamInference} from './transport';
interface Env{DEEPSEEK_API_KEY?:string;ALLOWED_ORIGINS:string;AI_ENABLED:string;DAILY_REQUEST_LIMIT:string;BUDGET:DurableObjectNamespace<Budget>}
export class Budget extends DurableObject<Env>{
 async fetch(request:Request){
  const {ip,limit}=await request.json() as {ip:string;limit:number};const now=Date.now(),day=new Date(now).toISOString().slice(0,10),minute=Math.floor(now/60000);
  const allowed=await this.ctx.storage.transaction(async tx=>{
   type State={day:string;total:number;ips:Record<string,{daily:number;minute:number;burst:number}>};
   let state=await tx.get<State>('budget');if(!state||state.day!==day)state={day,total:0,ips:{}};
   const person=state.ips[ip]??{daily:0,minute,burst:0};if(person.minute!==minute){person.minute=minute;person.burst=0;}
   if(state.total>=limit||person.daily>=30||person.burst>=5)return false;
   person.daily++;person.burst++;state.total++;state.ips[ip]=person;await tx.put('budget',state);return true;
  });return Response.json({allowed},{status:allowed?200:429});
 }
}
const MAX_BODY=3_000_000,MAX_IMAGE=2_000_000;
export async function readBody(request:Request){
 if(Number(request.headers.get('content-length')??0)>MAX_BODY)throw new Error('BODY_TOO_LARGE');
 const reader=request.body?.getReader();if(!reader)throw new Error('INVALID_INPUT');let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY){await reader.cancel();throw new Error('BODY_TOO_LARGE');}chunks.push(value);}
 const all=new Uint8Array(size);let p=0;for(const chunk of chunks){all.set(chunk,p);p+=chunk.length;}return JSON.parse(new TextDecoder().decode(all)) as Record<string,unknown>;
}
export function validImage(value:unknown):value is string{
 if(typeof value!=='string')return false;const m=value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!m||m[2].length*3/4>MAX_IMAGE)return false;
 try{const s=atob(m[2].slice(0,32));return m[1]==='png'?s.startsWith('\x89PNG\r\n\x1a\n'):m[1]==='jpeg'?s.startsWith('\xff\xd8\xff'):s.startsWith('RIFF')&&s.slice(8,12)==='WEBP';}catch{return false;}
}
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const requestId=crypto.randomUUID();
 const origin=request.headers.get('Origin')??'',origins=env.ALLOWED_ORIGINS.split(',').map(x=>x.trim()),allowed=origins.includes(origin);
 const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin','X-Request-ID':requestId,'Access-Control-Expose-Headers':'X-Request-ID'};
 if(allowed)headers['Access-Control-Allow-Origin']=origin;
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});const path=new URL(request.url).pathname;
 if(request.method==='OPTIONS')return allowed?new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}}):json({error:'此来源未获允许。'},403);
 if(path==='/api/health'&&request.method==='GET')return json({status:'ok',ai:!!env.DEEPSEEK_API_KEY&&env.AI_ENABLED==='true',model:'deepseek-flash',scope:'linear-dc',configured:!!env.DEEPSEEK_API_KEY,version:'reliability-v2'});
 if(!['/api/parse','/api/chat'].includes(path))return json({error:'接口不存在。'},404);
 if(request.method!=='POST')return json({error:'请使用 POST 请求。'},405);
 if(!allowed)return json({error:'此来源未获允许。'},403);
 if(!env.DEEPSEEK_API_KEY||env.AI_ENABLED!=='true')return json({error:'AI 服务尚未配置或已暂停；仍可使用示例与本地仿真。',code:'NOT_CONFIGURED'},503);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'请求格式应为 JSON。'},415);
 let body:Record<string,unknown>;
 try{body=await readBody(request);}catch(e){return json({error:(e as Error).message==='BODY_TOO_LARGE'?'图片太大，请选择 2 MB 以内的图片。':'请求格式不正确。'},(e as Error).message==='BODY_TOO_LARGE'?413:400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'请求应为包含文字或图片的对象。',code:'INVALID_INPUT',requestId},400);
 const text=typeof body.text==='string'?body.text.trim():'',image=body.image;
 if(text.length>4000||(!text&&!image))return json({error:'请提供 4000 字以内的题目或清晰电路图片。'},400);
 if(image!==undefined&&image!==null&&!validImage(image))return json({error:'请上传 2 MB 以内的 PNG、JPEG 或 WebP 图片。'},400);
 const chat=path==='/api/chat';let doc;
 if(chat){const parsed=CircuitSchema.safeParse(body.document);if(!parsed.success)return json({error:'当前电路数据不完整，请重新选择实验。'},400);doc=parsed.data;}
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(new Date().toISOString().slice(0,10)+'|'+(request.headers.get('CF-Connecting-IP')??'local')));
 const ip=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 const configured=Number(env.DAILY_REQUEST_LIMIT),limit=Number.isFinite(configured)?Math.max(1,Math.min(1000,configured)):150;
 const consume=async()=>{
  const response=await env.BUDGET.get(env.BUDGET.idFromName('global')).fetch(new Request('https://budget/check',{method:'POST',body:JSON.stringify({ip,limit})}));
  return response.status===200;
 };
 try{
  if(!await consume())return json({error:'请求次数已达上限。每分钟最多5次、每人每天30次（含自动恢复）。请稍后再试，仍可本地调参。',code:'RATE_LIMIT',requestId},429);
  const options={key:env.DEEPSEEK_API_KEY,text,image:typeof image==='string'?image:undefined,document:doc,requestId,consume};
  if(request.headers.get('Accept')?.includes('application/x-ndjson'))return streamInference((onProgress,signal)=>runInference({...options,onProgress,signal}),headers,requestId);
  const outcome=await runInference({...options,signal:request.signal});return json(outcome.body,outcome.status);
 }catch{
  console.info(JSON.stringify({event:'service_error',requestId,code:'SERVICE_UNAVAILABLE'}));
  return json({error:'识别服务暂时不可用，请稍后重试。图片和当前实验已保留。',code:'SERVICE_UNAVAILABLE',requestId},503);
 }
}};
