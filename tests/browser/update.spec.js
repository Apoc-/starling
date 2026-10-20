import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
test('real version A to B update preserves a save with an old second tab, then launches offline',async({page,context})=>{
  test.skip(!!process.env.TEST_URL,'Local deployment mutation test; never alter the live release.');
  await page.goto('./');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await expect(page.getByRole('button',{name:'Collect energy'})).toBeEnabled();
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Collect energy'}).click();
  const other=await context.newPage();await other.goto(page.url());await expect(other.locator('#notice')).toContainText('read-only');
  const html=await readFile('dist/index.html','utf8'),sw=await readFile('dist/sw.js','utf8');
  try{
    await writeFile('dist/index.html',html.replace('<title>Starling — a little orbital idle</title>','<title>Starling — update B</title>'));
    await writeFile('dist/sw.js',sw.replace("const CACHE = '","const CACHE = 'update-B-"));
    await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
    await expect(page.locator('#update-banner')).toBeVisible();
    await expect(page).toHaveTitle('Starling — a little orbital idle');
    await page.getByRole('button',{name:'Collect energy'}).click();await expect(page.locator('#energy')).toHaveText('4');
    await page.getByRole('button',{name:'Save & update'}).click();
    await expect(page).toHaveTitle('Starling — update B');await expect(page.locator('#energy')).toHaveText('4');
    await expect(other).toHaveTitle('Starling — update B');await expect(other.locator('#energy')).toHaveText('4');
    await context.setOffline(true);await page.reload();await expect(page).toHaveTitle('Starling — update B');await expect(page.locator('#energy')).toHaveText('4');
    await page.screenshot({path:'artifacts/update-B-offline.png'});
  }finally{await writeFile('dist/index.html',html);await writeFile('dist/sw.js',sw);}
});

test('a failed update save prevents activation and leaves progress exportable',async({page})=>{
  test.skip(!!process.env.TEST_URL,'Local deployment mutation test.');
  await page.goto('./');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await expect(page.getByRole('button',{name:'Collect energy'})).toBeEnabled();
  const sw=await readFile('dist/sw.js','utf8');
  try{
    await writeFile('dist/sw.js',sw.replace("const CACHE = '","const CACHE = 'failed-save-update-"));
    await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});await expect(page.locator('#update-banner')).toBeVisible();
    await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};});
    await page.getByRole('button',{name:'Save & update'}).click();await expect(page.locator('#toast')).toContainText('Update paused');
    expect(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting)).toBe(true);
    await expect(page.locator('#save-status')).toContainText('Not saved');
  }finally{await writeFile('dist/sw.js',sw);}
});
