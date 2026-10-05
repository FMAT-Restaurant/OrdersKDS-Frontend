import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // forbidOnly prevents accidentally committing test.only() calls in CI.
  forbidOnly: !!process.env.CI,
  // Two retries in CI to absorb transient flakiness; zero locally to surface failures fast.
  retries: process.env.CI ? 2 : 0,
  // Single worker in CI avoids resource contention on GitHub Actions runners.
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    // Port 4173 is the Vite preview default, intentionally different from the dev server (5173)
    // so that E2E tests run against the production-like bundle, not the dev server.
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm run build && pnpm run preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    // 120 s accounts for the full vite build time on a cold CI runner.
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
