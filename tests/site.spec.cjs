const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test('page renders without script errors or broken local assets', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.title()).not.toBe('');
  expect(await page.locator('img').evaluateAll(images =>
    images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('page.png'), fullPage: true });
});
