/**
 * IT-FE-06 / ST-16 — CSS isolation: the federated remote does not alter the
 * host's styles.
 *
 * Scenario: the host stub (port 5174) has "hostile" styles on
 * body, button, and html (red background, yellow border, etc.). The
 * federated component is mounted inside `.orders-kds-root` and we verify that
 * the computed styles of the host DO NOT change after mounting.
 *
 * Servers started by playwright.config.ts:
 *   - Port 4173 → federated remote (pnpm build + pnpm preview)
 *   - Port 5174 → host stub (tests/e2e/host-stub/index.html)
 *   - Port 5173 → dev server (harness)
 */
import { test, expect } from '@playwright/test';

test.describe('IT-FE-06 / ST-16 — CSS scoping in host stub', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the host stub which has "hostile" global styles
    await page.goto('http://127.0.0.1:5174');
  });

  test('body keeps its original host background-color (hostile red)', async ({ page }) => {
    const bodyBg = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor,
    );
    // The host stub defines body { background-color: red !important }
    // Tailwind with preflight: false MUST NOT overwrite this
    expect(bodyBg).toBe('rgb(255, 0, 0)');
  });

  test('body keeps its original host font-family (hostile monospace)', async ({ page }) => {
    const bodyFont = await page.evaluate(() =>
      window.getComputedStyle(document.body).fontFamily,
    );
    // The host stub defines body { font-family: monospace !important }
    expect(bodyFont).toContain('monospace');
  });

  test('global host buttons keep their yellow border', async ({ page }) => {
    // Insert a global button outside the .orders-kds-root scope
    await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.id = 'global-host-button';
      btn.textContent = 'Host button';
      document.body.insertBefore(btn, document.body.firstChild);
    });

    const borderColor = await page.evaluate(() => {
      const btn = document.getElementById('global-host-button');
      return btn ? window.getComputedStyle(btn).borderColor : null;
    });

    // The host stub defines button { border: 5px solid yellow !important }
    expect(borderColor).toBe('rgb(255, 255, 0)');
  });

  test('html keeps its original host font-size (hostile 20px)', async ({ page }) => {
    const htmlFontSize = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).fontSize,
    );
    // The host stub defines html, body { font-size: 20px !important }
    expect(htmlFontSize).toBe('20px');
  });

  test('ST-16 — the bundle is mounted in .orders-kds-root without modifying external styles', async ({
    page,
  }) => {
    // Capture host styles BEFORE any federated script
    const stylesBefore = await page.evaluate(() => ({
      bodyBg: window.getComputedStyle(document.body).backgroundColor,
      bodyFont: window.getComputedStyle(document.body).fontFamily,
      htmlFontSize: window.getComputedStyle(document.documentElement).fontSize,
    }));

    // Wait for the remote's root container to be present
    const root = page.locator('#root.orders-kds-root');
    await expect(root).toBeAttached();

    // Capture host styles AFTER mounting
    const stylesAfter = await page.evaluate(() => ({
      bodyBg: window.getComputedStyle(document.body).backgroundColor,
      bodyFont: window.getComputedStyle(document.body).fontFamily,
      htmlFontSize: window.getComputedStyle(document.documentElement).fontSize,
    }));

    // Host styles must not have changed
    expect(stylesAfter.bodyBg).toBe(stylesBefore.bodyBg);
    expect(stylesAfter.bodyFont).toBe(stylesBefore.bodyFont);
    expect(stylesAfter.htmlFontSize).toBe(stylesBefore.htmlFontSize);
  });
});
