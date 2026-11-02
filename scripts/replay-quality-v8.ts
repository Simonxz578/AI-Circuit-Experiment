/** Offline acceptance of recorded independent vision responses. Never calls a provider. */
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {CircuitSchema,type CircuitDocument} from '../src/circuit/schema';
import {normalizeRecognition,normalizeVisualInventory} from '../src/circuit/recognition';
import {reconcileVisionConsensus} from '../worker/src/visionConsensus';
import {alignComponentIds,electricalFingerprint} from '../worker/src/visualAudit';
import {contactRaster,contactCandidates} from '../src/circuit/contactVision';
const recorded=JSON.parse(await readFile('private/v8/current.json','utf8')).results;
const final=JSON.parse(await readFile('private/v8/final.json','utf8')).results;
const manifest=JSON.parse(await readFile('public/examples/vision-v4/manifest.json','utf8')).cases;
const graph=(rows:unknown[][])=>CircuitSchema.parse({title:'人工标注',nodes:[...new Set(rows.flatMap(r=>[r[2],r[3],...(r[6]?[r[6]]:[])]))].map((id,i)=>({id,x:100+i%3*200,y:100+Math.floor(i/3)*100})),components:rows.map(([id,type,a,b,value,closed=true,two])=>({id,type,name:id,a,b,value,closed,labelVisible:!['V1','A1','VM1'].includes(String(id)),...(two?{terminals:{two},parameters:{throw:0}}:{})})),source:'image'});
const original=graph([['V1','source','p','g',null],['R1','resistor','p','m',30],['R2','resistor','m','n',null],['S2','switch','m','n',null,false],['S1','switch','g','n',null,false]]);
const spdt=graph([['V1','source','p','g',null],['C','capacitor','p','c',null],['R1','resistor','p','m',null],['R2','resistor','m','g',null],['K','spdt','c','m',null,true,'g']]);
const led=graph([['V1','source','p','g',null],['LED','led','p','a',null],['R','resistor','a','b',null],['A1','ammeter','b','g',null],['VM1','voltmeter','p','a',null]]);
const cap=graph([['V1','source','s','g',12],['R1','resistor','p','n',4000],['R2','resistor','p','n',5000],['R3','resistor','s','p',2000],['R4','resistor','n','g',3000],['C1','capacitor','p','n',.0001]]);cap.components.forEach(c=>{c.labelVisible=false;});
const cases=[{id:'user-original',file:'private/vision-v4/user-open-switches.png',expected:original},{id:'spdt',file:'private/v6/spdt.png',expected:spdt},...manifest.filter((c:any)=>['ammeter-voltmeter','crossing-no-junction'].includes(c.id)).map((c:any)=>({...c,expected:CircuitSchema.parse(c.expected)})),{id:'led-meter',file:'private/v8/led-meter.png',expected:led},{id:'cap-kohm',file:'private/v8/cap-kohm.png',expected:cap}];
const results=[];
globalThis.fetch=async()=>{throw Error('Offline replay forbids network calls');};
for(const c of cases){
 const latest=final.find((r:any)=>r.id===c.id),first=recorded.find((r:any)=>r.id===c.id);
 const rawOCR=JSON.parse(latest.providerPasses.find((p:any)=>p.userTask.startsWith('独立读取')).content),inventory=normalizeVisualInventory(rawOCR);
 const pair=c.id==='led-meter'||c.id==='cap-kohm'?latest.providerPasses.filter((p:any)=>p.thinking==='enabled'&&!p.userTask.startsWith('重新独立读取')).map((p:any)=>JSON.parse(p.content)):[first.candidates.primary,first.candidates.reviewer];
 const primary=normalizeRecognition(pair[0],'image'),other=normalizeRecognition(pair[1],'image');
 const raw=execFileSync('python3',['scripts/image-rgba.py',c.file],{maxBuffer:10000000}),width=raw.readUInt32LE(0),height=raw.readUInt32LE(4),raster=contactRaster(raw.subarray(8),width,height),candidates=contactCandidates(raster);
 let doc=reconcileVisionConsensus(primary,other,inventory,raster,candidates);doc=alignComponentIds(c.expected,doc)??doc;
 const problems=[];
 if(electricalFingerprint(doc)!==electricalFingerprint(c.expected))problems.push('Topology differs from annotation');
 for(const e of c.expected.components){const a=doc.components.find(v=>v.id===e.id);if(!a||a.type!==e.type){problems.push(e.id+' type/identity differs');continue;}if(a.value===null||e.value===null?a.value!==e.value:Math.abs(a.value-e.value)>1e-8*Math.max(1e-12,Math.abs(e.value)))problems.push(e.id+' value differs');if(e.type==='switch'&&a.closed!==e.closed)problems.push(e.id+' initial switch state differs');if(e.type==='spdt'&&a.parameters?.throw!==0)problems.push('SPDT initial position differs');}
 if(c.id==='user-original'&&(doc.measurements.length!==2||doc.measurements.find(m=>m.value===.3)?.conditions.S1!==true||doc.measurements.find(m=>m.value===.5)?.conditions.S2!==true))problems.push('Given operating conditions differ');
 const result={id:c.id,mode:'offline-recorded-response-replay',responseSources:c.id==='led-meter'||c.id==='cap-kohm'?'final.json reasoned full-page + targeted reasoned review':'current.json simultaneous reasoned topology + independent full-page',inventorySource:'final.json independent full-page OCR',passed:!problems.length,problems,verification:doc.verification,uncertainties:doc.uncertainties,document:doc};results.push(result);console.log(JSON.stringify({...result,document:undefined}));
}
await writeFile('private/v8/replay.json',JSON.stringify({checkedAt:new Date().toISOString(),paidCalls:0,caseCount:cases.length,passed:results.filter(r=>r.passed).length,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
