import {z} from 'zod';import {CircuitSchema,MeasurementSchema,componentTypes,registry,type CircuitDocument} from './schema';
export const OperationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('change_type'),id:z.string(),type:z.enum(componentTypes)}),
 z.object({action:z.literal('add_component'),id:z.string(),type:z.enum(componentTypes),a:z.string(),b:z.string(),value:z.number().finite().nullable().default(null),parameters:z.record(z.string(),z.number().finite()).optional()}),
 z.object({action:z.literal('set_component_type'),id:z.string(),type:z.enum(componentTypes)}),
 z.object({action:z.literal('set_parameter'),id:z.string(),key:z.enum(['forwardVoltage','internalResistance','range','totalResistance','position']),value:z.number().finite().nonnegative().max(1e7)}),
 z.object({action:z.literal('add_measurement'),measurement:MeasurementSchema}),
 z.object({action:z.literal('set_given_reading'),measurement:MeasurementSchema}),
 z.object({action:z.literal('remove_measurement'),id:z.string()}),
 z.object({action:z.literal('add_meter'),targetId:z.string(),type:z.enum(['ammeter','voltmeter'])}),
 z.object({action:z.literal('set_value'),id:z.string(),value:z.number().finite()}),
 z.object({action:z.literal('set_switch'),id:z.string(),closed:z.boolean()}),
 z.object({action:z.literal('insert_series'),afterId:z.string(),value:z.number().finite().max(1e7).nullable().default(null),type:z.enum(componentTypes).default('resistor')}),
 z.object({action:z.literal('add_parallel'),targetId:z.string(),value:z.number().finite().max(1e7).nullable().default(null),type:z.enum(componentTypes).default('resistor')}),
 z.object({action:z.literal('create_node'),id:z.string()}),
 z.object({action:z.literal('split_node'),node:z.string(),newNode:z.string(),targets:z.array(z.object({id:z.string(),terminal:z.enum(['a','b'])})).min(1).max(40)}),
 z.object({action:z.literal('reconnect'),id:z.string(),a:z.string(),b:z.string()}),
 z.object({action:z.literal('remove'),id:z.string()})
]);
export const OperationsSchema=z.array(OperationSchema).max(8);
/** Compile intent to graph edits. Coordinates never create electrical connections. */
export function applyOperations(original:CircuitDocument,input:unknown):CircuitDocument{
 const ops=OperationsSchema.parse(input),doc=structuredClone(original);doc.source='edited';
 for(const op of ops){
  if(op.action==='create_node'){if(doc.nodes.some(n=>n.id===op.id))throw Error('节点ID重复。');doc.nodes.push({id:op.id,x:500,y:300});continue;}
  if(op.action==='split_node'){if(!doc.nodes.some(n=>n.id===op.node)||doc.nodes.some(n=>n.id===op.newNode))throw Error('拆分节点无效。');doc.nodes.push({id:op.newNode,x:500,y:300});for(const t of op.targets){const c=doc.components.find(c=>c.id===t.id);if(!c||c[t.terminal]!==op.node)throw Error('所选端子不属于该节点。');c[t.terminal]=op.newNode;}continue;}
  if(op.action==='remove_measurement'){doc.measurements=doc.measurements.filter(m=>m.id!==op.id);continue;}
  if(op.action==='add_measurement'||op.action==='set_given_reading'){doc.measurements=[...doc.measurements.filter(m=>m.id!==op.measurement.id),op.measurement];continue;}
  if(op.action==='add_component'){if(doc.components.some(c=>c.id===op.id))throw Error('元件ID重复。');doc.components.push({...op,name:registry[op.type].label,valueSource:op.value===null?'unknown':'user',closed:true,confidence:1,evidence:'用户新增'});continue;}
  const id='id' in op?op.id:'afterId' in op?op.afterId:op.targetId;const target=doc.components.find(c=>c.id===id);if(!target)throw new Error('操作指定了不存在的元件。');
  if(op.action==='change_type'||op.action==='set_component_type'){if(target.terminals&&Object.keys(target.terminals).length>2)throw Error('多端器件需要明确全部端子连接。');const compatible=['resistor','rheostat'].includes(target.type)&&['resistor','rheostat'].includes(op.type);target.type=op.type;target.name=registry[op.type].label;if(!compatible){target.value=null;target.valueSource='unknown';target.parameters={};}target.rawValue=undefined;target.rawUnit=undefined;}
  if(op.action==='add_meter'){
   if(!['source','resistor','rheostat','led','diode','lamp','capacitor'].includes(target.type))throw new Error('请选择要测量的元件。');
   const prefix=op.type==='ammeter'?'A':'VM';let i=1;while(doc.components.some(c=>c.id===prefix+i))i++;
   let left=target.a,right=target.b;
   if(op.type==='ammeter'){let j=1;while(doc.nodes.some(n=>n.id==='j'+j))j++;const node='j'+j;const a=doc.nodes.find(n=>n.id===left)!,b=doc.nodes.find(n=>n.id===right)!;doc.nodes.push({id:node,x:(a.x+b.x)/2,y:(a.y+b.y)/2});target.b=node;target.position=undefined;left=node;}
   doc.components.push({id:prefix+i,type:op.type,name:op.type==='ammeter'?'理想电流表':'理想电压表',a:left,b:right,value:null,valueSource:'unknown',closed:true,confidence:1,evidence:'按用户要求添加仪表'});
  }
  if(op.action==='set_parameter'){if(op.key==='forwardVoltage'&&!['led','diode'].includes(target.type)||op.key==='internalResistance'&&!['source','ammeter','voltmeter'].includes(target.type)||op.key==='range'&&!['ammeter','voltmeter'].includes(target.type))throw Error('模型参数不适用于该元件。');target.parameters={...target.parameters,[op.key]:op.value};if(op.key==='totalResistance'||op.key==='position'){const p=target.parameters;if(target.type!=='rheostat')throw Error('滑片参数仅用于变阻器。');if(p.totalResistance!==undefined&&p.position!==undefined){target.value=p.totalResistance*p.position;target.valueSource='user';}}}
  if(op.action==='set_value'){if(!['resistor','rheostat','source','capacitor','polar_capacitor','inductor','thermistor','photoresistor','lamp','ac_source'].includes(target.type))throw new Error('元件参数不可调整。');target.value=op.value;target.valueSource='user';target.unitUncertain=false;target.rawValue=undefined;target.rawUnit=undefined;}
  if(op.action==='set_switch'){if(!['switch','fuse'].includes(target.type))throw new Error('此元件不是开关。');target.closed=op.closed;}
  if(op.action==='reconnect'){target.a=op.a;target.b=op.b;}
  if(op.action==='remove'){doc.components=doc.components.filter(c=>c.id!==op.id);doc.measurements=doc.measurements.filter(m=>m.targetId!==op.id&&!Object.hasOwn(m.conditions,op.id));}
  if(op.action==='insert_series'||op.action==='add_parallel'){
   const prefix=op.type==='capacitor'||op.type==='polar_capacitor'?'C':op.type==='inductor'?'L':op.type==='led'||op.type==='diode'?'D':op.type==='ammeter'?'A':op.type==='voltmeter'?'VM':op.type==='switch'?'S':op.type==='source'?'V':'R';let r=1;while(doc.components.some(c=>c.id===prefix+r))r++;const a=doc.nodes.find(n=>n.id===target.a)!,b=doc.nodes.find(n=>n.id===target.b)!;let left=target.a,right=target.b;let position;
   if(op.action==='insert_series'){
    let j=1;while(doc.nodes.some(n=>n.id===`j${j}`))j++;const node=`j${j}`;
    doc.nodes.push({id:node,x:Math.max(60,Math.min(940,(a.x+b.x)/2)),y:Math.max(60,Math.min(540,(a.y+b.y)/2))});
    target.b=node;target.position=undefined;left=node;right=b.id;
   }else position={x:Math.min(900,(a.x+b.x)/2+150),y:Math.min(500,(a.y+b.y)/2+120)};
   doc.components.push({id:prefix+r,type:op.type,name:registry[op.type].label,a:left,b:right,value:op.value,valueSource:op.value===null?'unknown':'user',closed:true,confidence:1,evidence:'按用户明确要求新增',...(position?{position}:{})});
  }
 }
 return CircuitSchema.parse(doc);
}
