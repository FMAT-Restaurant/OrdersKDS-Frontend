# Orders & KDS — Registro de Decisiones y Puntos Abiertos Cerrados en la Reunión con Inventario y Menú (Sprint 4)

> **Origen:** Reunión de alineación técnica con Inventario (Héctor) y Menú · Refactorización de Sprint 4  
> **Fecha de actualización:** 31 de octubre de 2026  
> **Aplica a:** `ordenes-kds-frontend` (y `ordenes-kds-backend`)  
> **Ubicación:** `docs/adr/Decisiones_Puntos_Abiertos_Sprint4_Reunion_Inventario.md`  
> **Complementa a:** `docs/adr/Decisiones_Puntos_Abiertos_OP01-OP09.md` y `docs/adr/Puntos_Abiertos_Pendientes.md`  
> **Estándar:** Formato Architecture Decision Record (ADR) según `CONTRIBUTING_Frontend.md` §10  
>
> **Enfoque de este documento:**  
> Este documento registra las decisiones arquitectónicas cerradas en el Sprint 4 adaptadas específicamente para la **arquitectura, interfaz de usuario (UI), esquemas de validación Zod y componentes del cliente frontend (`orders-frontend`)**.

---

## 1. Matriz de Decisiones Cerradas en Sprint 4 y su Impacto en el Frontend

| Elemento / Código | Tema Acordado | Estado Consolidado | ADR / Referencia | Impacto Específico en el Frontend (`orders-frontend`) |
|---|---|:---:|---|---|
| **OP-04** | Contrato de `ordenes.orden.expirada` con `reason`/`motivo` e `items[]` | **Aceptado** | ADR-0012 (§2.1) | Manejo accesible de `EXPIRED` en `OrderTicketWidget`; notificación push con alerta de tiempo agotado (60s) y delegación a `onCreateNewOrder`. |
| **OP-11** | Prioridad de cola KDS y visibilidad de comandas en `RESERVED` | **Aceptado** | ADR-0013 (§2.2) | Visualización de órdenes en `RESERVED` e `IN_PREPARATION` en `GET /kds/queue?view=active`, ordenadas por FIFO de cocina (`COALESCE(in_prep, reserved, created)`). |
| **Estado `RESERVED`** | Desacoplamiento entre reserva temporal e inicio de cocción | **Aceptado** | ADR-0013 (§2.2) | Se agrega `OrderStatus.RESERVED` a tipos y Zod (`OrderStatusSchema`); insignia "Reservado en cocina" en el widget; cancelación habilitada sin merma. |
| **Consumo en Cocina** | Descuento definitivo de stock al iniciar preparación física | **Aceptado** | ADR-0014 (§2.3) | Botón "Iniciar preparación" en tarjetas KDS en `RESERVED` (`PATCH /orders/{id}/start-preparation`), activando cronómetro de cocción. |
| **Rechazo en Cocina** | Rechazo físico de insumo por Chef en `RESERVED` (`kitchen-reject`) | **Aceptado** | ADR-0015 (§2.4) | Diálogo de rechazo con `{ "reason": "..." }` en KDS; devolución de la comanda a `REJECTED` al mesero con alerta instantánea en tiempo real. |
| **Opción A Stock Parcial** | Pre-reserva parcial en `inventario.stock.insuficiente` y reapertura | **Aceptado** | ADR-0016 (§2.5) | Desglose visual de `rejectionDetails` con `aria-live="assertive"`; botón "Modificar comanda" reabre `REJECTED -> CREATED` sobre el **mismo `orderId`**. |
| **Caché + Confirmar** | Mantener botón "Confirmar" con respuesta `< 20 ms` de Inventario | **Aceptado** | ADR-0017 (§2.6) | UX fluida sin eventos por cada clic; confirmación en mesa con respuesta completa por WebSocket en `< 500 ms`. |
| **Saneamiento y `1:N`** | Soporte de relación `1:N` en `DiningSession` | **Aceptado** | ADR-0018 (§2.7) | `OrderTicketWidget` acepta `diningSessionId` en props; monitor de sala consulta múltiples comandas por sesión con `GET /orders?diningSessionId=`. |

---

## 2. Registro Detallado de Decisiones de Arquitectura (ADR) para el Frontend

### 2.1 ADR-0012: Contrato de Expiración y Manejo de Estado `EXPIRED` en UI (Cierre de OP-04)

- **Estado:** Aceptado (Cerrado e implementado en Sprint 4)
- **Fecha:** 2026-10-31
- **Requisitos relacionados:** RF-35, RNF-02, RNF-13, OP-01, OP-04

#### Contexto de Interfaz
Cuando una comanda confirmada permanece ≥ 60 segundos en `CREATED` sin recibir respuesta de Inventario, el backend la marca como `EXPIRED` y emite el evento `orden.status_changed` por WebSocket. Se requería definir el comportamiento exacto de los componentes visuales para no dejar al mesero en un estado ambiguo de carga indefinida.

#### Decisión en el Frontend
1. **Notificación en Tiempo Real:** Al recibir `{ "type": "order.status_changed", "status": "EXPIRED" }` por `/ws/waiter`:
   - El widget actualiza su estado interno y muestra un banner de alerta con rol `alert`.
   - Se deshabilitan permanentemente los botones de "Modificar comanda", "Confirmar" y "Cancelar comanda".
2. **Acción de Recuperación:** Se despliega el botón de acción principal para delegar en la app host la creación de una nueva comanda limpia mediante el callback `onCreateNewOrder()`.

---

### 2.2 ADR-0013: Incorporación de `OrderStatus.RESERVED` y Visibilidad en Cola KDS (Cierre de OP-11)

- **Estado:** Aceptado (Cerrado e implementado en Sprint 4)
- **Fecha:** 2026-10-31
- **Requisitos relacionados:** RF-01..04, RF-09, RF-18, RF-24, OP-11

#### Contexto de Interfaz
Anteriormente, la orden pasaba directamente de `CREATED` a `IN_PREPARATION` al reservarse el stock. Esto impedía al cliente cancelar su orden antes de que el cocinero empezara a elaborarla y no permitía a cocina saber qué órdenes estaban en espera de cocción vs. cuáles ya estaban en el fuego.

#### Decisión en el Frontend
1. **Tipado y Validación Zod (`src/shared/types/order.ts` y `src/shared/api/schemas.ts`):**
   - Se incorpora `RESERVED = 'RESERVED'` al enum `OrderStatus` y a `OrderStatusSchema`.
   - Se incorpora `stockReservedAt` (`z.string().nullable()`) a `OrderSchema`.
2. **Presentación en `OrderTicketWidget`:**
   - La orden en `RESERVED` renderiza la insignia visual con estilo de advertencia/espera: *"Reservado en cocina"* (`[data-status="RESERVED"]`).
   - El botón **"Cancelar comanda" se mantiene completamente habilitado** permitiendo la cancelación sin merma (`PATCH /orders/{orderId}/cancel`).
   - El botón "Confirmar" se desactiva (la orden ya está confirmada y asegurada).
3. **Visibilidad en Pantalla KDS (`KdsBoard`):**
   - La cola activa (`GET /kds/queue?view=active`) muestra tanto las órdenes en `RESERVED` como en `IN_PREPARATION`.
   - El ordenamiento FIFO ubica primero las de mayor antigüedad en cocina usando `COALESCE(in_preparation_at, stock_reserved_at, created_at) ASC`.

---

### 2.3 ADR-0014: Inicio Manual de Preparación en KDS (`PATCH /orders/{id}/start-preparation`)

- **Estado:** Aceptado (Cerrado e implementado en Sprint 4)
- **Fecha:** 2026-10-31
- **Requisitos relacionados:** RF-09, RF-10, RF-18, RNF-01, OP-11

#### Contexto de Interfaz
En cocina, las tarjetas en `RESERVED` representan comandas cuyos insumos ya fueron apartados en bodega, pero el Chef puede decidir no encender la parrilla de inmediato si la estación está saturada.

#### Decisión en el Frontend
1. **Acción en Tarjeta KDS:**
   - Cada tarjeta en estado `RESERVED` presenta un botón prominente de acción primaria: **"Iniciar preparación"**.
   - Al pulsarlo, invoca `PATCH /orders/{orderId}/start-preparation` (o alias `POST`).
   - Con la respuesta `200 OK`, la tarjeta actualiza su estado visual a `IN_PREPARATION`, estampa `inPreparationAt` e inicia el conteo visible del cronómetro de preparación.
2. **Efecto Reflejado en la Tablet del Mesero:**
   - Al transicionar a `IN_PREPARATION`, el stream WebSocket actualiza el `OrderTicketWidget`: la opción de "Cancelar comanda" sin merma se deshabilita de inmediato, ya que la cocción física ha comenzado.

---

### 2.4 ADR-0015: Rechazo Físico en Cocina (`PATCH /orders/{id}/items/{itemId}/kitchen-reject`)

- **Estado:** Aceptado (Cerrado e implementado en Sprint 4)
- **Fecha:** 2026-10-31
- **Requisitos relacionados:** RF-09, RF-17, RF-18, RF-40

#### Contexto de Interfaz
Si el Chef inspecciona su estación física y descubre que el insumo está descompuesto o agotado (a pesar de que el sistema teórico de Inventario aprobó la reserva), se requería un mecanismo para que cocina rechace ese platillo específico sin cancelar toda la mesa comensal y alertando de inmediato al mesero.

#### Decisión en el Frontend
1. **Interacción en Pantalla KDS:**
   - En una tarjeta en estado `RESERVED`, el Chef puede seleccionar un platillo y elegir la opción *"Rechazar por falta de insumo"*.
   - Se abre un modal de confirmación solicitando el motivo obligatorio `{ "reason": string }` que se envía a `PATCH /orders/{orderId}/items/{itemId}/kitchen-reject`.
   - La comanda sale de la cola activa de cocina.
2. **Notificación y Reacción en la Tablet del Mesero:**
   - El backend devuelve la orden al estado `REJECTED` con `"source": "kitchen"` y emite `order.status_changed` por `/ws/waiter`.
   - `OrderTicketWidget` recibe la notificación en tiempo real, activa la alerta sonora/visual y renderiza el desglose con el motivo reportado por el Chef.
   - En el catálogo de platillos del mesero, ese producto queda inmediatamente bloqueado para futuras órdenes (`422 DISH_UNAVAILABLE`).

---

### 2.5 ADR-0016: Stock Parcial (Opción A) y Reapertura Editable `REJECTED -> CREATED` en `OrderTicketWidget`

- **Estado:** Aceptado (Cerrado e implementado en Sprint 4)
- **Fecha:** 2026-10-31
- **Requisitos relacionados:** RF-13, RF-14, RF-32, RF-34, OP-05

#### Contexto de Interfaz
Si un comensal pide 3 hamburguesas y solo hay carne para 1, el flujo anterior marcaba la comanda como rechazo terminal, obligando al mesero a re-capturar todos los platillos de la mesa desde cero y perdiendo el turno de apartado.

#### Decisión en el Frontend
1. **Esquema de Datos Zod y Recepción de `rejectionDetails`:**
   - Se actualiza `OrderSchema` y `WsOrderStatusChangedSchema` para incluir `rejectionDetails` con la estructura:
     ```typescript
     {
       missingIngredients?: string[];
       rejectedItems?: Array<{ offerId: string; requestedQuantity: number; availableQuantity: number }>;
       reservedItems?: Array<{ offerId: string; quantity: number }>;
     }
     ```
2. **Componente Visual `OrderTicketWidget` (`src/OrderTicketWidget.tsx`):**
   - Cuando `status === 'REJECTED'`, se renderiza el contenedor `.order-ticket__rejection-breakdown` con `role="alert"` y `aria-live="assertive"`.
   - Muestra el desglose claro: platillos rechazados con cantidades pedidas vs disponibles, platillos pre-reservados temporalmente y faltantes.
3. **Flujo de Modificación y Reapertura Editable:**
   - Se habilita el botón **"Modificar comanda"**.
   - El mesero ajusta cantidades o retira los platillos rechazados directamente en la interfaz.
   - Al guardar los cambios (`PATCH /orders/{orderId}/items`), el backend invoca `order.reopen_as_draft()`, regresando la orden de forma transparente a `CREATED` sobre el **mismo `orderId`**.
   - La orden limpia su estado de rechazo y queda lista para volver a pulsar "Confirmar" frente a los comensales.

---

### 2.6 ADR-0017: Experiencia de Usuario Frente a la Mesa (Confirmación Rápida con WebSocket)

- **Estado:** Aceptado (Cerrado en Sprint 4)
- **Fecha:** 2026-10-31
- **Requisitos relacionados:** RF-17, RF-32, RF-33, RF-34, RNF-01, RNF-06

#### Decisión en el Frontend
1. **Captura Fluida en Borrador:** El mesero agrega y quita platillos con total soltura en la tablet validando existencia general en `< 1 ms` contra la proyección local del catálogo. No se generan llamadas lentas de red ni bloqueos por cada clic en `+` o `-`.
2. **Confirmación en Mesa:** Al terminar la captura frente al comensal, el mesero pulsa "Confirmar":
   - El widget muestra inmediatamente el indicador *"Pendiente de confirmación de stock"*.
   - En **menos de 500 ms**, el stream WebSocket empuja la respuesta:
     - Si hubo stock completo: transiciona a `RESERVED` con la insignia "Reservado en cocina".
     - Si faltó stock parcial: transiciona a `REJECTED` mostrando en ese mismo segundo la advertencia al mesero para acordar el ajuste con el cliente.

---

### 2.7 ADR-0018: Soporte para Relación `1:N` entre Sesión de Mesa y Comandas

- **Estado:** Aceptado (Cerrado e implementado en Sprint 4)
- **Fecha:** 2026-10-31
- **Requisitos relacionados:** RF-10, RF-12, RF-16, RF-32, RF-39

#### Decisión en el Frontend
1. **Identificador de Sesión en Componentes:**
   - Se agrega la propiedad opcional `diningSessionId` en `OrderTicketWidgetProps` y en el modelo Zod `OrderSchema`.
   - Si está presente, el widget muestra la etiqueta de sesión (`.order-ticket__session`) para trazabilidad de la mesa.
2. **Consultas Agrupadas en Monitor de Sala:**
   - El monitor de mesas puede solicitar todas las órdenes asociadas a una misma estancia comensal mediante `GET /orders?diningSessionId=<sessionId>`, permitiendo visualizar rondas de bebidas, entradas y platillos fuertes correspondientes a la misma mesa.

