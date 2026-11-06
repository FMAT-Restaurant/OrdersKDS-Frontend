import { useMemo, useState } from 'react';
import './features/ready-orders-alert/ReadyOrdersAlert.css';
import { useOrderEvents } from './shared/realtime/useOrderEvents.ts';
import type { OrderStatusChangedEvent } from './shared/realtime/types.ts';
import type { TokenProvider } from './shared/types/auth.ts';
import { OrderStatus } from './shared/types/order.ts';

export interface ReadyOrdersAlertProps {
  readonly userId: string;
  readonly tokenProvider: TokenProvider;
  readonly webSocketBaseUrl?: string;
}

export function ReadyOrdersAlert({
  userId,
  tokenProvider,
  webSocketBaseUrl,
}: ReadyOrdersAlertProps) {
  const [alerts, setAlerts] = useState<OrderStatusChangedEvent[]>([]);
  const channels = useMemo(() => ['floor', `user:${userId}`], [userId]);

  const handleOrderStatusChanged = (event: OrderStatusChangedEvent) => {
    if (
      event.status !== OrderStatus.DELIVERED ||
      event.responsibleWaiterId !== userId
    ) {
      return;
    }

    setAlerts((currentAlerts) => {
      const currentAlert = currentAlerts.find((alert) => alert.orderId === event.orderId);
      if (currentAlert && currentAlert.version >= event.version) {
        return currentAlerts;
      }

      return [
        ...currentAlerts.filter((alert) => alert.orderId !== event.orderId),
        event,
      ];
    });
  };

  useOrderEvents({
    role: 'waiter',
    tokenProvider,
    channels,
    baseUrl: webSocketBaseUrl,
    onOrderStatusChanged: handleOrderStatusChanged,
  });

  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className="ready-orders-alerts" aria-label="Órdenes listas para recoger">
      {alerts.map((alert) => (
        <div
          className="ready-orders-alert"
          key={alert.orderId}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <p>Entregada por cocina — recoger</p>
          <p className="ready-orders-alert__order">Orden {alert.orderId}</p>
          <button
            type="button"
            aria-label={`Descartar aviso de orden ${alert.orderId}`}
            onClick={() => {
              setAlerts((currentAlerts) =>
                currentAlerts.filter((currentAlert) => currentAlert.orderId !== alert.orderId),
              );
            }}
          >
            Descartar
          </button>
        </div>
      ))}
    </section>
  );
}
