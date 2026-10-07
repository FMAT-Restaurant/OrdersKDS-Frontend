/**
 * UT-FE-27 — Compiled CSS does not contain global rules.
 *
 * Validates that the Tailwind configuration with `preflight: false` and
 * `important: '.orders-kds-root'` never emits rules that modify
 * `body`, `html`, or `:root` outside the scope of the root container.
 *
 * Strategy: reads the CSS files from the `dist/` directory generated
 * by the Module Federation build. If the directory does not exist (dev
 * environment without a previous build), the test is marked as "skipped"
 * with a warning, to avoid blocking local development.
 *
 * In CI the `unit-tests` job runs AFTER `build-federation`, so
 * `dist/` will always be available.
 */
import { existsSync, readFileSync } from 'fs';
import { globSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// Global selectors that MUST NOT appear outside .orders-kds-root
const FORBIDDEN_GLOBAL_SELECTORS = [
  /^body\s*[{,]/m,
  /^html\s*[{,]/m,
  /^:root\s*[{,]/m,
  /^\*\s*[{,]/m,           // global wildcard
  /^h[1-6]\s*[{,]/m,      // global headings (blocked by preflight: false)
  /^button\s*[{,]/m,       // global buttons
];

describe('UT-FE-27 — CSS scoping (TASK-08)', () => {
  it('the dist/ directory exists (federated build generated)', () => {
    const distExists = existsSync('dist');
    if (!distExists) {
      console.warn(
        '[UT-FE-27] dist/ not found. Run `pnpm run build` before running this test locally.',
      );
    }
    // In CI it must always exist; locally we inform but don't fail here.
    expect(distExists || !process.env.CI).toBe(true);
  });

  it('no CSS file in the bundle contains global selectors', () => {
    if (!existsSync('dist')) {
      console.warn('[UT-FE-27] Skipping CSS content check — dist/ not found.');
      return;
    }

    const cssFiles = globSync('dist/**/*.css');
    expect(cssFiles.length).toBeGreaterThan(0); // Must have at least one CSS file

    for (const file of cssFiles) {
      const content = readFileSync(file, 'utf-8');

      for (const pattern of FORBIDDEN_GLOBAL_SELECTORS) {
        expect(
          content,
          `Forbidden global selector found in "${file}" (pattern: ${pattern})`,
        ).not.toMatch(pattern);
      }
    }
  });

  it('all Tailwind selectors are scoped under .orders-kds-root', () => {
    if (!existsSync('dist')) {
      console.warn('[UT-FE-27] Skipping selector scope check — dist/ not found.');
      return;
    }

    const cssFiles = globSync('dist/**/*.css');
    for (const file of cssFiles) {
      const content = readFileSync(file, 'utf-8');

      // Extract lines containing Tailwind utility selectors (.text-, .bg-, etc. classes)
      // and verify they are always prefixed by .orders-kds-root
      const utilityLines = content
        .split('\n')
        .filter((line) => /\.(text|bg|p|m|flex|grid|w-|h-|rounded|border|font)/.test(line));

      for (const line of utilityLines) {
        // If the line has a Tailwind selector, it must be inside .orders-kds-root
        if (line.includes('{') && !line.trim().startsWith('/*')) {
          expect(
            line,
            `Utility selector out of scope in "${file}": ${line.trim()}`,
          ).toMatch(/\.orders-kds-root/);
        }
      }
    }
  });
});
