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
Permite que cualquier componente del catálogo de Menú envíe platillos a la comanda con una sola línea de código sin necesitar acceso a referencias de React:

1. **Evento para Agregar Ítem (`fmat:comanda:add-item`):**
   ```javascript
   window.dispatchEvent(new CustomEvent('fmat:comanda:add-item', {
     detail: {
       dishId: "b3e34b9f-6fa1-4a55-93df-520e5c8e312a",
       name: "Hamburguesa Clásica",
       unitPrice: 150.00,
       quantity: 1,
       notes: "Sin cebolla"
     }
   }));
   ```
2. **Escucha en `OrderTicketWidget`:**
   El widget escucha el evento en `window.addEventListener('fmat:comanda:add-item', ...)` y agrega automáticamente el renglón al estado del ticket.

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
