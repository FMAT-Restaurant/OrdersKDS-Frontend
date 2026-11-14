import { useCallback, useEffect, useState } from 'react';
import KdsApp from './KdsApp.tsx';
import OrderTicketWidget from './OrderTicketWidget.tsx';
import { ReadyOrdersAlert } from './ReadyOrdersAlert.tsx';
import {
  DEFAULT_WAITER_ID,
  MockWebSocket,
  SEED_ORDER_ITEMS,
  UI_PRESET_ITEMS,
  createSandboxController,
  type PresetItemConfig,
  type SandboxController,
  type SandboxSimAction,
} from './features/dev-sandbox/mockSandboxFetch.ts';
import { generateLocalDevToken } from './shared/api/client.ts';
import { queryClient } from './shared/api/queryClient.ts';
import { UserRole, type TokenProvider } from './shared/types/auth.ts';

type DevViewMode = 'kds' | 'ticket' | 'alerts';
type QuickSimAction =
  | 'add_tacos'
  | 'add_burger'
  | 'expire_ttl'
  | 'kitchen_start'
  | 'kitchen_deliver'
  | 'kitchen_reject';

interface DevRoleOption {
  readonly role: UserRole;
  readonly label: string;
  readonly testId: string;
  readonly targetView?: DevViewMode;
  readonly title: string;
}

const DEV_ROLE_OPTIONS: readonly DevRoleOption[] = [
  {
    role: UserRole.ADMIN,
    label: '👑 Admin',
    testId: 'dev-role-admin',
    title: 'Admin: acceso completo a vistas y en KDS habilita Anular (Admin) + Anular (Cocina)',
  },
  {
    role: UserRole.CHEF,
    label: '👨‍🍳 Chef',
    testId: 'dev-role-chef',
    targetView: 'kds',
    title: 'Chef Master: bloqueado a KDS en producción; muestra Anular (Cocina) y oculta Anular (Admin)',
  },
  {
    role: UserRole.KITCHEN,
    label: '🍳 Cocinero',
    testId: 'dev-role-kitchen',
    targetView: 'kds',
    title: 'Cocinero: bloqueado a KDS en producción; oculta ambos botones de anulación',
  },
  {
    role: UserRole.WAITER,
    label: '📝 Mesero',
    testId: 'dev-role-waiter',
    targetView: 'ticket',
    title: 'Mesero: en producción inicia en Orden Mesero sin acceso a KDS',
  },
];

const defaultDevTokenProvider: TokenProvider = () => Promise.resolve(generateLocalDevToken('admin'));

function DevNavbar({
  view,
  selectedRole,
  isMockKds,
  onViewChange,
  onRoleChange,
  onToggleMockKds,
}: Readonly<{
  view: DevViewMode;
  selectedRole: UserRole;
  isMockKds: boolean;
  onViewChange: (view: DevViewMode) => void;
  onRoleChange: (option: DevRoleOption) => void;
  onToggleMockKds: () => void;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-bold text-slate-400 uppercase tracking-wider">Dev Views:</span>
      <nav className="inline-flex rounded-md shadow-sm" aria-label="Selector de vistas">
        <button
          type="button"
          onClick={() => onViewChange('kds')}
          className={`px-3 py-1.5 rounded-l-md font-medium border border-slate-700 transition-colors ${
            view === 'kds'
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          🍳 KDS Cocina
        </button>
        <button
          type="button"
          onClick={() => onViewChange('ticket')}
          className={`px-3 py-1.5 font-medium border-t border-b border-r border-slate-700 transition-colors ${
            view === 'ticket'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          📝 Orden Mesero (OrderTicketWidget)
        </button>
        <button
          type="button"
          onClick={() => onViewChange('alerts')}
          className={`px-3 py-1.5 rounded-r-md font-medium border-t border-b border-r border-slate-700 transition-colors ${
            view === 'alerts'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          🔔 Alerta Órdenes Listas
        </button>
      </nav>
      <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-700">
        <span className="font-bold text-slate-400 uppercase mr-1">Rol:</span>
        {DEV_ROLE_OPTIONS.map((option) => (
          <button
            key={option.role}
            type="button"
            data-testid={option.testId}
            title={option.title}
            onClick={() => onRoleChange(option)}
            className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
              selectedRole === option.role
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onToggleMockKds}
        className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
          isMockKds
            ? 'bg-purple-700 text-white border-purple-500'
            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
        }`}
        title="Alterna si KDS lee del backend real (:8000) o del estado compartido en memoria con Mesero"
      >
        {isMockKds ? '🧪 KDS: Memoria Compartida' : '🔌 KDS: Backend (:8000)'}
      </button>
    </div>
  );
}

function SimulationButton({
  item,
  isSelected,
  onClick,
  defaultActiveBg,
}: Readonly<{
  item: PresetItemConfig;
  isSelected: boolean;
  onClick: (id: string) => void;
  defaultActiveBg?: string;
}>) {
  const activeClass = item.activeBg ?? defaultActiveBg ?? 'bg-teal-600 text-white border-teal-500';
  return (
    <button
      type="button"
      onClick={() => onClick(item.id)}
      className={`px-2 py-1 rounded text-xs border ${
        isSelected ? activeClass : 'bg-slate-800 text-slate-300 border-slate-700'
      }`}
    >
      {item.label}
    </button>
  );
}

function TicketSimulationBar({
  isBackendMode,
  selectedOrderId,
  customOrderId,
  onSelectPreset,
  onSelectSeedOrder,
  onCustomOrderIdChange,
  onApplyCustomOrder,
  onStartBlankDraft,
}: Readonly<{
  isBackendMode: boolean;
  selectedOrderId: string;
  customOrderId: string;
  onSelectPreset: (id: string) => void;
  onSelectSeedOrder: (uuid: string) => void;
  onCustomOrderIdChange: (val: string) => void;
  onApplyCustomOrder: () => void;
  onStartBlankDraft: () => void;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-slate-400">Simulación UI:</span>
      <button
        type="button"
        onClick={onStartBlankDraft}
        className={`px-2 py-1 rounded text-xs border ${
          !isBackendMode && !selectedOrderId
            ? 'bg-indigo-600 text-white border-indigo-400'
            : 'bg-slate-800 text-slate-300 border-slate-700'
        }`}
      >
        🆕 Borrador Blanco
      </button>
      {UI_PRESET_ITEMS.map((item) => (
        <SimulationButton
          key={item.id}
          item={item}
          isSelected={!isBackendMode && selectedOrderId === item.id}
          onClick={onSelectPreset}
        />
      ))}

      <span className="text-slate-500 ml-2">| Backend Real:</span>
      {SEED_ORDER_ITEMS.map((item) => (
        <SimulationButton
          key={item.id}
          item={item}
          isSelected={isBackendMode && selectedOrderId === item.id}
          onClick={onSelectSeedOrder}
          defaultActiveBg="bg-teal-600 text-white border-teal-500"
        />
      ))}

      <div className="flex items-center gap-1 pl-2 border-l border-slate-700">
        <input
          type="text"
          placeholder="UUID de Orden..."
          value={customOrderId}
          onChange={(e) => onCustomOrderIdChange(e.target.value)}
          className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 text-xs w-36"
        />
        <button
          type="button"
          onClick={onApplyCustomOrder}
          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"
        >
          Cargar
        </button>
      </div>
    </div>
  );
}

function TicketQuickLifecycleControls({
  selectedOrderId,
  onSimulateEvent,
  onGoToKds,
}: Readonly<{
  selectedOrderId: string;
  onSimulateEvent: (action: QuickSimAction) => void;
  onGoToKds: () => void;
}>) {
  const dispatchMenuAddDish = (dish: { dishId: string; name: string; unitPrice: number }) => {
    window.dispatchEvent(
      new CustomEvent('fmat:orden:add-item', {
        detail: { ...dish, quantity: 1 },
      }),
    );
  };

  return (
    <div className="w-full max-w-3xl mb-3 bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs text-xs flex flex-wrap items-center gap-1.5">
      <span className="font-semibold text-slate-700 mr-1">Eventos rápidos (Menú / Cocina):</span>
      <button
        type="button"
        onClick={() =>
          dispatchMenuAddDish({ dishId: 'dish-tacos', name: 'Orden de Tacos al Pastor', unitPrice: 120 })
        }
        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
      >
        + Menú: Tacos al Pastor
      </button>
      <button
        type="button"
        onClick={() =>
          dispatchMenuAddDish({ dishId: 'dish-hamburguesa', name: 'Hamburguesa Clásica', unitPrice: 165 })
        }
        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
      >
        + Menú: Hamburguesa
      </button>
      {selectedOrderId && (
        <>
          <button
            type="button"
            onClick={() => onSimulateEvent('kitchen_start')}
            className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300"
          >
            Cocina: Iniciar Prep
          </button>
          <button
            type="button"
            onClick={() => onSimulateEvent('kitchen_deliver')}
            className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300"
          >
            Cocina: Entregar
          </button>
          <button
            type="button"
            onClick={() => onSimulateEvent('kitchen_reject')}
            className="px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-900 border border-red-300"
          >
            Simular Rechazo Stock
          </button>
          <button
            type="button"
            onClick={() => onSimulateEvent('expire_ttl')}
            className="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300"
          >
            Caducar TTL (&gt;15m)
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onGoToKds}
        className="ml-auto px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold"
      >
        Ver en KDS Cocina →
      </button>
    </div>
  );
}

function TicketViewContent({
  selectedOrderId,
  isBackendMode,
  mockFetch,
  onSelectPreset,
  onOrderSubmitted,
  onSimulateEvent,
  onGoToKds,
}: Readonly<{
  selectedOrderId: string;
  isBackendMode: boolean;
  mockFetch: typeof fetch;
  onSelectPreset: (id: string) => void;
  onOrderSubmitted: (newOrderId: string) => void;
  onSimulateEvent: (action: QuickSimAction) => void;
  onGoToKds: () => void;
}>) {
  return (
    <div className="p-6 flex flex-col items-center justify-start min-h-full bg-slate-100 text-slate-900">
      <div className="w-full max-w-3xl mb-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-xs text-slate-600 flex justify-between items-center">
        <div>
          <strong className="text-slate-800">Vista Mesero (OrderTicketWidget):</strong>
          <p className="mt-0.5">
            {isBackendMode
              ? 'Conectado a orders-backend en http://localhost:8000 con JWT de rol waiter.'
              : 'Modo simulación visual en memoria compartida con KDS.'}
          </p>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            isBackendMode ? 'bg-teal-100 text-teal-800' : 'bg-blue-100 text-blue-800'
          }`}
        >
          {isBackendMode ? 'Live Backend' : 'Mock Preset'}
        </span>
      </div>

      {!isBackendMode && (
        <TicketQuickLifecycleControls
          selectedOrderId={selectedOrderId}
          onSimulateEvent={onSimulateEvent}
          onGoToKds={onGoToKds}
        />
      )}

      <div className="orders-kds-root w-full max-w-3xl">
        <OrderTicketWidget
          key={selectedOrderId || 'blank-draft'}
          orderId={selectedOrderId || undefined}
          userId={DEFAULT_WAITER_ID}
          tokenProvider={defaultDevTokenProvider}
          apiBaseUrl={isBackendMode ? 'http://localhost:8000' : ''}
          webSocketBaseUrl={isBackendMode ? 'ws://localhost:8000' : undefined}
          fetchFn={isBackendMode ? undefined : mockFetch}
          WebSocketClass={
            isBackendMode ? undefined : (MockWebSocket as unknown as typeof WebSocket)
          }
          diningSessionId="00000000-0000-0000-0000-000000000099"
          entityLabel="orden"
          allowRemoveAllItems
          onOrderSubmitted={onOrderSubmitted}
          onCreateNewOrder={() => onSelectPreset('ord-mesa-4')}
        />
      </div>
    </div>
  );
}

function AlertsViewContent() {
  return (
    <div className="p-6 flex flex-col items-center justify-start min-h-full bg-slate-900 text-slate-100">
      <div className="w-full max-w-xl mb-4 bg-slate-800 p-4 rounded-lg border border-slate-700 text-sm">
        <h2 className="font-bold text-white mb-2">Simulador de Alertas para Meseros</h2>
        <p className="text-slate-300 text-xs mb-3">
          Escucha el canal WebSocket de cocina y emite un sonido (chime) y una notificación emergente
          cuando un platillo pasa a <code>DELIVERED</code>.
        </p>
      </div>
      <div className="w-full max-w-xl">
        <ReadyOrdersAlert
          userId={DEFAULT_WAITER_ID}
          tokenProvider={defaultDevTokenProvider}
          webSocketBaseUrl="ws://localhost:8000"
          enableSound={true}
        />
      </div>
    </div>
  );
}

export interface DevSandboxAppProps {
  readonly effectiveRole?: UserRole;
  readonly tokenProvider?: TokenProvider;
}

/**
 * Standalone interactive development sandbox for testing Waiter, KDS, and Alerts flows
 * both against live backend seeds and a shared in-memory lifecycle simulator.
 */
export function DevSandboxApp({
  effectiveRole,
  tokenProvider,
}: Readonly<DevSandboxAppProps> = {}) {
  const [view, setView] = useState<DevViewMode>('kds');
  const [selectedRole, setSelectedRole] = useState<UserRole>(effectiveRole ?? UserRole.ADMIN);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('ord-mesa-4');
  const [customOrderId, setCustomOrderId] = useState<string>('');
  const [isBackendMode, setIsBackendMode] = useState<boolean>(false);
  const [isMockKds, setIsMockKds] = useState<boolean>(false);
  const [sandbox] = useState<SandboxController>(() => createSandboxController(defaultDevTokenProvider));

  const activeTokenProvider = useCallback<TokenProvider>(
    () => (tokenProvider ? tokenProvider() : Promise.resolve(generateLocalDevToken(selectedRole))),
    [tokenProvider, selectedRole],
  );

  const syncSandboxQueries = useCallback(
    (orderId?: string) => {
      void queryClient.invalidateQueries({ queryKey: ['kds'] });
      if (orderId) {
        const latest = sandbox.getOrder(orderId);
        if (latest) {
          queryClient.setQueryData(['order', orderId], latest);
        }
        void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      }
    },
    [sandbox],
  );

  useEffect(() => {
    sandbox.updateContext(selectedOrderId, activeTokenProvider, syncSandboxQueries);
  }, [sandbox, selectedOrderId, activeTokenProvider, syncSandboxQueries]);

  useEffect(() => {
    sandbox.getOrders().forEach((order) => {
      if (order.id) {
        queryClient.setQueryData(['order', order.id], order);
      }
    });
  }, [sandbox]);

  const handleSelectPreset = useCallback(
    (orderId: string) => {
      setIsBackendMode(false);
      setIsMockKds(true);
      setSelectedOrderId(orderId);
      const freshOrder = sandbox.resetPreset(orderId);
      if (freshOrder) {
        queryClient.setQueryData(['order', orderId], freshOrder);
      }
      void queryClient.invalidateQueries({ queryKey: ['kds'] });
    },
    [sandbox],
  );

  const handleStartBlankDraft = useCallback(() => {
    setIsBackendMode(false);
    setIsMockKds(true);
    setSelectedOrderId('');
  }, []);

  const handleSelectSeedOrder = useCallback((orderUuid: string) => {
    setIsBackendMode(true);
    setIsMockKds(false);
    setSelectedOrderId(orderUuid);
    void queryClient.invalidateQueries({ queryKey: ['order', orderUuid] });
    void queryClient.invalidateQueries({ queryKey: ['kds'] });
  }, []);

  const handleApplyCustomOrder = useCallback(() => {
    const trimmed = customOrderId.trim();
    if (trimmed) {
      setIsBackendMode(true);
      setIsMockKds(false);
      setSelectedOrderId(trimmed);
      void queryClient.invalidateQueries({ queryKey: ['order', trimmed] });
    }
  }, [customOrderId]);

  const handleViewChange = useCallback((nextView: DevViewMode) => {
    setView(nextView);
    if (nextView === 'kds') {
      void queryClient.invalidateQueries({ queryKey: ['kds'] });
    }
  }, []);

  const handleRoleChange = useCallback(
    (option: DevRoleOption) => {
      setSelectedRole(option.role);
      if (option.targetView) {
        handleViewChange(option.targetView);
      }
    },
    [handleViewChange],
  );

  const handleOrderSubmitted = useCallback(
    (newOrderId: string) => {
      setSelectedOrderId(newOrderId);
      syncSandboxQueries(newOrderId);
    },
    [syncSandboxQueries],
  );

  const handleSimulateEvent = useCallback(
    (action: QuickSimAction) => {
      if (action === 'add_tacos' || action === 'add_burger') {
        return;
      }
      const simAction: SandboxSimAction = action;
      const updated = sandbox.simulateAction(selectedOrderId, simAction);
      if (!updated) return;
      setIsMockKds(true);
      syncSandboxQueries(selectedOrderId);
    },
    [sandbox, selectedOrderId, syncSandboxQueries],
  );

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-900 text-slate-100">
      <header className="flex flex-wrap items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs gap-2 shrink-0 z-50">
        <DevNavbar
          view={view}
          selectedRole={selectedRole}
          isMockKds={isMockKds}
          onViewChange={handleViewChange}
          onRoleChange={handleRoleChange}
          onToggleMockKds={() => {
            setIsMockKds((prev) => !prev);
            void queryClient.invalidateQueries({ queryKey: ['kds'] });
          }}
        />

        {view === 'ticket' && (
          <TicketSimulationBar
            isBackendMode={isBackendMode}
            selectedOrderId={selectedOrderId}
            customOrderId={customOrderId}
            onSelectPreset={handleSelectPreset}
            onSelectSeedOrder={handleSelectSeedOrder}
            onCustomOrderIdChange={setCustomOrderId}
            onApplyCustomOrder={handleApplyCustomOrder}
            onStartBlankDraft={handleStartBlankDraft}
          />
        )}
      </header>

      <main className="flex-1 w-full h-full overflow-auto">
        {view === 'kds' && (
          <KdsApp
            userRole={selectedRole}
            tokenProvider={activeTokenProvider}
            client={isMockKds ? sandbox.mockKdsClient : undefined}
          />
        )}
        {view === 'ticket' && (
          <TicketViewContent
            selectedOrderId={selectedOrderId}
            isBackendMode={isBackendMode}
            mockFetch={sandbox.mockFetch}
            onSelectPreset={handleSelectPreset}
            onOrderSubmitted={handleOrderSubmitted}
            onSimulateEvent={handleSimulateEvent}
            onGoToKds={() => handleViewChange('kds')}
          />
        )}
        {view === 'alerts' && <AlertsViewContent />}
      </main>
    </div>
  );
}

export default DevSandboxApp;
