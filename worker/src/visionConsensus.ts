import {CircuitSchema,needsReview,type CircuitDocument,type Component} from '../../src/circuit/schema';
import type {VisualInventory} from '../../src/circuit/recognition';
import type {ContactRaster,ContactCandidate} from '../../src/circuit/contactVision';
import {alignComponentIds,reconcileVisualInventory} from './visualAudit';

// The cropped pass describes incidence only. Independent full-page OCR supplies values;
// the other graph pass must corroborate those values before automatic acceptance.
export function hydrateTopology(graph:CircuitDocument,inventory:VisualInventory|null):CircuitDocument{
 if(!inventory)return graph;
 return CircuitSchema.parse({...graph,components:graph.components.map(c=>{
  const item=inventory.components.find(i=>i.id===c.id&&i.type===c.type);
  if(!item)return c;
  return {...c,value:item.value,valueSource:item.value===null?'unknown':'given',rawValue:item.rawValue,rawUnit:item.rawUnit,unitUncertain:item.unitUncertain,parameters:{...c.parameters,...item.parameters},labelVisible:item.labelVisible??c.labelVisible};
 })});
}

const valuesEqual=(a:number|null,b:number|null)=>a===null||b===null?a===b:Math.abs(a-b)<=1e-8*Math.max(1e-12,Math.abs(a),Math.abs(b));
const numeric=new Set<Component['type']>(['source','resistor','rheostat','lamp','capacitor','polar_capacitor','thermistor','photoresistor','inductor','ac_source']);

/** Agreement checks incidence, directed terminals, SI values and explicit model parameters.
 * Ordinary switch state still comes from contact pixels, never from operating conditions. */
export function reconcileVisionConsensus(graph:CircuitDocument,independent:CircuitDocument|null,inventory:VisualInventory|null,raster?:ContactRaster,candidates:ContactCandidate[]=[]):CircuitDocument{
 const hydrated=hydrateTopology(graph,inventory);
 const aligned=independent?alignComponentIds(independent,graph):null;
 // Keep the full-page pass's independently read values. Matching automatic IDs by
 // their numeric values is safer than transplanting the OCR list by array order/ID.
 const checked=reconcileVisualInventory(aligned?independent!:hydrated,inventory,raster,candidates);
 const uncertainties=[...checked.uncertainties];
 if(!aligned)uncertainties.push(independent?'两次独立追踪的接线不一致，请对照原图核对支路和接点。':'独立接线复核未完成，请对照原图核对后继续。');
 const components=checked.components.map(c=>{
  const other=independent?.components.find(o=>o.id===c.id&&o.type===c.type);
  if(!other)return c;
  let next={...c};
  if(numeric.has(c.type)&&(!valuesEqual(c.value,other.value)||other.unitUncertain)){
   next={...next,value:null,valueSource:'unknown'};
   uncertainties.push(`【${c.id}参数】独立读取的数值或单位不一致，请对照原题填写。`);
  }
  for(const [key,value] of Object.entries(c.parameters??{})){
   if(c.type==='spdt'&&key==='throw')continue; // Three-way positions retain their explicit review.
   if(other.parameters?.[key]!==undefined&&!valuesEqual(value,other.parameters[key])){
    const parameters={...next.parameters};delete parameters[key];next={...next,parameters};
    uncertainties.push(`【${c.id}参数】图中模型参数读取不一致，请对照原题确认。`);
   }
  }
  return next;
 });
 const doc=CircuitSchema.parse({...checked,components,uncertainties:[...new Set(uncertainties)].slice(0,16)});
 return CircuitSchema.parse({...doc,verification:{...checked.verification!,mode:'independent-vision',topologyMatched:!!aligned,status:aligned&&inventory&&checked.verification?.inventoryMatched&&!needsReview(doc)&&checked.verification.topologyGuard!=='open-path'?'matched':!inventory||!independent?'unavailable':'review'}});
}
