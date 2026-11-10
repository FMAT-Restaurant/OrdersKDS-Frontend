# Orders & KDS — Puntos Abiertos Pendientes de Resolución (Frontend Backlog)

> **Origen:** `docs/adr/Decisiones_Puntos_Abiertos_OP01-OP09.md`, `docs/adr/Decisiones_Puntos_Abiertos_Sprint4_Reunion_Inventario.md` y `Planificacion_Sprints_Orders_KDSV3.md`  
> **Fecha de corte:** 31 de octubre de 2026 (Cierre de Sprint 4 / Inicio de Sprint 5)  
> **Aplica a:** `ordenes-kds-frontend` (y `ordenes-kds-backend`)  
> **Ubicación:** `docs/adr/Puntos_Abiertos_Pendientes.md`  
> **Propósito:** Registrar y dar seguimiento a los puntos abiertos (OP) que involucran responsabilidades del equipo de **Frontend (`orders-frontend`)** para los Sprints 5 y 6, separándolos de las decisiones que ya quedaron formalmente cerradas e implementadas en el Sprint 4.

---

## 1. Matriz de Seguimiento de Puntos Abiertos Pendientes en Frontend

| ID | Tema | Estado Actual | Contraparte | Hito Objetivo | Impacto / Tareas en Frontend |
|---|---|:---:|---|:---:|---|
| **OP-12** | Diálogo y flujo para rehacer platillo (`redo`) en orden `DELIVERED` | **Diseño acordado; pendiente de cerrar evento extra con Inventario** | Frontend Orders + Backend + Inventario (Héctor) | Sprint 5 (`TASK-23`, `TASK-32`) | `TASK-23` (Diálogo UI de rehechura y captura de `{ "note": "..." }`) y llamada a `PATCH /orders/{id}/items/{itemId}/redo`. |
| **OP-13** | Canal/MFE donde el mesero recibe la alerta visual de orden `DELIVERED` | **Opción B seleccionada; integración por acordar con Sala** | Frontend Orders + Microservicio de Sala | Sprint 6 (`INT-03`) | Frontend de Órdenes exporta el MFE flotante `ReadyOrdersAlert` (`TASK-42`), que escucha `/ws/waiter` y filtra por mesero responsable. |
| **OP-10** | Endpoints de WebSocket y Gateway en ambiente compartido de staging | **En curso** | Infraestructura / Broker + Backend Orders | Sprint 5 (`TASK-38`) | Configuración de URLs de WebSocket seguras (`wss://`) y paso del token JWT por Gateway hacia `/ws/waiter` y `/ws/kds`. |
| **Propuesta Menú → Inventario** | Sincronización de disponibilidad en catálogo | **Pendiente en Broker** | Inventario + Menú + Orders | Sprint 5 (`TASK-21b`, `TASK-38`) | Consumo del estado `available: false` en frontend para bloquear platillos agotados en `< 1 ms`. |

---

## 2. Detalle de los Puntos Abiertos y Acciones Requeridas en Frontend

### 2.1 OP-12: Diálogo y Acción para Rehacer Platillo (`redo`) en `OrderTicketWidget`

- **Estado:** Diálogo y acción implementados en frontend (`TASK-23`); integración con backend pendiente de validar (`TASK-32`).
- **Dueño:** Frontend Orders & KDS (`TASK-23`) + Backend (`TASK-32`).
- **Hito de resolución:** Sprint 5.
- **Contexto y Comportamiento en la Interfaz:**
  1. Cuando un comensal devuelve un platillo ya entregado por queja de cocción o calidad (RF-22), la orden matriz se encuentra en `OrderStatus.DELIVERED`.
  2. En el frontend se acordó que **la orden completa no retrocede** a preparación; únicamente el renglón afectado pasa de `ItemStatus.DELIVERED` a `ItemStatus.PENDING`.
  3. `TASK-23` implementará el diálogo modal accesible donde el mesero selecciona el platillo devuelto e ingresa obligatoriamente la nota con el motivo de la queja (`{ "note": string }`).
  4. Al presionar "Rehacer", invoca `PATCH /orders/{orderId}/items/{itemId}/redo`.
  5. En el KDS, el ítem rehecho aparece resaltado como pendiente dentro de la orden `DELIVERED`, sin cambiar la columna ni el estado de la orden.
- **Acción pendiente:**
  - [x] Implementar el diálogo modal accesible en `OrderTicketWidget`, la nota obligatoria y la llamada a `PATCH /orders/{id}/items/{itemId}/redo`.
  - [ ] Validar el flujo integrado con el backend y confirmar el evento para actualizar el KDS en tiempo real.

---

### 2.2 OP-13: Recepción de Alerta Visual de Orden `DELIVERED` ("Lista para recoger")

- **Estado:** Opción B seleccionada para Orders; el montaje e integración con Sala se acuerdan en INT-03.
- **Dueño:** Frontend Orders & KDS + Microservicio de Sala.
- **Hito de resolución:** Integración INT-03 (Sprint 6).
- **Contexto:**
  - Cuando cocina marca el último platillo de una orden como `READY`, la orden transiciona a `DELIVERED` y el backend publica `order.status_changed` por el canal `/ws/waiter` (`floor` y `user:{userId}`).
  - El frontend de Órdenes exporta mediante Module Federation un componente flotante de alertas (`ReadyOrdersAlert` — `TASK-42`), que se monta en la pantalla del mesero.
  - Los eventos del canal compartido `floor` incluyen `responsibleWaiterId` para que la alerta solo se muestre al mesero asignado.
- **Acción pendiente:**
  - [ ] Acordar con Sala el contrato de integración y el montaje del módulo en INT-03 (Sprint 6).

---

### 2.3 OP-10: Homologación de Conexión WebSocket y Gateway en Staging

- **Estado:** En curso para Sprint 5 (`TASK-38`).
- **Dueño:** Infraestructura + Frontend + Backend Orders.
- **Acción para el Frontend:**
  - [ ] Verificar que en el entorno de staging el API Gateway reenvíe correctamente el token JWT en el protocolo de WebSocket hacia `/ws/waiter` y `/ws/kds` sin exponer credenciales en la URL.
