# Prompt de Integración con el Shell (Frontend + Puertos)

Copia y pega el siguiente bloque directamente en el agente de IA de tu equipo (Cursor, Antigravity, Claude Code, Copilot, Windsurf, etc.) dentro del repositorio **Frontend** de tu microservicio.

> **Nota:** Si tu equipo también desea sincronizar el **Modo Oscuro** con el Shell, utiliza el prompt opcional [PROMPT_MODO_OSCURO.md](./PROMPT_MODO_OSCURO.md).

---

## Prompt para el Agente de IA

````markdown
# PROMPT PARA AGENTE IA: Integración de Microfrontend con Auth Shell (Module Federation)

Actúa como un Ingeniero Frontend Senior experto en React 18, TypeScript y Vite.
Necesito que configures este repositorio **Frontend** para conectarse como un **Microfrontend Remoto (Remote)** dentro del Shell principal (`Auth-Frontend`) usando `@originjs/vite-plugin-federation`, respetando los puertos, la sesión compartida y el enrutamiento hacia el API Gateway (Kong).

Primero, inspecciona este repositorio para identificar a cuál de los 6 módulos pertenece y usa **estrictamente** los valores de su fila en esta tabla oficial de contratos:

### Matriz Maestra de Puertos y Contratos

| Módulo / Dominio | `name` en Federation | Puerto Frontend (`server` y `preview`) | Ruta en API Gateway (`http://localhost:8000`) | Puerto Backend (Referencia) | Rol de Sistema en Auth |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **Sala / Host** | `salaApp` | `5174` | `/api/v1/floor` | `8085` | `HOST` |
| **Menú** | `menuApp` | `5173` | `/api/v1/menu` | `8080` | `GESTOR_MENU` |
| **Inventario** | `inventarioApp` | `5176` | `/api/v1/inventory` | `8083` | `ALMACENISTA` |
| **Órdenes (POS)** | `ordenesApp` | `5177` | `/api/v1/orders` | `8082` | `MESERO` |
| **Cocina (KDS)** | `cocinaApp` | `5179` | `/api/v1/kitchen` | `8086` | `CHEF_MASTER` |
| **Caja y Facturación** | `cajaApp` | `5178` | `/api/v1/payments` | `8084` | `CAJERO` |

---

## 1. Requisito Crítico: React 18 (¡NO React 19!)
El Shell (`Auth-Frontend`) corre en **React 18** (`^18.3.1`). Como Module Federation comparte la instancia de React en memoria (`shared: ['react', 'react-dom']`), si este microfrontend usa React 19 romperá el Shell con el error `Objects are not valid as a React child`.
Asegura que `package.json` tenga:
```bash
npm install react@^18.3.1 react-dom@^18.3.1
npm install -D @types/react@^18.3.18 @types/react-dom@^18.3.5
```

---

## 2. Configurar Module Federation en `vite.config.ts`
1. Instala el plugin:
   ```bash
   npm install -D @originjs/vite-plugin-federation
   ```
2. Configura `vite.config.ts` para exponer `./App` en `assets/remoteEntry.js` usando exactamente el `name` y puerto de la Matriz Maestra:
   ```typescript
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import federation from '@originjs/vite-plugin-federation';

   export default defineConfig({
     plugins: [
       react(),
       federation({
         name: '<NAME_SEGUN_MATRIZ>', // ej. 'menuApp', 'inventarioApp', 'salaApp', 'ordenesApp', 'cocinaApp', 'cajaApp'
         filename: 'remoteEntry.js',
         exposes: {
           './App': './src/App.tsx', // Debe tener export default del componente raíz
         },
         shared: ['react', 'react-dom'],
       }),
     ],
     server: {
       port: <PUERTO_SEGUN_MATRIZ>,
       strictPort: true,
       cors: true,
       host: '0.0.0.0',
     },
     preview: {
       port: <PUERTO_SEGUN_MATRIZ>,
       strictPort: true,
       cors: true,
       host: '0.0.0.0',
     },
     build: {
       target: 'esnext',
       minify: false,
       cssCodeSplit: false,
     },
   });
   ```
   > **Obligatorio:** `./src/App.tsx` debe exportar el componente raíz con `export default App`.

3. **Scripts de ejecución (¡`vite dev` NO genera `remoteEntry.js`!):**
   `@originjs/vite-plugin-federation` solo genera `assets/remoteEntry.js` al compilar. Agrega en `package.json`:
   ```json
   "scripts": {
     "dev:federation": "vite build && vite preview --port <PUERTO_SEGUN_MATRIZ> --host 0.0.0.0",
     "preview": "vite preview --port <PUERTO_SEGUN_MATRIZ> --host 0.0.0.0"
   }
   ```
   > **Si usas Docker con Nginx:** Reconstruye sin caché ante cambios (`docker compose build --no-cache && docker compose up -d`), incluye `add_header Access-Control-Allow-Origin *;` en `nginx.conf` y verifica con `curl -I http://localhost:<PUERTO>/assets/remoteEntry.js` que devuelva `Content-Type: application/javascript` (si devuelve `text/html`, el build no se generó).

---

## 3. Recibir Sesión, Usuario y Permisos desde el Shell
El Shell monta tu `<App />` pasando props de usuario y token, y además guarda la sesión activa en `localStorage` bajo la clave `'fmat_restaurant_auth_session'`.

1. **Acepta `FederatedModuleProps` en `./src/App.tsx` con fallback a `localStorage`:**
   ```typescript
   export interface ShellUser {
     id: string;
     userType: 'ADMIN' | 'STAFF';
     staffId?: string;
     email?: string;
     displayName?: string;
     firstName?: string;
     lastName?: string;
     roles?: string[];      // ej. ['ADMINISTRADOR'] o ['MESERO']
     permissions: string[]; // ej. ['*'] o permisos con ':'
   }

   export interface FederatedModuleProps {
     token?: string;
     currentUser?: ShellUser;
     theme?: 'light' | 'dark';
   }

   const getStoredSession = (): { accessToken?: string; user?: ShellUser } | null => {
     try {
       const raw = localStorage.getItem('fmat_restaurant_auth_session');
       return raw ? JSON.parse(raw) : null;
     } catch {
       return null;
     }
   };
   ```
   - Token activo: `const activeToken = token ?? getStoredSession()?.accessToken;`
   - Usuario activo: `const activeUser = currentUser ?? getStoredSession()?.user;`

2. **Helper de permisos en UI (siempre con dos puntos `:` y bypass de Admin):**
   Si este frontend oculta o deshabilita botones por permiso, usa exactamente el formato con **dos puntos (`:`)** y permite acceso total cuando el usuario sea `ADMIN`, `ADMINISTRADOR` o tenga `*`:
   ```typescript
   export const hasPermission = (user: ShellUser | undefined, requiredPermission: string): boolean => {
     if (!user) return false;
     if (
       user.userType === 'ADMIN' ||
       user.roles?.includes('ADMINISTRADOR') ||
       user.roles?.includes('ADMIN') ||
       user.permissions?.includes('*')
     ) {
       return true;
     }
     return Boolean(user.permissions?.includes(requiredPermission));
   };
   ```
   - **Catálogo de permisos emitidos por Auth para tu módulo:**
     - **Inventario (`ALMACENISTA`):** `inventory:items:read`, `inventory:items:write`, `inventory:batches:read`, `inventory:batches:write`, `inventory:suppliers:read`, `inventory:suppliers:write`, `inventory:recipes:read`, `inventory:reservations:read`, `inventory:movements:read`
     - **Menú (`GESTOR_MENU`):** `menu:entries:view`, `menu:entries:manage`, `menu:categories:view`, `menu:categories:manage`, `menu:recipes:view`, `menu:recipes:manage`, `menu:offers:view`, `menu:offers:manage`
     - **Sala (`HOST`):** `sala:tables:view`, `sala:tables:occupy`, `sala:tables:update_status`, `sala:tables:assign_waiter`, `sala:assignments:view`, `sala:table_unions:view`, `sala:table_unions:create`, `sala:table_unions:release`, `sala:reservations:view`, `sala:reservations:create`, `sala:reservations:update`, `sala:reservations:cancel`, `sala:reservations:mark_no_show`, `sala:waitlist_entries:view`, `sala:waitlist_entries:create`, `sala:waitlist_entries:update_status` *(Admin: `sala:tables:create`, `sala:tables:update`, `sala:tables:delete`)*
     - **Órdenes (`MESERO`):** `orders:orders:view`, `orders:orders:create`, `orders:orders:update`, `orders:orders:confirm`, `orders:orders:cancel`, `orders:orders:transfer`, `orders:items:redo`, `orders:orders:request_bill` *(Admin: `orders:orders:void_admin`)*
     - **Cocina (`CHEF_MASTER`):** `kitchen:queues:view`, `kitchen:orders:start_preparation`, `kitchen:items:ready`, `kitchen:orders:ready`, `kitchen:items:reject`, `kitchen:items:cancel`, `kitchen:orders:void_error`, `orders:orders:view`
     - **Caja (`CAJERO`):** `billing:invoices:create`, `billing:reports:view`

3. **Evitar Sidebars / Logins duplicados:**
   El Shell ya incluye el Sidebar global de navegación entre módulos y la pantalla de login. Si este microfrontend tenía un sidebar propio de todo el restaurante o pantalla de login propia, ocúltalo cuando se monte desde el Shell.

---

## 4. Conexión HTTP al API Gateway y Datos Mínimos del Backend
1. **En el Frontend:** Apunta `VITE_API_URL` al API Gateway (`http://localhost:8000<RUTA_SEGUN_MATRIZ>`), **no** al puerto interno del backend, y envía siempre el header:
   ```ts
   Authorization: `Bearer ${activeToken}`
   ```
2. **Nota mínima para tu Backend (solo puertos y headers):**
   - El backend debe escuchar en `0.0.0.0` en el **Puerto Backend** de la Matriz Maestra y tener CORS habilitado.
   - Kong reenvía las peticiones validando el JWT e inyectando los headers `x-user-id`, `x-staff-id`, `x-user-roles` y `x-user-permissions` (separados por comas, formato `:`, y `*` para `ADMINISTRADOR`).

---

## 5. Checklist de Verificación
1. [ ] `react` y `react-dom` en `^18.3.1`.
2. [ ] `vite.config.ts` expone `./App` con el `name` y puerto exacto de la Matriz Maestra y `host: '0.0.0.0'`.
3. [ ] `src/App.tsx` acepta `{ token, currentUser, theme }` con fallback a `localStorage.getItem('fmat_restaurant_auth_session')`.
4. [ ] Las peticiones HTTP usan `Authorization: Bearer <token>` hacia `http://localhost:8000<RUTA>`.
5. [ ] `npm run build` termina sin errores y genera `dist/assets/remoteEntry.js`.
````
