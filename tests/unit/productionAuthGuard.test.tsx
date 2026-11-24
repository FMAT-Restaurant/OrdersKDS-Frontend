import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UnauthenticatedSessionView from '../../src/features/auth/UnauthenticatedSessionView.tsx';
import { ApiClient, generateLocalDevToken } from '../../src/shared/api/client.ts';
import { UserRole } from '../../src/shared/types/auth.ts';

describe('Production Auth Guard & Bundle Hardening (DEF-E5-018)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    localStorage.clear();
  });

  it('renders accessible session-required view when unauthenticated in production mode', async () => {
    vi.stubEnv('DEV', false);
    const { default: ProdApp } = await import('../../src/App.tsx');

    render(<ProdApp />);

    const alertBox = screen.getByTestId('auth-required-screen');
    expect(alertBox).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('heading', { name: 'Sesión requerida' })).toBeInTheDocument();
  });

  it('renders UnauthenticatedSessionView standalone', () => {
    render(<UnauthenticatedSessionView />);
    expect(screen.getByTestId('auth-required-screen')).toBeInTheDocument();
    expect(screen.getByText(/portal principal de autenticación/i)).toBeInTheDocument();
  });

  it('returns empty string from generateLocalDevToken and omits auth header in ApiClient when not DEV', async () => {
    vi.stubEnv('DEV', false);
    expect(generateLocalDevToken('admin')).toBe('');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { apiClient } = await import('../../src/shared/api/client.ts');
    expect(apiClient).toBeDefined();

    const scopedClient = new ApiClient({ baseUrl: 'http://localhost:8000', fetchFn: fetchMock });
    await scopedClient.get('/health');

    const passedHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(passedHeaders.get('Authorization')).toBeNull();
  });

  it('mounts authenticated Shell user cleanly even when DEV is false', async () => {
    vi.stubEnv('DEV', false);
    const provider = vi.fn().mockResolvedValue('provider-jwt');
    let capturedToken: string | null = null;

    vi.doMock('../../src/KdsApp.tsx', () => ({
      default: ({
        userRole,
        tokenProvider,
      }: {
        userRole?: UserRole;
        tokenProvider?: () => Promise<string | null>;
      }) => {
        if (tokenProvider) {
          void tokenProvider().then((resolved) => {
            capturedToken = resolved;
          });
        }
        return <div data-testid="authenticated-kds" data-role={userRole} />;
      },
    }));
    const { default: ProdApp } = await import('../../src/App.tsx');

    const { rerender } = render(
      <ProdApp
        token="signed.shell.token"
        currentUser={{ id: 'chef-1', roles: ['chef'], permissions: ['kitchen:queues:view'] }}
      />,
    );

    expect(await screen.findByTestId('authenticated-kds')).toHaveAttribute(
      'data-role',
      UserRole.CHEF,
    );
    expect(capturedToken).toBe('signed.shell.token');

    rerender(
      <ProdApp
        tokenProvider={provider}
        currentUser={{ id: 'chef-2', roles: ['chef'], permissions: ['kitchen:queues:view'] }}
      />,
    );
    expect(provider).toHaveBeenCalled();

    localStorage.setItem('fmat_restaurant_auth_session', JSON.stringify({ accessToken: 'stored-jwt' }));
    rerender(
      <ProdApp
        currentUser={{ id: 'chef-3', roles: ['chef'], permissions: ['kitchen:queues:view'] }}
      />,
    );
    expect(await screen.findByTestId('authenticated-kds')).toBeInTheDocument();
  });

  it('excludes devsignature and DevSandboxApp from production dist bundle if built', () => {
    const assetsDir = path.join('dist', 'assets');
    if (!fs.existsSync(assetsDir)) {
      return;
    }
    const jsFiles = fs.readdirSync(assetsDir).filter((file: string) => file.endsWith('.js'));
    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf8');
      expect(content).not.toContain('devsignature');
      expect(content).not.toContain('DevSandboxApp');
    }
  });
});
