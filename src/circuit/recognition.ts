import {z} from 'zod';
import {CircuitSchema,registry,type Component,type CircuitDocument} from './schema';

const aliases:Record<string,Component['type']>={
 dc_source:'source',voltage_source:'source',battery:'source',dc_voltage:'source',
 variable_resistor:'rheostat',potentiometer:'rheostat',current_meter:'ammeter',voltage_meter:'voltmeter',
 resistor:'resistor',source:'source',switch:'switch',wire:'wire',ammeter:'ammeter',voltmeter:'voltmeter',rheostat:'rheostat',
 lamp:'lamp',fuse:'fuse',capacitor:'capacitor',inductor:'inductor',diode:'diode',ac_source:'ac_source',unsupported:'unsupported'
};
const point=z.object({x:z.number().finite(),y:z.number().finite()});
const rawNode=z.union([z.string().min(1).max(24),z.object({id:z.string().min(1).max(24),x:z.number().finite().optional(),y:z.number().finite().optional()})]);
const rawSchema=z.object({title:z.string().min(1).max(120),problemText:z.string().max(4000).optional(),
 nodes:z.array(rawNode).min(2).max(40),components:z.array(z.object({
  id:z.string().min(1).max(24),type:z.string().max(40),name:z.string().max(80).optional(),a:z.string().min(1).max(24),b:z.string().min(1).max(24),
  value:z.union([z.number().finite(),z.string().max(40),z.null()]).optional(),valueSource:z.enum(['given','user','unknown','suggested']).optional(),
  closed:z.boolean().optional(),position:point.nullable().optional(),confidence:z.number().min(0).max(1).optional(),evidence:z.string().max(500).optional()
 })).min(1).max(40),warnings:z.array(z.string().max(500)).max(16).optional(),uncertainties:z.array(z.string().max(500)).max(16).optional(),confidence:z.number().min(0).max(1).optional()});

function stableId(id:string){const sub='₀₁₂₃₄₅₆₇₈₉';return id.normalize('NFKC').replace(/[₀-₉]/g,c=>String(sub.indexOf(c))).replace(/\s+/g,'');}
function valueNumber(value:number|string|null|undefined,type:Component['type']):number|null{
 if(value===undefined||value===null||value==='')return null;if(typeof value==='number')return value;
 if(/^(?:未知|未给出|待填写|unknown|null|\?)$/i.test(value.trim()))return null;
 const m=value.trim().match(/^([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*(kΩ|kOhm|千欧姆?|MΩ|兆欧姆?|Ω|ohms?|欧姆?|mV|毫伏|V|伏特?)?$/i);
 if(!m)throw new Error('元件数值格式无法核验。');const unit=m[2]??'';
 if(type==='source'&&/Ω|ohm|欧/i.test(unit))throw new Error('电源参数单位不是电压。');
 if(['resistor','rheostat'].includes(type)&&/V|伏/.test(unit))throw new Error('电阻参数单位不是电阻。');
 return Number(m[1])*(/^(?:k|千)/i.test(unit)?1000:/^(?:MΩ|兆)/.test(unit)?1e6:/^(?:mV|毫伏)$/.test(unit)?.001:1);
}

/** Only normalizes representation and layout. Never infers or adds a wire/value. */
export function normalizeRecognition(input:unknown,source:'text'|'image'):CircuitDocument{
 const unwrapped=input&&typeof input==='object'&&'document' in input?(input as {document:unknown}).document:input;
 const raw=rawSchema.parse(unwrapped),warnings=[...(raw.warnings??[])],uncertainties=[...(raw.uncertainties??[])];
 const coords:{id:string;x?:number;y?:number}[]=raw.nodes.map((node,i)=>typeof node==='string'?{id:node}:{...node});
 const xValues=coords.flatMap(n=>n.x===undefined?[]:[n.x]),yValues=coords.flatMap(n=>n.y===undefined?[]:[n.y]);
 const needsScale=xValues.some(x=>x<60||x>940)||yValues.some(y=>y<60||y>540);
 const scale=(v:number,values:number[],min:number,max:number)=>{const lo=Math.min(...values),hi=Math.max(...values);return hi===lo?(min+max)/2:min+(v-lo)/(hi-lo)*(max-min);};
 const nodes=coords.map((n,i)=>({id:stableId(n.id),x:n.x===undefined?180+(i%3)*300:needsScale?scale(n.x,xValues,100,900):n.x,y:n.y===undefined?130+Math.floor(i/3)*Math.min(120,360/Math.max(1,Math.ceil(coords.length/3)-1)):needsScale?scale(n.y,yValues,100,500):n.y}));
 const components=raw.components.map(c=>{
  const type=aliases[c.type.toLowerCase()];if(!type)throw new Error('识别结果包含未知元件类型。');const id=stableId(c.id);
  const value=['source','resistor','rheostat','lamp','capacitor','inductor','ac_source'].includes(type)?valueNumber(c.value,type):null;
  if((type==='switch'||type==='fuse')&&c.closed===undefined)uncertainties.push(`${id} 的通断状态未确定，先按断开显示，请对照原图确认。`);
  const position=c.position?{x:Math.max(60,Math.min(940,needsScale&&xValues.length?scale(c.position.x,xValues,100,900):c.position.x)),y:Math.max(60,Math.min(540,needsScale&&yValues.length?scale(c.position.y,yValues,100,500):c.position.y))}:undefined;
  return {id,type,name:c.name??registry[type].label,a:stableId(c.a),b:stableId(c.b),value,valueSource:value===null?'unknown' as const:c.valueSource??'given' as const,closed:c.closed??!['switch','fuse'].includes(type),confidence:c.confidence??raw.confidence??.9,evidence:c.evidence??'',...(position?{position}:{})};
 });
 return CircuitSchema.parse({title:raw.title,problemText:raw.problemText??'',nodes,components,warnings:warnings.slice(0,16),uncertainties:[...new Set(uncertainties)].slice(0,16),confidence:raw.confidence??.9,source});
}
