import {describe,it,expect} from 'vitest';
import {localCommand} from './commands';
import {examples} from './examples';

describe('read requests cannot become local parameter edits',()=>{
 it.each(['我算出R1=15Ω，帮我核对','原图R1=30Ω，读一下不要修改','不要把R1改成8Ω','别闭合S1','请检查R1=15Ω是否正确','解释R1=15Ω时为什么电流会减小'])('routes %s to the coach without mutating',text=>{const d=structuredClone(examples[0]);const before=JSON.stringify(d);expect(localCommand(d,text)).toBeNull();expect(JSON.stringify(d)).toBe(before);});
 it('keeps explicit tuning and plain supplied answer entry local',()=>{const doc=examples[0];expect(localCommand(doc,'把R1改成8Ω')?.document?.components.find(c=>c.id==='R1')?.value).toBe(8);expect(localCommand(doc,'R1=15Ω')?.document?.components.find(c=>c.id==='R1')?.value).toBe(15);expect(localCommand(doc,'当前总电流')?.reply).toContain('1 A');});
});
