import { useCallback, useEffect, useState } from 'react';
import DevSandboxApp from './DevSandboxApp.tsx';
import KdsApp from './KdsApp.tsx';
import OrderTicketWidget from './OrderTicketWidget.tsx';
import { generateLocalDevToken, getStoredSessionToken } from './shared/api/client.ts';
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

type ShellViewMode = 'kds' | 'ticket';

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
 * Delegates to DevSandboxApp when running standalone without an authenticated Shell session.
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

  const effectiveTokenProvider: TokenProvider = useCallback(() => {
    if (token) return Promise.resolve(token);
    if (tokenProvider) return tokenProvider();
    const stored = getStoredSessionToken();
    return Promise.resolve(stored || generateLocalDevToken('admin'));
  }, [token, tokenProvider]);

  if (!activeUser) {
    return (
      <DevSandboxApp
        effectiveRole={UserRole.ADMIN}
        tokenProvider={effectiveTokenProvider}
      />
    );
  }

  const effectiveRole = resolveUserRole(activeUser) ?? UserRole.ADMIN;
  const hasKitchen = hasKitchenModuleAccess(activeUser);
  const hasOrders = hasWaiterModuleAccess(activeUser);
  const canSwitchViews = isAdminUser(activeUser) || (hasKitchen && hasOrders);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-900 text-slate-100">
      {canSwitchViews && <ShellNavbar view={view} onViewChange={setView} />}

      <main className="flex-1 w-full h-full overflow-auto">
        {view === 'kds' ? (
          <KdsApp userRole={effectiveRole} tokenProvider={effectiveTokenProvider} />
        ) : (
          <div className="p-6 flex flex-col items-center justify-start min-h-full bg-slate-100 text-slate-900">
            <div className="orders-kds-root w-full max-w-4xl">
              <OrderTicketWidget
                tokenProvider={effectiveTokenProvider}
                userId={activeUser.id || activeUser.sub || '00000000-0000-0000-0000-000000000001'}
                entityLabel="orden"
                allowRemoveAllItems
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
