import {z} from 'zod';
import {quantities} from './units';
export const MeasurementSchema=z.object({id:z.string().min(1).max(24),targetId:z.string().min(1).max(24),quantity:z.enum(['current','voltage','power','charge']),value:z.number().finite().nullable(),rawValue:z.string().max(80).optional(),rawUnit:z.string().max(30).optional(),conditions:z.record(z.string(),z.boolean()).default({}),source:z.enum(['diagram','text','user']).default('text'),evidence:z.string().max(500).default(''),confidence:z.number().min(0).max(1).default(1)});
export type Measurement=z.infer<typeof MeasurementSchema>;
export const componentTypes=['source','resistor','rheostat','switch','wire','ammeter','voltmeter','lamp','fuse','capacitor','inductor','diode','led','ac_source','polar_capacitor','thermistor','photoresistor','zener','motor','galvanometer','unsupported'] as const;
export const StateObservationSchema=z.object({contact:z.enum(['gap','touching','unclear']),basis:z.enum(['diagram','text','unclear']),confidence:z.number().min(0).max(1),region:z.object({x:z.number().min(0).max(1000),y:z.number().min(0).max(1000),width:z.number().positive().max(1000),height:z.number().positive().max(1000)}).optional()});
export const ComponentSchema=z.object({
 id:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,23}$/),type:z.enum(componentTypes),name:z.string().max(80),
 a:z.string().min(1).max(24),b:z.string().min(1).max(24),value:z.number().finite().nullable(),
 valueSource:z.enum(['given','user','unknown','suggested']).default('unknown'),
 parameters:z.record(z.string(),z.number().finite()).optional(),rawValue:z.string().max(80).optional(),rawUnit:z.string().max(30).optional(),unitUncertain:z.boolean().optional(),quantityKind:z.enum(quantities).optional(),terminals:z.record(z.string(),z.string()).optional(),
 closed:z.boolean().default(true),position:z.object({x:z.number().min(60).max(10000),y:z.number().min(60).max(10000)}).optional(),positionSource:z.enum(['recognition','manual']).optional(),
 confidence:z.number().min(0).max(1).default(1),evidence:z.string().max(500).default(''),
 stateObservation:StateObservationSchema.optional(),stateSource:z.enum(['diagram','text','uncertain','user']).optional(),initialClosed:z.boolean().optional(),labelVisible:z.boolean().optional(),candidateIndex:z.number().int().min(0).max(39).optional()
});
export const CircuitSchema=z.object({
 measurements:z.array(MeasurementSchema).max(40).default([]),
 title:z.string().min(1).max(120),problemText:z.string().max(4000).default(''),
 nodes:z.array(z.object({id:z.string().min(1).max(24),x:z.number().min(60).max(940),y:z.number().min(60).max(540)})).min(2).max(40),
 components:z.array(ComponentSchema).min(1).max(40),warnings:z.array(z.string().max(500)).max(16).default([]),
 uncertainties:z.array(z.string().max(500)).max(16).default([]),confidence:z.number().min(0).max(1).default(1),
 source:z.enum(['example','text','image','edited']).default('text'),
 verification:z.object({mode:z.enum(['independent-vision','visual-inventory']),status:z.enum(['matched','review','unavailable']),topologyMatched:z.boolean(),inventoryMatched:z.boolean().optional(),topologyGuard:z.enum(['passed','open-path','not-applicable']).optional(),checkedSwitches:z.number().int().min(0).max(40),pixelCheckedSwitches:z.number().int().min(0).max(40).optional()}).optional()
}).superRefine((doc,ctx)=>{
 const nodes=new Set(doc.nodes.map(n=>n.id)),ids=new Set<string>();
 if(nodes.size!==doc.nodes.length)ctx.addIssue({code:'custom',message:'连接节点 ID 重复。'});
 for(const m of doc.measurements){if(!doc.components.some(c=>c.id===m.targetId)||Object.keys(m.conditions).some(id=>!doc.components.some(c=>c.id===id&&c.type==='switch')))ctx.addIssue({code:'custom',message:'测量标注引用了不存在的元件或开关。'});}
 for(const c of doc.components){
  if(c.terminals&&Object.values(c.terminals).some(n=>!nodes.has(n)))ctx.addIssue({code:'custom',message:'额外端子引用了不存在的节点。'});
  for(const [k,v] of Object.entries(c.parameters??{})){if(v<0||v>1e7||(k==='position'&&v>1))ctx.addIssue({code:'custom',message:'模型参数超出范围。'});}
  if(ids.has(c.id))ctx.addIssue({code:'custom',message:`元件 ${c.id} 的 ID 重复。`});ids.add(c.id);
  if(!nodes.has(c.a)||!nodes.has(c.b))ctx.addIssue({code:'custom',message:`${c.id} 连接了不存在的节点。`});
  if(c.value!==null && (Math.abs(c.value)>1e7 || ((['resistor','lamp'].includes(c.type)&&c.value<=0||c.type==='rheostat'&&c.value<0)) || (c.type==='source'&&Math.abs(c.value)>1000)))ctx.addIssue({code:'custom',message:`${c.id} 的参数超出支持范围。`});
 }
});
export type CircuitDocument=z.infer<typeof CircuitSchema>;
export type Component=z.infer<typeof ComponentSchema>;
export const registry:Record<Component['type'],{label:string;unit:string;support:'dc'|'limited';min:number;max:number}>={
 source:{label:'直流电源',unit:'V',support:'dc',min:-1000,max:1000},resistor:{label:'电阻',unit:'Ω',support:'dc',min:.001,max:1e7},rheostat:{label:'滑动变阻器',unit:'Ω',support:'dc',min:0,max:1e7},
 switch:{label:'开关',unit:'',support:'dc',min:0,max:1},wire:{label:'导线',unit:'',support:'dc',min:0,max:0},ammeter:{label:'理想电流表',unit:'A',support:'dc',min:0,max:0},voltmeter:{label:'理想电压表',unit:'V',support:'dc',min:0,max:0},
 lamp:{label:'灯泡（需非线性模型）',unit:'Ω',support:'limited',min:.001,max:1e7},fuse:{label:'保险丝（仅通断）',unit:'',support:'dc',min:0,max:1},
 capacitor:{label:'电容（直流稳态）',unit:'F',support:'dc',min:0,max:1e7},inductor:{label:'电感（暂不求解）',unit:'H',support:'limited',min:0,max:1e7},led:{label:'发光二极管（需伏安模型）',unit:'',support:'limited',min:0,max:1e7},diode:{label:'二极管（暂不求解）',unit:'',support:'limited',min:0,max:1e7},ac_source:{label:'交流电源（暂不求解）',unit:'V',support:'limited',min:0,max:1000},polar_capacitor:{label:'有极性电容（直流稳态）',unit:'F',support:'dc',min:0,max:1e7},thermistor:{label:'热敏电阻（需温度模型）',unit:'Ω',support:'limited',min:0,max:1e7},photoresistor:{label:'光敏电阻（需光照模型）',unit:'Ω',support:'limited',min:0,max:1e7},zener:{label:'稳压二极管（需击穿模型）',unit:'V',support:'limited',min:0,max:1000},motor:{label:'电动机（需机电模型）',unit:'',support:'limited',min:0,max:1e7},galvanometer:{label:'检流计（需仪表模型）',unit:'A',support:'limited',min:0,max:1e7},unsupported:{label:'暂不支持的元件',unit:'',support:'limited',min:0,max:1e7}
};
export function needsReview(doc:CircuitDocument){return doc.confidence<.85||doc.uncertainties.length>0||doc.components.some(c=>c.confidence<.8||c.valueSource==='suggested'||c.unitUncertain);}
export function editValue(doc:CircuitDocument,id:string,value:number|null):CircuitDocument{return CircuitSchema.parse({...doc,source:'edited',components:doc.components.map(c=>c.id===id?{...c,value,valueSource:value===null?'unknown':'user',unitUncertain:false,rawValue:undefined,rawUnit:undefined}:c)});}
