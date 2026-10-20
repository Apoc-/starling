import { test, expect } from '@playwright/test';
const fixture=(overrides={})=>({version:1,revision:1,state:{energy:5000,runEarned:15000,lifetimeEarned:15000,producers:{scout:0,array:0,reactor:0},upgrades:[],stardust:0,voyages:0,checkpoint:Date.now(),...overrides}});
async function ready(page){await page.goto('./');await expect(page.getByRole('button',{name:'Collect energy'})).toBeEnabled();}
async function offer(page,data){await page.getByRole('button',{name:'Open settings'}).click();await page.locator('#import-file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});}
async function importStation(page,data){await offer(page,data);await page.getByRole('button',{name:'Replace progress',exact:true}).click();await expect(page.locator('#import-dialog')).not.toBeVisible();await expect(page.locator('#save-status')).toHaveText('Saved on this device');}
async function exported(page){await page.getByRole('button',{name:'Open settings'}).click();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup',exact:true}).click();const download=await downloadPromise;const stream=await download.createReadStream();let text='';for await (const chunk of stream)text+=chunk;await page.getByRole('button',{name:'Close settings'}).click();return JSON.parse(text);}

test('backup confirmation, upgrades, voyage cancel/confirm, and portable round trip',async({page})=>{
  await ready(page);
  await offer(page,fixture());await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('#energy')).toHaveText('0');
  await importStation(page,fixture());await expect(page.locator('#energy')).toHaveText('5k');
  await page.getByRole('button',{name:'Research Focused pulse'}).click();await expect(page.locator('#tap-value')).toHaveText('2');await expect(page.locator('#energy')).toHaveText('4.9k');
  await page.getByRole('button',{name:'Research Smart grid'}).click();
  const before=await exported(page);expect(before.state.energy).toBe(4540);expect(before.state.upgrades).toEqual(['pulse','conductor']);
  await page.getByRole('button',{name:/New voyage/}).click();await expect(page.locator('#voyage-preview')).toContainText('1 stardust');await page.getByRole('button',{name:'Stay here'}).click();await expect(page.locator('#energy')).toHaveText('4.5k');
  await page.getByRole('button',{name:/New voyage/}).click();await page.getByRole('button',{name:'Begin voyage'}).click();
  await expect(page.locator('#energy')).toHaveText('0');await expect(page.locator('#stardust')).toHaveText('1');await expect(page.locator('#boost')).toHaveText('+25%');await expect(page.locator('#tap-value')).toHaveText('1.3');
  await page.reload();await expect(page.locator('#stardust')).toHaveText('1');
  const after=await exported(page);expect(after.state.lifetimeEarned).toBe(15000);expect(after.state.runEarned).toBe(0);expect(after.state.upgrades).toEqual([]);expect(after.state.voyages).toBe(1);
  await importStation(page,before);expect((await exported(page)).state).toEqual({...before.state,checkpoint:expect.any(Number)});
  await page.getByRole('button',{name:'Build Solar array'}).click();await expect(page.locator('#rate')).toHaveText('8');await expect(page.locator('#owned-array')).toHaveText('1');
  await page.screenshot({path:'artifacts/mobile-midgame.png',fullPage:true});
});

test('future, corrupt, oversized, and invalid imports preserve current progress',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'Collect energy'}).click();
  for (const data of [{...fixture(),version:2},fixture({energy:-1}),fixture({upgrades:['<script>window.injected=true</script>']})]) {
    await offer(page,data);await expect(page.locator('#toast')).toContainText('Import rejected');await expect(page.locator('#import-dialog')).not.toBeVisible();await page.getByRole('button',{name:'Close settings'}).click();
  }
  await page.getByRole('button',{name:'Open settings'}).click();
  for(const text of ['not json',' '.repeat(100001)]){await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(text)});await expect(page.locator('#toast')).toContainText('Import rejected');}
  await page.getByRole('button',{name:'Close settings'}).click();await expect(page.locator('#energy')).toHaveText('1');expect(await page.evaluate(()=>window.injected)).toBeUndefined();
});

test('a second tab is read-only and cannot overwrite the active station',async({page,context})=>{
  await ready(page);await page.getByRole('button',{name:'Collect energy'}).click();
  const other=await context.newPage();await other.goto(page.url());await expect(other.locator('#notice')).toContainText('read-only');await expect(other.getByRole('button',{name:'Collect energy'})).toBeDisabled();
  await page.getByRole('button',{name:'Collect energy'}).click();await expect(page.locator('#energy')).toHaveText('2');await page.close();await other.reload();await expect(other.getByRole('button',{name:'Collect energy'})).toBeEnabled();await expect(other.locator('#energy')).toHaveText('2');
});

test('storage denial leaves a playable exportable session with no false saved status',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{value:{open(){throw new DOMException('Storage disabled','SecurityError');}}});});
  await ready(page);await expect(page.locator('#notice')).toContainText('storage is unavailable');await page.getByRole('button',{name:'Collect energy'}).click();await expect(page.locator('#energy')).toHaveText('1');await expect(page.locator('#save-status')).toContainText('Temporary session');expect((await exported(page)).state.energy).toBe(1);
});

test('quota failure retains last commit and offers an export of in-memory progress',async({page})=>{
  await ready(page);await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};});
  await page.getByRole('button',{name:'Collect energy'}).click();await expect(page.locator('#notice')).toContainText('Saving is unavailable');await expect(page.locator('#save-status')).toContainText('Not saved');expect((await exported(page)).state.energy).toBe(1);
  const persisted=await page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('starling-save',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const r=db.transaction('saves').objectStore('saves').get('current');r.onsuccess=()=>{resolve(r.result.state.energy);db.close();};};}));expect(persisted).toBe(0);
});

test('future on-device schema is preserved without silent reset',async({page})=>{
  await page.goto('manifest.webmanifest');
  await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('starling-save',1);r.onupgradeneeded=()=>r.result.createObjectStore('saves');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put({version:99,revision:7,state:{precious:'do not overwrite'}},'current');tx.oncomplete=()=>{db.close();resolve();};};});});
  await page.goto('./');await expect(page.locator('#notice')).toContainText('Nothing has been overwritten');await expect(page.getByRole('button',{name:'Collect energy'})).toBeDisabled();
  const version=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('starling-save',1);r.onsuccess=()=>{const db=r.result;const q=db.transaction('saves').objectStore('saves').get('current');q.onsuccess=()=>{resolve(q.result.version);db.close();};};}));expect(version).toBe(99);
});

test('returning earns four capped hours exactly once, even after reload and backwards time',async({page})=>{
  const now=Date.UTC(2026,0,1);
  await page.clock.setFixedTime(now);
  await page.goto('manifest.webmanifest');
  const seed=fixture({energy:0,runEarned:0,lifetimeEarned:0,producers:{scout:1,array:0,reactor:0},checkpoint:now-8*60*60*1000});
  await page.evaluate(data=>new Promise((resolve,reject)=>{const r=indexedDB.open('starling-save',1);r.onupgradeneeded=()=>r.result.createObjectStore('saves');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(data,'current');tx.oncomplete=()=>{db.close();resolve();};};}),seed);
  await ready(page);expect((await exported(page)).state.energy).toBe(7200);
  await page.reload();await expect(page.getByRole('button',{name:'Collect energy'})).toBeEnabled();expect((await exported(page)).state.energy).toBe(7200);
  await page.clock.setFixedTime(now-60*60*1000);await page.reload();await expect(page.getByRole('button',{name:'Collect energy'})).toBeEnabled();const saved=await exported(page);expect(saved.state.energy).toBe(7200);expect(saved.state.checkpoint).toBe(now);
});

test('responsive desktop, narrow mobile, landscape, keyboard, and reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await ready(page);
  for(const viewport of [{width:320,height:568},{width:844,height:390},{width:1440,height:1000}]){await page.setViewportSize(viewport);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.getByRole('button',{name:'Collect energy'}).focus();await page.keyboard.press('Enter');await expect(page.locator('#energy')).toHaveText('1');
  await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
});
