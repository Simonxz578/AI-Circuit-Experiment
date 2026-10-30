import {CircuitSchema,type CircuitDocument} from './circuit/schema';
const base=import.meta.env.VITE_API_URL??'';
export async function requestApi(path:string,body:unknown,signal?:AbortSignal){
 const response=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(65000)]):AbortSignal.timeout(65000)});
 let result;try{result=await response.json();}catch{throw new Error('服务暂时无法连接，请稍后重试。');}
 if(!response.ok)throw new Error(result.error??'服务暂时不可用。');return result;
}
export async function parseCircuit(text:string,image:string|undefined,signal:AbortSignal){const r=await requestApi('parse',{text,image},signal);return {document:CircuitSchema.parse(r.document),durationMs:r.durationMs as number,model:r.model as string};}
export async function askCoach(text:string,document:CircuitDocument,signal:AbortSignal){const r=await requestApi('chat',{text,document},signal);return {reply:r.reply as string,document:r.document?CircuitSchema.parse(r.document):null};}
export async function health(){try{const r=await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(5000)});return r.ok&&((await r.json()) as {ai:boolean}).ai;}catch{return false;}}
