import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';

test('read-only tab cannot activate an update over unsaved writer progress',async({page,context})=>{
  test.skip(!!process.env.TEST_URL,'Mutates only local built test deployment.');
  await page.goto('./');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await expect(page.getByRole('button',{name:'Collect energy'})).toBeEnabled();
  const other=await context.newPage();await other.goto(page.url());await expect(other.locator('#notice')).toContainText('read-only');
  await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};});
  await page.getByRole('button',{name:'Collect energy'}).click();await expect(page.locator('#save-status')).toContainText('Not saved');await expect(page.locator('#energy')).toHaveText('1');
  const sw=await readFile('dist/sw.js','utf8');
  try{
    await writeFile('dist/sw.js',sw.replace("const CACHE = '","const CACHE = 'read-only-regression-"));
    await other.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
    await expect(other.locator('#update-banner')).toBeVisible();
    // The spectator must not have an enabled update action. Guard its handler too.
    await expect(other.getByRole('button',{name:/Save & update|Update in active/})).toBeDisabled();
    await other.locator('#update-now').evaluate(button=>button.dispatchEvent(new Event('click')));
    await page.waitForTimeout(200);
    expect(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting)).toBe(true);
    await expect(page.locator('#energy')).toHaveText('1');await expect(page.locator('#save-status')).toContainText('Not saved');
  }finally{await writeFile('dist/sw.js',sw);}
});

test('an unsupported Web Locks browser never writes its temporary session to disk',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
  await page.goto('./');await expect(page.getByRole('button',{name:'Collect energy'})).toBeEnabled();
  await expect(page.locator('#notice')).toContainText('temporary');await page.getByRole('button',{name:'Collect energy'}).click();await expect(page.locator('#energy')).toHaveText('1');
  const current=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('starling-save',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const q=db.transaction('saves').objectStore('saves').get('current');q.onsuccess=()=>{resolve(q.result||null);db.close();};};}));expect(current).toBeNull();
});
