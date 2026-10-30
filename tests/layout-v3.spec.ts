import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
const record=JSON.parse(readFileSync('docs/evidence/reliability/public-switch.json','utf8'));

test.beforeEach(async({page})=>{await page.route('**/api/health',r=>r.fulfill({json:{ai:true}}));});
test('bad recognition coordinates become a readable two-switch circuit and stay fixed while adjusting',async({page},info)=>{
 const doc=structuredClone(record.document);doc.components.forEach((c:{position:{x:number;y:number}})=>c.position={x:500,y:250});
 await page.route('**/api/parse',r=>r.fulfill({json:{document:doc,durationMs:7000}}));
 await page.goto('');await page.locator('input[type=file]').nth(0).setInputFiles('public/examples/switch-bypass.png');await page.getByRole('button',{name:'生成实验',exact:true}).click();await expect(page.getByRole('button',{name:'生成实验',exact:true})).toBeEnabled();
 const geometry=()=>page.locator('[data-component-id]').evaluateAll(els=>els.map(e=>({id:e.getAttribute('data-component-id'),x:Number(e.getAttribute('data-layout-x')),y:Number(e.getAttribute('data-layout-y'))})));
 const positions=await geometry();expect(positions).toHaveLength(5);const r2=positions.find(p=>p.id==='R2')!,s2=positions.find(p=>p.id==='S2')!;expect(Math.abs(r2.y-s2.y)).toBeGreaterThanOrEqual(172);
 for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)expect(Math.abs(positions[i].x-positions[j].x)>=205||Math.abs(positions[i].y-positions[j].y)>=172).toBe(true);
 await page.getByRole('switch',{name:'S1 开关',exact:true}).click();await expect(page.locator('.readout-strip')).toContainText('0.4 A');await page.getByRole('switch',{name:'S2 开关',exact:true}).click();await expect(page.locator('.readout-strip')).toContainText('1.2 A');expect(await geometry()).toEqual(positions);
 await page.getByLabel('R1 参数',{exact:true}).fill('20');await expect(page.locator('.readout-strip')).toContainText('0.6 A');expect(await geometry()).toEqual(positions);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`docs/screenshots/layout-v3-${info.project.name}.png`,fullPage:true});
});

test('loading robot charges with both arms, white lightning eyes, and session reuse skips another call',async({page},info)=>{
 let calls=0;let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/parse',async r=>{calls++;if(calls===1)await gate;await r.fulfill({json:{document:record.document,durationMs:7000}});});
 await page.goto('');await page.locator('input[type=file]').nth(0).setInputFiles('public/examples/switch-bypass.png');await page.getByRole('button',{name:'生成实验',exact:true}).click();
 const robot=page.locator('.workspace-mascot .robot');await expect(robot).toHaveAttribute('data-charging','true');expect(await robot.locator('.robot-lightning-eyes path').count()).toBe(2);
 const arms=await robot.locator('.robot-arm-left,.robot-arm-right').evaluateAll(els=>els.map(e=>getComputedStyle(e).animationName));expect(arms).toEqual(['charge-left','charge-right']);
 expect(await robot.locator('.robot-lightning-eyes').evaluate(e=>getComputedStyle(e).fill)).toBe('rgb(255, 255, 255)');await page.screenshot({path:`docs/screenshots/charging-v3-${info.project.name}.png`,fullPage:true});release();
 await expect(page.getByRole('button',{name:'生成实验',exact:true})).toBeEnabled();await expect(robot).toHaveAttribute('data-charging','false');
 await page.getByRole('button',{name:'生成实验',exact:true}).click();await expect(page.getByRole('button',{name:'生成实验',exact:true})).toBeEnabled();await expect(page.locator('.canvas-footer')).toContainText('已复用本次识别');expect(calls).toBe(1);
 await page.getByRole('button',{name:'重新识别',exact:true}).click();await expect(page.getByRole('button',{name:'生成实验',exact:true})).toBeEnabled();expect(calls).toBe(2);await expect(page.locator('.canvas-footer')).toContainText('识别用时 7.0 秒');
});

test('manual movement preserves electrical endpoints and solver results',async({page})=>{
 await page.goto('');const component=page.locator('[data-component-id="R1"] .component-hit');const box=await component.boundingBox();expect(box).toBeTruthy();await component.scrollIntoViewIfNeeded();const visibleBox=(await component.boundingBox())!;
 const endpoints=await page.locator('[data-component-id="R1"]').getAttribute('data-terminal-a');await page.mouse.move(visibleBox.x+visibleBox.width/2,visibleBox.y+visibleBox.height/2);await page.mouse.down();await page.mouse.move(visibleBox.x+visibleBox.width/2+25,visibleBox.y+visibleBox.height/2+80,{steps:8});await page.mouse.up();
 await expect(page.locator('.readout-strip')).toContainText('1 A');const saved=page.waitForEvent('download');await page.getByLabel('保存当前实验配置',{exact:true}).click();const path=await (await saved).path();const d=JSON.parse(await readFile(path!,'utf8'));const r=d.components.find((c:{id:string})=>c.id==='R1');expect(r.positionSource).toBe('manual');expect(r.a).toBe('n1');expect(r.b).toBe('n2');expect(await page.locator('[data-component-id="R1"]').getAttribute('data-terminal-a')).not.toBe(endpoints);
});

test('reduced motion disables the paired charging animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.route('**/api/parse',async r=>{await new Promise(resolve=>setTimeout(resolve,1500));await r.fulfill({json:{document:record.document,durationMs:1500}});});await page.goto('');await page.getByLabel('电路描述',{exact:true}).fill('12V 两电阻和两个开关');await page.getByRole('button',{name:'生成实验',exact:true}).click();await expect(page.locator('.workspace-mascot .robot')).toHaveAttribute('data-charging','true');expect(await page.locator('.workspace-mascot .robot-arm-left').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
});
