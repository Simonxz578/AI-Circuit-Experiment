import {readFile} from 'node:fs/promises';
const vars = await readFile(new URL('../worker/.dev.vars', import.meta.url), 'utf8');
const key = vars.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1];
if (!key) throw new Error('AI Circuit backend key not configured');
const started = performance.now();
const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST', headers: {'Content-Type':'application/json', Authorization:`Bearer ${key}`},
  body: JSON.stringify({model:'deepseek-flash', messages:[{role:'user',content:'Reply only OK.'}], thinking:{type:'disabled'}, max_tokens:16}),
  signal: AbortSignal.timeout(45000)
});
const body = await response.json();
console.log(JSON.stringify({status:response.status,model:body.model ?? 'deepseek-flash',validReply:typeof body.choices?.[0]?.message?.content === 'string',errorType:body.error?.type ?? null,durationMs:Math.round(performance.now()-started)}));
if (!response.ok) process.exitCode=1;
