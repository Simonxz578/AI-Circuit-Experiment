import {z} from 'zod';import {CircuitSchema,type CircuitDocument} from './schema';
export const OperationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('set_value'),id:z.string(),value:z.number().finite()}),
 z.object({action:z.literal('set_switch'),id:z.string(),closed:z.boolean()}),
 z.object({action:z.literal('insert_series'),afterId:z.string(),value:z.number().positive().max(1e7)}),
 z.object({action:z.literal('add_parallel'),targetId:z.string(),value:z.number().positive().max(1e7)}),
 z.object({action:z.literal('reconnect'),id:z.string(),a:z.string(),b:z.string()}),
 z.object({action:z.literal('remove'),id:z.string()})
]);
export const OperationsSchema=z.array(OperationSchema).max(8);
/** Compile intent to graph edits. Coordinates never create electrical connections. */
export function applyOperations(original:CircuitDocument,input:unknown):CircuitDocument{
 const ops=OperationsSchema.parse(input),doc=structuredClone(original);doc.source='edited';
 for(const op of ops){
  const id='id' in op?op.id:'afterId' in op?op.afterId:op.targetId;const target=doc.components.find(c=>c.id===id);if(!target)throw new Error('操作指定了不存在的元件。');
  if(op.action==='set_value'){if(!['resistor','rheostat','source'].includes(target.type))throw new Error('元件参数不可调整。');target.value=op.value;target.valueSource='user';}
  if(op.action==='set_switch'){if(!['switch','fuse'].includes(target.type))throw new Error('此元件不是开关。');target.closed=op.closed;}
  if(op.action==='reconnect'){target.a=op.a;target.b=op.b;}
  if(op.action==='remove')doc.components=doc.components.filter(c=>c.id!==op.id);
  if(op.action==='insert_series'||op.action==='add_parallel'){
   let r=1;while(doc.components.some(c=>c.id===`R${r}`))r++;const a=doc.nodes.find(n=>n.id===target.a)!,b=doc.nodes.find(n=>n.id===target.b)!;let left=target.a,right=target.b;let position;
   if(op.action==='insert_series'){
    let j=1;while(doc.nodes.some(n=>n.id===`j${j}`))j++;const node=`j${j}`;
    doc.nodes.push({id:node,x:Math.max(60,Math.min(940,(a.x+b.x)/2)),y:Math.max(60,Math.min(540,(a.y+b.y)/2))});
    target.b=node;target.position=undefined;left=node;right=b.id;
   }else position={x:Math.min(900,(a.x+b.x)/2+150),y:Math.min(500,(a.y+b.y)/2+120)};
   doc.components.push({id:`R${r}`,type:'resistor',name:'电阻',a:left,b:right,value:op.value,valueSource:'user',closed:true,confidence:1,evidence:'按用户明确要求新增',...(position?{position}:{})});
  }
 }
 return CircuitSchema.parse(doc);
}
