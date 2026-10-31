import {DurableObject} from 'cloudflare:workers';
import {CircuitSchema,StateObservationSchema} from '../../src/circuit/schema';
import {runInference} from './inference';
import {streamInference} from './transport';
import {validContactRaster,validContactCandidates} from '../../src/circuit/contactVision';
interface Env{DEEPSEEK_API_KEY?:string;ALLOWED_ORIGINS:string;AI_ENABLED:string}
/** Legacy binding retained for a non-destructive migration. It no longer counts or rejects requests. */
export class Budget extends DurableObject<Env>{
 async fetch(){return Response.json({allowed:true,limitsDisabled:true});}
}
const MAX_BODY=4_000_000,MAX_IMAGE=2_000_000;
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
 if(path==='/api/health'&&request.method==='GET')return json({status:'ok',ai:!!env.DEEPSEEK_API_KEY&&env.AI_ENABLED==='true',model:'deepseek-flash',scope:'linear-dc',configured:!!env.DEEPSEEK_API_KEY,version:'vision-v5',appRateLimit:false});
 if(!['/api/parse','/api/chat'].includes(path))return json({error:'接口不存在。'},404);
 if(request.method!=='POST')return json({error:'请使用 POST 请求。'},405);
 if(!allowed)return json({error:'此来源未获允许。'},403);
 if(!env.DEEPSEEK_API_KEY||env.AI_ENABLED!=='true')return json({error:'AI 服务尚未配置或已暂停；仍可使用示例与本地仿真。',code:'NOT_CONFIGURED'},503);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'请求格式应为 JSON。'},415);
 let body:Record<string,unknown>;
 try{body=await readBody(request);}catch(e){return json({error:(e as Error).message==='BODY_TOO_LARGE'?'图片太大，请选择 2 MB 以内的图片。':'请求格式不正确。'},(e as Error).message==='BODY_TOO_LARGE'?413:400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'请求应为包含文字或图片的对象。',code:'INVALID_INPUT',requestId},400);
 const text=typeof body.text==='string'?body.text.trim():'',image=body.image,imageDetail=body.imageDetail,raster=body.contactRaster;
 if(text.length>4000||(!text&&!image))return json({error:'请提供 4000 字以内的题目或清晰电路图片。'},400);
 if(image!==undefined&&image!==null&&!validImage(image))return json({error:'请上传 2 MB 以内的 PNG、JPEG 或 WebP 图片。'},400);
 if(imageDetail!==undefined&&(!image||!validImage(imageDetail)))return json({error:'电路细节图格式无效，请重新选择图片。'},400);
 const diagramRegion=StateObservationSchema.shape.region.safeParse(body.diagramRegion);
 if(body.diagramImage!==undefined&&(!image||!validImage(body.diagramImage)||!diagramRegion.success||!diagramRegion.data))return json({error:'电路区域图无效，请重新选择图片。'},400);
 if(raster!==undefined&&(!image||!validContactRaster(raster)))return json({error:'触点图像数据无效，请重新选择图片。'},400);
 if(body.contactCandidates!==undefined&&(!raster||!validContactCandidates(body.contactCandidates)))return json({error:'触点定位数据无效，请重新选择图片。'},400);
 const chat=path==='/api/chat';let doc;
 if(chat){const parsed=CircuitSchema.safeParse(body.document);if(!parsed.success)return json({error:'当前电路数据不完整，请重新选择实验。'},400);doc=parsed.data;}
 try{
  const options={key:env.DEEPSEEK_API_KEY,text,image:typeof image==='string'?image:undefined,imageDetail:typeof imageDetail==='string'?imageDetail:undefined,diagramImage:typeof body.diagramImage==='string'?body.diagramImage:undefined,diagramRegion:diagramRegion.success?diagramRegion.data:undefined,contactRaster:validContactRaster(raster)?raster:undefined,contactCandidates:validContactCandidates(body.contactCandidates)?body.contactCandidates:undefined,document:doc,requestId,consume:async()=>true};
  if(request.headers.get('Accept')?.includes('application/x-ndjson'))return streamInference((onProgress,signal)=>runInference({...options,onProgress,signal}),headers,requestId);
  const outcome=await runInference({...options,signal:request.signal});return json(outcome.body,outcome.status);
 }catch{
  console.info(JSON.stringify({event:'service_error',requestId,code:'SERVICE_UNAVAILABLE'}));
  return json({error:'识别服务暂时不可用，请稍后重试。图片和当前实验已保留。',code:'SERVICE_UNAVAILABLE',requestId},503);
 }
}};
