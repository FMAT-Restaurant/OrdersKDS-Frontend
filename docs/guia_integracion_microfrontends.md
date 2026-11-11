## Prompt para el Agente de IA de cada equipo

````markdown
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
2. Actualiza `vite.config.ts` para exponer el componente raíz como `./App` en el archivo `remoteEntry.js` y fijar el puerto asignado tanto en `server` como en `preview` con `cors: true`:
   ```ts
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import federation from '@originjs/vite-plugin-federation';

   export default defineConfig({
     plugins: [
       react(),
       federation({
         name: '<NAME_SEGUN_TABLA>', // ej. 'menu_app'
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

3. En `package.json`, agrega o actualiza los scripts para poder levantar el microfrontend en modo federado (ya que `@originjs/vite-plugin-federation` genera `assets/remoteEntry.js` al compilar):
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
   - Usa la variable de entorno `VITE_API_URL` con fallback al API Gateway: `http://localhost:8000<RUTA_SEGUN_TABLA>` (ej. `http://localhost:8000/api/v1/menu`).
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

Por favor, aplica todos estos cambios, verifica que `npm run build` genere correctamente `dist/assets/remoteEntry.js` sin errores de TypeScript, y muéstrame un resumen de los archivos modificados.
````
