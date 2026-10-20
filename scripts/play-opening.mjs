// Optional real-time, fresh-save opening playthrough. Run preview first.
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.AGENT_BROWSER_EXECUTABLE_PATH || undefined});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(process.env.TEST_URL || 'http://localhost:4173/starling/');
  const collect=page.getByRole('button',{name:'Collect energy'});await collect.waitFor();
  const began=Date.now(),milestones=[];
  const goals=[['first drone','Build Collector drone'],['tap upgrade','Research Focused pulse'],['solar array','Build Solar array'],['production upgrade','Research Smart grid']];
  let next=0,taps=0;
  while(Date.now()-began<120000){
    if(await collect.isEnabled()){await collect.tap();taps++;await expect(collect).toBeEnabled();}
    if(next<goals.length){const button=page.getByRole('button',{name:goals[next][1],exact:true});if(await button.isEnabled()){await button.tap();milestones.push({milestone:goals[next][0],elapsedSeconds:(Date.now()-began)/1000});next++;}}
    await page.waitForTimeout(500);
  }
  const report={durationSeconds:(Date.now()-began)/1000,taps,milestones,visibleEnergy:await page.locator('#energy').textContent(),visibleRate:await page.locator('#rate').textContent(),saveStatus:await page.locator('#save-status').textContent(),pageErrors:errors};
  await page.screenshot({path:'artifacts/real-time-opening.png',fullPage:true});
  await writeFile('artifacts/real-time-opening.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length || next<3)throw Error('Opening playthrough did not reach expected first three goals.');
}finally{await browser.close();}
