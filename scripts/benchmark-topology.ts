import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parsePrompt} from '../worker/src/prompts';import {normalizeRecognition} from '../src/circuit/recognition';import {layoutCircuit,wireEntersOtherSymbol} from '../src/circuit/layout';import {solve} from '../src/circuit/solver';
const key=(await readFile('worker/.dev.vars','utf8')).match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1];if(!key)throw new Error('New circuit backend key missing');
const results=[];
for(const name of ['switch-bypass','switch-unknown','mixed']){
 const image='data:image/png;base64,'+(await readFile(`public/examples/${name}.png`)).toString('base64'),start=Date.now();
 const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:'deepseek-flash',thinking:{type:'enabled'},reasoning_effort:'low',max_tokens:6000,response_format:{type:'json_object'},messages:[{role:'system',content:parsePrompt},{role:'user',content:[{type:'text',text:'识别实际电路的端子连接和给定数值。'},{type:'image_url',image_url:{url:image,detail:'high'}}]}]}),signal:AbortSignal.timeout(90000)});
 const data=await response.json(),choice=data.choices?.[0];let graph=null,layout=null,error=null;try{graph=normalizeRecognition(JSON.parse(choice.message.content),'image');layout=layoutCircuit(graph);}catch(e){error=(e as Error).name;}
 const result={input:name,status:response.status,durationMs:Date.now()-start,finishReason:choice?.finish_reason,completionTokens:data.usage?.completion_tokens,bodyChars:choice?.message?.content?.length,components:graph?.components.map(c=>({id:c.id,type:c.type,a:c.a,b:c.b,value:c.value,closed:c.closed})),layoutMs:layout?.routingMs,wireObstructions:layout?.wires.filter(w=>wireEntersOtherSymbol(w,layout!.placements)).length,error,graph};
 results.push(result);console.log(JSON.stringify({...result,graph:undefined}));
}
await mkdir('docs/evidence/layout-v3',{recursive:true});await writeFile('docs/evidence/layout-v3/real-benchmark.json',JSON.stringify({checkedAt:new Date().toISOString(),model:'deepseek-flash',results},null,2));
if(results.some(r=>r.status!==200||r.error||r.wireObstructions))process.exitCode=1;
