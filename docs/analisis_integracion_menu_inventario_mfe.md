# Análisis Profundo de Integración: Orders & KDS Frontend con Menú e Inventario (Microfrontends & Comanda del Mesero)

> [!IMPORTANT]
> **Propósito del Documento:**
> Este análisis técnico define la arquitectura de integración y el plan de pruebas para la inyección del componente de comanda (**`OrderTicketWidget`**) de `orders-frontend` dentro de la aplicación de **`Menu-Frontend`** (así como en el Shell unificado de **`Auth`**).
> 
> **Condición de No-Regresión:** Este diseño **no rompe la compatibilidad con el Shell de Auth** (Module Federation, React 18, RBAC), respeta el aislamiento de estilos CSS y conserva intactos los 270 tests unitarios y los tests E2E con Playwright.

--

## 1. Resumen Ejecutivo y Caso de Uso del Mesero

En la experiencia de atención en sala de FMAT Restaurant, el mesero interactúa principalmente con la interfaz de **Menú**:
1. Consulta el catálogo visual de platillos, recetas, precios y alérgenos.
2. Selecciona los platillos solicitados por los comensales de una mesa.
3. El componente **`OrderTicketWidget`** (microfrontend remoto expuesto por `orders-frontend`) se incrusta dentro de la pantalla de Menú para mostrar el ticket activo en tiempo real:
   * Permite agregar platillos, ajustar porciones, notas de cocina (ej. "sin cebolla") y remover ítems.
   * Al pulsar **"Enviar a Cocina"** (`Confirmar`), envía la comanda a `orders-backend`, la cual inicia la Saga de reserva en Inventario.
   * Si Inventario aprueba la reserva, el widget notifica al mesero que la orden está en espera de preparación en Cocina.
   * Si Inventario detecta stock insuficiente, el widget resalta los platillos faltantes para que el mesero los ajuste inmediatamente con los comensales.

---

## 2. Diagnóstico de Compatibilidad y Module Federation

### 2.1 Comparativa de Tecnologías entre Microfrontends

| Propiedad | `Menu-Frontend` (Host Consumidor) | `orders-frontend` (Remote Productor) | `Auth-Frontend` (Shell Global) |
| :--- | :--- | :--- | :--- |
| **Puerto Local** | `5175` | `5177` | `3000` |
| **Herramienta Build** | Vite 5 | Vite 5 | Vite 5 |
| **Plugin Federation** | `@originjs/vite-plugin-federation` | `@originjs/vite-plugin-federation` | `@originjs/vite-plugin-federation` |
| **Versión de React** | **`^18.3.1`** (React 18) | React 19 (en migración a 18) | **`18.2.0`** (React 18) |
| **Componente Expuesto** | `./App` (`menu_app`) | **`./OrderTicketWidget`**, `./KdsApp` | Host Principal |

> [!TIP]
> **Sinergia con el Microservicio de Auth:**
> Al inspeccionar el `package.json` de `Menu-Frontend`, se constata que utiliza `react: ^18.3.1`.
> Esto confirma que la decisión tomada en el análisis de integración de Auth (alinear `orders-frontend` a React 18 para compartir la misma instancia con el Shell) **también resuelve automáticamente la integración con `Menu-Frontend`**, eliminando cualquier conflicto de doble instancia de React hooks o errores de `Invalid Hook Call`.

---


## 3. Contrato de Inyección de `OrderTicketWidget` en `Menu-Frontend`

### 3.1 Declaración del Remote en `Menu-Frontend/vite.config.ts`
Para consumir el widget de órdenes, el equipo de Menú debe registrar `orders_mfe` en su configuración de Vite:

```typescript
// Menu-Frontend/vite.config.ts
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'menu_app',
      remotes: {
        orders_mfe: 'http://localhost:5177/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom'],
    }),
  ],
  // ...
});
```

### 3.2 Montaje Dinámico del Componente en Menú
En la vista donde el mesero atiende una mesa en `Menu-Frontend`:

```tsx
import React, { lazy, Suspense } from 'react';

// Carga asíncrona del microfrontend remoto
const OrderTicketWidget = lazy(() => import('orders_mfe/OrderTicketWidget'));

export function WaiterMenuView({ currentTable, currentDiningSession, tokenProvider }) {
  const [selectedDishes, setSelectedDishes] = React.useState([]);

  return (
    <div className="flex flex-row w-full h-full">
      {/* Panel Izquierdo: Catálogo de Menú */}
      <section className="w-2/3 p-4 overflow-y-auto">
        <MenuCatalogList onAddDish={(dish) => {
          // Opción 1: Pasar por evento DOM desacoplado
          window.dispatchEvent(new CustomEvent('fmat:comanda:add-item', { detail: dish }));
        }} />
      </section>

      {/* Panel Derecho: Ticket de Comanda (Microfrontend de Órdenes) */}
      <aside className="w-1/3 p-2 bg-slate-100 border-l">
        <Suspense fallback={<div className="p-4 text-center">Cargando comanda...</div>}>
          <OrderTicketWidget
            diningSessionId={currentDiningSession.id}
            tableNumber={currentTable.number}
            tokenProvider={tokenProvider}
            onOrderSubmitted={(orderId) => {
              console.log('Comanda enviada exitosamente:', orderId);
            }}
          />
        </Suspense>
      </aside>
    </div>
  );
}
```

---

## 4. Contrato de Props y Bus de Eventos DOM Desacoplado

Para evitar acoplar estrechamente el código de Menú con el de Órdenes, se ofrece soporte dual: comunicación por props y comunicación por eventos desacoplados en el navegador.

### 4.1 Tipos TypeScript del Componente (`OrderTicketWidgetProps`)

```typescript
export interface OrderTicketWidgetProps {
  /** ID de la sesión de comedor activa en Sala */
  diningSessionId?: string;
  /** Número o identificador visible de la mesa */
  tableNumber?: number | string;
  /** ID del mesero autenticado en sesión */
  waiterId?: string;
  /** Función asíncrona provista por el host para obtener el JWT válido */
  tokenProvider?: () => Promise<string | null>;
  /** Callback opcional cuando la orden fue confirmada e ingresó a la saga */
  onOrderSubmitted?: (orderId: string) => void;
  /** Callback opcional si la orden es cancelada por el mesero */
  onOrderCancelled?: () => void;
}
```

### 4.2 Bus de Eventos DOM (`CustomEvent`)
Para desacoplar por completo el microfrontend de Menú del microfrontend de Órdenes (evitando dependencias cíclicas de paquetes o manipulación de estado compartido), la integración se apoya en un bus de eventos en el navegador mediante `window.dispatchEvent` y `window.addEventListener`.

Existen dos modalidades de eventos soportadas por `OrderTicketWidget`:

#### 1. Apertura de Diálogo con Platillo Precargado (`fmat:comanda:open-add-dialog`) - **Flujo Recomendado**
Permite que el mesero pulse "+ Agregar a comanda" en la tarjeta del platillo en Menú; esto abre en el widget de Órdenes el modal interactivo `AddDishDialog` con el nombre y precio bloqueados en solo lectura (para garantizar fidelidad con el menú), permitiendo al mesero seleccionar cantidad, notas especiales (ej. "sin cebolla") y modificadores antes de incorporarlo al ticket.

* **Evento emitido desde Menú (`OfferCard.tsx`):**
```tsx
const customerDishName =
  offer.presentationTag && offer.presentationTag !== "Sin etiqueta de presentación"
    ? `${offer.entryName} (${offer.presentationTag})`
    : offer.entryName;

window.dispatchEvent(
  new CustomEvent("fmat:comanda:open-add-dialog", {
    detail: {
      dishId: offer.id,
      name: customerDishName,
      unitPrice: offer.basePrice,
    },
  })
);
```

#### 2. Inserción Directa al Ticket (`fmat:comanda:add-item`)
Agrega directamente el platillo con cantidad y notas opcionales al borrador de la comanda sin pasar por el diálogo modal:
```javascript
window.dispatchEvent(
  new CustomEvent("fmat:comanda:add-item", {
    detail: {
      dishId: "b3e34b9f-6fa1-4a55-93df-520e5c8e312a",
      name: "Hamburguesa Clásica",
      unitPrice: 150.0,
      quantity: 1,
      notes: "Sin cebolla"
    }
  })
);
```

### 4.3 Implementación de Referencia para el Equipo de Menú

> [!IMPORTANT]
> **Responsabilidad del Equipo de Menú:**
> Esta integración debe ser revisada, adaptada y mergeada por el equipo dueño de `Menu-Frontend` en su propio ciclo de desarrollo. A continuación se documenta el código exacto de referencia validado durante las pruebas de integración:

#### A. Modificación en `src/features/offers/OfferCard.tsx`
Se agrega el botón de acción rápida en la tarjeta de oferta activa, interceptando el evento para no detonar la navegación al detalle de edición:

```tsx
// src/features/offers/OfferCard.tsx
export function OfferCard({ offer, busy, returnTo, catalogReturnTo, onStatusChange }: OfferCardProps) {
  // ... lógica existente ...

  const customerDishName =
    offer.presentationTag && offer.presentationTag !== "Sin etiqueta de presentación"
      ? `${offer.entryName} (${offer.presentationTag})`
      : offer.entryName;

  const handleAddToComanda = () => {
    window.dispatchEvent(
      new CustomEvent("fmat:comanda:open-add-dialog", {
        detail: {
          dishId: offer.id,
          name: customerDishName,
          unitPrice: offer.basePrice,
        },
      })
    );
  };

  return (
    <article className="offer-card" data-return-key={`offer:${offer.id}`} tabIndex={-1}>
      {active && (
        <div className="offer-card__order-action">
          <button
            type="button"
            className="button button--primary offer-card__add-to-order-btn"
            data-testid={`offer-add-to-order-${offer.id}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAddToComanda();
            }}
            aria-label={`Agregar ${customerDishName} a la comanda`}
          >
            + Agregar a comanda
          </button>
        </div>
      )}
      <Link data-return-key={`offer:${offer.id}:edit`} className="offer-card__content" to={editPath} state={{ returnTo, catalogReturnTo }} aria-label={`Abrir oferta ${presentation} para editar`}>
        {/* ... contenido existente de la tarjeta ... */}
      </Link>
    </article>
  );
}
```

#### B. Estilos en `src/features/offers/styles.css`
Aislamiento con selector de especificidad `:where(.menu-module[data-menu-module])`:

```css
/* src/features/offers/styles.css */
:where(.menu-module[data-menu-module]) .offer-card__order-action {
  padding: 8px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

:where(.menu-module[data-menu-module]) .offer-card__add-to-order-btn {
  width: 100%;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
```

---

### 4.4 Directiva Oficial y Prompt para Agentes del Equipo de Auth (Para la Reunión Inter-Equipos)

A continuación se documenta de forma íntegra la especificación oficial y el prompt estandarizado emitido por el equipo de **Auth & Shell** para la alineación entre `Menu-Frontend`, `orders-frontend` y el contenedor principal:

```markdown
Actúa como un ingeniero experto en React, TypeScript, Vite y arquitecturas de Microfrontends.
Necesito que configures y adaptes este repositorio para conectarse como un **Microfrontend Remoto (Remote)** dentro del **Shell principal (`Auth-Frontend`)** del proyecto **FMAT-Restaurant** usando `@originjs/vite-plugin-federation`, además de alinear las llamadas HTTP con el **API Gateway (Kong)**.

Primero, inspecciona este repositorio para identificar a cuál de los 5 módulos pertenece y usa **estrictamente** los valores de su fila en esta tabla oficial de contratos del Shell:

| Módulo | `name` en Federation | Puerto (`server` y `preview`) | Ruta en API Gateway (`http://localhost:8000`) | Puerto interno Backend Docker | Prefijo de Permisos PBAC |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sala / Host** | `sala_app` | `5174` | `/api/v1/floor` | `8085` | `sala:` |
| **Menú** | `menu_app` | `5175` | `/api/v1/menu` | `8081` | `menu:` |
| **Inventario** | `inventario_app` | `5176` | `/api/v1/inventory` | `8083` | `inventory:` |
| **Órdenes y Cocina (KDS)** | `ordenes_app` | `5177` | `/api/v1/orders` | `8082` | `orders:` y `kitchen:` |
| **Caja y Facturación** | `caja_app` | `5178` | `/api/v1/payments` | `8084` | `billing:` |

Realiza los siguientes cambios en el repositorio:

### 1. Instalar y configurar Module Federation en el Frontend
1. **Alinear la versión de React con el Shell:**
   El Shell (`Auth-Frontend`) utiliza **React 18** (`^18.3.1`). Como Module Federation comparte la misma instancia en memoria (`shared: ['react', 'react-dom']`), es requisito obligatorio que todos los microfrontends utilicen React 18 (si usan React 19, React 18 no reconoce sus elementos y arroja error de `Objects are not valid as a React child`):
   ```bash
   npm install react@^18.3.1 react-dom@^18.3.1
   npm install -D @types/react@^18.3.18 @types/react-dom@^18.3.5
   ```
2. Instala el plugin de federación en las dependencias de desarrollo:
   ```bash
   npm install -D @originjs/vite-plugin-federation
   ```
3. Actualiza `vite.config.ts` para exponer el componente raíz como `./App` en el archivo `remoteEntry.js` y fijar el puerto asignado tanto en `server` como en `preview` con `cors: true`:
   ```ts
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import federation from '@originjs/vite-plugin-federation';

   export default defineConfig({
     plugins: [
       react(),
       federation({
         name: '<NAME_SEGUN_TABLA>', // ej. 'menu_app' o 'ordenes_app'
         filename: 'remoteEntry.js',
         exposes: {
           './App': './src/App.tsx',
         },
         shared: ['react', 'react-dom'],
       }),
     ],
     server: {
       port: <PUERTO_SEGUN_TABLA>,
       strictPort: true,
       cors: true,
       host: true,
     },
     preview: {
       port: <PUERTO_SEGUN_TABLA>,
       strictPort: true,
       cors: true,
       host: true,
     },
     build: {
       target: 'esnext',
       minify: false,
       cssCodeSplit: false,
     },
   });
   ```
   > **Nota crítica:** El Shell (`Auth-Frontend`) importa el módulo desde `http://localhost:<PUERTO>/assets/remoteEntry.js` y monta el `export default` de `./src/App.tsx`. Asegúrate de que `src/App.tsx` tenga `export default App`.

4. En `package.json`, agrega o actualiza los scripts para poder levantar el microfrontend en modo federado (ya que `@originjs/vite-plugin-federation` genera `assets/remoteEntry.js` al compilar):
   ```json
   "scripts": {
     "dev:federation": "vite build && vite preview --port <PUERTO_SEGUN_TABLA>",
     "preview": "vite preview --port <PUERTO_SEGUN_TABLA>"
   }
   ```

---

### 2. Recibir la Sesión, Usuario, Permisos PBAC y Tema desde el Shell
El Shell (`Auth-Frontend`) le pasa a `<App />` las siguientes props al montarlo, y además guarda la sesión en `localStorage` bajo la clave `'fmat_restaurant_auth_session'` (que es compartida cuando se ejecuta dentro del Shell):

1. Define la interfaz de props en `src/App.tsx` (o en un archivo de tipos):
   ```ts
   export interface ShellUser {
     id: string;
     userType: 'ADMIN' | 'STAFF';
     staffId?: string;
     email?: string;
     displayName: string;
     roleLabel?: string;
     roles?: string[];
     permissions: string[]; // Ej: ['inventory:view', 'inventory:ingredients:create'] o ['*'] para ADMIN
   }

   export interface FederatedModuleProps {
     token?: string;
     currentUser?: ShellUser;
     theme?: 'light' | 'dark';
   }
   ```
2. Haz que `App` acepte `FederatedModuleProps` y tenga un fallback automático a `localStorage.getItem('fmat_restaurant_auth_session')` por si no recibe props o se recarga:
   ```tsx
   const getStoredSession = (): { accessToken?: string; user?: ShellUser } | null => {
     try {
       const raw = localStorage.getItem('fmat_restaurant_auth_session');
       return raw ? JSON.parse(raw) : null;
     } catch {
       return null;
     }
   };
   ```
   - El token efectivo será `const activeToken = token ?? getStoredSession()?.accessToken;`
   - El usuario efectivo será `const activeUser = currentUser ?? getStoredSession()?.user;`
   - Para verificar si el usuario tiene un permiso en la UI, crea un helper:
     ```ts
     export const hasPermission = (user: ShellUser | undefined, requiredPermission: string): boolean => {
       if (!user) return false;
       if (user.userType === 'ADMIN' || user.permissions.includes('*')) return true;
       return user.permissions.includes(requiredPermission);
     };
     ```
3. **Soporte de Modo Oscuro (`[data-theme="dark"]`):**
   El Shell aplica el atributo `data-theme="dark"` en `document.documentElement` (`<html data-theme="dark">`). Asegúrate de que tu `src/index.css` incluya la paleta oscura de FMAT-Restaurant:
   ```css
   [data-theme="dark"] {
     --color-primary: #E06A3B;
     --color-primary-hover: #F07C48;
     --color-accent: #FB923C;
     --color-primary-soft: rgba(224, 106, 59, 0.16);

     --color-ink: #FFFFFF;
     --color-text: #E8E3DF;
     --color-muted: #9C9288;
     --color-border: #2C2420;
     --color-canvas: #0A0908;
     --color-surface: #161311;

     --color-success: #22C55E;
     --bg-success: rgba(34, 197, 94, 0.15);
     --color-warning: #F59E0B;
     --bg-warning: rgba(245, 158, 11, 0.15);
     --color-danger: #EF4444;
     --bg-danger: rgba(239, 68, 68, 0.15);
   }
   ```
4. **Evitar duplicar el Sidebar principal:** El Shell ya provee el Sidebar lateral de navegación entre microservicios y el header móvil. Si este frontend tenía un Sidebar global de todo el restaurante o barra de login propia, ocúltalo cuando se monte desde el Shell para renderizar únicamente el contenido del módulo.

---

### 3. Conectar el Frontend y Backend con el API Gateway
1. **En el Frontend (servicios HTTP / `fetch` / `axios`):**
   - Usa la variable de entorno `VITE_API_URL` con fallback al API Gateway: `http://localhost:8000<RUTA_SEGUN_TABLA>` (ej. `http://localhost:8000/api/v1/menu` o `http://localhost:8000/api/v1/orders`).
   - En todas las peticiones incluye el header:
     ```ts
     Authorization: `Bearer ${activeToken}`
     ```
2. **En el Backend (si está en este mismo repo o monorepo):**
   - El API Gateway (Kong + plugin `auth-perimeter`) ya valida la firma del JWT, bloquea contraseñas temporales y reenvía la petición al backend inyectando estos headers HTTP:
     - `x-user-id`: UUID del usuario autenticado
     - `x-user-type`: `'ADMIN'` o `'STAFF'`
     - `x-user-role`: Rol del usuario
     - `x-user-permissions`: Permisos separados por comas (ej. `menu:view,menu:dishes:manage` o `*`)
   - Asegúrate de que el Backend escuche en el puerto interno indicado en la tabla y autorice los endpoints leyendo `x-user-permissions` (o el `Bearer` token si se prueba directo sin Gateway).

---

### 4. Instrucciones Especiales para el Módulo de Menú (`menu_app`): Integración con la Comanda (`orders_app`)

Si este repositorio es **`Menu-Frontend`**, debe permitir a los meseros enviar platillos directamente hacia el componente **`OrderTicketWidget`** (microfrontend de Órdenes y Cocina) mediante eventos desacoplados en el navegador:

1. **En `src/features/offers/OfferCard.tsx`:**
   Agregar el botón "+ Agregar a comanda" en cada tarjeta de platillo activo para emitir el evento `fmat:comanda:open-add-dialog`:
   ```tsx
   const customerDishName =
     offer.presentationTag && offer.presentationTag !== "Sin etiqueta de presentación"
       ? `${offer.entryName} (${offer.presentationTag})`
       : offer.entryName;

   const handleAddToComanda = () => {
     window.dispatchEvent(
       new CustomEvent("fmat:comanda:open-add-dialog", {
         detail: {
           dishId: offer.id,
           name: customerDishName,
           unitPrice: offer.basePrice,
         },
       })
     );
   };

   // Dentro del renderizado de la tarjeta:
   {active && (
     <div className="offer-card__order-action">
       <button
         type="button"
         className="button button--primary offer-card__add-to-order-btn"
         data-testid={`offer-add-to-order-${offer.id}`}
         onClick={(e) => {
           e.preventDefault();
           e.stopPropagation();
           handleAddToComanda();
         }}
         aria-label={`Agregar ${customerDishName} a la comanda`}
       >
         + Agregar a comanda
       </button>
     </div>
   )}
   ```

2. **En `src/features/offers/styles.css`:**
   Agregar los estilos para el botón de acción:
   ```css
   :where(.menu-module[data-menu-module]) .offer-card__order-action {
     padding: 8px 12px;
     background: var(--surface);
     border-bottom: 1px solid var(--border);
   }

   :where(.menu-module[data-menu-module]) .offer-card__add-to-order-btn {
     width: 100%;
     font-weight: 700;
     display: flex;
     align-items: center;
     justify-content: center;
     gap: 6px;
   }
   ```
```

---

## 5. Sincronización en Tiempo Real de Disponibilidad e Inventario

```mermaid
flowchart LR
    Inv["Inventario Backend"] -->|inventory.recipe.availability-changed| MenuBack["Menú Backend"]
    MenuBack -->|WebSocket / SSE| MenuFront["Menú Frontend (Catálogo)"]
    MenuFront -->|Deshabilita botón 'Agregar'| Waiter["Mesero"]

    Inv -->|inventory.reservation.rejected| OrdersBack["Orders Backend"]
    OrdersBack -->|WebSocket: order.status_changed (REJECTED)| OrderWidget["OrderTicketWidget (Frontend)"]
    OrderWidget -->|Alerta visual: 'Stock insuficiente'| Waiter
```

1. **Prevención en el Catálogo de Menú:**
   * Cuando Inventario detecta que una materia prima llegó a cero, publica `inventory.recipe.availability-changed` con `isAvailable: false`.
   * Menú marca la oferta como agotada y `Menu-Frontend` pinta la tarjeta en gris con el botón "Agotado" deshabilitado.
2. **Manejo de Reserva Rechazada en `OrderTicketWidget`:**
   * Si dos meseros piden el último platillo simultáneamente, la validación final la ejecuta Inventario al recibir `ordenes.order.created`.
   * Si Inventario responde `inventory.reservation.rejected`, `orders-backend` emite por WebSocket el cambio de estado con el detalle de platillos rechazados.
   * `OrderTicketWidget` muestra de inmediato un banner de advertencia amigable:
     > *"⚠️ Stock insuficiente: Hamburguesa Clásica solo tiene 1 porción disponible. Por favor ajusta la cantidad para continuar."*
   * El mesero puede ajustar la cantidad a 1 y re-confirmar la misma orden sin tener que reescribir todo el pedido.

---

## 6. Aislamiento de Estilos CSS (Tailwind vs CSS Nativos de Menú)

* **Riesgo:** `Menu-Frontend` contiene hojas de estilos globales como `styles.css` y `primitives.css` que definen reglas generales para etiquetas `button`, `input` y `div`.
* **Solución de Aislamiento:**
  1. `OrderTicketWidget` encapsula todo su marcado dentro de un contenedor raíz con la clase contenedora `#orders-ticket-root` o `orders-widget-scope`.
  2. Todas las clases de Tailwind de `orders-frontend` se compilan con reseteo específico de scope.
  3. Las áreas interactivas del widget respetan estrictamente la directriz de accesibilidad de mínimo **64px** de alto para pantallas táctiles de meseros y cocineros, tal como lo validan los tests E2E de Playwright.

---

## 7. Plan de Pruebas de Frontend para la Sesión de Hoy

### 7.1 Prueba Standalone de `OrderTicketWidget`
1. En la carpeta `orders-frontend`, ejecutar:
   ```bash
   pnpm run dev
   ```
2. Abrir en el navegador la ruta de prueba interactiva:
   `http://localhost:5177/` (o la ruta de demostración del widget).
3. Simular la adición de platillos mediante la consola del navegador:
   ```javascript
   window.dispatchEvent(new CustomEvent('fmat:comanda:add-item', {
     detail: { dishId: 'test-1', name: 'Tacos al Pastor', unitPrice: 85.0, quantity: 2 }
   }));
   ```
4. Verificar que el platillo aparezca en la comanda con su subtotal correcto ($170.00).
5. Pulsar "Confirmar Comanda" y validar que se envíe la petición HTTP `POST /orders` hacia `orders-backend`.

### 7.2 Prueba de Integración con `Menu-Frontend` (Federated Dev)
1. Con `orders-frontend` corriendo en el puerto `5177`:
   ```bash
   # En orders-frontend:
   pnpm run build && pnpm run preview --port 5177
   ```
   *(Nota: Module Federation en Vite requiere que el remote esté compilado o usando el plugin de desarrollo federation).*
2. En la carpeta de `Menu-Frontend`, levantar la aplicación:
   ```bash
   npm run dev -- --port 5175
   ```
3. Abrir `http://localhost:5175` y verificar en la pestaña **Network** de las herramientas de desarrollador que se cargue exitosamente:
   `http://localhost:5177/assets/remoteEntry.js`
4. Confirmar que el widget se renderice sin errores en consola y que al seleccionar un platillo en Menú, este se agregue fluidamente a la comanda.
