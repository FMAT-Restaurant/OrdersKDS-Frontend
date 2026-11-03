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
| **OP-13** | Canal/MFE donde el mesero recibe la alerta visual de orden `DELIVERED` | **Pendiente de definir con equipo de Sala** | Frontend Orders + Microservicio de Sala | Sprint 6 (`INT-03`) | Opción A: Sala consume `/ws/waiter` en su mapa de mesas.<br>Opción B: Frontend de Órdenes exporta el MFE flotante `ReadyOrdersAlert` (`TASK-42`). |
| **OP-10** | Endpoints de WebSocket y Gateway en ambiente compartido de staging | **En curso** | Infraestructura / Broker + Backend Orders | Sprint 5 (`TASK-38`) | Configuración de URLs de WebSocket seguras (`wss://`) y paso del token JWT por Gateway hacia `/ws/waiter` y `/ws/kds`. |
| **Propuesta Menú → Inventario** | Sincronización de disponibilidad en catálogo | **Pendiente en Broker** | Inventario + Menú + Orders | Sprint 5 (`TASK-21b`, `TASK-38`) | Consumo del estado `available: false` en frontend para bloquear platillos agotados en `< 1 ms`. |

---

## 2. Detalle de los Puntos Abiertos y Acciones Requeridas en Frontend

### 2.1 OP-12: Diálogo y Acción para Rehacer Platillo (`redo`) en `OrderTicketWidget`

- **Estado:** Diseño técnico listo para implementar en Sprint 5 (`TASK-23`).
- **Dueño:** Frontend Orders & KDS (`TASK-23`) + Backend (`TASK-32`).
- **Hito de resolución:** Sprint 5.
- **Contexto y Comportamiento en la Interfaz:**
  1. Cuando un comensal devuelve un platillo ya entregado por queja de cocción o calidad (RF-22), la orden matriz se encuentra en `OrderStatus.DELIVERED`.
  2. En el frontend se acordó que **la orden completa no retrocede** a preparación; únicamente el renglón afectado pasa de `ItemStatus.DELIVERED` a `ItemStatus.PENDING`.
  3. `TASK-23` implementará el diálogo modal accesible donde el mesero selecciona el platillo devuelto e ingresa obligatoriamente la nota con el motivo de la queja (`{ "note": string }`).
  4. Al presionar "Rehacer", invoca `PATCH /orders/{orderId}/items/{itemId}/redo`.
  5. En la pantalla KDS de cocina, la tarjeta de la orden reaparece en la cola activa con un indicador destacado de que ese platillo específico debe volverse a cocinar.
- **Acción pendiente:**
  - [ ] Implementar el diálogo modal accesible en el frontend en el Sprint 5 (`TASK-23`) una vez que el backend habilite el endpoint con la opción acordada con Inventario.

---

### 2.2 OP-13: Recepción de Alerta Visual de Orden `DELIVERED` ("Lista para recoger")

- **Estado:** Pendiente de definición inter-equipo con Sala.
- **Dueño:** Frontend Orders & KDS + Microservicio de Sala.
- **Hito de resolución:** Integración INT-03 (Sprint 6).
- **Contexto:**
  - Cuando cocina marca el último platillo de una orden como `READY`, la orden transiciona a `DELIVERED` y el backend publica `order.status_changed` por el canal `/ws/waiter` (`floor` y `user:{userId}`).
  - Se debe definir cómo se entera el mesero para ir físicamente a la barra de cocina:
    - **Alternativa A (Recomendada):** El microservicio de Sala escucha el canal `/ws/waiter` y hace parpadear la mesa correspondiente en verde en su propio mapa de mesas.
    - **Alternativa B:** El frontend de Órdenes desarrolla y exporta mediante Module Federation un componente flotante de alertas (`ReadyOrdersAlert` — `TASK-42`), que se monta en la esquina de la pantalla del mesero.
- **Acción pendiente:**
  - [ ] Reunión técnica con el equipo de Sala en Sprint 6 para acordar si se adopta la Alternativa A o si se activa el desarrollo de `TASK-42` (Alternativa B).

---

### 2.3 OP-10: Homologación de Conexión WebSocket y Gateway en Staging

- **Estado:** En curso para Sprint 5 (`TASK-38`).
- **Dueño:** Infraestructura + Frontend + Backend Orders.
- **Acción para el Frontend:**
  - [ ] Verificar que en el entorno de staging el API Gateway reenvíe correctamente el token JWT en el protocolo de WebSocket hacia `/ws/waiter` y `/ws/kds` sin exponer credenciales en la URL.

