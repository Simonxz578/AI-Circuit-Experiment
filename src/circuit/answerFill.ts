import {CircuitSchema,type CircuitDocument,type Component} from './schema';

type Selection={ids:string[];unknown:string[]};
function mentionedTargets(text:string,doc:CircuitDocument,selectedId?:string):Selection{
 const labels=[...text.matchAll(/\b[A-Za-z][A-Za-z0-9_-]{0,23}\b/g)].map(m=>m[0]).filter(id=>!['V','A','W','SI','LED'].includes(id.toUpperCase()));
 const selected=doc.components.find(c=>c.id===selectedId),nearby=/这个|该元件|选中|它/.test(text);
 const types=new Set<Component['type']>();
 if(/电压表|伏特表/.test(text))types.add('voltmeter');
 if(/电流表|安培表/.test(text))types.add('ammeter');
 if(/电源|电池/.test(text)||!labels.length&&/电压/.test(text)&&!/电压表/.test(text))types.add('source');
 if(/电阻|阻值|变阻器/.test(text)){types.add('resistor');types.add('rheostat');}
 if(/LED|发光二极管/.test(text))types.add('led');
 if(/电容/.test(text)){types.add('capacitor');types.add('polar_capacitor');}
 const explicit=doc.components.filter(c=>labels.some(id=>id.toLowerCase()===c.id.toLowerCase()));
 // “R2电阻/阻值” describes R2; it does not select every resistor. A separate
 // type such as “R2和电源” still adds the explicitly named source category.
 const representedTypes=new Set(explicit.map(c=>c.type));
 const matches=doc.components.filter(c=>explicit.some(e=>e.id===c.id)||types.has(c.type)&&!representedTypes.has(c.type)&&(!nearby||c.id===selected?.id));
 if(nearby&&!labels.length&&!types.size&&selected)matches.push(selected);
 return {ids:[...new Set(matches.map(c=>c.id))],unknown:labels.filter(id=>!doc.components.some(c=>c.id.toLowerCase()===id.toLowerCase()))};
}

/** A request to fill one answer must not silently populate the rest of the experiment. */
export function selectAnswerFill(before:CircuitDocument,computed:CircuitDocument,text:string,selectedId?:string):{document?:CircuitDocument;targetIds:string[];restricted:boolean;error?:string}{
 const clauses=text.split(/[，,。；;！!\n]/).filter(Boolean);
 const only=clauses.filter(c=>/(?:只|仅).*(?:填|代入|写入)/.test(c));
 const except=clauses.filter(c=>/(?:不要|不用|无需|不必|别|不).*(?:填|代入|写入)/.test(c));
 const restricted=only.length>0||except.length>0;
 if(!restricted)return {document:computed,targetIds:before.components.map(c=>c.id),restricted:false};
 const wanted=mentionedTargets(only.join('，'),before,selectedId),excluded=mentionedTargets(except.join('，'),before,selectedId);
 if(wanted.unknown.length||excluded.unknown.length)return {targetIds:[],restricted:true,error:'没有找到你指定的 '+[...wanted.unknown,...excluded.unknown].join('、')+'，请使用图中的元件编号。'};
 const hasTargetWords=/[A-Za-z]\d|电源|电池|电压表|电流表|电阻|阻值|变阻器|电容|这个|该元件|选中|它/.test(only.join('，'));
 if(only.length&&!wanted.ids.length&&hasTargetWords)return {targetIds:[],restricted:true,error:'请明确只填写哪个元件，例如“只填 R2”。其他数值未改动。'};
 const ids=(only.length&&wanted.ids.length?wanted.ids:before.components.map(c=>c.id)).filter(id=>!excluded.ids.includes(id));
 if(!ids.length)return {targetIds:[],restricted:true,error:'没有可按本次要求填写的数值，当前实验未改动。'};
 return {targetIds:ids,restricted:true,document:CircuitSchema.parse({...before,components:before.components.map(c=>ids.includes(c.id)?computed.components.find(v=>v.id===c.id)??c:c),measurements:[...before.measurements.filter(m=>!ids.includes(m.targetId)),...computed.measurements.filter(m=>ids.includes(m.targetId))]})};
}
