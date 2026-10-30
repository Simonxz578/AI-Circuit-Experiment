import {describe,it,expect} from 'vitest';
import {layoutCircuit,topologyKey,wireEntersOtherSymbol} from './layout';
import {examples} from './examples';
import {CircuitSchema} from './schema';
import switchRecord from '../../docs/evidence/reliability/public-switch.json';
import unknownRecord from '../../docs/evidence/reliability/fixed-switch-unknown.json';

const cases=[...examples,CircuitSchema.parse(switchRecord.document),CircuitSchema.parse(unknownRecord.graph)];
describe('deterministic circuit layout and wire routing',()=>{
 it.each(cases.map((doc,i)=>({doc,i})))('case $i: symbols and labels do not overlap; wires avoid other components',({doc})=>{
  const before=JSON.stringify(doc),layout=layoutCircuit(doc),poses=Object.values(layout.placements);
  expect(poses.length).toBe(doc.components.filter(c=>c.type!=='wire').length);
  for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++)expect(Math.abs(poses[i].x-poses[j].x)>=205||Math.abs(poses[i].y-poses[j].y)>=172).toBe(true);
  for(const p of poses){expect(p.x-90).toBeGreaterThan(0);expect(p.x+90).toBeLessThan(layout.width);expect(p.y-78).toBeGreaterThan(0);expect(p.y+78).toBeLessThan(layout.height);}
  for(const wire of layout.wires){expect(wireEntersOtherSymbol(wire,layout.placements)).toBe(false);wire.points.forEach((p,i)=>{if(i)expect(p.x===wire.points[i-1].x||p.y===wire.points[i-1].y).toBe(true);});}
  expect(layout.wires.filter(w=>w.owner)).toHaveLength(poses.length*2);expect(JSON.stringify(doc)).toBe(before);
 });
 it('overlapping model positions never place two parallel components together',()=>{const d=structuredClone(cases[3]);d.components.forEach(c=>c.position={x:500,y:200});const out=layoutCircuit(d);expect(out.placements.R2.y).not.toBe(out.placements.S2.y);expect(out.placements.V1.y).toBeGreaterThan(out.placements.R2.y);});
 it('parameters and switch states do not trigger layout or routing changes',()=>{const original=cases[3],d=structuredClone(original);d.components.forEach(c=>{c.value=c.value===null?null:c.value*2;c.closed=!c.closed;});expect(topologyKey(d)).toBe(topologyKey(original));expect(layoutCircuit(d).placements).toEqual(layoutCircuit(original).placements);});
 it('component array order does not change the layout',()=>{const d=structuredClone(cases[3]);d.components.reverse();expect(layoutCircuit(d).placements).toEqual(layoutCircuit(cases[3]).placements);});
 it('arbitrary bridge networks use general routing without replacing topology',()=>{const d=CircuitSchema.parse({title:'bridge',nodes:['p','a','b','g'].map((id,i)=>({id,x:100+200*i,y:250})),components:[['V1','source','p','g',10],['R1','resistor','p','a',10],['R2','resistor','a','g',10],['R3','resistor','p','b',20],['R4','resistor','b','g',20],['R5','resistor','a','b',7]].map(([id,type,a,b,value])=>({id,type,a,b,value,name:id,valueSource:'given'}))});const out=layoutCircuit(d);expect(out.mode).toBe('general');expect(Object.keys(out.placements)).toHaveLength(6);expect(out.wires.every(w=>!wireEntersOtherSymbol(w,out.placements))).toBe(true);});
});
