import {test,expect} from '@playwright/test';import {examples} from '../src/circuit/examples';
const encode=(events:unknown[])=>events.map(e=>JSON.stringify(e)).join('\n')+'\n';
test.beforeEach(async({page})=>{await page.route('**/api/health',r=>r.fulfill({json:{ai:true}}));});
test('streamed progress and automatic recovery lead to the actual returned graph',async({page})=>{
 await page.route('**/api/parse',r=>r.fulfill({contentType:'application/x-ndjson',body:encode([{type:'progress',data:{stage:'正在自动恢复一次',attempt:2}},{type:'heartbeat'},{type:'result',data:{document:examples[2],durationMs:50}}])}));
 await page.goto('');await page.getByLabel('电路描述',{exact:true}).fill('双开关电路');await page.getByRole('button',{name:'生成实验',exact:true}).click();await expect(page.getByRole('button',{name:'生成实验',exact:true})).toBeEnabled();await expect(page.locator('.readout-strip')).toContainText('3 A');
});
test('streamed empty-output error keeps upload and offers one-click retry',async({page})=>{
 let calls=0;await page.route('**/api/parse',r=>{calls++;return r.fulfill({contentType:'application/x-ndjson',body:calls===1?encode([{type:'error',status:502,data:{code:'EMPTY_OUTPUT',error:'AI本次没有返回可用的识别结果。图片已保留，请重试。'}}]):encode([{type:'result',data:{document:examples[1],durationMs:10}}])});});
 await page.goto('');await page.locator('input[type=file]').nth(0).setInputFiles('public/examples/switch-bypass.png');await page.getByRole('button',{name:'生成实验',exact:true}).click();await expect(page.getByRole('alert')).toContainText('没有返回');await expect(page.getByAltText('已上传的电路题原图')).toBeVisible();await expect(page.locator('.readout-strip')).toContainText('1 A');await page.getByRole('button',{name:'重试识别',exact:true}).click();await expect(page.getByRole('button',{name:'生成实验',exact:true})).toBeEnabled();await expect(page.locator('.readout-strip')).toContainText('6 A');expect(calls).toBe(2);
});
