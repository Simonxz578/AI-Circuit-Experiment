import {CircuitSchema,type CircuitDocument} from './schema';import {solve,linearSolve} from './solver';
const intentClauses=(text:string)=>text.split(/[，,。；;！!\n]/).map(s=>s.trim()).filter(Boolean);
const solveIntent=/解题|解(?:一?下)?(?:这|那)?(?:一)?道?题|做题|求解|算出.*(?:答案|结果|阻值|电压|电流)|(?:帮我|帮忙|请|替我|你帮我).*?(?:计算|算)|计算.*(?:未知|答案|阻值|电源)|算(?:一?下|一下)?(?:这道?题)/;
const negation='(?:不要|不用|无需|不必|不需要|不希望|不能|别|暂不|先别|不|没必要)';
const negatedIntent=(clause:string,verb:string)=>new RegExp(negation+'(?:帮我|帮忙|替我|给我|你|您|我|先|再|直接|自动|继续|马上|现在|重新|急着|擅自|\\s)*(?:'+verb+')').test(clause);
const fillQuestion=(clause:string)=>/需要(?:填|填写|填入).*?(?:哪些|什么)|(?:怎么|如何|怎样|应该|应当).{0,6}(?:填|代入|写入)|(?:填|填写|填入).{0,6}(?:什么|哪些|哪个|得对|对吗|正确吗|对不对)/.test(clause);
export const asksToSolve=(text:string)=>{
 const clauses=intentClauses(text),denied=clauses.some(clause=>negatedIntent(clause,'解题|解(?:一?下)?(?:这|那)?(?:一)?道?题|做题|求解|计算|算'));
 if(denied||/核对|检查|验证|算得对|是否正确|对不对/.test(text)&&!/解题|解(?:一?下)?(?:这|那)?(?:一)?道?题|做题|求解/.test(text))return false;
 const explicit=clauses.some(clause=>solveIntent.test(clause)&&!fillQuestion(clause)&&!/解.{0,8}题(?:的)?(?:思路|方法)|(?:怎么|如何)(?:来|才能)?解.{0,8}题/.test(clause));
 return explicit||asksToFill(text)&&/(?:答案|结果|数值|阻值|电压|电流|电源|[A-Za-z]\d)/.test(text);
};
export const asksToFill=(text:string)=>intentClauses(text).some(clause=>(/(?:填入|填上|填写|填好|填进去|填到|代入|写入)/.test(clause)||/填\s*(?:[A-Za-z][A-Za-z0-9_-]*|答案|结果|数值|阻值|电压|电流|电源)/.test(clause))&&!fillQuestion(clause)&&!/(?:待填写|待填入|需要填哪些|要填哪些|哪些.*(?:填写|填入))/.test(clause)&&!/^(?:我|由我|让我)(?:自己|来)?(?:填|代入|写入)/.test(clause)&&!negatedIntent(clause,'填|代入|写入'));
/** Inverse MNA: only explicit independent measurements constrain missing parameters. Never changes initial switches. */
export function answerCircuit(doc:CircuitDocument):{document?:CircuitDocument;reply:string}{
 if(doc.components.some(c=>c.unitUncertain||c.stateSource==='uncertain'))return {reply:'请先确认图中不清楚的单位或开关初态，我再计算。'};
 const unknown=doc.components.filter(c=>['source','resistor','rheostat'].includes(c.type)&&c.value===null);
 const known=doc.measurements.filter(m=>m.value!==null&&m.confidence>=.85&&!/计算结果|算出的结果/.test(m.evidence));
 if(unknown.length>4||doc.components.length>24)return {reply:'这道题超出当前自动填值的求解范围，可以继续手动调参。'};
 if(unknown.length&&known.length<unknown.length)return {reply:'目前记录的独立已知条件不足，还不能确定唯一答案。请补充原题给出的示数及对应开关状态。'};
 const build=(x:number[])=>CircuitSchema.parse({...doc,components:doc.components.map(c=>{const i=unknown.findIndex(u=>u.id===c.id);return i<0?c:{...c,value:c.type==='source'?x[i]:Math.exp(x[i]),valueSource:'user',evidence:'根据原题独立测量条件由电路求解器计算'};})});
 const residual=(x:number[])=>{const d=build(x);return known.map(m=>{const current={...d,components:d.components.map(c=>Object.hasOwn(m.conditions,c.id)?{...c,closed:m.conditions[c.id]}:c)};const s=solve(current),v=s.readings[m.targetId]?.[m.quantity];if(!s.ok||v==null||!Number.isFinite(v))throw Error('不能验证测量');return (Math.abs(m.value!)===m.value!?Math.abs(v)-m.value!:v-m.value!)/Math.max(.001,Math.abs(m.value!));});};
 let answer:CircuitDocument|undefined;
 try{
  if(!unknown.length){if(known.length&&Math.max(...residual([]).map(Math.abs))>1e-6)return {reply:'当前填写的数值与原题的示数条件不一致。请清空待求的参数，或让我根据原题重新解答。'};const s=solve(doc);if(!s.ok)return {reply:s.reason??'当前模型不能计算。'};answer=structuredClone(doc);}
  else for(const seed of [6,24,60]){
   let x=unknown.map(c=>c.type==='source'?seed:Math.log(seed));let converged=false;
   for(let iteration=0;iteration<35;iteration++){
    const r=residual(x),n=x.length,j=x.map((v,k)=>{const h=1e-5*Math.max(1,Math.abs(v)),next=[...x];next[k]+=h;return residual(next).map((v,i)=>(v-r[i])/h);});
    const a=Array.from({length:n},(_,p)=>Array.from({length:n},(_,q)=>j[p].reduce((s,v,i)=>s+v*j[q][i],0))),b=j.map(col=>-col.reduce((s,v,i)=>s+v*r[i],0));
    const delta=linearSolve(a,b); // Rank deficiency is rejected even when repeated measurements happen to fit.
    if(Math.max(...r.map(Math.abs))<1e-7){converged=true;break;}
    const score=r.reduce((s,v)=>s+v*v,0);let accepted=false;
    for(const rate of [1,.5,.25,.1,.03]){const next=x.map((v,i)=>v+delta[i]*rate);try{if(residual(next).reduce((s,v)=>s+v*v,0)<score){x=next;accepted=true;break;}}catch{/* Out-of-range candidates are not applied. */}}
    if(!accepted)break;
   }
   if(!converged)continue;const candidate=build(x);candidate.components=candidate.components.map(c=>unknown.some(u=>u.id===c.id)&&c.value!==null?{...c,value:Number(c.value.toPrecision(8))}:c);
   if(answer&&unknown.some(c=>Math.abs(candidate.components.find(v=>v.id===c.id)!.value!-answer!.components.find(v=>v.id===c.id)!.value!)>1e-4*Math.max(1,Math.abs(answer!.components.find(v=>v.id===c.id)!.value!))))return {reply:'已知条件可能对应不止一组答案，我不会自动填写。请补充题目限制。'};
   answer=candidate;
  }
 }catch{return {reply:'现有条件无法得到可核验的唯一结果，请补充原题条件。'};}
 if(!answer)return {reply:'暂未从这些条件得到可核验的答案，请检查示数、单位及开关条件。'};
 for(const m of known){const state={...answer,components:answer.components.map(c=>Object.hasOwn(m.conditions,c.id)?{...c,closed:m.conditions[c.id]}:c)};const check=solve(state),value=check.readings[m.targetId]?.[m.quantity];if(!check.ok||value==null||Math.abs((m.value!>=0?Math.abs(value):value)-m.value!)>1e-6*Math.max(.001,Math.abs(m.value!)))return {reply:'结果取整后未能通过题目条件核验，未自动填写。'};}
 // Record calculated meter results separately; preserve every initial switch state.
 const s=solve(answer);if(s.ok)for(const c of answer.components.filter(c=>['ammeter','voltmeter'].includes(c.type))){const quantity=c.type==='ammeter'?'current':'voltage',value=s.readings[c.id]?.[quantity];if(value==null)continue;const existing=answer.measurements.find(m=>m.targetId===c.id&&m.source==='user'&&!Object.keys(m.conditions).length);let i=1;while(answer.measurements.some(m=>m.id==='M'+i))i++;answer.measurements=answer.measurements.filter(m=>m.id!==existing?.id);answer.measurements.push({id:existing?.id??'M'+i,targetId:c.id,quantity,value:Math.abs(value),conditions:{},source:'user',confidence:1,evidence:'电路求解器计算的结果'});}
 const results=unknown.map(c=>{const n=answer!.components.find(v=>v.id===c.id)!.value!;return `${c.id}=${Number(n.toPrecision(8))}${c.type==='source'?'V':'Ω'}`;});
 return {document:answer,reply:unknown.length?`依据原题给出的示数及开关条件计算：${results.join('，')}。结果已回代核对；图示初始开关状态保持不变。`:'已按当前接线与参数计算，并将电表示数记录为计算结果。'};
}
