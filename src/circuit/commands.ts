import {editValue,registry,type CircuitDocument} from './schema';
import {solve} from './solver';
export type CommandResult={reply:string;document?:CircuitDocument};
export function localCommand(doc:CircuitDocument,text:string):CommandResult|null{
 const value=text.trim().match(/^(?:请)?(?:把|将)?\s*([A-Za-z][A-Za-z0-9_-]*)\s*(?:改成|改为|设为|设置为|调到|=)\s*(-?\d+(?:\.\d+)?)\s*(千欧姆|千欧|kΩ|欧姆|欧|Ω|伏特|伏|V)?[。！!]?$/i);
 if(value){const component=doc.components.find(c=>c.id.toLowerCase()===value[1].toLowerCase());if(!component)return {reply:`当前电路没有 ${value[1]}，请确认图中的元件编号。`};if(!['source','resistor','rheostat'].includes(component.type))return {reply:'这个元件没有可调的电压或电阻值。'};const ohms=/欧|Ω/i.test(value[3]??''),volts=/伏|^V$/i.test(value[3]??'');if((component.type==='source'&&ohms)||(component.type!=='source'&&volts))return {reply:'单位与元件不匹配：电源使用伏特，电阻使用欧姆。'};try{const n=Number(value[2])*(/千|^k/i.test(value[3]??'')?1000:1);return {document:editValue(doc,component.id,n),reply:`已将 ${component.id} 改为 ${n} ${registry[component.type].unit}，读数与曲线已重新计算。`};}catch{return {reply:'这个数值超出范围。电阻应大于 0，电源应在 ±1000 V 以内。'};}}
 if(/^(?:请)?(?:把|将)?(?:开关|S\d+)\s*(?:打开|断开|闭合|合上|关闭)[。！!]?$/i.test(text.trim())){const id=text.match(/S\d+/i)?.[0];const target=doc.components.find(c=>c.type==='switch'&&(!id||c.id.toLowerCase()===id.toLowerCase()));if(!target)return {reply:'当前没有找到对应开关。'};const closed=/闭合|合上|关闭/.test(text);return {document:{...doc,source:'edited',components:doc.components.map(c=>c.id===target.id?{...c,closed}:c)},reply:`已${closed?'闭合':'断开'} ${target.id}。请观察电流读数的变化。`};}
 if(/^(现在|当前)?(?:的)?(?:总电流|电流是多少|读数)[？?。]?$/.test(text.trim())){const s=solve(doc);return {reply:s.ok&&s.totalCurrent!==null?`当前总电流为 ${Number(s.totalCurrent.toPrecision(5))} A。这是按当前接线与参数求解的结果。`:s.reason??'多电源电路请查看各电源与支路的读数。'};}
 return null;
}
