import {describe,it,expect} from 'vitest';
import report from '../../docs/evidence/layout-v3/real-benchmark.json';
import {CircuitSchema} from './schema';
import {solve} from './solver';
import {layoutCircuit,wireEntersOtherSymbol} from './layout';

describe('real provider results from the topology-only prompt',()=>{
 it('recognizes the two-switch bypass and solves all four physical states',()=>{
  const d=CircuitSchema.parse(report.results.find(r=>r.input==='switch-bypass')!.graph);
  expect(d.components.map(c=>c.id).sort()).toEqual(['R1','R2','S1','S2','V1']);expect(d.components.find(c=>c.id==='R1')!.value).toBe(10);expect(d.components.find(c=>c.id==='R2')!.value).toBe(20);expect(d.components.find(c=>c.id==='V1')!.value).toBe(12);
  const resistor=d.components.find(c=>c.id==='R2')!,bypass=d.components.find(c=>c.id==='S2')!;expect([bypass.a,bypass.b].sort()).toEqual([resistor.a,resistor.b].sort());
  for(const [s1,s2,current] of [[false,false,0],[true,false,.4],[true,true,1.2],[false,true,0]] as const){const doc=structuredClone(d);doc.components.find(c=>c.id==='S1')!.closed=s1;doc.components.find(c=>c.id==='S2')!.closed=s2;const result=solve(doc);expect(result.ok).toBe(true);expect(result.totalCurrent).toBeCloseTo(current,8);}
  expect(layoutCircuit(d).junctions.length).toBeGreaterThanOrEqual(2);
 });
 it('does not turn a given resistance sum into fabricated individual values',()=>{
  const d=CircuitSchema.parse(report.results.find(r=>r.input==='switch-unknown')!.graph);expect(d.components.filter(c=>['source','resistor'].includes(c.type)).map(c=>c.value)).toEqual([null,null,null]);expect(solve(d).ok).toBe(false);
 });
 it('recognizes mixed branches and solves 12V / (2 + (6 parallel 3)) = 3A',()=>{
  const d=CircuitSchema.parse(report.results.find(r=>r.input==='mixed')!.graph);const result=solve(d);expect(result.ok).toBe(true);expect(result.totalCurrent).toBeCloseTo(3,8);
 });
 it.each(report.results)('$input routes without any conductor passing through another symbol',({graph})=>{
  const d=CircuitSchema.parse(graph),layout=layoutCircuit(d);expect(layout.wires.every(w=>!wireEntersOtherSymbol(w,layout.placements))).toBe(true);
  // A crossing is allowed, a shared conductor segment between distinct nets is not.
  for(let i=0;i<layout.wires.length;i++)for(let j=i+1;j<layout.wires.length;j++){const a=layout.wires[i],b=layout.wires[j];if(a.net===b.net)continue;for(let x=1;x<a.points.length;x++)for(let y=1;y<b.points.length;y++){const [p,q,r,s]=[a.points[x-1],a.points[x],b.points[y-1],b.points[y]];const horizontal=p.y===q.y&&r.y===s.y&&p.y===r.y&&Math.min(Math.max(p.x,q.x),Math.max(r.x,s.x))>Math.max(Math.min(p.x,q.x),Math.min(r.x,s.x));const vertical=p.x===q.x&&r.x===s.x&&p.x===r.x&&Math.min(Math.max(p.y,q.y),Math.max(r.y,s.y))>Math.max(Math.min(p.y,q.y),Math.min(r.y,s.y));expect(horizontal||vertical).toBe(false);}}
 });
});
