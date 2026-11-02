import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/api/health',r=>r.fulfill({json:{ai:true}}));await page.goto('');});
test('purple surfaces and legible readings preserve the one-screen workspace',async({page},info)=>{
 const result=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,viewport:[innerWidth,innerHeight],colors:['.topbar','.input-panel','.companion-section','.circuit-canvas','.instrument-panel','.readout-strip'].map(s=>getComputedStyle(document.querySelector(s)!).backgroundColor)}));
 expect(result.width).toBeLessThanOrEqual(result.viewport[0]);expect(result.height).toBeLessThanOrEqual(result.viewport[1]);
 expect(result.colors).toEqual(['rgb(38, 19, 63)','rgb(66, 39, 101)','rgb(59, 33, 93)','rgb(26, 14, 49)','rgb(73, 43, 109)','rgb(65, 38, 96)']);
 await expect(page.locator('.readout-strip')).toContainText('1000 mA');await page.screenshot({path:`private/v8/${info.project.name}-final.png`,fullPage:true});
});
test('reading the original and continuing a question carry image and conversation without changing values',async({page})=>{
 const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5j8AAAAASUVORK5CYII=','base64');
 await page.locator('input[type=file][accept="image/png,image/jpeg,image/webp"]').setInputFiles({name:'question.png',mimeType:'image/png',buffer:photo});
 let count=0;await page.route('**/api/chat',async route=>{const body=route.request().postDataJSON();expect(body.image).toMatch(/^data:image\/png;base64,/);expect(body.selectedId).toBe('R1');expect(body.history.length).toBeGreaterThan(0);if(count++===1)expect(body.history.some((t:any)=>t.text==='原图已知条件已读取。')).toBe(true);await route.fulfill({json:{reply:count===1?'原图已知条件已读取。':'继续核对原题条件。',document:null}});});
 const input=page.getByLabel('向电路搭档提问');await input.fill('原图R1=30Ω，读一下不要修改');await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect(page.getByRole('log')).toContainText('原图已知条件已读取。');
 await input.fill('继续核对这些');await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect(page.getByRole('log')).toContainText('继续核对原题条件。');expect(count).toBe(2);await expect(page.getByRole('button',{name:'R1 电阻，4 Ω',exact:true})).toBeAttached();await expect(page.locator('.pending-panel')).toHaveCount(0);
});
