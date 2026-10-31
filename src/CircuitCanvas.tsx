import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import {Maximize2,Minus,Plus,RotateCcw} from 'lucide-react';
import {registry,type CircuitDocument,type Component} from './circuit/schema';
import type {Solution} from './circuit/solver';
import {displayQuantity} from './circuit/units';
import {studentText} from './circuit/studentText';
import {Robot} from './Robot';
import {layoutCircuit,pathData,topologyKey} from './circuit/layout';
export const format=(n:number|null|undefined,unit='')=>n===null||n===undefined?'—':!Number.isFinite(n)?`∞ ${unit}`:unit?displayQuantity(Math.abs(n)<1e-12?0:n,unit):`${Number((Math.abs(n)<1e-10?0:n).toPrecision(4))}`;
/** Instrument geometry and resistor bands adapted from Ninefold LabApparatus.tsx. */
function Symbol({c,reading,selected,vertical,reversed=false}:{c:Component;reading?:number|null;selected:boolean;vertical:boolean;reversed?:boolean}){
 if(c.type==='source')return <g transform={vertical?'rotate(-90)':undefined}><rect x="-51" y="-36" width="102" height="72" rx="11" fill="#e8f4ff" stroke="#afc3dc" strokeWidth="2"/><rect x="-38" y="-23" width="76" height="27" rx="4" fill="#102d5a"/><text y="-4" textAnchor="middle" fill="white" fontSize="20" stroke="none">{format(c.value,'V')}</text><circle cx="-30" cy="22" r="4" fill="#2a4c73"/><text x="-30" y="25" textAnchor="middle" fontSize="10" stroke="none" fill="white">{reversed?'−':'+'}</text><circle cx="30" cy="22" r="4" fill="#2a4c73"/><text x="30" y="25" textAnchor="middle" fontSize="10" stroke="none" fill="white">{reversed?'+':'−'}</text><path d={vertical?'M0 -65V-36M0 36V65':'M-65 0H-51M51 0H65'}/></g>;
 if(c.type==='resistor'||c.type==='rheostat')return <g><path d="M-65 0H65"/><rect x="-42" y="-15" width="84" height="30" rx="7" fill={selected?'#fff':'#e6effa'} stroke="#bbd1ea" strokeWidth="1.5"/>{[-20,-10,2,23].map((dx,j)=><path key={dx} d={`M${dx} -14v28`} stroke={['#314563','#6c819b','#314563','#95a8bd'][j]} strokeWidth={j===3?4:5}/>)}{c.type==='rheostat'&&<path d="M-12 -35 14 -9m-12 0h12v-12" stroke="white" strokeWidth="3"/>}</g>;
 if(c.type==='ammeter'||c.type==='voltmeter')return <g><path d="M-65 0H-32M32 0H65"/><circle r="32" fill="#e8f4ff" stroke="#bdd5ed" strokeWidth="2"/><g transform={vertical?'rotate(-90)':undefined}><text y="-1" textAnchor="middle" stroke="none" fill="#123d76" fontSize="25" fontWeight="600">{c.type==='ammeter'?'A':'V'}</text><text y="18" textAnchor="middle" stroke="none" fill="#123d76" fontSize="16">{format(reading)}</text></g></g>;
 if(c.type==='spdt')return <g><path d="M-65 0H-25M25 -30H65M25 30H65"/><path d={c.parameters?.throw===1?'M-25 0 25 -30':c.parameters?.throw===2?'M-25 0 25 30':'M-25 0 18 -12'} stroke="white" strokeWidth="4"/>{[-30,30].map(y=><circle key={y} cx="25" cy={y} r="4" fill="white"/>)}<circle cx="-25" r="4" fill="white"/><text x="40" y="-39" fill="white" stroke="none" fontSize="16">1</text><text x="40" y="52" fill="white" stroke="none" fontSize="16">2</text></g>;
 if(c.type==='fuse')return <g><path d="M-65 0H65"/><rect x="-38" y="-14" width="76" height="28" fill="none"/></g>;
 if(['switch','spdt'].includes(c.type))return <g><path d="M-65 0H-25M25 0H65"/><path d={c.closed?'M-25 0H25':'M-25 0 22 -27'} stroke="#fff" strokeWidth="4" strokeLinecap="round"/><circle cx="-25" r="4" fill="white"/><circle cx="25" r="4" fill="white"/></g>;
 if(c.type==='capacitor'||c.type==='polar_capacitor')return <g><path d="M-65 0H-9M9 0H65M-9 -27V27M9 -27V27"/>{c.type==='polar_capacitor'&&<text x={reversed?20:-28} y="-32" fontSize="17" fill="white" stroke="none">+</text>}</g>;
 if(c.type==='diode'||c.type==='led'||c.type==='zener')return <g><g transform={reversed?'scale(-1 1)':undefined}><path d="M-65 0H-22M22 0H65M22 -23V23"/><path d="M-22 -23 22 0 -22 23Z" fill="#ffffff20"/>{c.type==='zener'&&<path d="M22 -23 32 -30M22 23 12 30"/>}{c.type==='led'&&<path d="M-7 -32 10 -49m-7 0h7v7M12 -25 29 -42m-7 0h7v7"/>}</g><text x={reversed?28:-37} y="31" fill="white" stroke="none" fontSize="16">A</text><text x={reversed?-37:28} y="31" fill="white" stroke="none" fontSize="16">K</text></g>;
 if(c.type==='thermistor'||c.type==='photoresistor')return <g><path d="M-65 0H-35M35 0H65"/><rect x="-35" y="-15" width="70" height="30" fill="none"/>{c.type==='thermistor'?<path d="M-40 30H-22L32 -29"/>:<><circle r="47" fill="none"/><path d="M-35 -52 -10 -30m-10 0h10v-10M-10 -56 15 -34m-10 0h10v-10"/></>}</g>;
 if(c.type==='motor'||c.type==='galvanometer')return <g><path d="M-65 0H-30M30 0H65"/><circle r="30" fill="none"/><text textAnchor="middle" y="9" fill="white" stroke="none" fontSize="26">{c.type==='motor'?'M':'G'}</text></g>;
 if(c.type==='inductor')return <g><path d="M-65 0H-40C-40 -30 -20 -30 -20 0C-20 -30 0 -30 0 0C0 -30 20 -30 20 0C20 -30 40 -30 40 0H65" fill="none"/></g>;
 if(c.type==='lamp')return <g><path d="M-65 0H-30M30 0H65"/><circle r="30" fill="none"/><path d="M-21 -21 21 21M-21 21 21 -21"/></g>;
 if(c.type==='ac_source')return <g><path d="M-65 0H-30M30 0H65"/><circle r="30" fill="none"/><path d="M-22 0C-17 -26 -5 -26 0 0S17 26 22 0" fill="none"/></g>;
 if(c.type==='wire')return <path d="M-65 0H65"/>;
 return <g><path d="M-65 0H-36M36 0H65"/><rect x="-36" y="-22" width="72" height="44" rx="8" fill="#ffffff15" strokeDasharray="4 4"/><text textAnchor="middle" y="6" fill="white" stroke="none" fontSize="16">{'未知器件'}</text></g>;
}
export function CircuitCanvas({doc,solution,selected,onSelect,onToggle,onMove,assembling,placed,review}:{doc:CircuitDocument;solution:Solution;selected:string;onSelect:(id:string)=>void;onToggle:(id:string)=>void;onMove:(id:string,x:number,y:number)=>void;assembling:boolean;placed:number;review:boolean}){
 const [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[draft,setDraft]=useState<{id:string;x:number;y:number}|null>(null);
 const svg=useRef<SVGSVGElement>(null),drag=useRef<{id:string;startX:number;startY:number;originX:number;originY:number;moved:boolean}|null>(null),panning=useRef<{x:number;y:number;panX:number;panY:number}|null>(null);
 const key=topologyKey(doc);
 const layout=useMemo(()=>layoutCircuit(doc),[key]);
 const width=layout.width,height=layout.height;const [scale,setScale]=useState(1);useEffect(()=>{const el=svg.current;if(!el)return;const observer=new ResizeObserver(([e])=>setScale(Math.min(e.contentRect.width/width,e.contentRect.height/height)||1));observer.observe(el);return()=>observer.disconnect();},[width,height]);
 const point=(e:PointerEvent)=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return {x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:(p.x-width/2-pan.x)/zoom+width/2,y:(p.y-height/2-pan.y)/zoom+height/2};};
 const actual=doc.components.filter(c=>c.type!=='wire'),visible=new Set((assembling?actual.slice(0,placed):actual).map(c=>c.id)),current=actual[Math.min(placed,actual.length-1)],target=current?layout.placements[current.id]:undefined;
 const reset=()=>{setZoom(1);setPan({x:0,y:0});};
 return <div className={`circuit-canvas topology-canvas ${review?'awaiting-review':''} ${assembling?'is-building':''}`} data-layout-mode={layout.mode}>
  <div className="canvas-note"><span className="canvas-live-dot"/>{assembling?`正在放置 ${current?.id??'元件'}`:review?'请核对待确认项，可点击开关修正':doc.source==='example'?'示例电路 · 点击开关可切换':'按原图初态 · 点击开关可切换'}</div>
  <div className="canvas-tools"><button aria-label="缩小电路" onClick={()=>setZoom(z=>Math.max(.5,z-.15))}><Minus size={16}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="放大电路" onClick={()=>setZoom(z=>Math.min(3.5,z+.15))}><Plus size={16}/></button><button aria-label="电路自适应居中" onClick={reset}><Maximize2 size={16}/></button></div>
  <svg ref={svg} viewBox={`0 0 ${width} ${height}`} className="circuit-svg" aria-label={`${doc.title}，${actual.length}个元件。电连接由节点决定，拖动仅改变布局。`} onPointerMove={e=>{
   if(drag.current){const p=point(e),d=drag.current;if(Math.hypot(p.x-d.startX,p.y-d.startY)>10)d.moved=true;if(d.moved)setDraft({id:d.id,x:Math.max(130,Math.min(width-130,d.originX+p.x-d.startX)),y:Math.max(110,Math.min(height-110,d.originY+p.y-d.startY))});}
   else if(panning.current){const matrix=svg.current?.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),d=panning.current;setPan({x:d.panX+p.x-d.x,y:d.panY+p.y-d.y});}
  }} onPointerUp={()=>{const d=drag.current;if(d?.moved&&draft){onMove(draft.id,draft.x,draft.y);}else if(d){onSelect(d.id);if(doc.components.some(c=>c.id===d.id&&['switch','spdt'].includes(c.type)))onToggle(d.id);}drag.current=null;panning.current=null;setDraft(null);}} onPointerCancel={()=>{drag.current=null;panning.current=null;setDraft(null);}}>
   <defs><pattern id="board-dots" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="white" opacity=".13"/></pattern></defs>
   <rect className="canvas-pan-area" width={width} height={height} fill="url(#board-dots)" onPointerDown={e=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return;e.currentTarget.setPointerCapture(e.pointerId);const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());panning.current={x:p.x,y:p.y,panX:pan.x,panY:pan.y};}}/>
   <g transform={`translate(${width/2+pan.x} ${height/2+pan.y}) scale(${zoom}) translate(${-width/2} ${-height/2})`}>
    <g className="circuit-wires" pointerEvents="none">{[...new Set(layout.wires.map(w=>w.net))].map(net=>{const routes=layout.wires.filter(w=>w.net===net&&(!assembling||!w.owner||visible.has(w.owner)));return <g key={net} data-net={net}>
     {routes.map((wire,i)=><path key={`halo-${i}`} d={pathData(wire.points)} fill="none" stroke="#06419e" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>)}
     {routes.map((wire,i)=><path key={i} className="routed-wire" d={pathData(wire.points)} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>)}
    </g>;})}</g>
    {layout.junctions.map((p,i)=><circle key={`${p.net}-${i}`} cx={p.x} cy={p.y} r="5" fill="white" data-junction-net={p.net}/>)}
    {actual.filter(c=>visible.has(c.id)).map(c=>{const base=layout.placements[c.id],g=draft?.id===c.id?{...base,x:draft.x,y:draft.y}:base,r=solution.readings[c.id],selectedC=selected===c.id;
     const value=['source','resistor','rheostat','capacitor','polar_capacitor','inductor','thermistor','photoresistor'].includes(c.type)?c.unitUncertain?'单位待确认':c.value===null?'待填写':format(c.value,registry[c.type].unit):['switch','fuse'].includes(c.type)?c.stateSource==='uncertain'?'待确认':c.closed?'闭合':'断开':c.type==='spdt'?(c.stateSource==='uncertain'?'请确认位置':c.parameters?.throw?'接 '+c.parameters.throw:'断开'):c.type==='ammeter'?format(r?.current,'A'):c.type==='voltmeter'?format(r?.voltage,'V'):'';
     return <g key={c.id} className={`circuit-component ${selectedC?'selected':''} ${c.confidence<.8?'uncertain-component':''}`} data-component-id={c.id} data-layout-x={g.x} data-layout-y={g.y} data-terminal-a={`${g.terminalA.x},${g.terminalA.y}`} data-terminal-b={`${g.terminalB.x},${g.terminalB.y}`}>
      <g transform={`translate(${g.x} ${g.y})`} role={['switch','spdt'].includes(c.type)?'switch':'button'} aria-checked={['switch','spdt'].includes(c.type)?c.closed:undefined} tabIndex={0} aria-label={['switch','spdt'].includes(c.type)?`${c.id} 图中开关`:`${c.id} ${registry[c.type].label}，${value}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(c.id);if(['switch','spdt'].includes(c.type))onToggle(c.id);}}} onPointerDown={e=>{if(assembling)return;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);drag.current={id:c.id,startX:p.x,startY:p.y,originX:g.x,originY:g.y,moved:false};e.preventDefault();e.stopPropagation();}}>
       {doc.measurements.some(m=>m.targetId===c.id)&&<title>{doc.measurements.filter(m=>m.targetId===c.id).map(m=>`题目给定 ${m.value??'待求'} · ${m.quantity}；${Object.entries(m.conditions).map(([id,v])=>id+(v?'闭合':'断开')).join('、')}`).join('；')}</title>}{['switch','spdt'].includes(c.type)&&<title>{c.stateSource==='uncertain'?'初态待确认；点击切换开关':'点击闭合或断开，拖动调整位置'}</title>}
       <rect className="component-hit" x="-90" y="-78" width="180" height="156" rx="18" fill={selectedC?'#ffffff08':'transparent'} stroke={selectedC?'#ffffff65':'transparent'} strokeWidth="1"/>
       {doc.measurements.some(m=>m.targetId===c.id)&&<text y="-78" textAnchor="middle" fill="white" fontSize="16">题目条件 ×{doc.measurements.filter(m=>m.targetId===c.id).length}</text>}<g stroke="#d1e6ff" strokeWidth="3"><Symbol c={c} reading={r?.[c.type==='ammeter'?'current':'voltage']} selected={selectedC} vertical={false} reversed={g.reversed}/></g>
       <text className="component-label" style={{fontSize:Math.max(22,13/scale)}} y={c.type==='led'?-72:-52} textAnchor="middle">{c.id}</text><text className="component-value" style={{fontSize:Math.max(20,13/scale)}} y="60" textAnchor="middle">{value}</text>
      </g>
     </g>;
    })}
    {assembling&&target&&<g style={{transform:`translate(${target.x-45}px,${target.y-160}px)`,transition:'transform .3s cubic-bezier(.2,0,0,1)'}}><foreignObject width="90" height="110"><Robot working/></foreignObject></g>}
   </g>
  </svg>
  <div className="canvas-bottom"><span>● 实心点相连 · 跨线留白不相连</span><span>点击开关切换 · 拖动空白处平移</span></div>
  {!solution.ok&&!review&&<div className="canvas-warning" role="status">{studentText(solution.reason)}</div>}
  {review&&<div className="canvas-warning">识别草图 · 暂不计算，确认后继续</div>}
  <button className="reset-layout" aria-label="重新居中电路" onClick={reset}><RotateCcw size={14}/></button>
 </div>;
}
