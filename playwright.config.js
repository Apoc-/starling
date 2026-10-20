import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', timeout:30000, workers:1,
  use:{baseURL:process.env.TEST_URL || 'http://localhost:4173/starling/', headless:true, viewport:{width:390,height:844}, launchOptions:{executablePath:process.env.AGENT_BROWSER_EXECUTABLE_PATH || undefined}, trace:'retain-on-failure'},
  reporter:[['list'],['json',{outputFile:'artifacts/browser-results.json'}]],
  outputDir:'artifacts/playwright',
  webServer: process.env.TEST_URL ? undefined : {command:'npm run preview', url:'http://localhost:4173/health', reuseExistingServer:!process.env.CI, timeout:15000}
});
