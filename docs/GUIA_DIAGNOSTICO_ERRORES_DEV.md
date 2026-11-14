# Guía de Diagnóstico de Errores en Modo Desarrollador (`orders-frontend`)

Esta guía documenta el sistema centralizado de diagnóstico implementado en
[`src/shared/api/devErrorLogger.ts`](../src/shared/api/devErrorLogger.ts) para diferenciar
en tiempo de desarrollo entre errores de conexión, autenticación, permisos, catálogo,
conflictos de versión/estado y WebSockets sin degradar los mensajes amigables mostrados al usuario final.

---

## 1. Arquitectura y principios

- **Separación UX vs. DevTools:** La interfaz sigue mostrando mensajes claros para meseros y
  cocineros (por ejemplo, `"Error de comunicación con el servidor. Verifique su conexión."`).
  Solo cuando `import.meta.env.DEV` es `true`, los módulos reportan prefijos y pistas técnicas en consola.
- **Preservación de contratos:** `toDeveloperEndpointError` conserva la instancia de `ApiError`
  (`status`, `code`, `details`) para no alterar las reglas de formato de `OrderTicketWidget` ni React Query.
- **Sin ruido excesivo en reconexiones:** `logDeveloperWebSocketClose` registra la advertencia de
  desconexión (`1006`) una sola vez en el primer fallo (`!wasReconnecting`), evitando inundar la
  consola durante reintentos con backoff exponencial.

---

## 2. Ámbitos configurados (`DevFeatureScope`)

| Ámbito | Archivo(s) conectado(s) | Qué diagnostica |
| :--- | :--- | :--- |
| `KDS` | `src/features/kds-board/useKdsQueue.ts`, `src/features/kds-board/KdsBoard.tsx` | Fallas en `GET /kds/queue?view=active\|delivered` |
| `OrderTicket` | `src/OrderTicketWidget.tsx`, `src/features/order-ticket/useOrderTicketActions.ts` | Consultas `GET /orders/{id}` y mutaciones (`POST /orders + /items`, `confirm`, `cancel`, `items`, `redo`) |
| `WebSocket` | `src/shared/realtime/kdsWebSocketClient.ts` | Cierres `4401`, `4403` y desconexiones iniciales hacia `/ws/kds` y `/ws/waiter` |
| `ReadyOrdersAlert` / `IntermediateDishes` | Reservados en `DevFeatureScope` para telemetría dev futura | Suscripción/alertas de mesero y pantalla de platillos |

---

## 3. Categorías de error (`DevErrorCategory`) y prefijos en consola

Cada error capturado se clasifica automáticamente mediante `classifyDevError(error)`:

| Categoría | Condición / Código | Prefijo en consola | Causa raíz frecuente y acción |
| :--- | :--- | :--- | :--- |
| `CONNECTION` | HTTP `status === 0`, `status >= 500`, `INTERNAL_ERROR` o mensaje `network`/`failed to fetch`/`econnrefused`/`timeout`/`socket`/`connection` | `[<Scope>] Error de conexión con el servidor:` | `orders-backend` (`uvicorn` en `:8000`) apagado, proxy Vite devolviendo `502` o Docker detenido. Levantar servicios y verificar puertos. |
| `AUTH_TOKEN` | `UNAUTHENTICATED` (`401`) | `[<Scope>] Error de autenticación JWT (401):` | Token ausente, expirado o firmado con secreto distinto. Revisar `tokenProvider`, `localStorage` (`fmat_restaurant_auth_session`) o `JWT_SECRET`. |
| `FORBIDDEN_ACCESS` | `FORBIDDEN_ROLE` / `FORBIDDEN_CHANNEL` (`403`) | `[<Scope>] Acceso denegado por permisos/rol (403):` | El usuario no tiene el rol o permiso PBAC requerido. Revisar claims `roles`/`permissions` del JWT y `app/domain/access.py`. |
| `NOT_FOUND` | `ORDER_NOT_FOUND` (`404`) | `[<Scope>] Recurso o comanda no encontrado (404):` | El `orderId` consultado no existe en PostgreSQL. Confirmar ID o reiniciar datos de prueba. |
| `STATE_OR_VERSION_CONFLICT` | `INVALID_STATE_TRANSITION` / `VERSION_CONFLICT` (`409`) | `[<Scope>] Conflicto de estado o versión optimista (409):` | Otra estación modificó la comanda o cambió de estado antes de confirmar/editar. Refrescar la comanda antes de reintentar. |
| `DISH_UNAVAILABLE` | `DISH_UNAVAILABLE` (`422`) | `[<Scope>] Platillo u oferta no disponible en catálogo (422):` | Redis (`catalog:platillo:*`) indica falta de stock o platillo/oferta deshabilitado. Verificar eventos con Menu/Inventory. |
| `CONTRACT_VALIDATION` | `VALIDATION_ERROR` / `NOTE_REQUIRED` (`400`/`422`) | `[<Scope>] Error de validación o contrato de datos (400/422):` | Payload o respuesta no coincide con `shared/api/schemas.ts` o falta nota obligatoria. Inspeccionar red en DevTools y logs del backend. |
| `WEBSOCKET` | Error cuyo mensaje incluye `websocket` | `[<Scope>] Error en conexión WebSocket tiempo real:` | Fallo al abrir/mantener `/ws/kds` o `/ws/waiter`. Revisar estado de `:8000`, token subprotocolo y CORS. |
| `UNEXPECTED` | Cualquier otra excepción | `[<Scope>] Error inesperado en módulo cliente:` | Error no clasificado en cliente. Revisar stack trace completo y pestaña Network de DevTools. |

---

## 4. Errores esperados cuando el backend o Docker están apagados

### ¿Por qué aparece `WebSocket connection to 'ws://localhost:8000/ws/waiter?token=...devsignature' failed`?

En el host local de desarrollo (`src/App.tsx`):
1. Al entrar a **Alerta Mesero** (`AlertsViewContent`), se monta `<ReadyOrdersAlert webSocketBaseUrl="ws://localhost:8000" tokenProvider={devTokenProvider} ... />` usando el cliente real de WebSocket (`KdsWebSocketClient`, sin mock).
2. Al entrar a **Comanda** (`TicketViewContent`) en modo backend en vivo / Shell Host, `OrderTicketWidget` también abre suscripción en `/ws/waiter`.
3. `devTokenProvider` genera un token local de desarrollo (`generateLocalDevToken('admin')`, cuya firma sintética termina en `devsignature`).
4. Con los contenedores Docker y `orders-backend` (`:8000`) apagados, el navegador emite el error nativo `WebSocket connection to 'ws://localhost:8000/ws/waiter?token=...devsignature' failed` en `KdsWebSocketClient.connect()`, y la estrategia `scheduleReconnect()` reintenta con backoff exponencial.

Para distinguir rápidamente este escenario de un error de credenciales real:
- **`[WebSocket] Sin conexión con ws://localhost:8000/ws/waiter (code=1006)`:** comportamiento normal mientras el backend esté apagado.
- **`[WebSocket] Cierre 4401 (UNAUTHENTICATED)`:** el backend respondió, pero rechazó el JWT (por ejemplo, `...devsignature` contra un backend real que exige firma HMAC compartida).
- **`[WebSocket] Cierre 4403 (FORBIDDEN_ROLE)`:** el backend aceptó el JWT, pero el rol del usuario no tiene acceso al canal solicitado (se detiene la reconexión).

---

## 5. Checklist rápido para depuración

1. **Verifique si el servidor responde:** confirme si `orders-backend` está ejecutándose en el puerto `8000` (el proxy de Vite redirige `/orders`, `/kds`, `/api` y `/ws` a `127.0.0.1:8000`).
2. **Filtre la consola por prefijo:** busque `[KDS]`, `[OrderTicket]` o `[WebSocket]` para ubicar de inmediato módulo y categoría.
3. **Revise Network -> Fetch/XHR y WS:** contraste el código HTTP (`401`, `403`, `404`, `409`, `422`, `502`) o código de cierre WebSocket (`1006`, `4401`, `4403`) con la tabla anterior.
