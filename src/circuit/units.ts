export const quantities=['resistance','voltage','current','capacitance','inductance','power','charge','forwardVoltage','internalResistance','range','position'] as const;
export type Quantity=typeof quantities[number];
const base:Record<Quantity,string>={resistance:'Ω',voltage:'V',current:'A',capacitance:'F',inductance:'H',power:'W',charge:'C',forwardVoltage:'V',internalResistance:'Ω',range:'',position:''};
export function parseQuantity(raw:number|string,kind:Quantity):number{
 if(typeof raw==='number'){if(!Number.isFinite(raw))throw Error('数值无效');return raw;}
 const cleaned=raw.trim().replace(/千欧姆?|千欧/g,'kΩ').replace(/兆欧姆?|兆欧/g,'MΩ').replace(/欧姆?|ohms?/gi,'Ω').replace(/毫伏/g,'mV').replace(/伏特?|法拉|亨利/g,m=>m.startsWith('伏')?'V':m==='法拉'?'F':'H').replace(/[μµu]/g,'μ');
 const m=cleaned.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([kMmμnp]?)(Ω|A|V|F|H|W|C|%)?$/);if(!m)throw Error('数值或单位待确认');
 const unit=m[3]??'',expected=base[kind];if(unit&&unit!=='%'&&expected&&unit!==expected)throw Error('单位与物理量不匹配');if(unit==='%'&&kind!=='position')throw Error('百分比只用于滑片位置');
 const factor:Record<string,number>={'':1,k:1e3,M:1e6,m:1e-3,μ:1e-6,n:1e-9,p:1e-12};const n=Number(m[1])*factor[m[2]]*(unit==='%'?.01:1);if(!Number.isFinite(n))throw Error('数值超出范围');return n;
}
export function displayQuantity(value:number,unit:string){
 let factor=1,prefix='';if(value!==0){const abs=Math.abs(value);if(abs>=1e6){factor=1e6;prefix='M';}else if(abs>=1000){factor=1000;prefix='k';}else if(abs<1e-9){factor=1e-12;prefix='p';}else if(abs<1e-6){factor=1e-9;prefix='n';}else if(abs<.001){factor=1e-6;prefix='μ';}else if(abs<1){factor=.001;prefix='m';}}
 return `${Number((value/factor).toPrecision(4))}${unit?' '+prefix+unit:''}`;
}
