import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import KdsApp from './KdsApp.tsx';
import OrderTicketWidget from './OrderTicketWidget.tsx';
import UnauthenticatedSessionView from './features/auth/UnauthenticatedSessionView.tsx';
import {
  getStoredSessionToken,
  resolveDefaultApiBaseUrl,
  resolveDefaultWsBaseUrl,
} from './shared/api/client.ts';
import {
  getStoredSessionUser,
  hasKitchenModuleAccess,
  hasWaiterModuleAccess,
  isAdminUser,
  resolveUserRole,
  UserRole,
  type FederatedModuleProps,
  type ShellUser,
  type TokenProvider,
} from './shared/types/auth.ts';

const LazyDevSandboxApp = import.meta.env.DEV ? lazy(() => import('./DevSandboxApp.tsx')) : null;

type ShellViewMode = 'kds' | 'ticket';

function extractThemeFromEvent(event: Event): 'light' | 'dark' | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }
  const detail: unknown = event.detail;
  if (detail === 'light' || detail === 'dark') {
    return detail;
  }
  if (typeof detail === 'object' && detail !== null && 'theme' in detail) {
    const candidate = (detail as { theme?: unknown }).theme;
    if (candidate === 'light' || candidate === 'dark') {
      return candidate;
    }
  }
  return null;
}

function getInitialView(user: ShellUser): ShellViewMode {
  if (!hasKitchenModuleAccess(user) && hasWaiterModuleAccess(user)) {
    return 'ticket';
  }
  return 'kds';
}

function ShellNavbar({
  view,
  onViewChange,
}: Readonly<{
  view: ShellViewMode;
  onViewChange: (view: ShellViewMode) => void;
}>) {
  return (
    <header className="flex items-center justify-between px-6 py-2 bg-slate-950 border-b border-slate-800 text-xs shrink-0 z-50">
      <span className="font-semibold text-slate-200">Módulo Órdenes &amp; Cocina</span>
      <div className="flex gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
        <button
          type="button"
          onClick={() => onViewChange('kds')}
          className={`px-3 py-1 rounded font-medium transition-colors cursor-pointer ${
            view === 'kds'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Pantalla Cocina (KDS)
        </button>
        <button
          type="button"
          onClick={() => onViewChange('ticket')}
          className={`px-3 py-1 rounded font-medium transition-colors cursor-pointer ${
            view === 'ticket'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Gestión de Órdenes
        </button>
      </div>
    </header>
  );
}

/**
 * Production Module Federation root entrypoint for Auth-Frontend Shell.
 * Requires an active Shell session in production (dev harness loads only in DEV).
 */
function App({
  token,
  tokenProvider,
  currentUser,
  theme,
}: Readonly<FederatedModuleProps> = {}) {
  const activeUser = currentUser ?? getStoredSessionUser();
  const [view, setView] = useState<ShellViewMode>(() =>
    activeUser ? getInitialView(activeUser) : 'kds',
  );

  useEffect(() => {
    if (theme) {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextTheme = extractThemeFromEvent(event);
      if (nextTheme) {
        document.documentElement.dataset.theme = nextTheme;
      }
    };
    window.addEventListener('theme-change', handleThemeChange);
    return () => window.removeEventListener('theme-change', handleThemeChange);
  }, []);

  const effectiveTokenProvider: TokenProvider = useCallback(() => {
    if (token) return Promise.resolve(token);
    if (tokenProvider) return tokenProvider();
    return Promise.resolve(getStoredSessionToken());
  }, [token, tokenProvider]);

  if (!activeUser) {
    if (import.meta.env.DEV && LazyDevSandboxApp) {
      return (
        <Suspense fallback={null}>
          <LazyDevSandboxApp
            effectiveRole={UserRole.ADMIN}
            tokenProvider={token || tokenProvider ? effectiveTokenProvider : undefined}
          />
        </Suspense>
      );
    }
    return <UnauthenticatedSessionView />;
  }

  const effectiveRole = resolveUserRole(activeUser) ?? UserRole.ADMIN;
  const hasKitchen = hasKitchenModuleAccess(activeUser);
  const hasOrders = hasWaiterModuleAccess(activeUser);
  const canSwitchViews = isAdminUser(activeUser) || (hasKitchen && hasOrders);
  const effectiveView: ShellViewMode = canSwitchViews ? view : getInitialView(activeUser);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-900 text-slate-100">
      {canSwitchViews && <ShellNavbar view={effectiveView} onViewChange={setView} />}

      <main className="flex-1 w-full h-full overflow-auto">
        {effectiveView === 'kds' ? (
          <KdsApp
            userRole={effectiveRole}
            currentUser={activeUser}
            tokenProvider={effectiveTokenProvider}
            apiBaseUrl={resolveDefaultApiBaseUrl()}
          />
        ) : (
          <div className="orders-kds-root min-h-full w-full">
            <div className="p-6 flex flex-col items-center justify-start min-h-full bg-canvas text-ink">
              <div className="w-full max-w-4xl">
                <OrderTicketWidget
                  tokenProvider={effectiveTokenProvider}
                  userId={activeUser.id || activeUser.sub || '00000000-0000-0000-0000-000000000001'}
                  apiBaseUrl={resolveDefaultApiBaseUrl()}
                  webSocketBaseUrl={resolveDefaultWsBaseUrl()}
                  entityLabel="orden"
                  allowRemoveAllItems
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
