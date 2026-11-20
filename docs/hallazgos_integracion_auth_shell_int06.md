# Hallazgos y Pendientes de Integración INT-06 para Auth-Frontend (Shell)

> **Módulo emisor:** Órdenes y Cocina (KDS) — `orders-frontend` (`ordenesApp:5177` y `cocinaApp:5179`)  
> **Equipo destinatario:** Equipo de `Auth-Frontend` (Shell Principal)  
> **Fecha:** 18 de Noviembre de 2026  
> **Referencia:** Tarea `INT-06` (`Planificacion_Sprints_Orders_KDSV4.md`)

Este documento detalla únicamente los ajustes que corresponden al repositorio externo `Auth-Frontend` detectados al validar la integración con sus commits recientes (`ab9bc2c` / `6bd92f7`). Los ajustes correspondientes a `orders-frontend` (`resolveDefaultApiBaseUrl` / `resolveDefaultWsBaseUrl` con prefijo Kong y modo `auto`, soporte `userType: 'ADMINISTRADOR'`, y `Dockerfile` con `BUILD_MODE=cocina`) ya fueron aplicados en este repositorio.

---

## 1. Visibilidad de "Órdenes (POS)" para `CHEF_MASTER` en `Sidebar.tsx` y `DashboardHomeView.tsx`

* **Estado observado (`Auth-Frontend` commit `ab9bc2c`):**
  * `src/services/authApi.ts` (línea `116`) y `Auth-Backend` (`roles.service.ts`) asignan `orders:orders:view` a `CHEF_MASTER` únicamente para consulta de detalle en solo lectura.
  * Sin embargo, tanto `src/components/layout/Sidebar.tsx` (líneas `45` y `58-61`) como `src/components/dashboard/DashboardHomeView.tsx` (línea `15`) evalúan acceso al módulo `ordenes` con `p.startsWith('orders:')`.
* **Impacto:**
  * A un usuario con rol `CHEF_MASTER` le aparece visible la opción **"Órdenes (POS)"** en la barra lateral y la tarjeta **"Órdenes y Pedidos (POS)"** en el Inicio, aunque operativamente solo debe acceder a **Cocina (KDS)**. (Al abrirlo, `orders-frontend` ya lo protege y lo mantiene en KDS vía `hasWaiterModuleAccess`, pero la navegación del Shell muestra una entrada engañosa).
  * Adicionalmente, en `src/components/dashboard/DashboardHomeView.tsx` (línea `20`), el contador `availableModules` suma `[hasInventory, hasOrders, hasMenu, hasSala, hasBilling]` y omite `hasKitchen`, provocando un conteo inconsistente para roles de cocina.
* **Acción requerida en `Auth-Frontend`:**
  1. En `Sidebar.tsx` y `DashboardHomeView.tsx`, replicar la regla de módulo de mesero para `ordenes`: considerar que el usuario tiene acceso al módulo `ordenes` solo si es `ADMIN` / tiene `*`, tiene algún permiso `orders:*` distinto de `orders:orders:view`, o tiene `orders:orders:view` **sin** permisos `kitchen:*`.
  2. Incluir `hasKitchen` dentro del arreglo de `availableModules` en `DashboardHomeView.tsx`.

---

## 2. Content-Security-Policy (CSP) en `nginx.conf` (Despliegue Docker / Producción)

* **Estado observado (`Auth-Frontend/nginx.conf:43`):**
  * La cabecera `Content-Security-Policy` solo autoriza los puertos `5174`, `5175`, `5176`, `5177`, `5178` y `http://localhost:4000`.
* **Impacto:**
  * Al correr `Auth-Frontend` detrás de Nginx en Docker/Staging, el navegador bloqueará la carga de `cocinaApp` (`http://localhost:5179/assets/remoteEntry.js`) y bloqueará todas las peticiones `fetch` y WebSockets hacia Kong (`http://localhost:8000`, `ws://localhost:8000`).
* **Acción requerida en `Auth-Frontend`:**
  * Agregar `http://localhost:5179` en `script-src`, `style-src`, `img-src` y `connect-src`.
  * Agregar el origen del API Gateway (`http://localhost:8000` y `ws://localhost:8000`, o los orígenes HTTPS/WSS del entorno de staging/producción) en `connect-src`.

---

## 3. Regex de reescritura en `vite.config.ts` (`fmat-remote-gateway-rewrite`)

* **Estado observado (`Auth-Frontend/vite.config.ts:76-80`):**
  * El middleware `fmat-remote-gateway-rewrite` reemplaza `/http:\/\/localhost:808[0-5]/g` por `effectiveGatewayUrl`.
* **Impacto:**
  * El puerto de referencia del backend de Cocina en `INT-06` es `8086`, que queda fuera del rango `808[0-5]`. Aunque `orders-frontend` ya apunta por defecto al Gateway `:8000` y soporta resolución dinámica por host (`auto`), ampliar el patrón a `808[0-6]` garantiza cobertura completa para los 6 módulos.

---

## 4. Política de Seguridad sobre `JWT_SECRET`

* Ningún repositorio frontend (`Auth-Frontend`, `orders-frontend`) debe recibir, configurar ni empaquetar `JWT_SECRET`. Ese secreto pertenece exclusivamente a los `.env` privados de `Auth-Backend` y `API-Gateway` (Kong).
