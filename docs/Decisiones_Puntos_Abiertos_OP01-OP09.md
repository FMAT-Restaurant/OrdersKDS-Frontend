# Orders & KDS — Registro Consolidado de Decisiones de Arquitectura (ADR) y Puntos Abiertos

> **Origen:** TASK-37 (S1), TASK-C37 (S2) y Refactorización de Sprint 4 · **Fecha de actualización:** 31 de octubre de 2026  
> **Aplica a:** `ordenes-kds-backend` y `ordenes-kds-frontend`  
> **Ubicación:** `docs/Decisiones_Puntos_Abiertos_OP01-OP09.md` (y `docs/adr/Decisiones_Puntos_Abiertos_OP01-OP09.md`)  
> **Complementado por:** [`docs/adr/Decisiones_Puntos_Abiertos_Sprint4_Reunion_Inventario.md`](adr/Decisiones_Puntos_Abiertos_Sprint4_Reunion_Inventario.md) (ADRs 0012–0018 cerrados en la reunión con Inventario y Menú) y [`docs/adr/Puntos_Abiertos_Pendientes.md`](adr/Puntos_Abiertos_Pendientes.md)  
> **Estándar:** Formato Architecture Decision Record (ADR) según `CONTRIBUTING_Frontend.md` §10  
>
> **Convención de este documento:**
> - Las decisiones aprobadas e implementadas se registran con estado **Aceptado**.
> - Los acuerdos pendientes de validación técnica de campo o de otros equipos se marcan como **Propuesto / Pendiente**.
> - Los identificadores de código, rutas y campos JSON van en inglés (`DEVELOPMENT_GUIDELINES.md` §2); los nombres de eventos del broker se mantienen según los contratos pactados con otros microservicios.

---

## 1. Matriz de Estado de Puntos Abiertos (TASK-37 / TASK-C37 / Sprint 4)

| Elemento | Estado original (S1) | Estado consolidado actual (S4) | ADR / Referencia | Dueño | Fecha / Hito |
|---|---|---|---|---|---|
| **OP-01** `SAGA_TIMEOUT_SECONDS` | `[ ]` sin marcar | `[x]` **Aceptado**: 60 s como máximo desde `confirmed_at` | ADR-0001 | Backend | S1 / Cerrado |
| **OP-02** Canales WebSocket | `[ ]` sin marcar | `[x]` **Aceptado**: dos endpoints (`/ws/kds`, `/ws/waiter`) y canales por estación, piso y usuario | ADR-0002 | Backend + Frontend | S2–S4 / Cerrado |
| **OP-03** Colores semánticos | `[ ]` sin marcar | `[x]` **Aceptado**: paleta estándar en guía visual; tokens `--color-success/warning/error/info` | ADR-0003 | Frontend | S1 / Cerrado |
| **OP-04** Contrato `orden.expirada` y `motivo` | No existía | `[x]` **Aceptado**: incluye `elapsedSeconds`, `reason: "timeout"`, `motivo: "timeout"` e `items` consolidados | ADR-0012 (`Decisiones_Puntos_Abiertos_Sprint4_Reunion_Inventario.md`) | Backend + Inventario | S4 / Cerrado |
| **OP-05** `confirm` repetido y reapertura | `[ ]` sin marcar | `[x]` **Aceptado**: `confirm` idempotente con `confirmed_at`, reapertura editable `REJECTED -> CREATED` y `attempt_key=order.version` | ADR-0004 y ADR-0016 | Backend + Frontend | S1–S4 / Cerrado |
| **OP-06** Interacción KDS / Bump Bar | `[ ]` sin marcar | `[x]` **Aceptado**: KDS táctil como entrada principal, teclado/Bump Bar secundario con paridad total | ADR-0005 | Frontend | S1 / Cerrado |
| **OP-07** Rutas en inglés | `[ ]` sin marcar | `[x]` **Aceptado**: rutas, parámetros y campos REST en inglés; eventos broker sin cambio | ADR-0006 | Backend + Frontend | S1 / Cerrado |
| **OP-08** Quién marca "Entregado" | `[ ]` sin marcar | `[x]` **Aceptado**: cocina lo marca, sin endpoint `deliver`, mesero recoge sin registro en sistema | ADR-0007 | Backend + Frontend | S1 / Cerrado |
| **OP-09** Tiempo y estación catálogo | `[ ]` sin marcar | `[x]` **Aceptado**: ambos campos son texto (`string`) de referencia | ADR-0008 | Backend + Menú | S1 / Cerrado |
| **OP-10** Topología y credenciales broker | `[x]` con URL expuesta | `[ ]` **En curso**: homologar exchange/colas en staging; credenciales exclusivas vía secretos (`RABBITMQ_URL`) | OP-10 (§3.2) | Infra / Broker + Backend | S5 (`TASK-38`) |
| **OP-11** Prioridad en cola KDS y `RESERVED` | No existía | `[x]` **Aceptado**: incluye `RESERVED` e `IN_PREPARATION`, ordena por `COALESCE(in_preparation_at, stock_reserved_at, created_at) ASC` | ADR-0009 y ADR-0013 | Backend + Frontend | S4 / Cerrado |
| **OP-12** Rehacer ítem con orden `DELIVERED` | No existía | `[ ]` **Pendiente S5**: orden conserva `DELIVERED`, ítem pasa a `PENDING` (diseño listo para `TASK-32` y `TASK-23`) | ADR-0010 (`Puntos_Abiertos_Pendientes.md`) | Backend + Frontend + Inventario | S5 (`TASK-32`, `TASK-23`) |
| **OP-13** Aviso `DELIVERED` al mesero | No existía | `[ ]` **Pendiente**: monitor de Sala vs. componente flotante propio en frontend | OP-13 (§3.3) | Frontend + Sala | INT-03 (S6 · `TASK-42`) |
| **TASK-27** Platillos intermedios (chef) | `[ ]` sin marcar | `[x]` **Aceptado (NO-GO)**: excluido del horizonte de 7 sprints (`INTERMEDIATE_DISHES_ENABLED=false`) | ADR-0011 | Arquitectura | S1 / Cerrado |

---

## 2. Registro de Decisiones de Arquitectura (ADR-0001 a ADR-0011)

> Para las decisiones **ADR-0012 a ADR-0018** acordadas en la reunión de alineación con Inventario y Menú durante el Sprint 4 (estado `RESERVED`, consumo definitivo `ordenes.orden.en_preparacion`, rechazo físico en cocina `ordenes.platillo.rechazado_cocina`, Opción A de stock insuficiente parcial con desglose visual, reapertura editable `REJECTED -> CREATED` y relación `1:N` en `DiningSession`), consúltese [`docs/adr/Decisiones_Puntos_Abiertos_Sprint4_Reunion_Inventario.md`](adr/Decisiones_Puntos_Abiertos_Sprint4_Reunion_Inventario.md).

### ADR-0001: Valor y gobernanza de `SAGA_TIMEOUT_SECONDS` (OP-01)

- **Estado:** Aceptado
- **Fecha:** 2026-10-05
- **Requisitos relacionados:** RF-35, RNF-01, RNF-10

#### Contexto
Si el microservicio de Inventario no responde al evento `ordenes.orden.creada`, la comanda queda bloqueada indefinidamente en `CREATED`. El documento ERS define el estado `EXPIRED` para resolver este escenario, pero omitió fijar el tiempo límite (ERS §10, punto 7).

#### Decisión
Se fija un tiempo límite estricto de **60 segundos como máximo**:
1. `SAGA_TIMEOUT_SECONDS=60` como valor obligatorio acordado.
2. La regla de expiración se evalúa contando **≥ 60 segundos transcurridos desde `confirmed_at`**. El temporizador inicia en el momento de la confirmación por el mesero y no en la creación del borrador.
3. Se define una frecuencia para el Saga Timeout Watcher de `SAGA_WATCHER_INTERVAL_SECONDS=5`.
4. **Sin valor por defecto en código:** el microservicio aborta su arranque si la variable de entorno no está configurada, obligando a su definición explícita en cada despliegue.

#### Consecuencias en el Frontend
- En la interfaz del mesero (`OrderTicketWidget`), tras confirmar se muestra el banner *"Pendiente de confirmación de stock"*. Si transcurren ≥ 60 segundos sin respuesta de Inventario, la orden pasa a `EXPIRED` vía WebSocket (`/ws/waiter`), mostrando la alerta de tiempo agotado y habilitando la creación de una nueva comanda (`onCreateNewOrder`).

---

### ADR-0002: Alcance y autenticación de canales WebSocket (OP-02)

- **Estado:** Aceptado (Implementado y actualizado en Sprint 4)
- **Fecha:** 2026-10-05 (Actualizado: 2026-10-31)
- **Requisitos relacionados:** RNF-04, RNF-06, RNF-12

#### Contexto
La Arquitectura §3.3 estipula una conexión bidireccional persistente por sesión autenticada con JWT, pero no detallaba la taxonomía de canales ni las restricciones por rol, lo que causaba incertidumbre sobre el tráfico que recibe cada cliente.

#### Decisión
Se establecen **dos endpoints** WebSocket segregados por rol y cuatro canales normalizados:

| Canal | Endpoint | Roles autorizados | Modo de suscripción | Tráfico recibido |
|---|---|---|---|---|
| `kds:station:{station}` | `/ws/kds` | `kitchen`, `chef`, `admin` | Solicitado por el cliente (cambio sin reconectar) | Cambios de estado de órdenes con ítems de la estación e ítems asociados |
| `kds:all` | `/ws/kds` | `kitchen`, `chef`, `admin` | Solicitado por el cliente | Todas las órdenes activas en cocina sin filtro |
| `floor` | `/ws/waiter` | `waiter`, `admin` | Automático al conectar | Cambios de estado de todas las órdenes activas del restaurante |
| `user:{userId}` | `/ws/waiter` | `waiter`, `admin` | Automático desde el claim del JWT | Alertas de órdenes bajo su responsabilidad (`RESERVED`, `REJECTED` con `rejectionDetails`, `EXPIRED`, `DELIVERED`) |

Reglas clave para el cliente frontend:
- El handshake rechaza tokens ausentes o inválidos con código `4401`, y roles no permitidos con código `4403`.
- Intentar suscribirse a un canal ajeno al rol responde con `{ "error": "FORBIDDEN_CHANNEL" }`.
- Las cargas útiles son señales tipadas en camelCase validadas mediante esquemas Zod en el frontend (`WsOrderStatusChangedSchema` y `WsItemStatusChangedSchema`).

---

### ADR-0003: Paleta de colores semánticos y tokens de UI (OP-03)

- **Estado:** Aceptado
- **Fecha:** 2026-10-05
- **Requisitos relacionados:** RNF-07, RNF-08, RNF-11

#### Contexto
La guía visual FMAT-RESTAURANT presentaba estados de éxito, advertencia y error en capturas de pantalla sin códigos hexadecimales estandarizados, provocando inconsistencias en componentes compartidos como `StatusBadge`.

#### Decisión
Se adopta formalmente la paleta estándar mediante tokens semánticos definidos bajo el ámbito `.orders-kds-root`:
- `--color-success`: `#16A34A` (Operación exitosa, "En stock", orden "Pagada")
- `--color-warning`: `#D97706` ("Bajo stock", orden "Pendiente", orden `RESERVED`, tarjeta KDS por atrasarse)
- `--color-error`: `#DC2626` (Fallos, "Agotado", orden `REJECTED`, tarjeta KDS atrasada, anulación)
- `--color-info`: `#2563EB` (Mensajes neutros, sincronización de red)
- `--color-primary-soft` / `--color-primary`: `#FFF7ED` / `#C2410C` (Selección activa)

Queda prohibido el uso de valores hexadecimales sueltos en componentes. Todo estado se comunica con color acompañado de texto descriptivo o icono para garantizar accesibilidad (contraste AA ≥ 4.5:1).

---

### ADR-0004: Semántica e idempotencia de `confirm` y Reapertura Editable (OP-05)

- **Estado:** Aceptado (Actualizado con ADR-0016 en Sprint 4)
- **Fecha:** 2026-10-05 (Actualizado: 2026-10-31)
- **Requisitos relacionados:** RF-32, RF-33, RNF-02, RNF-09

#### Contexto
Un doble toque en la interfaz o un reintento de red en `POST /orders/{id}/confirm` podía provocar publicaciones duplicadas de `ordenes.orden.creada`. Además, si la comanda era rechazada por falta de stock, el mesero no podía corregir la orden existente.

#### Decisión
1. El endpoint `POST /orders/{id}/confirm` es estrictamente **idempotente**:
   - Si la orden está en `CREATED` sin marca `confirmed_at`: fija `confirmed_at`, `confirmed_by`, guarda en base de datos y publica `ordenes.orden.creada` por outbox transaccional una sola vez con un `eventId` determinista (`attempt_key=order.version`).
   - Si la orden ya tiene `confirmed_at` o se encuentra en `RESERVED`, `IN_PREPARATION`, `DELIVERED`, `WASTED` o `PAID`: responde `200 OK` con el estado actual de la comanda sin duplicar el evento.
   - Si la orden está en `CANCELLED`, `REJECTED`, `EXPIRED` o `VOIDED`: rechaza la operación con `409 Conflict` (`INVALID_STATE_TRANSITION`).
2. **Reapertura editable desde `REJECTED` (ADR-0016):**
   - Cuando el mesero modifica los platillos de una orden rechazada (`PATCH /orders/{orderId}/items`), el backend ejecuta automáticamente `order.reopen_as_draft()`, regresando la comanda a `CREATED` y limpiando `confirmed_at` y `rejection_details` sobre el **mismo `orderId`**. Esto permite volver a presionar "Confirmar" con un nuevo intento y nuevo `eventId` determinista.

---

### ADR-0005: Interacción dual táctil principal y Bump Bar en KDS (OP-06)

- **Estado:** Aceptado
- **Fecha:** 2026-10-05
- **Requisitos relacionados:** RF-09, RF-11, RNF-07, RNF-11

#### Contexto
La especificación original exigía una interacción de cocina exclusiva mediante teclado físico (Bump Bar). En la operativa real de cocina, los monitores son táctiles de pared en formato landscape y el personal requiere operar directamente sobre la pantalla incluso con guantes, manteniendo el teclado como respaldo.

#### Decisión
El KDS opera en **monitor táctil grande de pared (landscape 1920×1080) con interacción táctil como método principal**, y soporte de teclado/Bump Bar como **método secundario con 100 % de paridad funcional**.

Reglas de diseño táctil en el frontend:
- Objetivos táctiles mínimos de **64 px** con espaciado de al menos 16 px.
- Acciones frecuentes ("Marcar ítem listo" y "Orden lista") se resuelven en un solo toque sin arrastre, doble toque ni pulsaciones largas.

Mapeo de teclado unificado (`KeyboardEvent.code`):

| Tecla | Acción | Equivalente táctil |
|---|---|---|
| `ArrowLeft` / `ArrowRight` | `FOCUS_PREVIOUS_ORDER` / `FOCUS_NEXT_ORDER` | Botones de paginación o toque a la tarjeta |
| `ArrowUp` / `ArrowDown` | `FOCUS_PREVIOUS_ITEM` / `FOCUS_NEXT_ITEM` | Toque sobre el renglón del platillo |
| `Enter` | `MARK_FOCUSED_ITEM_READY` | Toque sobre el ítem |
| `NumpadEnter` | `MARK_FOCUSED_ORDER_READY` | Botón "Orden lista" |
| `PageUp` / `PageDown` | `PREVIOUS_STATION` / `NEXT_STATION` | Selector de estación |
| `Digit1` … `Digit9` | Selección directa de la tarjeta visible 1 a 9 | Toque directo a la tarjeta |

---

### ADR-0006: Convención de nombres en inglés para rutas y contratos REST (OP-07)

- **Estado:** Aceptado
- **Fecha:** 2026-10-05
- **Requisitos relacionados:** RF-08, RF-28, RNF-10

#### Decisión
Se formalizan todas las rutas, query parameters y cuerpos JSON en **inglés**:
- `GET /orders?status=&diningSessionId=`
- `GET /kds/queue?station=&view=`
- `PATCH /orders/{orderId}/start-preparation`
- `PATCH /orders/{orderId}/items/{itemId}/kitchen-reject`
- `PATCH /orders/{orderId}/void-kitchen-error`
- Cuerpos JSON: `{ "note": "..." }`, `{ "reason": "..." }`
- Endpoints en tiempo real: `/ws/kds` y `/ws/waiter`

Los contratos de eventos del broker se mantienen en español según los acuerdos inter-microservicios (`ordenes.orden.creada`, etc.).

---

### ADR-0007: Semántica de orden "Entregada" y rol de cocina (OP-08)

- **Estado:** Aceptado
- **Fecha:** 2026-10-05
- **Requisitos relacionados:** RF-11, RF-18, RF-19, RNF-10

#### Decisión
**El mesero no interactúa con ningún endpoint de entrega.** Su responsabilidad física es recoger los platillos al observar la notificación:
1. La transición a `DELIVERED` la produce exclusivamente la cocina al marcar el último platillo listo (`PATCH /orders/{id}/items/{itemId}/ready` o `PATCH /orders/{id}/ready`).
2. En la misma transacción, la orden transita `IN_PREPARATION → DELIVERED` y sus platillos pasan a `DELIVERED`.
3. El frontend emite la notificación WebSocket por los canales `floor` y `user:{userId}`, informando al mesero que la comanda está lista para ser recogida.
4. Se prohíbe cualquier endpoint `deliver` en el frontend. Si un mesero intenta invocar endpoints de cocina, el backend responde `403 FORBIDDEN_ROLE`.

---

### ADR-0008: Estación y tiempo de preparación en catálogo como texto de referencia (OP-09)

- **Estado:** Aceptado
- **Fecha:** 2026-10-05
- **Requisitos relacionados:** RF-02, RF-08, RNF-05, RNF-13

#### Decisión
Ambos campos se definen como **texto libre (`string`) de referencia**:
- `station` (`estacion`): texto libre normalizado (minúsculas, sin acentos). Permite agrupar en filtros del KDS y suscribir al canal `kds:station:{station}`.
- `preparationTime` (`tiempoPreparacion`): texto puramente informativo para el personal de cocina (ej. `"15-20 min"`). **No se parsea a enteros ni se utiliza para cálculos matemáticos.**
- Al ser texto libre procedente de un servicio externo, el frontend lo renderiza sanitizado para mitigar riesgos de inyección XSS.

---

### ADR-0009: Prioridad en cola KDS por tiempo en cocina y soporte de `RESERVED` (OP-11)

- **Estado:** Aceptado (Cerrado en Sprint 4 con ADR-0013)
- **Fecha:** 2026-10-05 (Actualizado: 2026-10-31)
- **Requisitos relacionados:** RF-02, RF-03, RF-18, RNF-06

#### Decisión
1. La cola activa del KDS (`GET /kds/queue?view=active`) incluye las comandas en **`RESERVED`**, **`IN_PREPARATION`** y aquellas **`DELIVERED` con al menos un ítem `PENDING`**.
2. El ordenamiento FIFO por antigüedad en cocina se calcula mediante:
   `COALESCE(Order.in_preparation_at, Order.stock_reserved_at, Order.created_at) ASC`, desempatando por `Order.created_at ASC` y `Order.public_id ASC`.
3. Semáforo visual en tarjetas KDS mediante los umbrales configurables:
   - `KDS_WARNING_AFTER_SECONDS` (por defecto 600 s / 10 min): comanda "Por atrasarse" (`--color-warning`).
   - `KDS_LATE_AFTER_SECONDS` (por defecto 900 s / 15 min): comanda "Atrasada" (`--color-error`).
4. El cronómetro visible de cada tarjeta mantiene su conteo desde la creación original de la comanda.

---

### ADR-0010: Rehacer platillo con orden en estado `DELIVERED` (OP-12)

- **Estado:** Propuesto (Diseño acordado para Sprint 5 · `TASK-32` y `TASK-23`)
- **Fecha:** 2026-10-05 (Actualizado: 2026-10-31)
- **Requisitos relacionados:** RF-22, RF-18, RNF-10

#### Decisión
**El estado de la orden matriz no retrocede**:
1. La orden permanece en `DELIVERED`.
2. Únicamente el platillo afectado cambia de estado a `PENDING`, asociando la nota obligatoria del motivo del rehacer (`PATCH /orders/{id}/items/{itemId}/redo`).
3. El KDS resalta visualmente la tarjeta de la orden con un distintivo de ítem rehecho pendiente.
4. Cuando la estación de cocina finaliza la nueva preparación, marca el platillo nuevamente como `READY`, pasando de inmediato a `DELIVERED`.

---

### ADR-0011: Descarte de funcionalidad opcional de platillos intermedios (TASK-27 NO-GO)

- **Estado:** Aceptado (NO-GO para el horizonte de 7 sprints)
- **Fecha:** 2026-10-05
- **Requisitos relacionados:** RF-36, RF-37, RF-38

#### Decisión
Se declara **NO-GO formal** para la funcionalidad de platillos intermedios en el frontend y backend:
1. No se destina esfuerzo de desarrollo de interfaz ni componentes para este módulo durante los 7 sprints.
2. Se mantiene la compatibilidad arquitectónica abierta para futuras fases sin rediseño disruptivo.
