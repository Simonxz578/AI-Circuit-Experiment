import {DurableObject} from 'cloudflare:workers';
import {CircuitSchema} from '../../src/circuit/schema';
import {solve} from '../../src/circuit/solver';
import {applyOperations,OperationsSchema} from '../../src/circuit/operations';
import {parsePrompt,coachPrompt} from './prompts';
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
 const origin=request.headers.get('Origin')??'',origins=env.ALLOWED_ORIGINS.split(',').map(x=>x.trim()),allowed=origins.includes(origin);
 const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(allowed)headers['Access-Control-Allow-Origin']=origin;
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});const path=new URL(request.url).pathname;
 if(request.method==='OPTIONS')return allowed?new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}}):json({error:'此来源未获允许。'},403);
 if(path==='/api/health'&&request.method==='GET')return json({status:'ok',ai:!!env.DEEPSEEK_API_KEY&&env.AI_ENABLED==='true',model:'deepseek-flash',scope:'linear-dc'});
 if(!['/api/parse','/api/chat'].includes(path))return json({error:'接口不存在。'},404);
 if(request.method!=='POST')return json({error:'请使用 POST 请求。'},405);
 if(!allowed)return json({error:'此来源未获允许。'},403);
 if(!env.DEEPSEEK_API_KEY||env.AI_ENABLED!=='true')return json({error:'AI 服务尚未配置或已暂停；仍可使用示例与本地仿真。',code:'NOT_CONFIGURED'},503);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'请求格式应为 JSON。'},415);
 let body:Record<string,unknown>;
 try{body=await readBody(request);}catch(e){return json({error:(e as Error).message==='BODY_TOO_LARGE'?'图片太大，请选择 2 MB 以内的图片。':'请求格式不正确。'},(e as Error).message==='BODY_TOO_LARGE'?413:400);}
 const text=typeof body.text==='string'?body.text.trim():'',image=body.image;
 if(text.length>4000||(!text&&!image))return json({error:'请提供 4000 字以内的题目或清晰电路图片。'},400);
 if(image!==undefined&&image!==null&&!validImage(image))return json({error:'请上传 2 MB 以内的 PNG、JPEG 或 WebP 图片。'},400);
 const chat=path==='/api/chat';let doc;
 if(chat){const parsed=CircuitSchema.safeParse(body.document);if(!parsed.success)return json({error:'当前电路数据不完整，请重新选择实验。'},400);doc=parsed.data;}
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(new Date().toISOString().slice(0,10)+'|'+(request.headers.get('CF-Connecting-IP')??'local')));
 const ip=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 const configured=Number(env.DAILY_REQUEST_LIMIT),limit=Number.isFinite(configured)?Math.max(1,Math.min(1000,configured)):150;
 const budget=await env.BUDGET.get(env.BUDGET.idFromName('global')).fetch(new Request('https://budget/check',{method:'POST',body:JSON.stringify({ip,limit})}));
 if(!budget.ok)return json({error:'请求次数已达上限。每分钟最多 5 次，每人每天 30 次；请稍后再试或使用本地调参。',code:'RATE_LIMIT'},429);
 const content:unknown[]=[{type:'text',text:chat?JSON.stringify({request:text,currentCircuit:{title:doc!.title,nodes:doc!.nodes.map(n=>n.id),components:doc!.components.map(({id,type,a,b,value,closed})=>({id,type,a,b,value,closed}))},solver:solve(doc!)}):text||'请识别这张电路题图片中的元件、参数和完整拓扑。'}];
 if(image)content.push({type:'image_url',image_url:{url:image,detail:'high'}});
 const started=Date.now();
 try{
  const upstream=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.DEEPSEEK_API_KEY}`},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'system',content:chat?coachPrompt:parsePrompt},{role:'user',content}],response_format:{type:'json_object'},thinking:{type:'enabled'},reasoning_effort:'high',max_tokens:8000}),signal:AbortSignal.timeout(60000)});
  if(!upstream.ok){const status=upstream.status;return json({error:status===401?'AI 服务授权失效，请联系维护者。':status===402?'AI 服务余额不足；仍可使用本地仿真。':status===429?'AI 服务繁忙，请稍后重试。':'AI 服务暂时不可用，请重试。',code:'UPSTREAM',providerStatus:status},status===429?429:502);}
  const data=await upstream.json() as {choices?:{message?:{content?:string}}[];model?:string};const raw=data.choices?.[0]?.message?.content;
  if(!raw)throw new Error('EMPTY');let result:unknown;try{result=JSON.parse(raw);}catch{return json({error:'识别结果格式不完整，请重试或换一张清晰图片。'},422);}
  const meta={model:data.model??'deepseek-flash',durationMs:Date.now()-started};
  if(chat){const r=result as {reply?:unknown;operations?:unknown};if(typeof r.reply!=='string'||r.reply.length>5000)return json({error:'助教回复不完整，请重试。'},422);const ops=OperationsSchema.safeParse(r.operations??[]);if(!ops.success)return json({error:'助教修改指令不完整，当前实验已保留。'},422);let document=null;try{if(ops.data.length)document=applyOperations(doc!,ops.data);}catch{return json({error:'修改后的电路未通过接线核验，当前实验已保留。'},422);}const solved=document?solve(document):null;const reply=r.reply+(solved?.ok&&solved.totalCurrent!==null?`\n修改草案求解：总电流 ${Number(solved.totalCurrent.toPrecision(5))} A。确认应用后更新实验。`:'');return json({reply,document,...meta});}
  const parsed=CircuitSchema.safeParse(result);if(!parsed.success)return json({error:'识别结果未通过元件与接线核验。请上传更清晰的电路图，或补充文字说明。',code:'INVALID_GRAPH'},422);
  const graph=parsed.data,solution=solve(graph);
  const uncertain=[...graph.uncertainties];
  if(!solution.ok&&!graph.components.some(c=>['source','resistor','rheostat'].includes(c.type)&&c.value===null))uncertain.push(solution.reason??'接线需要核验。');
  if(solution.ok&&solution.totalCurrent!==null&&solution.totalCurrent<1e-10&&graph.components.some(c=>c.type==='source'&&c.value!==0)&&!graph.components.some(c=>c.type==='switch'&&!c.closed))uncertain.push('当前识别未形成导通回路，请对照原图核验电源回线与节点。');
  return json({document:{...graph,uncertainties:uncertain.slice(0,16),source:image?'image':'text'},...meta});
 }catch(e){return json({error:(e as Error).name==='TimeoutError'?'识别超过 60 秒，请重试或缩小图片。':'AI 服务连接中断，请检查网络后重试。',code:'CONNECTION'},504);}
}};
