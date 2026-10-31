import {CircuitSchema,needsReview,type CircuitDocument,type Component} from '../../src/circuit/schema';
import {corroborateContact,inspectContact,type ContactRaster,type ContactCandidate,type ContactEvidence} from '../../src/circuit/contactVision';
import type {VisualInventory} from '../../src/circuit/recognition';
import {solve} from '../../src/circuit/solver';

/** Node names and undirected terminal order are arbitrary. Component incidence is electrical topology. */
export function electricalFingerprint(doc:CircuitDocument):string{
 const parent=new Map(doc.nodes.map(n=>[n.id,n.id]));const root=(n:string):string=>parent.get(n)===n?n:root(parent.get(n)!);
 for(const c of doc.components)if(c.type==='wire'){const a=root(c.a),b=root(c.b);if(a!==b)parent.set(a,b);}
 const groups=new Map<string,string[]>();for(const c of doc.components){if(c.type==='wire')continue;for(const terminal of ['a','b'] as const){const net=root(c[terminal]),polarity=['source','diode','ac_source'].includes(c.type)?'.'+terminal:'';groups.set(net,[...(groups.get(net)??[]),c.id+polarity]);}}
 return JSON.stringify({components:doc.components.filter(c=>c.type!=='wire').map(c=>[c.id,c.type]).sort(),nodes:[...groups.values()].map(ports=>ports.sort().join('|')).sort()});
}
const observed=(c:Component|undefined)=>!!c&&c.type==='switch'&&c.stateObservation?.basis==='diagram'&&c.stateObservation.confidence>=.85&&((c.stateObservation.contact==='gap'&&!c.closed)||(c.stateObservation.contact==='touching'&&c.closed));

/** Only automatically assigned IDs may be aligned; visible component labels are immutable constraints. */
export function alignComponentIds(primary:CircuitDocument,audit:CircuitDocument):CircuitDocument|null{
 if(electricalFingerprint(primary)===electricalFingerprint(audit)&&primary.components.filter(c=>c.type!=='wire').every(c=>audit.components.some(o=>o.id===c.id&&o.type===c.type&&o.value===c.value)))return audit;
 const target=primary.components.filter(c=>c.type!=='wire'),incoming=audit.components.filter(c=>c.type!=='wire');if(target.length!==incoming.length)return null;
 const wanted=electricalFingerprint(primary);let visited=0;
 for(const exactValues of [true,false]){
  const candidates=new Map(incoming.map(c=>[c.id,target.filter(p=>p.type===c.type&&((c.labelVisible!==false||p.labelVisible!==false)?p.id===c.id:!exactValues||p.value===c.value)).sort((a,b)=>Number(b.value===c.value)-Number(a.value===c.value)||a.id.localeCompare(b.id))]));
  const ordered=[...incoming].sort((a,b)=>candidates.get(a.id)!.length-candidates.get(b.id)!.length),mapped=new Map<string,string>(),used=new Set<string>();
  const search=(i:number):CircuitDocument|null=>{if(++visited>4000)return null;if(i===ordered.length){const result={...audit,components:audit.components.map(c=>({...c,id:mapped.get(c.id)??c.id}))};return electricalFingerprint(result)===wanted?result:null;}
   const c=ordered[i];for(const candidate of candidates.get(c.id)!){if(used.has(candidate.id))continue;used.add(candidate.id);mapped.set(c.id,candidate.id);const result=search(i+1);if(result)return result;used.delete(candidate.id);mapped.delete(c.id);}return null;};
  const result=search(0);if(result)return result;
 }
 return null;
}

/** Agreement is required for automatic acceptance. Disagreement produces an explicit candidate, never a vote to guess. */
export function reconcileVisualChecks(primary:CircuitDocument,audit:CircuitDocument|null,raster?:ContactRaster,proposals?:ContactCandidate[]):CircuitDocument{
 const aligned=audit?alignComponentIds(primary,audit):null;
 const topologyMatched=!!aligned,uncertainties=[...primary.uncertainties,...(audit?.uncertainties??[])];let checkedSwitches=0,pixelCheckedSwitches=0;const resolved=new Set<string>();
 const conflictingRegions=new Set<string>();for(const doc of [primary,aligned??audit]){const switches=doc?.components.filter(c=>c.type==='switch')??[];for(let i=0;i<switches.length;i++)for(let j=i+1;j<switches.length;j++){const a=switches[i].stateObservation?.region,b=switches[j].stateObservation?.region;if(!a||!b)continue;const area=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));if(area/Math.min(a.width*a.height,b.width*b.height)>.65){conflictingRegions.add(switches[i].id);conflictingRegions.add(switches[j].id);}}}
 const pixelProofs=new Map(primary.components.filter(c=>c.type==='switch').map(c=>[c.id,corroborateContact(raster,c.stateObservation?.region,(aligned??audit)?.components.find(o=>o.id===c.id)?.stateObservation?.region,proposals)]));
 const usedPivots=new Map<string,string>();for(const [id,proof] of pixelProofs){if(!proof.pivotKey)continue;const other=usedPivots.get(proof.pivotKey);if(other){conflictingRegions.add(id);conflictingRegions.add(other);}usedPivots.set(proof.pivotKey,id);}
 if(!audit)uncertainties.push('独立图像核验未完成，请核对元件、连接及开关初态后继续。');
 else if(!topologyMatched)uncertainties.push('两次图像识别的元件或连接不一致，请对照原图核对接线后继续。');
 const components=primary.components.map(c=>{
  const other=(aligned??audit)?.components.find(o=>o.id===c.id&&o.type===c.type);let next={...c};
  if(c.type==='switch'){
   const pixel=conflictingRegions.has(c.id)?{contact:'unclear' as const,reason:'duplicate-location'}:pixelProofs.get(c.id)!;
   if(pixel.contact!=='unclear'){const closed=pixel.contact==='touching';checkedSwitches++;pixelCheckedSwitches++;resolved.add(c.id);next={...next,closed,initialClosed:closed,stateSource:'diagram',stateObservation:{...c.stateObservation!,contact:pixel.contact,basis:'diagram',confidence:.99}};}
   else if(!raster&&observed(c)&&observed(other)&&c.closed===other!.closed){checkedSwitches++;next={...next,closed:c.closed,initialClosed:c.closed,stateSource:'diagram'};}
   else{next={...next,closed:false,stateSource:'uncertain',initialClosed:undefined};uncertainties.push(`【${c.id}初态】触点识别未一致确认，暂按断开显示；请对照原图点击此开关确认，不能使用题干操作后的状态。`);}
  }
  if(other&&['source','resistor','rheostat'].includes(c.type)&&c.value!==other.value){
   next={...next,value:null,valueSource:'unknown'};uncertainties.push(`【${c.id}参数】两次读取的独立数值不一致，保留待填写，请对照原题确认。`);
  }
  return next;
 });
 const remaining=uncertainties.filter(u=>![...resolved].some(id=>u.includes(id)&&/(初态|通断状态|触点|开关状态|闭合状态|断开状态)/.test(u)&&!/(接线|节点|端子|连接)/.test(u)));
 const candidate=CircuitSchema.parse({...primary,components,confidence:Math.min(primary.confidence,audit?.confidence??primary.confidence),uncertainties:[...new Set(remaining)].slice(0,16)});
 return CircuitSchema.parse({...candidate,verification:{mode:'independent-vision',status:!audit?'unavailable':topologyMatched&&!needsReview(candidate)?'matched':'review',topologyMatched,checkedSwitches,pixelCheckedSwitches}});
}

/** A fast independent inventory checks OCR and label-to-pivot assignment; it makes no topology claim. */
export function reconcileVisualInventory(primary:CircuitDocument,inventory:VisualInventory|null,raster?:ContactRaster,proposals:ContactCandidate[]=[]):CircuitDocument{
 const remaining=inventory?.components.filter(c=>c.type!=='wire')??[],matching=new Map<string,VisualInventory['components'][number]>(),uncertainties=[...primary.uncertainties,...(inventory?.uncertainties??[])];let inventoryMatched=!!inventory;
 for(const c of [...primary.components.filter(c=>c.type!=='wire')].sort((a,b)=>Number(b.labelVisible!==false)-Number(a.labelVisible!==false))){
  let at=remaining.findIndex(o=>o.type===c.type&&o.id===c.id&&(c.labelVisible!==false||o.labelVisible!==false));
  if(at<0&&c.labelVisible===false)at=remaining.findIndex(o=>o.type===c.type&&o.labelVisible===false&&o.value===c.value);
  if(at<0&&c.labelVisible===false)at=remaining.findIndex(o=>o.type===c.type&&o.labelVisible===false);
  if(at<0){inventoryMatched=false;continue;}matching.set(c.id,remaining.splice(at,1)[0]);
 }
 if(remaining.length)inventoryMatched=false;
 if(!inventory)uncertainties.push('独立图像复核未完成，请核对元件、参数和开关初态后继续。');
 else if(!inventoryMatched)uncertainties.push('两次读取的元件标号或类型不一致，请对照原图核对后继续。');
 const proofs=new Map<string,ContactEvidence>(),used=new Map<string,string>(),duplicate=new Set<string>();
 for(const c of primary.components.filter(c=>c.type==='switch')){const other=matching.get(c.id);let proof:ContactEvidence;
  if(raster&&other&&c.candidateIndex!==undefined&&c.candidateIndex===other.candidateIndex&&proposals[c.candidateIndex]){const selected=proposals[c.candidateIndex];proof={...inspectContact(raster,selected.region),pivotKey:`${selected.pivot.x.toFixed(1)},${selected.pivot.y.toFixed(1)}`};}
  else proof=corroborateContact(raster,c.stateObservation?.region,other?.stateObservation?.region,proposals);
  if(!raster&&other&&observed(c)&&other.closed===c.closed&&other.stateObservation?.basis==='diagram'&&other.stateObservation.contact===c.stateObservation?.contact&&other.stateObservation.confidence>=.85)proof={contact:c.closed?'touching':'gap',reason:'legacy-visual-agreement'};
  proofs.set(c.id,proof);if(proof.pivotKey){const previous=used.get(proof.pivotKey);if(previous){duplicate.add(previous);duplicate.add(c.id);}used.set(proof.pivotKey,c.id);}
 }
 let checkedSwitches=0,pixelCheckedSwitches=0;const resolved=new Set<string>();
 const components=primary.components.map(c=>{const other=matching.get(c.id);let next={...c,...(other?.rawValue?{rawValue:other.rawValue}:{}),...(other?.rawUnit?{rawUnit:other.rawUnit}:{}),unitUncertain:c.unitUncertain||other?.unitUncertain===true};
  if(other&&['source','resistor','rheostat'].includes(c.type)&&c.value!==other.value){next={...next,value:null,valueSource:'unknown'};uncertainties.push(`【${c.id}参数】两次读取的独立数值不一致，保留待填写，请对照原题确认。`);}
  if(c.type==='switch'){const proof=proofs.get(c.id)!;if(proof.contact!=='unclear'&&!duplicate.has(c.id)){const closed=proof.contact==='touching';checkedSwitches++;if(raster)pixelCheckedSwitches++;resolved.add(c.id);next={...next,closed,initialClosed:closed,stateSource:'diagram',stateObservation:{...c.stateObservation,contact:proof.contact,basis:'diagram',confidence:.99}};}
   else{next={...next,closed:false,initialClosed:undefined,stateSource:'uncertain'};uncertainties.push(`【${c.id}初态】触点未完成一致核验，暂按断开显示；请对照原图点击开关确认。`);}}
  return next;
 });
 const noSwitches=primary.components.every(c=>c.type!=='switch')&&!!inventory&&inventory.components.every(c=>c.type!=='switch');
 const unresolved=uncertainties.filter(u=>!(noSwitches&&/(未发现|未见|没有|不含|无)开关/.test(u)&&!/(不清|模糊|无法辨|不确定|难以|可能|疑似|遮挡|遗漏)/.test(u))&&![...resolved].some(id=>u.includes(id)&&/(初态|通断状态|触点|开关状态|闭合状态|断开状态)/.test(u)&&!/(接线|节点|端子|连接)/.test(u)));
 const candidate=CircuitSchema.parse({...primary,components,confidence:Math.min(primary.confidence,inventory?.confidence??primary.confidence),uncertainties:[...new Set(unresolved)].slice(0,16)});
 let topologyGuard:'passed'|'open-path'|'not-applicable'='not-applicable';
 if(candidate.components.filter(c=>c.type==='source').length===1&&candidate.components.some(c=>['resistor','rheostat'].includes(c.type))&&candidate.components.every(c=>['source','resistor','rheostat','switch','fuse','wire','ammeter','voltmeter'].includes(c.type))){
  // A unit-valued probe checks only the existence of a possible conducting loop. Its values are never applied or returned.
  const probe={...candidate,components:candidate.components.map(c=>({...c,value:c.type==='source'||c.type==='resistor'||c.type==='rheostat'?1:c.value,closed:true}))},result=solve(probe);
  topologyGuard=result.ok&&result.totalCurrent!==null&&Math.abs(result.totalCurrent)<1e-10?'open-path':'passed';
 }
 const verified=CircuitSchema.parse({...candidate,uncertainties:topologyGuard==='open-path'?[...candidate.uncertainties,'即使接通图中开关，当前连接仍未形成电源回路，请对照原图核对回线与端子。'].slice(0,16):candidate.uncertainties,verification:{mode:'visual-inventory',status:!inventory?'unavailable':inventoryMatched&&!needsReview(candidate)&&topologyGuard!=='open-path'?'matched':'review',topologyMatched:false,inventoryMatched,topologyGuard,checkedSwitches,pixelCheckedSwitches}});
 return CircuitSchema.parse({...verified,measurements:inventory?.measurements?.length?inventory.measurements:verified.measurements});
}
