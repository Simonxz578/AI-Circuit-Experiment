import {afterEach,describe,it,expect,vi} from 'vitest';import {decodeResponse,requestApi} from './api';
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
function stream(lines:unknown[]){return new Response(lines.map(x=>JSON.stringify(x)).join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson'}});}
describe('streamed recognition',()=>{
 it('handles multibyte text and JSON split across network chunks',async()=>{const bytes=new TextEncoder().encode(JSON.stringify({type:'progress',data:{stage:'核验连接',attempt:1}})+'\n'+JSON.stringify({type:'result',data:{title:'电路'}})+'\n');const stages:string[]=[];const body=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=2)c.enqueue(bytes.slice(i,i+2));c.close();}});expect(await decodeResponse(new Response(body,{headers:{'Content-Type':'application/x-ndjson'}}),p=>stages.push(p.stage))).toEqual({title:'电路'});expect(stages).toEqual(['核验连接']);});
 it('heartbeats do not create fake completion and a recovery stage is visible',async()=>{const stages:string[]=[];const result=await decodeResponse(stream([{type:'heartbeat'},{type:'progress',data:{stage:'自动恢复一次',attempt:2}},{type:'result',data:{ok:true}}]),p=>stages.push(p.stage));expect(result).toEqual({ok:true});expect(stages).toEqual(['自动恢复一次']);});
 it('keeps model-empty errors distinct from network errors',async()=>{await expect(decodeResponse(stream([{type:'error',status:502,data:{code:'EMPTY_OUTPUT',error:'模型未返回正文',requestId:'public-test'}}]))).rejects.toMatchObject({code:'EMPTY_OUTPUT',status:502,requestId:'public-test'});});
 it('a stream ending before a result produces a recoverable incomplete-response error',async()=>{await expect(decodeResponse(stream([{type:'heartbeat'}]))).rejects.toMatchObject({code:'INCOMPLETE_RESPONSE'});});
 it('supports regular JSON errors from early validation and quotas',async()=>{await expect(decodeResponse(new Response(JSON.stringify({code:'RATE_LIMIT',error:'额度已达上限'}),{status:429,headers:{'Content-Type':'application/json'}}))).rejects.toMatchObject({code:'RATE_LIMIT',status:429});});
 it('retains a healthy 70-second request instead of aborting at the former 65-second limit',async()=>{
  vi.useFakeTimers();vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{const c=new AbortController();setTimeout(()=>c.abort(new DOMException('timeout','TimeoutError')),ms);return c.signal;});
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(stream([{type:'result',data:{ok:true}}])),70000);init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal!.reason);},{once:true});}));
  const result=requestApi('parse',{text:'双开关电路'});await vi.advanceTimersByTimeAsync(70001);await expect(result).resolves.toEqual({ok:true});
 });
});
