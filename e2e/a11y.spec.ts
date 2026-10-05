import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';

test('verify no accessibility violations with axe-core', async ({ page }) => {
  await page.goto('/');

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

  fs.mkdirSync('axe-report', { recursive: true });
  fs.writeFileSync('axe-report/axe-report.json', JSON.stringify(accessibilityScanResults, null, 2));

  expect(accessibilityScanResults.violations).toEqual([]);
});
