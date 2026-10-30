import {useRef,useState,type PointerEvent} from 'react';
import {Maximize2,Minus,Plus,RotateCcw} from 'lucide-react';
import {registry,type CircuitDocument,type Component} from './circuit/schema';
import type {Solution} from './circuit/solver';
import {Robot} from './Robot';
export const format=(n:number|null|undefined,unit='')=>n===null||n===undefined?'—':!Number.isFinite(n)?`∞ ${unit}`:`${Number((Math.abs(n)<1e-10?0:n).toPrecision(4))}${unit?' '+unit:''}`;
export function componentGeometry(c:Component,doc:CircuitDocument){
 const a=doc.nodes.find(n=>n.id===c.a)!,b=doc.nodes.find(n=>n.id===c.b)!;
 const vertical=Math.abs(b.y-a.y)>Math.abs(b.x-a.x);const x=c.position?.x??(a.x+b.x)/2,y=c.position?.y??(a.y+b.y)/2;
 return {a,b,x,y,vertical,angle:vertical?90:0,start:vertical?{x,y:y-65}:{x:x-65,y},end:vertical?{x,y:y+65}:{x:x+65,y}};
}
/** Instrument geometry and resistor bands adapted from Ninefold LabApparatus.tsx. */
function Symbol({c,reading,selected,vertical}:{c:Component;reading?:number|null;selected:boolean;vertical:boolean}){
 if(c.type==='source')return <g transform={vertical?'rotate(-90)':undefined}><rect x="-51" y="-36" width="102" height="72" rx="11" fill="#e8f4ff" stroke="#afc3dc" strokeWidth="2"/><rect x="-38" y="-23" width="76" height="27" rx="4" fill="#102d5a"/><text y="-4" textAnchor="middle" fill="white" fontSize="20" stroke="none">{format(c.value,'V')}</text><circle cx="-30" cy="22" r="4" fill="#2a4c73"/><text x="-30" y="25" textAnchor="middle" fontSize="10" stroke="none" fill="white">+</text><circle cx="30" cy="22" r="4" fill="#2a4c73"/><text x="30" y="25" textAnchor="middle" fontSize="10" stroke="none" fill="white">−</text><path d={vertical?'M0 -65V-36M0 36V65':'M-65 0H-51M51 0H65'}/></g>;
 if(c.type==='resistor'||c.type==='rheostat')return <g><path d="M-65 0H65"/><rect x="-42" y="-15" width="84" height="30" rx="7" fill={selected?'#fff':'#e6effa'} stroke="#bbd1ea" strokeWidth="1.5"/>{[-20,-10,2,23].map((dx,j)=><path key={dx} d={`M${dx} -14v28`} stroke={['#314563','#6c819b','#314563','#95a8bd'][j]} strokeWidth={j===3?4:5}/>)}{c.type==='rheostat'&&<path d="M-12 -35 14 -9m-12 0h12v-12" stroke="white" strokeWidth="3"/>}</g>;
 if(c.type==='ammeter'||c.type==='voltmeter')return <g><path d="M-65 0H-32M32 0H65"/><circle r="32" fill="#e8f4ff" stroke="#bdd5ed" strokeWidth="2"/><g transform={vertical?'rotate(-90)':undefined}><text y="-1" textAnchor="middle" stroke="none" fill="#123d76" fontSize="25" fontWeight="600">{c.type==='ammeter'?'A':'V'}</text><text y="18" textAnchor="middle" stroke="none" fill="#123d76" fontSize="16">{format(reading)}</text></g></g>;
 if(c.type==='switch'||c.type==='fuse')return <g><path d="M-65 0H-25M25 0H65"/><path d={c.closed?'M-25 0H25':'M-25 0 22 -27'} stroke="#fff" strokeWidth="4" strokeLinecap="round"/><circle cx="-25" r="4" fill="white"/><circle cx="25" r="4" fill="white"/></g>;
 return <g><path d="M-65 0H-36M36 0H65"/><rect x="-36" y="-22" width="72" height="44" rx="8" fill="#ffffff15" strokeDasharray="4 4"/><text textAnchor="middle" y="6" fill="white" stroke="none" fontSize="14">{c.type==='lamp'?'灯泡':c.type==='capacitor'?'电容':c.type==='inductor'?'电感':c.type==='diode'?'二极管':'待支持'}</text></g>;
}
export function CircuitCanvas({doc,solution,selected,onSelect,onMove,assembling,placed,review}:{doc:CircuitDocument;solution:Solution;selected:string;onSelect:(id:string)=>void;onMove:(id:string,x:number,y:number)=>void;assembling:boolean;placed:number;review:boolean}){
 const [zoom,setZoom]=useState(1);const [draft,setDraft]=useState<{id:string;x:number;y:number}|null>(null);const svg=useRef<SVGSVGElement>(null);const drag=useRef<{id:string;startX:number;startY:number;originX:number;originY:number}|null>(null);
 const point=(e:PointerEvent)=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return {x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:(p.x-500)/zoom+500,y:(p.y-300)/zoom+300};};
 const current=doc.components[Math.min(placed,doc.components.length-1)],target=current?componentGeometry(current,doc):{x:800,y:460};
 const visible=assembling?doc.components.slice(0,placed):doc.components;
 return <div className={`circuit-canvas ${review?'awaiting-review':''}`}>
  <div className="canvas-note"><span className="canvas-live-dot"/>{assembling?`正在放置 ${current?.id??'元件'}`:doc.source==='example'?'示例电路 · 可直接调参':review?'请先确认识别中的不确定连接':'电路已就绪 · 点击元件调参'}</div>
  <div className="canvas-tools"><button aria-label="缩小电路" onClick={()=>setZoom(z=>Math.max(.5,z-.15))}><Minus size={16}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="放大电路" onClick={()=>setZoom(z=>Math.min(2,z+.15))}><Plus size={16}/></button><button aria-label="电路自适应居中" onClick={()=>setZoom(1)}><Maximize2 size={16}/></button></div>
  <svg ref={svg} viewBox="0 0 1000 600" className="circuit-svg" aria-label={`${doc.title}，${doc.components.length} 个元件。元件连接由节点决定，拖动仅改变布局。`} onPointerMove={e=>{if(!drag.current)return;const p=point(e),d=drag.current;setDraft({id:d.id,x:Math.max(70,Math.min(930,d.originX+p.x-d.startX)),y:Math.max(70,Math.min(530,d.originY+p.y-d.startY))});}} onPointerUp={()=>{if(drag.current&&draft)onMove(draft.id,draft.x,draft.y);drag.current=null;setDraft(null);}} onPointerCancel={()=>{drag.current=null;setDraft(null);}}>
   <defs><pattern id="board-dots" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="white" opacity=".13"/></pattern></defs>
   <rect width="1000" height="600" fill="url(#board-dots)"/>
   <g transform={`translate(500 300) scale(${zoom}) translate(-500 -300)`}>
   {visible.map(original=>{const c=draft?.id===original.id?{...original,position:{x:draft.x,y:draft.y}}:original,g=componentGeometry(c,doc);const selectedC=selected===c.id;const r=solution.readings[c.id];
    if(c.type==='wire')return <path key={c.id} className="wire" d={`M${g.a.x} ${g.a.y}H${g.b.x}V${g.b.y}`} fill="none" stroke="#bedbff" strokeWidth="3"/>;
    const path=g.vertical?`M${g.a.x} ${g.a.y}H${g.x}V${g.start.y}M${g.end.x} ${g.end.y}V${g.b.y}H${g.b.x}`:`M${g.a.x} ${g.a.y}V${g.y}H${g.start.x}M${g.end.x} ${g.end.y}H${g.b.x}V${g.b.y}`;
    return <g key={c.id} className={`circuit-component ${selectedC?'selected':''} ${c.confidence<.8?'uncertain-component':''}`}>
      <path className="wire" d={path} fill="none" stroke={selectedC?'#fff':'#a9cfff'} strokeWidth={selectedC?3.5:2.8}/>
      <g transform={`translate(${g.x} ${g.y})`} role="button" tabIndex={0} aria-label={`${c.id} ${registry[c.type].label}，${c.value===null?'待填写':format(c.value,registry[c.type].unit)}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(c.id);}}} onPointerDown={e=>{if(assembling)return;e.currentTarget.setPointerCapture(e.pointerId);onSelect(c.id);const p=point(e);drag.current={id:c.id,startX:p.x,startY:p.y,originX:g.x,originY:g.y};e.preventDefault();}}>
       <rect className="component-hit" x={g.vertical?-52:-76} y={g.vertical?-76:-48} width={g.vertical?104:152} height={g.vertical?152:96} rx="18" fill={selectedC?'#ffffff0d':'transparent'} stroke={selectedC?'#ffffff75':'transparent'} strokeWidth="1"/>
       <g transform={`rotate(${g.angle})`} stroke="#d1e6ff" strokeWidth="3"><Symbol c={c} reading={r?.[c.type==='ammeter'?'current':'voltage']} selected={selectedC} vertical={g.vertical}/></g>
       <text className="component-label" x={g.vertical?-52:0} y={g.vertical?-8:-48} textAnchor={g.vertical?'end':'middle'}>{c.id}</text>
       <text className="component-value" x={g.vertical?-52:0} y={g.vertical?14:55} textAnchor={g.vertical?'end':'middle'}>{['source','resistor','rheostat'].includes(c.type)?c.value===null?'待填写':format(c.value,registry[c.type].unit):c.type==='switch'?(c.closed?'闭合':'断开'):c.type==='ammeter'?format(r?.current,'A'):c.type==='voltmeter'?format(r?.voltage,'V'):''}</text>
      </g>
    </g>;
   })}
   {doc.nodes.map(n=><g key={n.id}><circle cx={n.x} cy={n.y} r="4.5" fill="white"/><text x={n.x+9} y={n.y-10} fill="white" fontSize="20" opacity="1">{n.id}</text></g>)}
   {assembling&&<g style={{transform:`translate(${target.x+10}px,${target.y-120}px)`,transition:'transform .4s ease'}}><foreignObject width="90" height="100"><Robot working/></foreignObject></g>}
   </g>
  </svg>
  <div className="canvas-bottom"><span>● 实心点为电连接 · 跨线无点不相连</span><span>拖动调整位置 · 接线保持不变</span></div>
  {!solution.ok&&!review&&<div className="canvas-warning" role="status">{solution.reason}</div>}
  {review&&<div className="canvas-warning">识别草图 · 暂不计算，确认后继续</div>}
  <button className="reset-layout" aria-label="重新居中电路" onClick={()=>setZoom(1)}><RotateCcw size={14}/></button>
 </div>;
}
