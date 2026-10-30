import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {CircuitSchema} from '../src/circuit/schema';import {normalizeRecognition} from '../src/circuit/recognition';
const mode=process.argv[2]??'fixed',file=process.argv[3]??'public/examples/switch-bypass.png';
const {parsePrompt}=mode==='old'?await import('../test-results/legacy-prompts'):await import('../worker/src/prompts');
const vars=await readFile(new URL('../worker/.dev.vars',import.meta.url),'utf8'),key=vars.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1];
if(!key)throw new Error('New circuit key missing');const image='data:image/png;base64,'+(await readFile(file)).toString('base64'),start=Date.now();
const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'system',content:parsePrompt},{role:'user',content:[{type:'text',text:'识别图中的实际电路。两个开关均为断开状态，不要把断路当成无法解析的复杂电路。'},{type:'image_url',image_url:{url:image,detail:'high'}}]}],response_format:{type:'json_object'},thinking:{type:'enabled'},reasoning_effort:mode==='old'?'high':'low',max_tokens:mode==='old'?8000:6000}),signal:AbortSignal.timeout(125000)});
const body=await response.json(),choice=body.choices?.[0],raw=choice?.message?.content??'';
let graph=null,errorCode=null;try{const json=JSON.parse(raw);graph=mode==='old'?CircuitSchema.parse(json):normalizeRecognition(json,'image');}catch(e){errorCode=(e as Error).name;}
const report={mode,input:file,status:response.status,model:body.model,finishReason:choice?.finish_reason,bodyChars:raw.trim().length,reasoningChars:choice?.message?.reasoning_content?.length??0,usage:body.usage,durationMs:Date.now()-start,oldDeadlineExceeded:Date.now()-start>60000,validGraph:!!graph,errorCode,...(graph?{graph}:{})};
await mkdir('docs/evidence/reliability',{recursive:true});await writeFile(`docs/evidence/reliability/${mode}-${file.split('/').pop()!.replace('.png','')}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,graph:undefined}));
