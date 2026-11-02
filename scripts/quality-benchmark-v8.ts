/** Explicit paid acceptance run. Inputs and raw model outputs remain ignored under private/v8. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CircuitSchema,type CircuitDocument} from '../src/circuit/schema';
import {electricalFingerprint,alignComponentIds} from '../worker/src/visualAudit';
import {findDiagramRegion,contactDetailRegion} from '../src/circuit/vision';
import {contactRaster,contactCandidates} from '../src/circuit/contactVision';
import {layoutCircuit,wireEntersOtherSymbol} from '../src/circuit/layout';

const mode=process.argv[2]??'current';
const {runInference}=mode==='baseline'?await import('../private/v8/baseline/worker/src/inference'):await import('../worker/src/inference');
const own=JSON.parse(await readFile('public/examples/vision-v4/manifest.json','utf8')).cases;
const graph=(rows:unknown[][])=>CircuitSchema.parse({title:'人工标注',nodes:[...new Set(rows.flatMap(r=>[r[2],r[3],...(r[6]?[r[6]]:[])]))].map((id,i)=>({id,x:100+i%3*200,y:100+Math.floor(i/3)*100})),components:rows.map(([id,type,a,b,value,closed=true,two])=>({id,name:id,type,a,b,value,closed,valueSource:value===null?'unknown':'given',...(two?{terminals:{two},parameters:{throw:0},initialThrow:0}:{})})),source:'image'});
const common=graph([['V1','source','p','g',null],['R1','resistor','p','m',30],['R2','resistor','m','n',null],['S2','switch','m','n',null,false],['S1','switch','g','n',null,false]]);
common.components.forEach(c=>{c.labelVisible=c.id!=='V1';});
const capacitor=graph([['V1','source','s','g',12],['R1','resistor','p','n',4000],['R2','resistor','p','n',5000],['R3','resistor','s','p',2000],['R4','resistor','n','g',3000],['C1','capacitor','p','n',.0001]]);
capacitor.components.forEach(c=>{c.labelVisible=false;});
const led=graph([['V1','source','p','g',null],['LED','led','p','a',null],['R','resistor','a','b',null],['A1','ammeter','b','g',null],['VM1','voltmeter','p','a',null]]);
led.components.forEach(c=>{c.labelVisible=c.id==='R'||c.id==='LED';});
const cases=[
 {id:'user-original',file:'private/vision-v4/user-open-switches.png',expected:common,allowReview:false,expectedMeasurements:2},
 {id:'spdt',file:'private/v6/spdt.png',expected:graph([['V1','source','p','g',null],['C','capacitor','p','c',null],['R1','resistor','p','m',null],['R2','resistor','m','g',null],['K','spdt','c','m',null,true,'g']]),allowReview:true,expectedMeasurements:0},
 ...own.filter((c:any)=>['ammeter-voltmeter','crossing-no-junction'].includes(c.id)).map((c:any)=>({...c,expected:CircuitSchema.parse(c.expected),allowReview:false,expectedMeasurements:0})),
 {id:'led-meter',file:'private/v8/led-meter.png',expected:led,allowReview:true,expectedMeasurements:0},
 {id:'cap-kohm',file:'private/v8/cap-kohm.png',expected:capacitor,allowReview:false,expectedMeasurements:0},
];
const selected=process.env.VISION_CASES?.split(',');const selectedCases=cases.filter(c=>!selected||selected.includes(c.id));
const key=(await readFile('worker/.dev.vars','utf8')).match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1]?.trim();if(!key)throw Error('Configured test key missing');
const realFetch=globalThis.fetch;let calls=0;const providerPasses:any[]=[];
globalThis.fetch=async(input,init)=>{
 if(!String(input).startsWith('https://api.deepseek.com/'))return realFetch(input,init);
 if(++calls>selectedCases.length*4)throw Error('Provider call ceiling reached');
 const started=performance.now(),body=JSON.parse(String(init?.body??'{}')),response=await realFetch(input,init);
 try{const raw=await response.clone().json();providerPasses.push({requestedAt:started,elapsedMs:Math.round(performance.now()-started),thinking:body.thinking?.type,userTask:body.messages?.find((m:any)=>m.role==='user')?.content?.find((p:any)=>p.type==='text')?.text,finishReason:raw.choices?.[0]?.finish_reason,content:raw.choices?.[0]?.message?.content,usage:raw.usage});}catch{/* The pipeline itself handles malformed upstream data. */}
 return response;
};
const destination=`private/v8/${mode}.json`;await mkdir('private/v8',{recursive:true});const started=new Date().toISOString(),results:any[]=[];
for(const c of selectedCases){
 const bytes=await readFile(c.file),image='data:image/png;base64,'+bytes.toString('base64'),raw=execFileSync('python3',['scripts/image-rgba.py',c.file],{maxBuffer:10000000}),width=raw.readUInt32LE(0),height=raw.readUInt32LE(4),region=findDiagramRegion(raw.subarray(8),width,height),raster=contactRaster(raw.subarray(8),width,height),proposals=contactCandidates(raster);
 const crop=region?execFileSync('python3',['scripts/image-rgba.py',c.file,JSON.stringify(region)],{maxBuffer:5000000}):null,detail=region?execFileSync('python3',['scripts/image-rgba.py',c.file,JSON.stringify(contactDetailRegion(region))],{maxBuffer:5000000}):null;
 const phases:any[]=[];let candidates:unknown;const start=performance.now(),before=calls;
 try{
  const result=await runInference({key,text:'',image,imageDetail:detail?'data:image/jpeg;base64,'+detail.toString('base64'):undefined,diagramImage:crop?'data:image/jpeg;base64,'+crop.toString('base64'):undefined,diagramRegion:region?{x:region.x/width*1000,y:region.y/height*1000,width:region.width/width*1000,height:region.height/height*1000}:undefined,contactRaster:raster,contactCandidates:proposals,requestId:`v8-${mode}-${c.id}`,consume:async()=>true,signal:AbortSignal.timeout(130000),onProgress:p=>phases.push({...p,ms:Math.round(performance.now()-start)}),onCandidates:(primary,audit,reviewer)=>{candidates={primary,audit,reviewer};}});
  const parsed=CircuitSchema.safeParse(result.body.document);const problems:string[]=[];let doc=parsed.success?parsed.data:undefined;
  if(!doc)problems.push('No valid document: '+result.body.code);
  if(doc){
   const expected:CircuitDocument=c.expected;
   if(c.id==='spdt'){
    // This source has no printed supply ID. Renaming only that auto ID is a manual fixture convention.
    const source=doc.components.find(v=>v.type==='source');if(source)doc={...doc,components:doc.components.map(v=>v===source?{...v,id:'V1'}:v)};
   }
   if(c.id==='cap-kohm'||c.id==='led-meter'||c.id==='user-original')doc=alignComponentIds(expected,doc)??doc;
   if(electricalFingerprint(doc)!==electricalFingerprint(expected))problems.push('Topology differs from manual annotation');
   for(const e of expected.components){const a=doc.components.find(v=>v.id===e.id);if(!a||a.type!==e.type){problems.push(e.id+' identity/type differs');continue;}if(a.value===null||e.value===null?a.value!==e.value:Math.abs(a.value-e.value)>1e-8*Math.max(.000001,Math.abs(e.value)))problems.push(e.id+' value differs: '+a.value+' != '+e.value);if(e.type==='switch'&&a.closed!==e.closed)problems.push(e.id+' initial state differs');if(e.type==='spdt'&&(a.parameters?.throw!==0||a.terminals?.two===a.b))problems.push('SPDT position or third terminal differs');}
   if(c.expectedMeasurements&&doc.measurements.length<c.expectedMeasurements)problems.push('Given measurements missing: '+doc.measurements.length);
   if(doc.verification?.status!=='matched'&&!c.allowReview)problems.push('Not automatically accepted: '+doc.verification?.status);
   const layout=layoutCircuit(doc),wireObstructions=layout.wires.filter(w=>wireEntersOtherSymbol(w,layout.placements)).length;if(wireObstructions)problems.push('Wire enters other component');
  }
  const report={id:c.id,sha256:createHash('sha256').update(bytes).digest('hex'),status:result.status,durationMs:Math.round(performance.now()-start),providerCalls:calls-before,phases,providerPasses:providerPasses.filter(p=>p.requestedAt>=start),problems,passed:!problems.length,verification:doc?.verification,document:doc,candidates};results.push(report);console.log(JSON.stringify({...report,document:undefined,candidates:undefined,providerPasses:undefined}));
 }catch(e){results.push({id:c.id,durationMs:Math.round(performance.now()-start),providerCalls:calls-before,problems:[(e as Error).message],passed:false});console.log(JSON.stringify(results.at(-1)));}
 await writeFile(destination,JSON.stringify({started,finished:new Date().toISOString(),mode,providerCalls:calls,results},null,2));
}
console.log(JSON.stringify({mode,cases:results.length,passed:results.filter(r=>r.passed).length,providerCalls:calls,report:destination}));
