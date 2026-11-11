import { useState, useEffect } from 'react';
import KdsApp from './KdsApp.tsx';
import OrderTicketWidget from './OrderTicketWidget.tsx';
import { ReadyOrdersAlert } from './ReadyOrdersAlert.tsx';
import { queryClient } from './shared/api/queryClient.ts';
import { OrderStatus, ItemStatus } from './shared/types/order.ts';
import type { Order } from './shared/api/schemas.ts';

type ViewMode = 'kds' | 'ticket' | 'alerts';

/**
 * Valid JWT accepted by orders-backend (ADR-0011).
 * Payload: { sub, user_id: '00000000-0000-0000-0000-000000000001', role: 'waiter', exp: 253370764800 }
 */
const DEV_WAITER_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJ1c2VyX2lkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIiwicm9sZSI6IndhaXRlciIsImV4cCI6MjUzMzcwNzY0ODAwfQ.signature';

const MOCK_ORDER_CREATED: Order = {
  id: 'ord-mesa-4',
  orderId: 'ord-mesa-4',
  publicId: 'ord-mesa-4',
  tableNumber: 4,
  isTakeaway: false,
  status: OrderStatus.CREATED,
  version: 1,
  totalAmount: 350.0,
  diningSessionId: 'ses-mesa-4-active',
  responsibleWaiterId: '00000000-0000-0000-0000-000000000001',
  items: [
    {
      id: 'item-1',
      itemId: 'item-1',
      dishId: 'dish-burger-1',
      name: 'Hamburguesa Clásica',
      quantity: 2,
      unitPrice: 150.0,
      status: ItemStatus.PENDING,
      station: 'plancha',
      notes: 'Sin cebolla',
      modifiers: ['Carne término medio', 'Extra queso'],
      version: 1,
    },
    {
      id: 'item-2',
      itemId: 'item-2',
      dishId: 'dish-fries-1',
      name: 'Papas Francesas',
      quantity: 1,
      unitPrice: 50.0,
      status: ItemStatus.PENDING,
      station: 'freidora',
      notes: 'Crujientes',
      modifiers: [],
      version: 1,
    },
  ],
  createdAt: new Date().toISOString(),
};

const MOCK_ORDER_REJECTED: Order = {
  id: 'ord-rechazada-stock',
  orderId: 'ord-rechazada-stock',
  publicId: 'ord-rechazada-stock',
  tableNumber: 8,
  isTakeaway: false,
  status: OrderStatus.REJECTED,
  version: 2,
  totalAmount: 480.0,
  diningSessionId: 'ses-mesa-8-stock',
  responsibleWaiterId: '00000000-0000-0000-0000-000000000001',
  rejectionDetails: {
    source: 'inventory',
    missingIngredients: ['pan_brioche', 'queso_cheddar'],
    rejectedItems: [
      {
        offerId: 'dish-burger-1',
        dishId: 'dish-burger-1',
        name: 'Hamburguesa Doble Queso',
        requestedQuantity: 3,
        availableQuantity: 1,
        reason: 'Stock insuficiente en almacén de materias primas',
      },
    ],
    reservedItems: [
      {
        offerId: 'dish-burger-1',
        dishId: 'dish-burger-1',
        name: 'Hamburguesa Doble Queso',
        reservedQuantity: 1,
      },
      {
        offerId: 'dish-soda-1',
        dishId: 'dish-soda-1',
        name: 'Refresco Cola',
        reservedQuantity: 3,
      },
    ],
  },
  items: [
    {
      id: 'item-10',
      itemId: 'item-10',
      dishId: 'dish-burger-1',
      name: 'Hamburguesa Doble Queso',
      quantity: 3,
      unitPrice: 160.0,
      status: ItemStatus.PENDING,
      station: 'plancha',
      notes: 'Solo hay 1 pan disponible',
      modifiers: ['Extra tocino'],
      version: 1,
    },
  ],
  createdAt: new Date().toISOString(),
};

const MOCK_ORDER_RESERVED: Order = {
  id: 'ord-reservada-kds',
  orderId: 'ord-reservada-kds',
  publicId: 'ord-reservada-kds',
  tableNumber: 12,
  isTakeaway: false,
  status: OrderStatus.RESERVED,
  version: 2,
  totalAmount: 220.0,
  diningSessionId: 'ses-mesa-12',
  responsibleWaiterId: '00000000-0000-0000-0000-000000000001',
  stockReservedAt: new Date().toISOString(),
  items: [
    {
      id: 'item-20',
      itemId: 'item-20',
      dishId: 'dish-tacos-1',
      name: 'Orden de Tacos al Pastor',
      quantity: 2,
      unitPrice: 110.0,
      status: ItemStatus.PENDING,
      station: 'taqueria',
      notes: 'Con piña y salsa aparte',
      modifiers: ['Cilantro', 'Cebolla'],
      version: 2,
    },
  ],
  createdAt: new Date().toISOString(),
};

const MOCK_ORDER_DELIVERED: Order = {
  id: 'ord-entregada-rehacer',
  orderId: 'ord-entregada-rehacer',
  publicId: 'ord-entregada-rehacer',
  tableNumber: 3,
  isTakeaway: false,
  status: OrderStatus.DELIVERED,
  version: 3,
  totalAmount: 180.0,
  diningSessionId: 'ses-mesa-3',
  responsibleWaiterId: '00000000-0000-0000-0000-000000000001',
  items: [
    {
      id: 'item-30',
      itemId: 'item-30',
      dishId: 'dish-pasta-1',
      name: 'Pasta Carbonara',
      quantity: 1,
      unitPrice: 180.0,
      status: ItemStatus.DELIVERED,
      station: 'frio',
      notes: 'Servida al comensal',
      modifiers: [],
      version: 3,
    },
  ],
  createdAt: new Date().toISOString(),
};

const PRESETS: Record<string, Order> = {
  'ord-mesa-4': MOCK_ORDER_CREATED,
  'ord-rechazada-stock': MOCK_ORDER_REJECTED,
  'ord-reservada-kds': MOCK_ORDER_RESERVED,
  'ord-entregada-rehacer': MOCK_ORDER_DELIVERED,
};

function App() {
  const [view, setView] = useState<ViewMode>('kds');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('ord-mesa-4');
  const [customOrderId, setCustomOrderId] = useState<string>('');
  const [isBackendMode, setIsBackendMode] = useState<boolean>(false);

  useEffect(() => {
    Object.values(PRESETS).forEach((order) => {
      queryClient.setQueryData(['order', order.id], order);
    });
  }, []);

  const handleSelectPreset = (orderId: string) => {
    setIsBackendMode(false);
    setSelectedOrderId(orderId);
    const preset = PRESETS[orderId];
    if (preset) {
      queryClient.setQueryData(['order', orderId], preset);
    }
  };

  const handleSelectSeedOrder = (orderUuid: string) => {
    setIsBackendMode(true);
    setSelectedOrderId(orderUuid);
    queryClient.invalidateQueries({ queryKey: ['order', orderUuid] });
  };

  const handleApplyCustomOrder = () => {
    const trimmed = customOrderId.trim();
    if (trimmed) {
      setIsBackendMode(true);
      setSelectedOrderId(trimmed);
      queryClient.invalidateQueries({ queryKey: ['order', trimmed] });
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* Dev Switcher Bar */}
      <header className="flex flex-wrap items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs gap-2 shrink-0 z-50">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-400 uppercase tracking-wider">Dev Views:</span>
          <nav className="inline-flex rounded-md shadow-sm" aria-label="Selector de vistas">
            <button
              type="button"
              onClick={() => setView('kds')}
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
              onClick={() => setView('ticket')}
              className={`px-3 py-1.5 font-medium border-t border-b border-r border-slate-700 transition-colors ${
                view === 'ticket'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              📝 Comanda Mesero (OrderTicketWidget)
            </button>
            <button
              type="button"
              onClick={() => setView('alerts')}
              className={`px-3 py-1.5 rounded-r-md font-medium border-t border-b border-r border-slate-700 transition-colors ${
                view === 'alerts'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              🔔 Alerta Órdenes Listas
            </button>
          </nav>
        </div>

        {view === 'ticket' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">Simulación UI:</span>
            <button
              type="button"
              onClick={() => handleSelectPreset('ord-mesa-4')}
              className={`px-2 py-1 rounded text-xs border ${
                !isBackendMode && selectedOrderId === 'ord-mesa-4'
                  ? 'bg-blue-500 text-white border-blue-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Mesa 4 (Creada)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('ord-rechazada-stock')}
              className={`px-2 py-1 rounded text-xs border ${
                !isBackendMode && selectedOrderId === 'ord-rechazada-stock'
                  ? 'bg-red-600 text-white border-red-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              ⚠️ Rechazo Stock (Inventario)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('ord-reservada-kds')}
              className={`px-2 py-1 rounded text-xs border ${
                !isBackendMode && selectedOrderId === 'ord-reservada-kds'
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Mesa 12 (Reservada)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('ord-entregada-rehacer')}
              className={`px-2 py-1 rounded text-xs border ${
                !isBackendMode && selectedOrderId === 'ord-entregada-rehacer'
                  ? 'bg-purple-600 text-white border-purple-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Mesa 3 (Rehacer)
            </button>

            <span className="text-slate-500 ml-2">| Backend Real:</span>
            <button
              type="button"
              onClick={() => handleSelectSeedOrder('44444444-4444-4444-4444-444444444444')}
              className={`px-2 py-1 rounded text-xs border ${
                isBackendMode && selectedOrderId === '44444444-4444-4444-4444-444444444444'
                  ? 'bg-teal-600 text-white border-teal-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Seed Creada
            </button>
            <button
              type="button"
              onClick={() => handleSelectSeedOrder('11111111-1111-1111-1111-111111111111')}
              className={`px-2 py-1 rounded text-xs border ${
                isBackendMode && selectedOrderId === '11111111-1111-1111-1111-111111111111'
                  ? 'bg-teal-600 text-white border-teal-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Seed Reservada
            </button>

            <div className="flex items-center gap-1 pl-2 border-l border-slate-700">
              <input
                type="text"
                placeholder="UUID de Orden..."
                value={customOrderId}
                onChange={(e) => setCustomOrderId(e.target.value)}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 text-xs w-36"
              />
              <button
                type="button"
                onClick={handleApplyCustomOrder}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"
              >
                Cargar
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main View Area */}
      <main className="flex-1 w-full h-full overflow-auto">
        {view === 'kds' && <KdsApp />}

        {view === 'ticket' && (
          <div className="p-6 flex flex-col items-center justify-start min-h-full bg-slate-100 text-slate-900">
            <div className="w-full max-w-3xl mb-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-xs text-slate-600 flex justify-between items-center">
              <div>
                <strong className="text-slate-800">Vista Mesero (OrderTicketWidget):</strong>
                <p className="mt-0.5">
                  {isBackendMode
                    ? 'Conectado a orders-backend en http://localhost:8000 con JWT de rol waiter.'
                    : 'Modo simulación visual en memoria (presets interactivos).'}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isBackendMode ? 'bg-teal-100 text-teal-800' : 'bg-blue-100 text-blue-800'}`}>
                {isBackendMode ? 'Live Backend' : 'Mock Preset'}
              </span>
            </div>
            <div className="orders-kds-root w-full max-w-3xl">
              <OrderTicketWidget
                key={selectedOrderId}
                orderId={selectedOrderId}
                userId="00000000-0000-0000-0000-000000000001"
                tokenProvider={async () => DEV_WAITER_JWT}
                apiBaseUrl={isBackendMode ? 'http://localhost:8000' : undefined}
                webSocketBaseUrl={isBackendMode ? 'ws://localhost:8000' : undefined}
                diningSessionId="00000000-0000-0000-0000-000000000099"
                onCreateNewOrder={() => handleSelectPreset('ord-mesa-4')}
              />
            </div>
          </div>
        )}

        {view === 'alerts' && (
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
                userId="00000000-0000-0000-0000-000000000001"
                tokenProvider={async () => DEV_WAITER_JWT}
                webSocketBaseUrl="ws://localhost:8000"
                enableSound={true}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
