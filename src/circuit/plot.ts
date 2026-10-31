import {editValue,type CircuitDocument} from './schema';
import {solve} from './solver';
export type PlotPoint={x:number;y:number};
/** Adapted from Ninefold experimentPlot.ts (1be7d91), now solves the graph at every point. */
export function plotScale(values:number[]):{min:number;max:number;step:number;ticks:number[]}{
 const finite=values.filter(Number.isFinite);let min=Math.min(...finite),max=Math.max(...finite);if(!finite.length){min=0;max=1;}if(max===min){const pad=Math.abs(min)*.1||1;min-=pad;max+=pad;}
 const rough=(max-min)/4,power=10**Math.floor(Math.log10(rough)),step=([1,2,5,10].find(n=>n*power>=rough)??10)*power;
 min=Math.floor(min/step)*step;max=Math.ceil(max/step)*step;return {min,max,step,ticks:Array.from({length:Math.min(12,Math.round((max-min)/step)+1)},(_,i)=>Number((min+i*step).toPrecision(12)))};
}
export function sweep(doc:CircuitDocument,parameter:string,observe:string,min:number,max:number,steps=30,quantity:'current'|'voltage'|'power'='current'):PlotPoint[]{
 if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min||!Number.isInteger(steps)||steps<2||steps>100)return [];
 const target=doc.components.find(c=>c.id===parameter);if(!target||!['source','resistor','rheostat'].includes(target.type)||(target.type!=='source'&&min<=0))return [];
 const points:PlotPoint[]=[];
 for(let i=0;i<=steps;i++){const x=min+(max-min)*i/steps;try{const s=solve(editValue(doc,parameter,x)),y=s.readings[observe]?.[quantity];if(s.ok&&y!==null&&y!==undefined&&Number.isFinite(y))points.push({x,y:Math.abs(y)});}catch{/* Invalid parameter samples do not create fabricated points. */}}
 return points;
}
export function csv(rows:(string|number|null)[][]){return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');}
