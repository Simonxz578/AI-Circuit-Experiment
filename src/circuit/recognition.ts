import {z} from 'zod';
import {parseQuantity} from './units';
import {CircuitSchema,StateObservationSchema,MeasurementSchema,registry,type Component,type CircuitDocument} from './schema';

const aliases:Record<string,Component['type']>={
 dc_source:'source',voltage_source:'source',battery:'source',dc_voltage:'source',
 variable_resistor:'rheostat',potentiometer:'rheostat',current_meter:'ammeter',voltage_meter:'voltmeter',
 resistor:'resistor',source:'source',switch:'switch',wire:'wire',ammeter:'ammeter',voltmeter:'voltmeter',rheostat:'rheostat',
 spdt:'spdt',double_throw_switch:'spdt',spdt_switch:'spdt',polar_capacitor:'polar_capacitor',thermistor:'thermistor',photoresistor:'photoresistor',zener:'zener',motor:'motor',galvanometer:'galvanometer',led:'led',LED:'led',light_emitting_diode:'led',lamp:'lamp',fuse:'fuse',capacitor:'capacitor',inductor:'inductor',diode:'diode',ac_source:'ac_source',unsupported:'unsupported'
};
const point=z.object({x:z.number().finite(),y:z.number().finite()});
const candidateIndex=z.number().int().min(0).max(39).nullish().transform(v=>v??undefined);
const parameterKeys=new Set(['forwardVoltage','internalResistance','range','totalResistance','position','throw']);
// Provider annotations outside the model (e.g. adjustable:true) are not electrical
// parameters. Known model parameters still undergo strict numeric validation.
const rawParameters=z.preprocess(value=>value===null?undefined:value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([key,v])=>typeof v==='number'||parameterKeys.has(key))):value,z.record(z.string(),z.number().finite()).optional());
const rawNode=z.union([z.string().min(1).max(24),z.object({id:z.string().min(1).max(24),x:z.number().finite().optional(),y:z.number().finite().optional()})]);
const rawSchema=z.object({measurements:z.array(MeasurementSchema).max(40).optional(),title:z.string().min(1).max(120),problemText:z.string().max(4000).optional(),
 nodes:z.array(rawNode).min(2).max(40),components:z.array(z.object({
  id:z.string().min(1).max(24),type:z.string().max(40),name:z.string().max(80).optional(),a:z.string().min(1).max(24),b:z.string().min(1).max(24),
  value:z.union([z.number().finite(),z.string().max(40),z.null()]).optional(),valueSource:z.enum(['given','user','unknown','suggested']).optional(),
  terminals:z.record(z.string(),z.string()).optional(),parameters:rawParameters,rawValue:z.string().max(80).optional(),rawUnit:z.string().max(30).optional(),unitUncertain:z.boolean().optional(),closed:z.boolean().optional(),position:point.nullable().optional(),confidence:z.number().min(0).max(1).optional(),evidence:z.string().max(500).optional(),stateObservation:StateObservationSchema.optional(),labelVisible:z.boolean().optional(),visibleLabel:z.string().max(40).nullable().optional(),candidateIndex
 })).min(1).max(40),warnings:z.array(z.string().max(500)).max(16).optional(),uncertainties:z.array(z.string().max(500)).max(16).optional(),confidence:z.number().min(0).max(1).optional()});

function stableId(id:string){const sub='₀₁₂₃₄₅₆₇₈₉';return id.normalize('NFKC').replace(/[₀-₉]/g,c=>String(sub.indexOf(c))).replace(/\s+/g,'');}
function printedId(type:Component['type'],label:string|null|undefined){
 if(label===undefined||label===null)return undefined;
 const printed=stableId(label).replace(/^([A-Za-z]+)_\{?(\d+)\}?$/,'$1$2');
 if(!/^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(printed)||(type==='ammeter'||type==='voltmeter')&&/^[AV]$/i.test(printed))return undefined;
 return type==='voltmeter'&&/^V\d+$/i.test(printed)?printed.replace(/^V/i,'VM'):printed;
}
/** Numeric value labels and a meter's generic A/V symbol are not visible unique IDs.
 * Missing metadata preserves old saved documents; explicit null means no printed ID. */
function visibleId(id:string,type:Component['type'],label:string|null|undefined,legacy:boolean|undefined){
 if(label===undefined)return legacy;if(label===null)return false;
 const canonical=(value:string)=>stableId(value).replace(/^([A-Za-z]+)_\{?(\d+)\}?$/,'$1$2').toUpperCase();
 const printed=canonical(label),wanted=canonical(id);
 if((type==='ammeter'||type==='voltmeter')&&/^[AV]$/.test(printed))return false;
 return printed===wanted||type==='voltmeter'&&/^VM\d+$/.test(wanted)&&printed===wanted.replace(/^VM/,'V');
}
function valueNumber(value:number|string|null|undefined,type:Component['type']):number|null{
 if(value===undefined||value===null||value==='')return null;if(typeof value==='number')return value;
 if(/^(?:未知|未给出|待填写|unknown|null|\?)$/i.test(value.trim()))return null;
 return parseQuantity(value,['capacitor','polar_capacitor'].includes(type)?'capacitance':type==='inductor'?'inductance':type==='source'||type==='ac_source'?'voltage':'resistance');
}

function componentValue(c:{value?:number|string|null;rawValue?:string;rawUnit?:string;unitUncertain?:boolean},type:Component['type']){
 if(c.unitUncertain)return {value:null,unitUncertain:true};
 try{const raw=c.rawValue?.trim();const expression=raw?raw+(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/.test(raw)?c.rawUnit??'':''):c.value;
 return {value:valueNumber(expression,type),unitUncertain:false};}catch{return {value:null,unitUncertain:true};}
}
function observations(items:CircuitDocument['measurements']):CircuitDocument['measurements']{return items.map(m=>{if(!m.rawValue||m.value===null)return m;try{const raw=m.rawValue.trim(),expression=raw+(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)?m.rawUnit??'':'');return {...m,value:parseQuantity(expression,m.quantity)};}catch{return {...m,value:null,confidence:Math.min(m.confidence,.5),evidence:m.evidence+' 单位待确认'};}});}
function measurementIds(items:CircuitDocument['measurements'],ids:Map<string,string>){return items.map(m=>({...m,targetId:ids.get(stableId(m.targetId))??stableId(m.targetId),conditions:Object.fromEntries(Object.entries(m.conditions).map(([id,value])=>[ids.get(stableId(id))??stableId(id),value]))}));}
/** Only normalizes representation and layout. Never infers or adds a wire/value. */
export function normalizeRecognition(input:unknown,source:'text'|'image'):CircuitDocument{
 const unwrapped=input&&typeof input==='object'&&'document' in input?(input as {document:unknown}).document:input;
 const raw=rawSchema.parse(unwrapped),warnings=[...(raw.warnings??[])],uncertainties=[...(raw.uncertainties??[])];
 const componentIds=new Map(raw.components.map(c=>{const type=aliases[c.type.toLowerCase()];return [stableId(c.id),source==='image'&&type?printedId(type,c.visibleLabel)??stableId(c.id):stableId(c.id)];}));
 const coords:{id:string;x?:number;y?:number}[]=raw.nodes.map((node,i)=>typeof node==='string'?{id:node}:{...node});
 const xValues=coords.flatMap(n=>n.x===undefined?[]:[n.x]),yValues=coords.flatMap(n=>n.y===undefined?[]:[n.y]);
 const needsScale=xValues.some(x=>x<60||x>940)||yValues.some(y=>y<60||y>540);
 const scale=(v:number,values:number[],min:number,max:number)=>{const lo=Math.min(...values),hi=Math.max(...values);return hi===lo?(min+max)/2:min+(v-lo)/(hi-lo)*(max-min);};
 const nodes=coords.map((n,i)=>({id:stableId(n.id),x:n.x===undefined?180+(i%3)*300:needsScale?scale(n.x,xValues,100,900):n.x,y:n.y===undefined?130+Math.floor(i/3)*Math.min(120,360/Math.max(1,Math.ceil(coords.length/3)-1)):needsScale?scale(n.y,yValues,100,500):n.y}));
 const components=raw.components.map(c=>{
  const type=aliases[c.type.toLowerCase()];if(!type)throw new Error('识别结果包含未知元件类型。');const id=componentIds.get(stableId(c.id))!;
  const numeric=componentValue(c,type),value=['source','resistor','rheostat','lamp','capacitor','polar_capacitor','thermistor','photoresistor','inductor','ac_source'].includes(type)?numeric.value:null;
  const observation=c.stateObservation,observedClosed=observation?.basis==='diagram'&&observation.confidence>=.85&&observation.contact!=='unclear'?observation.contact==='touching':undefined;
  const closed=c.closed??observedClosed??!['switch','fuse'].includes(type),labelVisible=source==='image'?visibleId(id,type,c.visibleLabel,c.labelVisible):c.labelVisible;
  if((type==='switch'||type==='fuse')&&c.closed===undefined&&observedClosed===undefined&&c.candidateIndex===undefined)uncertainties.push(`${id} 的通断状态未确定，先按断开显示，请对照原图确认。`);
  const position=c.position?{x:Math.max(60,Math.min(940,needsScale&&xValues.length?scale(c.position.x,xValues,100,900):c.position.x)),y:Math.max(60,Math.min(540,needsScale&&yValues.length?scale(c.position.y,yValues,100,500):c.position.y))}:undefined;
  return {terminals:c.terminals,quantityKind:type==='source'?'voltage' as const:['resistor','rheostat'].includes(type)?'resistance' as const:['capacitor','polar_capacitor'].includes(type)?'capacitance' as const:type==='inductor'?'inductance' as const:undefined,parameters:c.parameters??{},rawValue:c.rawValue??(typeof c.value==='string'?c.value:undefined),rawUnit:c.rawUnit,unitUncertain:numeric.unitUncertain,id,type,name:c.name??registry[type].label,a:stableId(c.a),b:stableId(c.b),value,valueSource:value===null?'unknown' as const:c.valueSource??'given' as const,closed,confidence:c.confidence??raw.confidence??.9,evidence:c.evidence??'',...(position?{position}:{}),...(c.stateObservation?{stateObservation:c.stateObservation}:{}),...(labelVisible===undefined?{}:{labelVisible}),...(c.visibleLabel===undefined?{}:{visibleLabel:c.visibleLabel}),...(c.candidateIndex===undefined?{}:{candidateIndex:c.candidateIndex})};
 });
 return CircuitSchema.parse({measurements:measurementIds(observations(raw.measurements??[]),componentIds),title:raw.title,problemText:raw.problemText??'',nodes,components,warnings:warnings.slice(0,16),uncertainties:[...new Set(uncertainties)].slice(0,16),confidence:raw.confidence??.9,source});
}

const inventorySchema=z.object({measurements:z.array(MeasurementSchema).max(40).default([]),components:z.array(z.object({id:z.string().min(1).max(24),type:z.string().max(40),value:z.union([z.number().finite(),z.string().max(40),z.null()]).optional(),labelVisible:z.boolean().optional(),visibleLabel:z.string().max(40).nullable().optional(),candidateIndex,terminals:z.record(z.string(),z.string()).optional(),parameters:rawParameters,rawValue:z.string().max(80).optional(),rawUnit:z.string().max(30).optional(),unitUncertain:z.boolean().optional(),closed:z.boolean().optional(),stateObservation:StateObservationSchema.optional()})).min(1).max(40),confidence:z.number().min(0).max(1).default(.95),uncertainties:z.array(z.string().max(500)).max(16).default([])});
export type VisualInventory={components:{id:string;type:Component['type'];value:number|null;terminals?:Record<string,string>;parameters?:Record<string,number>;rawValue?:string;rawUnit?:string;unitUncertain?:boolean;labelVisible?:boolean;visibleLabel?:string|null;candidateIndex?:number;closed?:boolean;stateObservation?:Component['stateObservation']}[];confidence:number;uncertainties:string[];measurements?:CircuitDocument['measurements']};
export function normalizeVisualInventory(input:unknown):VisualInventory{
 const raw=inventorySchema.parse(input);const aliasesById=new Map<string,string>(),ids=new Set<string>();const components=raw.components.map(c=>{const type=aliases[c.type.toLowerCase()];if(!type)throw new Error('Unknown visual inventory type');const id=printedId(type,c.visibleLabel)??stableId(c.id);if(ids.has(id))throw new Error('Duplicate visual inventory ID');ids.add(id);aliasesById.set(stableId(c.id),id);const numeric=componentValue(c,type);return {...c,id,type,labelVisible:visibleId(id,type,c.visibleLabel,c.labelVisible),unitUncertain:numeric.unitUncertain,value:['source','resistor','rheostat','lamp','capacitor','polar_capacitor','thermistor','photoresistor','inductor','ac_source'].includes(type)?numeric.value:null};});
 return {...raw,components,measurements:measurementIds(observations(raw.measurements),aliasesById)};
}
