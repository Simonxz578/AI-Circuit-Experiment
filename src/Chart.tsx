import {useMemo,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import {registry,type CircuitDocument} from './circuit/schema';
import {csv,plotScale,sweep,type PlotPoint} from './circuit/plot';
import {format} from './CircuitCanvas';
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function Chart({doc}:{doc:CircuitDocument}){
 const params=doc.components.filter(c=>['source','resistor','rheostat'].includes(c.type));const measured=doc.components.filter(c=>['source','resistor','rheostat','ammeter','voltmeter','led','diode','capacitor','polar_capacitor'].includes(c.type));
 const [parameter,setParameter]=useState(params[0]?.id??'');const [observe,setObserve]=useState(measured.find(c=>c.type==='resistor')?.id??measured[0]?.id??'');const [min,setMin]=useState(params[0]?.type==='source'?0:Math.max(.1,(params[0]?.value??10)*.2)),[max,setMax]=useState(Math.max(20,(params[0]?.value??10)*2)),[steps,setSteps]=useState(30);const [quantity,setQuantity]=useState<'current'|'voltage'|'power'>('current');
 const actual=doc.components.find(c=>c.id===parameter&&params.includes(c))??params[0],observed=doc.components.find(c=>c.id===observe&&measured.includes(c))??measured[0];const from=min,invalidRange=!!actual&&actual.type!=='source'&&min<=0,ref=useRef<SVGSVGElement>(null);
 const points=useMemo(()=>actual&&observed&&!invalidRange?sweep(doc,actual.id,observed.id,from,max,steps,quantity):[],[doc,actual,observed,from,max,steps,quantity,invalidRange]);
 const x=plotScale(points.map(p=>p.x)),y=plotScale(points.map(p=>p.y));const xp=(v:number)=>55+(v-x.min)/(x.max-x.min)*280,yp=(v:number)=>180-(v-y.min)/(y.max-y.min)*140;
 const unit=quantity==='current'?'A':quantity==='voltage'?'V':'W';
 async function png(){if(!ref.current)return;const svg=ref.current.cloneNode(true) as SVGSVGElement;svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','760');svg.setAttribute('height','480');const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=760;canvas.height=480;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#074399';ctx.fillRect(0,0,760,480);ctx.drawImage(img,0,0,760,480);canvas.toBlob(b=>{if(b)download(b,'电路曲线.png');});URL.revokeObjectURL(url);};img.src=url;}
 return <div className="chart-panel">
  <div className="chart-fields"><label>扫描参数<select value={actual?.id??''} onChange={e=>{setParameter(e.target.value);const c=doc.components.find(c=>c.id===e.target.value);setMin(c?.type==='source'?0:Math.max(.1,(c?.value??10)*.2));setMax(Math.max(20,(c?.value??10)*2));}}>{params.map(c=><option key={c.id} value={c.id}>{c.id} · {registry[c.type].unit}</option>)}</select></label><label>观测元件<select value={observed?.id??''} onChange={e=>setObserve(e.target.value)}>{measured.map(c=><option key={c.id}>{c.id}</option>)}</select></label><label>读数<select value={quantity} onChange={e=>setQuantity(e.target.value as typeof quantity)}><option value="current">电流 / A</option><option value="voltage">电压 / V</option><option value="power">功率 / W</option></select></label></div>
  <div className="scan-range"><label>起点<input type="number" value={min} onChange={e=>setMin(Number(e.target.value))}/></label><span>—</span><label>终点<input type="number" value={max} onChange={e=>setMax(Number(e.target.value))}/></label><label>步数<input type="number" min={2} max={100} value={steps} onChange={e=>setSteps(Number(e.target.value))}/></label></div>
  <svg ref={ref} className="plot" viewBox="0 0 380 240" aria-label={`${actual?.id} 参数扫描下 ${observed?.id} 的${quantity==='current'?'电流':quantity==='voltage'?'电压':'功率'}曲线，共 ${points.length} 个求解点`}>
   <rect width="380" height="240" fill="#074399" rx="10"/>
   {y.ticks.map(t=><g key={t}><path d={`M55 ${yp(t)}H335`} stroke="#ffffff20" strokeDasharray="3 5"/><text x="45" y={yp(t)+4} fill="white" textAnchor="end" fontSize="14">{Math.abs(t)>=1000||Math.abs(t)>0&&Math.abs(t)<.001?t.toExponential(1):Number(t.toPrecision(3))}</text></g>)}
   {x.ticks.map(t=><g key={t}><text x={xp(t)} y="200" fill="white" textAnchor="middle" fontSize="14">{Math.abs(t)>=1000||Math.abs(t)>0&&Math.abs(t)<.001?t.toExponential(1):Number(t.toPrecision(3))}</text></g>)}
   <path d="M55 30V180H335" fill="none" stroke="#c0d7ff"/>
   <polyline points={points.map(p=>`${xp(p.x)},${yp(p.y)}`).join(' ')} fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>
   {points.filter((_,i)=>i%3===0).map((p:PlotPoint)=><circle key={p.x} cx={xp(p.x)} cy={yp(p.y)} r="2.5" fill="white"/>)}
   <text x="55" y="19" fill="white" fontSize="16">{observed?.id} · {unit}</text><text x="335" y="225" fill="white" textAnchor="end" fontSize="16">{actual?.id} · {actual?registry[actual.type].unit:''}</text>
  </svg>
  <p className="muted">{points.length?`${points.length} 个独立求解点 · 调参后自动更新`:invalidRange?'电阻扫描起点必须大于0Ω；0Ω为短路边界，不用极小数替代。':'当前参数或电路不可求解，请先补全参数。'}</p>
  <div className="export-row"><button disabled={!points.length} onClick={()=>download(new Blob([csv([[`${actual?.id} (${actual?registry[actual.type].unit:''})`,`${observed?.id} (${unit})`],...points.map(p=>[p.x,p.y])])],{type:'text/csv;charset=utf-8'}),'扫描数据.csv')}><Download size={14}/> 导出 CSV</button><button disabled={!points.length} onClick={()=>void png()}>保存曲线图</button></div>
  <p className="muted small">直流参数扫描 · 不表示时间曲线；LED 使用已填压降的近似模型<br/>起点 {format(from)}，终点 {format(max)}</p>
 </div>;
}
