# Análisis y Guía de Integración con el Shell Microfrontend (Frontend)

> **Módulo:** Órdenes y Cocina (KDS) — `orders-frontend`  
> **Destinatario:** Desarrolladores de Frontend de Orders-KDS y Equipo de Integración  
> **Fecha:** 11 de Noviembre de 2026  
> **Estado:** Documentación Técnica de Arquitectura y Plan de Cambios  

---

## 1. Resumen Ejecutivo y Diagnóstico del Entorno

El Shell principal del restaurante (`Auth-Frontend`) está construido en **React 18**, **Vite** y `@originjs/vite-plugin-federation`. Actúa como el host contenedor que autentica a los usuarios, administra los roles y permisos PBAC, y monta dinámicamente cada microfrontend según el módulo seleccionado en su barra lateral.

### Contrato Oficial del Shell (Arquitectura de 6 Módulos):
* **Módulo Órdenes (POS / Mesero):** Identificador en Federation `ordenesApp` (`http://localhost:5177/assets/remoteEntry.js`), expone `ordenesApp/App` y `ordenesApp/OrderTicketWidget`, enruta vía Kong `http://localhost:8000/api/v1/orders` (backend `8082`), rol base `MESERO` y permisos `orders:`.
* **Módulo Cocina (KDS):** Identificador en Federation `cocinaApp` (`http://localhost:5179/assets/remoteEntry.js`), compilado con `--mode cocina` hacia `dist-cocina/`, expone `cocinaApp/App` y `cocinaApp/KdsApp`, enruta vía Kong `http://localhost:8000/api/v1/kitchen` (backend `8086`), rol base `CHEF_MASTER` y permisos `kitchen:`.
* **Guard de `CHEF_MASTER`:** `CHEF_MASTER` puede portar `orders:orders:view` únicamente para consultar detalle de orden en solo lectura sin habilitar controles de escritura ni vista de POS Mesero.

> [!WARNING]
> **Atención al trabajo en paralelo:** Actualmente se están realizando ajustes visuales y de diseño en tiempo real en los componentes del tablero KDS (`OrderCard.tsx`, `OrderCardStub.tsx`, `StationSelector.tsx`, etc.). Los cambios descritos en este documento deben implementarse de forma coordinada, respetando los archivos de estilos que están siendo intervenidos.

---

## 2. Inyección de las Dos Interfaces del Microservicio en el Shell

El microservicio de Órdenes y Cocina cuenta con **dos interfaces de usuario principales**:
1. **Pantalla KDS de Cocina (`KdsApp.tsx`):** Diseñada para la línea caliente, planchas y freidoras. Orientada a pantallas táctiles y teclado industrial (Bump Bar).
2. **Gestión de Órdenes / Toma de Pedidos (`OrderTicketWidget.tsx` / Vista de Pedidos):** Diseñada para meseros y sala, permitiendo capturar órdenes, editar platillos, confirmar pedidos a cocina y solicitar la cuenta.

### El Reto de Arquitectura
El Shell solo monta un único componente raíz por microservicio:
```tsx
const RemoteOrdenesApp = React.lazy(() => import('ordenesApp/App'));
```
No tiene rutas separadas en el menú principal para "KDS" y "Órdenes", sino un único módulo: **"Órdenes y Cocina"** (`id: 'ordenes'`).

### La Solución: Componente Contenedor Orquestador (`src/App.tsx` + Sandbox en `src/DevSandboxApp.tsx`)
`src/App.tsx` actúa exclusivamente como el contenedor federado de producción que recibe las propiedades del Shell (`FederatedModuleProps`) y, únicamente cuando no existe usuario autenticado (`standalone` local), delega el renderizado a `src/DevSandboxApp.tsx` (junto con el motor compartido en memoria `src/features/dev-sandbox/mockSandboxFetch.ts`):

```mermaid
flowchart TD
    Shell[Shell Principal Auth-Frontend] -->|Carga ordenesApp/App con currentUser y token| AppContainer[src/App.tsx Contenedor Inteligente]
    
    AppContainer --> CheckRole{¿Qué perfil tiene el usuario?}
    
    CheckRole -->|Permisos kitchen:* o rol CHEF/COCINERO| RenderKDS[Renderiza KdsApp - Pantalla KDS]
    CheckRole -->|Permisos orders:* o rol MESERO| RenderOrders[Renderiza OrderTicketWidget - Gestión de Órdenes]
    CheckRole -->|ADMIN o permisos mixtos| RenderTabbed[Barra de pestañas: Alternar KDS y Gestión de Órdenes]
    CheckRole -->|Modo Standalone puerto 5177| RenderStandalone[Delega a src/DevSandboxApp.tsx]
```

#### Propuesta de Implementación para `src/App.tsx`:
```tsx
import React, { useState, useEffect } from 'react';
import KdsApp from './KdsApp';
import OrderTicketWidget from './OrderTicketWidget';
import type { FederatedModuleProps, ShellUser } from './types/federation';

export default function App({ token, currentUser, theme }: Readonly<FederatedModuleProps>) {
  // 1. Obtener sesión efectiva (props del Shell o localStorage)
  const [activeUser, setActiveUser] = useState<ShellUser | null>(currentUser ?? null);
  const [activeView, setActiveView] = useState<'kds' | 'orders'>('kds');

  useEffect(() => {
    if (!currentUser) {
      try {
        const raw = localStorage.getItem('fmat_restaurant_auth_session');
        if (raw) {
          const parsed = JSON.parse(raw);
          setActiveUser(parsed.user);
        }
      } catch (err) {
        console.error('Error leyendo sesión del shell:', err);
      }
    } else {
      setActiveUser(currentUser);
    }
  }, [currentUser]);

  // 2. Determinar vistas disponibles según PBAC (con guard específico para CHEF_MASTER)
  // Ref. real en src/shared/types/auth.ts: hasKitchenModuleAccess / hasWaiterModuleAccess / isAdminUser
  const hasKitchen = isAdminUser(activeUser) || hasKitchenModuleAccess(activeUser);
  const hasOrders = isAdminUser(activeUser) || hasWaiterModuleAccess(activeUser);
  // Nota: CHEF_MASTER puede portar `orders:orders:view` para ver detalle de ticket en solo lectura,
  // pero NO recibe permisos de escritura ni acceso al módulo POS Mesero (`hasWaiterModuleAccess`).

  // Ajustar vista inicial por rol predominante
  useEffect(() => {
    if (hasKitchen && !hasOrders) setActiveView('kds');
    else if (!hasKitchen && hasOrders) setActiveView('orders');
  }, [hasKitchen, hasOrders]);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Barra de alternancia visible solo para Admin o usuarios con doble rol */}
      {(isAdmin || (hasKitchen && hasOrders)) && (
        <header className="flex items-center justify-between px-6 py-2 bg-surface border-b border-border text-sm">
          <span className="font-semibold text-ink">Módulo Órdenes & Cocina</span>
          <div className="flex gap-2 bg-canvas p-1 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setActiveView('kds')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                activeView === 'kds' ? 'bg-fmat-primary text-white shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              Pantalla Cocina (KDS)
            </button>
            <button
              type="button"
              onClick={() => setActiveView('orders')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                activeView === 'orders' ? 'bg-fmat-primary text-white shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              Gestión de Órdenes
            </button>
          </div>
        </header>
      )}

      {/* Renderizado de la vista seleccionada */}
      <main className="flex-1 w-full overflow-hidden">
        {activeView === 'kds' ? (
          <KdsApp />
        ) : (
          <div className="p-6 max-w-4xl mx-auto">
            {/* Widget de comanda activa o selector de órdenes para mesero */}
            <OrderTicketWidget orderId="ord-101" />
          </div>
        )}
      </main>
    </div>
  );
}
```

---

## 3. Cambios Técnicos Necesarios en el Repositorio Frontend

### 3.1. Alinear versión de React con el Shell (Completado)
* **Estado actual:** `orders-frontend/package.json` ya está alineado con el Shell (`Auth-Frontend`) utilizando **React 18 (`"react": "^18.3.1"`, `"react-dom": "^18.3.1"`)**.
* **Requisito del Shell:** `Auth-Frontend` corre en React 18 (`^18.3.1`).
* **Riesgo técnico:** Como Module Federation comparte la instancia de React en tiempo de ejecución (`shared: ['react', 'react-dom']`), cuando el Shell (React 18) intente renderizar un componente compilado contra el runtime de React 19, fallará con:
  > `Error: Objects are not valid as a React child (found: object with keys {$$typeof, type, key, ref, props, _owner})`
* **Acción requerida (cuando se apruebe la fase de dependencias):**
  ```bash
  pnpm add react@^18.3.1 react-dom@^18.3.1
  pnpm add -D @types/react@^18.3.18 @types/react-dom@^18.3.5
  ```

---

### 3.2. Configuración de Module Federation en `vite.config.ts` (Dual: `ordenesApp` y `cocinaApp`)
La configuración de federación en `orders-frontend/vite.config.ts` expone ambos remotos oficiales de la matriz de `Auth-Frontend` mediante `--mode cocina`:

```diff
- name: 'ordersKds',
+ name: isCocina ? 'cocinaApp' : 'ordenesApp', // puertos 5179 (dist-cocina/) y 5177 (dist/)
  filename: 'remoteEntry.js',
  exposes: {
+   './App': './src/App.tsx',
    './KdsApp': './src/KdsApp.tsx',
    './IntermediateDishesApp': './src/IntermediateDishesApp.tsx',
    './OrderTicketWidget': './src/OrderTicketWidget.tsx',
    './ReadyOrdersAlert': './src/ReadyOrdersAlert.tsx',
  },
  shared: ['react', 'react-dom'],
```

Y fijar el puerto en `5177` con CORS habilitado:
```ts
server: {
  port: 5177,
  strictPort: true,
  cors: true,
  host: true,
},
preview: {
  port: 5177,
  strictPort: true,
  cors: true,
  host: true,
},
```

---

### 3.3. Configuración de Comunicación con el API Gateway (Kong)
En lugar de apuntar al backend directo, todas las peticiones HTTP del frontend deben fluir a través de la ruta del API Gateway:
* **Ruta Gateway:** `http://localhost:8000/api/v1/orders` (Kong tiene `strip_path: false` configurado para `~/api/v1/orders(/|$)`).
* **Configuración en `.env`:**
  ```env
  VITE_API_URL=http://localhost:8000/api/v1/orders
  VITE_WS_URL=ws://localhost:8000/api/v1/orders/ws
  ```
* **Consideración de CORS en el Gateway:**
  - Cuando el microfrontend corre embebido dentro del Shell (`http://localhost:3000`), el origen es `http://localhost:3000`, el cual ya está autorizado por defecto en `CORS_ORIGINS` de `API-Gateway/.env`.
  - Si se prueba en modo **standalone** (`http://localhost:5177`) contra el Gateway, se debe asegurar que `http://localhost:5177` esté listado en la variable `CORS_ORIGINS` del `API-Gateway/.env`.
* **Inyección de Token Bearer:**
  En `src/shared/api/client.ts`, el interceptor de peticiones debe resolver el token con esta prioridad:
  1. Token recibido en props del Shell (`token`).
  2. Token almacenado en `localStorage.getItem('fmat_restaurant_auth_session')` (`accessToken`).
  3. Token de desarrollo mock (solo en modo `standalone`).

---

### 3.4. Respeto al Tema del Shell (`data-theme="dark"`)
El Shell aplica el tema en la raíz del documento:
`<html data-theme="dark">` o `<html data-theme="light">`.

El trabajo de estilos que se está realizando actualmente en el equipo (reemplazando colores quemados `bg-gray-800` por variables semánticas `bg-surface`, `border-border`, `text-body`, `text-ink`) es **completamente compatible y necesario**. Se debe asegurar que `src/index.css` incluya la paleta oficial del restaurante para que al alternar el modo oscuro en el Shell, los componentes de ÓrdenesKDS respondan instantáneamente.

---

### 3.5. Scripts en `package.json`
Scripts disponibles para compilación y previsualización federada dual (`ordenesApp:5177` y `cocinaApp:5179`):
```json
"scripts": {
  "build": "tsc -b && vite build",
  "build:cocina": "tsc -b && vite build --mode cocina",
  "preview": "vite preview --port 5177 --host 0.0.0.0",
  "preview:cocina": "vite preview --mode cocina --port 5179 --host 0.0.0.0",
  "dev:federation": "vite build && vite preview --port 5177 --host 0.0.0.0",
  "dev:federation:cocina": "vite build --mode cocina && vite preview --mode cocina --port 5179 --host 0.0.0.0"
}
```

---

## 4. Hoja de Ruta Precavida para la Implementación

Para no interferir con las modificaciones de estilos que se están ejecutando en tiempo real:

1. **Fase 1 (Inmediata - Sin riesgo):**
   - El equipo termina de pulir y commitear los estilos visuales de `OrderCard.tsx`, `KdsBoard.tsx`, etc.
   - Se valida que `test:coverage` continúe al 100%.
2. **Fase 2 (Federación y Contenedor):**
   - Implementar el contenedor `src/App.tsx` con soporte para `FederatedModuleProps` y alternancia de vistas KDS / Gestión de Órdenes (delegando modo `standalone` local a `src/DevSandboxApp.tsx`).
   - Ajustar `vite.config.ts` para fijar el puerto `5177` y exportar `'./App': './src/App.tsx'`.
3. **Fase 3 (Alineación de React 18):**
   - En una rama dedicada o tras asentar los estilos, instalar `react@^18.3.1` y validar que el build federado sea consumido limpiamente por `Auth-Frontend` corriendo en el puerto `3000`.
