import {CircuitSchema,registry,type CircuitDocument} from './schema';
export type Reading={voltage:number|null;current:number|null;power:number|null};
export type Solution={ok:boolean;reason?:string;readings:Record<string,Reading>;nodeVoltages:Record<string,number>;totalCurrent:number|null;equivalentResistance:number|null;sourcePower:number|null;notes:string[]};
const fail=(reason:string):Solution=>({ok:false,reason,readings:{},nodeVoltages:{},totalCurrent:null,equivalentResistance:null,sourcePower:null,notes:[]});
/** Dense modified nodal analysis with partial pivoting. No LLM values are used as solutions. */
export function linearSolve(a:number[][],b:number[]):number[]{
 const m=a.map((r,i)=>[...r,b[i]]),n=b.length;
 for(let p=0;p<n;p++){
  let k=p;for(let i=p+1;i<n;i++)if(Math.abs(m[i][p])>Math.abs(m[k][p]))k=i;
  if(Math.abs(m[k][p])<1e-13)throw new Error('电源或电流表形成理想短路/冗余回路，请检查接线。');
  [m[p],m[k]]=[m[k],m[p]];const d=m[p][p];for(let j=p;j<=n;j++)m[p][j]/=d;
  for(let i=0;i<n;i++){if(i===p)continue;const f=m[i][p];for(let j=p;j<=n;j++)m[i][j]-=f*m[p][j];}
 }
 return m.map(r=>r[n]);
}
export function solve(input:CircuitDocument):Solution{
 const parsed=CircuitSchema.safeParse(input);if(!parsed.success)return fail(parsed.error.issues[0].message);const doc=parsed.data;
 const unsupported=doc.components.filter(c=>registry[c.type].support==='limited');
 if(unsupported.length)return fail(`${unsupported.map(c=>c.id+' '+registry[c.type].label).join('、')}：保留图形，当前只支持线性直流电路。`);
 const missing=doc.components.filter(c=>['source','resistor','rheostat'].includes(c.type)&&(c.value===null||c.valueSource==='suggested'));
 if(missing.length)return fail(`${missing.map(c=>c.id).join('、')} 待填写或确认参数；不使用猜测值计算。`);
 const parent=new Map(doc.nodes.map(n=>[n.id,n.id]));const root=(n:string):string=>{const p=parent.get(n)!;if(p===n)return n;const r=root(p);parent.set(n,r);return r;};
 const join=(a:string,b:string)=>parent.set(root(a),root(b));
 for(const c of doc.components)if(c.type==='wire'||(['switch','fuse'].includes(c.type)&&c.closed))join(c.a,c.b);
 const nodes=[...new Set(doc.nodes.map(n=>root(n.id)))];
 const adj=new Map(nodes.map(n=>[n,new Set<string>()]));
 for(const c of doc.components)if(['source','resistor','rheostat','ammeter'].includes(c.type)){const a=root(c.a),b=root(c.b);adj.get(a)!.add(b);adj.get(b)!.add(a);}
 const islands=new Map<string,number>(),grounds=new Set<string>();let island=0;
 for(const n of nodes){if(islands.has(n))continue;grounds.add(n);const q=[n];while(q.length){const v=q.pop()!;if(islands.has(v))continue;islands.set(v,island);for(const x of adj.get(v)!)q.push(x);}island++;}
 const free=nodes.filter(n=>!grounds.has(n)),idx=new Map(free.map((n,i)=>[n,i]));
 const vs=doc.components.filter(c=>['source','ammeter'].includes(c.type));
 for(const c of vs)if(root(c.a)===root(c.b))return fail(`${c.id} 两端被导线或闭合开关短接。`);
 const size=free.length+vs.length,a=Array.from({length:size},()=>Array(size).fill(0) as number[]),b=Array(size).fill(0) as number[];
 const stamp=(r:string,col:string,v:number)=>{const i=idx.get(r),j=idx.get(col);if(i!==undefined&&j!==undefined)a[i][j]+=v;};
 for(const c of doc.components)if(['resistor','rheostat'].includes(c.type)){const p=root(c.a),q=root(c.b),g=1/c.value!;stamp(p,p,g);stamp(q,q,g);stamp(p,q,-g);stamp(q,p,-g);}
 vs.forEach((c,k)=>{const row=free.length+k;for(const [node,sgn] of [[root(c.a),1],[root(c.b),-1]] as const){const i=idx.get(node);if(i!==undefined){a[i][row]+=sgn;a[row][i]+=sgn;}}b[row]=c.type==='source'?c.value!:0;});
 let x:number[];try{x=linearSolve(a,b);}catch(e){return fail((e as Error).message);}
 if(x.some(v=>!Number.isFinite(v)))return fail('求解未收敛，请检查电路连接与参数。');
 const v=(n:string)=>{const i=idx.get(root(n));return i===undefined?0:x[i];};const readings:Record<string,Reading>={};
 for(const c of doc.components){const same=islands.get(root(c.a))===islands.get(root(c.b));const voltage=same?v(c.a)-v(c.b):null;let current:number|null=null;
  if(['resistor','rheostat'].includes(c.type))current=(voltage??0)/c.value!;
  else if(c.type==='voltmeter'||(['switch','fuse'].includes(c.type)&&!c.closed))current=0;
  else if(['source','ammeter'].includes(c.type))current=x[free.length+vs.findIndex(s=>s.id===c.id)];
  readings[c.id]={voltage,current,power:voltage!==null&&current!==null?voltage*current:null};
 }
 const sources=doc.components.filter(c=>c.type==='source'),single=sources.length===1?sources[0]:null,totalCurrent=single?Math.abs(readings[single.id].current!):null;
 return {ok:true,readings,nodeVoltages:Object.fromEntries(doc.nodes.map(n=>[n.id,v(n.id)])),totalCurrent,equivalentResistance:single&&single.value!==0?(totalCurrent===0?Infinity:Math.abs(single.value!)/totalCurrent!):null,sourcePower:sources.reduce((sum,c)=>sum-readings[c.id].power!,0),notes:[...(island>1?['断开的支路按独立电位参考求解；跨浮置区域的电压未定义。']:[]),...(doc.components.some(c=>['wire','switch','fuse'].includes(c.type))?['理想导线与闭合开关的单独电流不报告；可串接电流表测量。']:[])]};
}
