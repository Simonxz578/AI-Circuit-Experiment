import {describe,it,expect} from 'vitest';
import {normalizeRecognition,normalizeVisualInventory} from './recognition';

const component=(overrides:Record<string,unknown>={})=>({id:'R1',type:'resistor',a:'p',b:'g',value:4000,labelVisible:true,...overrides});
const graph=(c:Record<string,unknown>)=>({title:'标号核对',nodes:['p','g'],components:[c]});

describe('verbatim visible IDs',()=>{
 it('does not treat an explicitly absent ID or a resistance value as a printed component ID',()=>{
  for(const visibleLabel of [null,'4k','4 kΩ','2000 Ω','']){
   const c=component({visibleLabel});
   expect(normalizeRecognition(graph(c),'image').components[0].labelVisible).toBe(false);
   expect(normalizeVisualInventory({components:[c]}).components[0].labelVisible).toBe(false);
  }
 });
 it('keeps true printed subscript and math-subscript labels',()=>{
  for(const visibleLabel of ['R1','R₁','Ｒ１','R_1','R_{1}']){
   expect(normalizeRecognition(graph(component({visibleLabel})),'image').components[0].labelVisible).toBe(true);
  }
 });
 it('uses the actual printed ID when the model generated a different one',()=>{
  const c=normalizeVisualInventory({components:[component({id:'R3',visibleLabel:'R1'})]}).components[0];
  expect(c.id).toBe('R1');expect(c.labelVisible).toBe(true);
  expect(normalizeRecognition(graph(component({id:'R3',visibleLabel:'R1'})),'image').components[0].id).toBe('R1');
 });
 it('maps a printed V1 voltmeter ID to VM1 while generic A and V remain type symbols',()=>{
  expect(normalizeVisualInventory({components:[component({id:'VM1',type:'voltmeter',value:null,visibleLabel:'V1'})]}).components[0].labelVisible).toBe(true);
  for(const [id,type,visibleLabel] of [['A1','ammeter','A'],['A','ammeter','A'],['VM1','voltmeter','V']]){
   expect(normalizeVisualInventory({components:[component({id,type,value:null,visibleLabel})]}).components[0].labelVisible).toBe(false);
  }
 });
 it('preserves missing metadata for legacy documents and text requests',()=>{
  expect(normalizeRecognition(graph(component()),'image').components[0].labelVisible).toBe(true);
  expect(normalizeVisualInventory({components:[component({labelVisible:false})]}).components[0].labelVisible).toBe(false);
  expect(normalizeRecognition(graph(component({visibleLabel:null})),'text').components[0].labelVisible).toBe(true);
 });
 it('remaps original measurement targets and switch conditions to canonical printed IDs',()=>{
  const components=[component({id:'resistor1',visibleLabel:'R'}),component({id:'switch1',type:'switch',value:null,visibleLabel:'K',closed:false})];
  const measurement={id:'M1',targetId:'resistor1',quantity:'current',value:.3,conditions:{switch1:true}};
  for(const out of [normalizeRecognition({...graph(components[0]),components,measurements:[measurement]},'image'),normalizeVisualInventory({components,measurements:[measurement]})]){
   expect(out.components.map(c=>c.id)).toEqual(['R','K']);
   expect(out.measurements?.[0]).toMatchObject({targetId:'R',conditions:{K:true}});
  }
 });
 it('rejects duplicate actual printed labels rather than silently overwriting components',()=>{
  const components=[component({id:'generated1',visibleLabel:'R1'}),component({id:'generated2',visibleLabel:'R1'})];
  expect(()=>normalizeVisualInventory({components})).toThrow();
  expect(()=>normalizeRecognition({...graph(components[0]),components},'image')).toThrow();
 });
 it('treats a null optional candidate as absent without inventing a contact match',()=>{
  const c=component({candidateIndex:null});
  expect(normalizeVisualInventory({components:[c]}).components[0].candidateIndex).toBeUndefined();
  expect(normalizeRecognition(graph(c),'image').components[0].candidateIndex).toBeUndefined();
 });
 it('ignores non-model boolean annotations but rejects a malformed actual model parameter',()=>{
  const c=component({parameters:{adjustable:true,internalResistance:2}});
  expect(normalizeRecognition(graph(c),'image').components[0].parameters).toEqual({internalResistance:2});
  expect(normalizeVisualInventory({components:[c]}).components[0].parameters).toEqual({internalResistance:2});
  expect(()=>normalizeRecognition(graph(component({parameters:{internalResistance:'2k'}})),'image')).toThrow();
 });
});
