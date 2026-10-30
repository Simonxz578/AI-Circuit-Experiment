import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {CircuitSchema} from '../src/circuit/schema';import {solve} from '../src/circuit/solver';import {examples} from '../src/circuit/examples';
const base=process.env.API_BASE??'https://ai-circuit-lab-api.simonxz578.workers.dev';
const headers={'Content-Type':'application/json',Origin:'https://simonxz578.github.io'};
const evidence=new URL(process.env.RELIABILITY_CHECK==='1'?'../docs/evidence/reliability/':'../docs/evidence/',import.meta.url);await mkdir(evidence,{recursive:true});
const report:{name:string;status:number;model?:string;durationMs:number;expected?:number;actual?:number|null;passed:boolean;components?:number;uncertainties?:string[]}[]=[];
for(const [name,expected] of [['series',1],['parallel',6],['mixed',3]] as const){
 const image='data:image/png;base64,'+(await readFile(new URL(`../public/examples/${name}.png`,import.meta.url))).toString('base64');const started=performance.now();
 const response=await fetch(base+'/api/parse',{method:'POST',headers,body:JSON.stringify({image}),signal:AbortSignal.timeout(65000)});const body=await response.json();
 const parsed=CircuitSchema.safeParse(body.document);const s=parsed.success?solve(parsed.data):null;const passed=response.ok&&s?.ok===true&&Math.abs((s.totalCurrent??Infinity)-expected)<1e-7;
 const row={name,status:response.status,model:body.model,durationMs:Math.round(performance.now()-started),expected,actual:s?.totalCurrent??null,passed,components:parsed.success?parsed.data.components.length:undefined,uncertainties:parsed.success?parsed.data.uncertainties:undefined};report.push(row);console.log(JSON.stringify(row));
 await writeFile(new URL(`${name}-recognition.json`,evidence),JSON.stringify({input:`public/examples/${name}.png`,...body,solution:s},null,2));
}
{
 const started=performance.now();const response=await fetch(base+'/api/parse',{method:'POST',headers,body:JSON.stringify({text:'用 10 V 直流电源，把 4 Ω 和 6 Ω 电阻串联，并串接理想电流表。'}),signal:AbortSignal.timeout(65000)});const body=await response.json();const parsed=CircuitSchema.safeParse(body.document),s=parsed.success?solve(parsed.data):null;const row={name:'real-text',status:response.status,model:body.model,durationMs:Math.round(performance.now()-started),expected:1,actual:s?.totalCurrent??null,passed:response.ok&&s?.ok===true&&Math.abs((s.totalCurrent??Infinity)-1)<1e-7};report.push(row);console.log(JSON.stringify(row));await writeFile(new URL('text-recognition.json',evidence),JSON.stringify({...body,solution:s},null,2));
}
{
 const started=performance.now();const response=await fetch(base+'/api/chat',{method:'POST',headers,body:JSON.stringify({text:'增加一个 6 欧姆电阻，在 R1 后面串联，保留其他元件和仪表。',document:examples[0]}),signal:AbortSignal.timeout(65000)});const body=await response.json();const parsed=CircuitSchema.safeParse(body.document),s=parsed.success?solve(parsed.data):null;const row={name:'real-agent-rewire',status:response.status,model:body.model,durationMs:Math.round(performance.now()-started),expected:10/16,actual:s?.totalCurrent??null,passed:response.ok&&typeof body.reply==='string'&&s?.ok===true&&Math.abs((s.totalCurrent??Infinity)-10/16)<1e-7&&parsed.success&&parsed.data.components.length===examples[0].components.length+1};report.push(row);console.log(JSON.stringify(row));await writeFile(new URL('agent-modification.json',evidence),JSON.stringify({...body,solution:s},null,2));
}
await writeFile(new URL('live-report.json',evidence),JSON.stringify({checkedAt:new Date().toISOString(),endpoint:base,kind:'REAL API, no mocks',report},null,2));if(report.some(r=>!r.passed))process.exitCode=1;
