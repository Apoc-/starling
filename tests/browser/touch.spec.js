import { test,expect } from '@playwright/test';
test.use({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
test('real mobile touch taps credit every deliberate energy collection',async({page})=>{
  await page.goto('./');const collect=page.getByRole('button',{name:'Collect energy'});await expect(collect).toBeEnabled();
  for(let i=0;i<10;i++){await collect.tap();await page.waitForTimeout(500);}
  await expect(page.locator('#energy')).toHaveText('10');
});
