import {z} from 'zod';
export const componentTypes=['source','resistor','rheostat','switch','wire','ammeter','voltmeter','lamp','fuse','capacitor','inductor','diode','ac_source','unsupported'] as const;
export const ComponentSchema=z.object({
 id:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,23}$/),type:z.enum(componentTypes),name:z.string().max(80),
 a:z.string().min(1).max(24),b:z.string().min(1).max(24),value:z.number().finite().nullable(),
 valueSource:z.enum(['given','user','unknown','suggested']).default('unknown'),
 closed:z.boolean().default(true),position:z.object({x:z.number().min(60).max(10000),y:z.number().min(60).max(10000)}).optional(),positionSource:z.enum(['recognition','manual']).optional(),
 confidence:z.number().min(0).max(1).default(1),evidence:z.string().max(500).default('')
});
export const CircuitSchema=z.object({
 title:z.string().min(1).max(120),problemText:z.string().max(4000).default(''),
 nodes:z.array(z.object({id:z.string().min(1).max(24),x:z.number().min(60).max(940),y:z.number().min(60).max(540)})).min(2).max(40),
 components:z.array(ComponentSchema).min(1).max(40),warnings:z.array(z.string().max(500)).max(16).default([]),
 uncertainties:z.array(z.string().max(500)).max(16).default([]),confidence:z.number().min(0).max(1).default(1),
 source:z.enum(['example','text','image','edited']).default('text')
}).superRefine((doc,ctx)=>{
 const nodes=new Set(doc.nodes.map(n=>n.id)),ids=new Set<string>();
 if(nodes.size!==doc.nodes.length)ctx.addIssue({code:'custom',message:'连接节点 ID 重复。'});
 for(const c of doc.components){
  if(ids.has(c.id))ctx.addIssue({code:'custom',message:`元件 ${c.id} 的 ID 重复。`});ids.add(c.id);
  if(!nodes.has(c.a)||!nodes.has(c.b))ctx.addIssue({code:'custom',message:`${c.id} 连接了不存在的节点。`});
  if(c.value!==null && (Math.abs(c.value)>1e7 || (['resistor','rheostat','lamp'].includes(c.type)&&c.value<=0) || (c.type==='source'&&Math.abs(c.value)>1000)))ctx.addIssue({code:'custom',message:`${c.id} 的参数超出支持范围。`});
 }
});
export type CircuitDocument=z.infer<typeof CircuitSchema>;
export type Component=z.infer<typeof ComponentSchema>;
export const registry:Record<Component['type'],{label:string;unit:string;support:'dc'|'limited';min:number;max:number}>={
 source:{label:'直流电源',unit:'V',support:'dc',min:-1000,max:1000},resistor:{label:'电阻',unit:'Ω',support:'dc',min:.001,max:1e7},rheostat:{label:'滑动变阻器',unit:'Ω',support:'dc',min:.001,max:1e7},
 switch:{label:'开关',unit:'',support:'dc',min:0,max:1},wire:{label:'导线',unit:'',support:'dc',min:0,max:0},ammeter:{label:'理想电流表',unit:'A',support:'dc',min:0,max:0},voltmeter:{label:'理想电压表',unit:'V',support:'dc',min:0,max:0},
 lamp:{label:'灯泡（需非线性模型）',unit:'Ω',support:'limited',min:.001,max:1e7},fuse:{label:'保险丝（仅通断）',unit:'',support:'dc',min:0,max:1},
 capacitor:{label:'电容（暂不求解）',unit:'F',support:'limited',min:0,max:1e7},inductor:{label:'电感（暂不求解）',unit:'H',support:'limited',min:0,max:1e7},diode:{label:'二极管（暂不求解）',unit:'',support:'limited',min:0,max:1e7},ac_source:{label:'交流电源（暂不求解）',unit:'V',support:'limited',min:0,max:1000},unsupported:{label:'暂不支持的元件',unit:'',support:'limited',min:0,max:1e7}
};
export function needsReview(doc:CircuitDocument){return doc.confidence<.85||doc.uncertainties.length>0||doc.components.some(c=>c.confidence<.8||c.valueSource==='suggested');}
export function editValue(doc:CircuitDocument,id:string,value:number|null):CircuitDocument{return CircuitSchema.parse({...doc,source:'edited',components:doc.components.map(c=>c.id===id?{...c,value,valueSource:value===null?'unknown':'user'}:c)});}
