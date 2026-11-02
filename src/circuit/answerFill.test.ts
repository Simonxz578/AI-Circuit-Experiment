import {describe,it,expect} from 'vitest';
import {selectAnswerFill} from './answerFill';
import {examples} from './examples';

describe('targeted answer filling',()=>{
 const before=()=>{const d=structuredClone(examples[0]);d.components=d.components.map(c=>['R1','R2','V1'].includes(c.id)?{...c,value:null,valueSource:'unknown'}:c);return d;};
 const computed=()=>{const d=structuredClone(examples[0]);d.components=d.components.map(c=>['R1','R2','V1'].includes(c.id)?{...c,valueSource:'user'}:c);d.measurements=[{id:'M1',targetId:'VM1',quantity:'voltage',value:6,conditions:{},source:'user',confidence:1,evidence:'电路求解器计算的结果'}];return d;};
 it.each(['帮我解题，只填R2','只把R2填进去，其他保持空着'])('honors %s without filling other unknowns or computed meters',text=>{const b=before(),r=selectAnswerFill(b,computed(),text);expect(r.restricted).toBe(true);expect(r.targetIds).toEqual(['R2']);expect(r.document?.components.find(c=>c.id==='R2')?.value).toBe(6);expect(r.document?.components.find(c=>c.id==='V1')?.value).toBeNull();expect(r.document?.components.find(c=>c.id==='R1')?.value).toBeNull();expect(r.document?.measurements).toEqual(b.measurements);});
 it('understands source names, exclusions, selected component and meter answers',()=>{const b=before();expect(selectAnswerFill(b,computed(),'填入答案，不要填电源').document?.components.find(c=>c.id==='V1')?.value).toBeNull();expect(selectAnswerFill(b,computed(),'只填写这个电阻','R1').targetIds).toEqual(['R1']);const meter=selectAnswerFill(b,computed(),'只填写电压表');expect(meter.targetIds).toEqual(['VM1']);expect(meter.document?.measurements[0].value).toBe(6);});
 it('refuses a missing explicit target instead of filling all',()=>{const r=selectAnswerFill(before(),computed(),'只填R99');expect(r.document).toBeUndefined();expect(r.error).toContain('R99');});
 it('preserves normal fill-all behavior when no subset is requested',()=>{expect(selectAnswerFill(before(),computed(),'帮我解题并填入答案').document).toEqual(computed());});
 it.each(['只把R2电阻填进去','帮我解题，只填R2阻值','只填R2电阻数值'])('treats the type noun as a modifier of the named component: %s',text=>{const r=selectAnswerFill(before(),computed(),text);expect(r.targetIds).toEqual(['R2']);expect(r.document?.components.find(c=>c.id==='R1')?.value).toBeNull();});
 it('still includes a separately requested source while retaining the named resistor scope',()=>{expect(selectAnswerFill(before(),computed(),'只填R2电阻和电源电压').targetIds).toEqual(['V1','R2']);});
});
