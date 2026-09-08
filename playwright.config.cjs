const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: { headless: true },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
});
