import type { Page } from '@playwright/test';

export type E2ERole = 'waiter' | 'kitchen' | 'chef' | 'admin';

interface SeedSessionOptions {
  readonly role: E2ERole;
  readonly theme?: 'light' | 'dark';
  readonly userId?: string;
}

const ROLE_TO_PERMISSIONS: Record<E2ERole, string[]> = {
  waiter: [
    'orders:orders:view',
    'orders:orders:create',
    'orders:orders:update',
    'orders:orders:confirm',
  ],
  kitchen: ['kitchen:queues:view', 'kitchen:orders:start_preparation', 'kitchen:items:ready', 'kitchen:orders:ready'],
  chef: ['kitchen:queues:view', 'kitchen:orders:start_preparation', 'kitchen:orders:void_error', 'kitchen:shifts:manage', 'orders:orders:view'],
  admin: ['*'],
};

/**
 * Seed localStorage before navigation so App.tsx mounts the real federated component
 * directly over window.fetch (bypassing DevSandboxApp mockFetch).
 * Uses an opaque non-JWT token format to keep Gitleaks green.
 */
export async function seedAuthSession(
  page: Page,
  { role, theme = 'light', userId = '00000000-0000-0000-0000-000000000001' }: SeedSessionOptions,
): Promise<void> {
  const sessionPayload = {
    token: `e2e-session-token-${role}`,
    accessToken: `e2e-session-token-${role}`,
    user: {
      id: userId,
      sub: userId,
      roles: [role],
      permissions: ROLE_TO_PERMISSIONS[role],
      ...(role === 'admin' ? { userType: 'ADMIN' } : {}),
    },
  };

  await page.addInitScript(
    ({ rawSession, activeTheme }) => {
      window.localStorage.setItem('fmat_restaurant_auth_session', rawSession);
      if (activeTheme === 'dark') {
        document.documentElement.dataset.theme = 'dark';
      } else {
        delete document.documentElement.dataset.theme;
      }
    },
    { rawSession: JSON.stringify(sessionPayload), activeTheme: theme },
  );
}

/**
 * Dynamically switch theme on the running document matching Auth Shell `theme-change` behavior.
 */
export async function setDocumentTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((nextTheme) => {
    if (nextTheme === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, theme);
}
