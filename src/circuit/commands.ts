import {editValue,registry,type CircuitDocument} from './schema';
import {applyOperations} from './operations';
import {solve} from './solver';
export type CommandResult={reply:string;preview?:boolean;document?:CircuitDocument};
export function localCommand(doc:CircuitDocument,text:string):CommandResult|null{
 const convert=text.trim().match(/^(?:请)?(?:把|将)?\s*([A-Za-z][A-Za-z0-9_-]*)\s*(?:改成|改为|换成)\s*(滑动变阻器|变阻器|电阻)[。！!]?$/i);
 if(convert){try{return {preview:true,document:applyOperations(doc,[{action:'change_type',id:doc.components.find(c=>c.id.toLowerCase()===convert[1].toLowerCase())?.id??convert[1],type:convert[2]==='电阻'?'resistor':'rheostat'}]),reply:'已更换元件类型，保留原接线和阻值。'};}catch(e){return {reply:(e as Error).message};}}
 if(/^(?:请)?(?:添加|加上)(?:一个)?电流表和(?:一个)?电压表[。！!：:]?$/.test(text.trim()))return {reply:'你想测量哪个元件？例如：在 R1 串入电流表，并在 R1 两端加电压表。'};
 const meters=text.trim().match(/^(?:请)?(?:给|在)?\s*([A-Za-z][A-Za-z0-9_-]*)\s*(?:添加|加上|串入)\s*(电流表和电压表|电流表|电压表)[。！!]?$/i);
 if(meters){const target=doc.components.find(c=>c.id.toLowerCase()===meters[1].toLowerCase());if(!target)return {reply:'未找到要测量的元件，请检查编号。'};try{const types=meters[2]==='电流表和电压表'?['ammeter','voltmeter']:meters[2]==='电流表'?['ammeter']:['voltmeter'];return {preview:true,document:applyOperations(doc,types.map(type=>({action:'add_meter',targetId:target.id,type}))),reply:`已为 ${target.id} 添加仪表：电流表串联测支路电流，电压表并联测两端电压。`};}catch(e){return {reply:(e as Error).message};}}
 const value=text.trim().match(/^(?:请)?(?:把|将)?\s*([A-Za-z][A-Za-z0-9_-]*)\s*(?:改成|改为|设为|设置为|调到|=)\s*(-?\d+(?:\.\d+)?)\s*(千欧姆|千欧|kΩ|欧姆|欧|Ω|伏特|伏|V)?[。！!]?$/i);
 if(value){const component=doc.components.find(c=>c.id.toLowerCase()===value[1].toLowerCase());if(!component)return {reply:`当前电路没有 ${value[1]}，请确认图中的元件编号。`};if(!['source','resistor','rheostat'].includes(component.type))return {reply:'这个元件没有可调的电压或电阻值。'};const ohms=/欧|Ω/i.test(value[3]??''),volts=/伏|^V$/i.test(value[3]??'');if((component.type==='source'&&ohms)||(component.type!=='source'&&volts))return {reply:'单位与元件不匹配：电源使用伏特，电阻使用欧姆。'};try{const n=Number(value[2])*(/千|^k/i.test(value[3]??'')?1000:1);return {document:editValue(doc,component.id,n),reply:`已将 ${component.id} 改为 ${n} ${registry[component.type].unit}，读数与曲线已重新计算。`};}catch{return {reply:'这个数值超出范围。电阻应大于 0，电源应在 ±1000 V 以内。'};}}
 if(/^(?:请)?(?:把|将)?(?:开关|S\d+)\s*(?:打开|断开|闭合|合上|关闭)[。！!]?$/i.test(text.trim())){const id=text.match(/S\d+/i)?.[0];const target=doc.components.find(c=>c.type==='switch'&&(!id||c.id.toLowerCase()===id.toLowerCase()));if(!target)return {reply:'当前没有找到对应开关。'};const closed=/闭合|合上|关闭/.test(text);return {document:{...doc,source:'edited',components:doc.components.map(c=>c.id===target.id?{...c,closed}:c)},reply:`已${closed?'闭合':'断开'} ${target.id}。请观察电流读数的变化。`};}
 if(/^(现在|当前)?(?:的)?(?:总电流|电流是多少|读数)[？?。]?$/.test(text.trim())){const s=solve(doc);return {reply:s.ok&&s.totalCurrent!==null?`当前总电流为 ${Number(s.totalCurrent.toPrecision(5))} A。这是按当前接线与参数求解的结果。`:s.reason??'多电源电路请查看各电源与支路的读数。'};}
 return null;
}
