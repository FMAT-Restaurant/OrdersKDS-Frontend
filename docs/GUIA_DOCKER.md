# Guía de uso de Docker — Orders & KDS Frontend

Documentación oficial para el equipo de desarrollo. Explica el empaquetamiento, ejecución y distribución de **Orders & KDS** en **una sola imagen Docker estándar** (`orders-frontend:latest`) —y el modo opcional dual-remoto (`cocinaApp`) para integración con Shell + Kong— tanto en local como en CI/CD (GitHub Actions y GHCR).

> **Documentos relacionados:**
> - [QUICKSTART.md](../QUICKSTART.md) — Requerimientos locales, variables de entorno, arranque con `pnpm dev` y pruebas en conjunto con `orders-backend`.
> - [README.md](../README.md) — Visión general de la arquitectura frontend y microfrontends (Module Federation).
> - [.github/workflows/ci.yml](../.github/workflows/ci.yml) — Pipeline de integración y despliegue continuo.

---

## 1. ¿Para qué usamos Docker en el Frontend?

A diferencia del backend (que orquesta bases de datos PostgreSQL, Redis y RabbitMQ), en el frontend el flujo estándar usa **una sola imagen** (`orders-frontend:latest`):

1. **Durante el desarrollo diario:** No necesitas Docker para el frontend. Ejecutas directamente `pnpm dev` en tu máquina (puerto `5177`) para aprovechar Vite con Hot Module Replacement (HMR) instantáneo.
2. **Para pruebas en contenedor y distribución (imagen única estándar):** `docker build -t orders-frontend:latest .` empaqueta la compilación estándar (`dist/`) dentro de un servidor web ligero y sin privilegios `root` (**`nginxinc/nginx-unprivileged:alpine`** en puerto `8080`). Esa única imagen ya contiene los 5 módulos expuestos (Mesero y KDS de Cocina).
3. **Opcional — Integración dual-remoto con Shell + Kong (`INT-06`/`INT-07`):** El mismo `Dockerfile` acepta `ARG BUILD_MODE=cocina` únicamente si el Auth Shell o Kong necesitan cargar dos remotos federados separados (`ordenesApp` en `:5177` apuntando a `/api/v1/orders`, y `cocinaApp` en `:5179` apuntando a `/api/v1/kitchen`).
4. **CI/CD automatizado:** En cada merge a la rama `main`, GitHub Actions compila la imagen Docker optimizada con multi-stage build y la publica en **GitHub Container Registry (GHCR)**.

---

## 2. Arquitectura de la Imagen (`Dockerfile`)

El proyecto utiliza una estrategia de compilación multi-etapa (**Multi-Stage Build**) definida en [`Dockerfile`](../Dockerfile), que soporta generar cualquiera de los dos remotos mediante `ARG BUILD_MODE`:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 1: builder (node:24-alpine)                                      │
│  - Activa Corepack y pnpm@9.15.9                                        │
│  - Copia package.json y pnpm-lock.yaml                                  │
│  - pnpm install --frozen-lockfile --ignore-scripts                      │
│  - Acepta build-args: BUILD_MODE (production|cocina),                   │
│    VITE_API_URL, VITE_API_BASE_URL, VITE_WS_URL                         │
│  - Si BUILD_MODE=cocina -> pnpm run build:cocina (dist-cocina -> /out)  │
│  - Por defecto          -> pnpm run build        (dist        -> /out)  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Extrae /app/out
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 2: producción (nginxinc/nginx-unprivileged:alpine)               │
│  - Copia /app/out a /usr/share/nginx/html                               │
│  - Copia nginx.conf a /etc/nginx/conf.d/default.conf (sin root + SPA)   │
│  - Aplica CSP estricto (sin unsafe-inline) y allowlist CORS (sin *)     │
│  - Expone el puerto no privilegiado 8080 (USER nginx)                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Configuración de Nginx, CSP estricto y Allowlist CORS
La etapa de producción copia [`nginx.conf`](../nginx.conf) hacia `/etc/nginx/conf.d/default.conf` con:
- **Enrutamiento SPA:** `try_files $uri $uri/ /index.html;` para resolver rutas de cliente sin 404 al recargar.
- **Allowlist CORS explícito (sin comodín `*`):** directiva `map $http_origin $cors_origin` que refleja `Access-Control-Allow-Origin` únicamente para orígenes locales autorizados (`localhost` y `127.0.0.1` en los puertos `3000`, `4173`, `5173`–`5179` y `8000`) junto con `Vary: Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` (incluyendo `Authorization`) y respuesta `204` con las mismas cabeceras ante preflights `OPTIONS`.
- **Cabeceras de seguridad y CSP estricto:** `Content-Security-Policy` equivalente a producción (sin `'unsafe-inline'` ni `'unsafe-eval'`), `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: cross-origin`, `Permissions-Policy`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` y `X-Frame-Options: DENY`.

> **Compatibilidad con `orders-backend` y puerto `3000`:** El servicio Docker de frontend usa `node:24-alpine` solo en compilación y `nginxinc/nginx-unprivileged:alpine` (`8080`) en ejecución, por lo que no entra en conflicto con los servicios de `orders-backend/docker-compose.yml` (`postgres:16-alpine`, `redis:7-alpine`, `rabbitmq:3-management-alpine`). Tanto el acceso directo del Shell en `:3000` como un mapeo opcional `-p 3000:8080` funcionan con el allowlist CORS de Nginx y Vite.

---

## 3. Comandos para Uso Local

Desde la raíz del repositorio `orders-frontend`:

### 3.1 Estándar recomendado: Imagen única (`orders-frontend:latest` en puerto `5177`)

Construye e inicia **un único contenedor** que expone toda la aplicación (vistas de Mesero y KDS de Cocina):

```powershell
# 1. Construir la imagen única estándar
docker build -t orders-frontend:latest .

# 2. Iniciar contenedor mapeando 5177 (host) -> 8080 (Nginx sin root)
docker rm -f orders-frontend 2>$null
docker run -d --name orders-frontend -p 5177:8080 orders-frontend:latest

# 3. Verificar que la app y remoteEntry.js respondan 200 OK
curl -I http://localhost:5177/
curl -I http://localhost:5177/assets/remoteEntry.js
```

### 3.2 Opcional (Integración dual-remoto con Shell de Auth y Kong): `cocinaApp` en puerto `5179`

Solo necesario si estás probando la arquitectura multi-remoto (`INT-06`/`INT-07`) donde el Auth Shell carga un remoto dedicado llamado `cocinaApp` apuntando al prefijo `/api/v1/kitchen`:

```powershell
# 1. Construir imagen separada para Cocina usando BUILD_MODE=cocina
docker build --build-arg BUILD_MODE=cocina -t cocina-frontend:latest .

# 2. Iniciar contenedor mapeando 5179 (host) -> 8080 (Nginx sin root)
docker rm -f cocina-frontend 2>$null
docker run -d --name cocina-frontend -p 5179:8080 cocina-frontend:latest
curl -I http://localhost:5179/assets/remoteEntry.js
```

> **Nota sobre URLs del backend en Docker:** Por defecto (`VITE_API_BASE_URL=auto` en `.env.example`), el bundle resuelve `http://<host-actual>:8000/api/v1/orders` (modo estándar) o `http://<host-actual>:8000/api/v1/kitchen` (modo `cocina`). Si necesitas apuntar a otro host o puerto en tiempo de build, pasa `--build-arg VITE_API_BASE_URL=https://... --build-arg VITE_WS_URL=wss://...`.

### 3.3 Detener y Limpiar los Contenedores

```powershell
docker rm -f orders-frontend
# Si también levantaste el remoto opcional de cocina:
# docker rm -f cocina-frontend
```

---

## 4. Empaquetamiento y Publicación en CI/CD (GitHub Actions)

El repositorio cuenta con automatización en [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) bajo el trabajo `build-and-push`:

### Requisitos previos en el pipeline
La imagen se compila y publica si:
1. El evento es un `push` directo a la rama `main`.
2. Todos los checks previos fueron aprobados:
   - `sonarcloud` (calidad de código y cobertura)
   - `build-federation` (compilación TypeScript + Vite)
   - `e2e` (pruebas Playwright en Chromium y WebKit)
   - `a11y` (auditoría WCAG con axe-core)
   - `zap-baseline` (escaneo de seguridad OWASP ZAP)

### Registro de Contenedores y Versionado
- **Registro:** GitHub Container Registry (`ghcr.io`).
- **Ruta de la Imagen:** `ghcr.io/fmat-restaurant/orderskds-frontend`
- **Etiquetado automático:** `main`, `sha-<commit>` y tags SemVer (ej. `v1.0.0`).
- **Notificaciones:** Envía un reporte a Discord informando el resultado del empaquetamiento.

---

## 5. Variables de Entorno y Configuración

Al tratarse de una SPA/MFE compilada en cliente, las variables con prefijo `VITE_` (`VITE_API_URL`, `VITE_API_BASE_URL`, `VITE_WS_URL`) se inyectan en tiempo de build (`pnpm run build` / `pnpm run build:cocina`).

- En desarrollo o en entornos estándar detrás de Kong Gateway (`:8000`), el valor recomendado es `auto` (resolución dinámica según `window.location.hostname` y modo `production` vs `cocina`).
- Para apuntar a un dominio distinto en staging o producción, usa `--build-arg` al construir la imagen Docker.

---

## 6. Preguntas Frecuentes y Diagnóstico

### ¿Por qué existe un build opcional `BUILD_MODE=cocina` si normalmente usamos una sola imagen?
- En uso normal (standalone o contenedor único), `docker build -t orders-frontend:latest .` (`dist/`) ya incluye los **5 módulos federados** (Mesero y Cocina) en un solo contenedor.
- `vite.config.ts` define en tiempo de build el nombre del remoto de Module Federation y el prefijo de API por defecto (`ordenesApp` + `/api/v1/orders` en `dist/`, frente a `cocinaApp` + `/api/v1/kitchen` en `dist-cocina/`). Solo en integración dual-remoto con el Auth Shell + Kong (`INT-06`/`INT-07`) se despliegan dos remotos separados.

### El contenedor arranca pero no se conecta al backend local
Si tu backend (`orders-backend`) corre en `localhost:8000`, el navegador del usuario accede directamente a `http://localhost:8000`. Verifica que el backend esté arriba (`http://localhost:8000/health`) y permita el origen del puerto desde el que abriste el frontend (`http://localhost:5177` o `http://localhost:5179`).

### Ver logs del contenedor Nginx
```powershell
docker logs -f orders-frontend
```
