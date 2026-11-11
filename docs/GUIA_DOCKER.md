# Guía de uso de Docker — Orders & KDS Frontend

Documentación oficial para el equipo de desarrollo. Explica el empaquetamiento, ejecución y distribución de la aplicación frontend (**Orders & KDS**) mediante contenedores Docker, tanto en entornos locales como en el pipeline de CI/CD (GitHub Actions y GitHub Container Registry).

> **Documentos relacionados:**
> - [QUICKSTART.md](../QUICKSTART.md) — Requerimientos locales, variables de entorno y arranque con `pnpm dev`.
> - [README.md](../README.md) — Visión general de la arquitectura frontend y microfrontends (Module Federation).
> - [.github/workflows/ci.yml](../.github/workflows/ci.yml) — Pipeline de integración y despliegue continuo.

---

## 1. ¿Para qué usamos Docker en el Frontend?

A diferencia del backend (que orquesta bases de datos PostgreSQL, Redis y RabbitMQ para desarrollo local), en el frontend el flujo es el siguiente:

1. **Durante el desarrollo diario:** No necesitas Docker. Ejecutas directamente `pnpm dev` en tu máquina para aprovechar el servidor de desarrollo de Vite con Hot Module Replacement (HMR) instantáneo.
2. **Para pruebas de producción y distribución:** Usamos Docker para empaquetar los artefactos estáticos compilados (`dist/`) dentro de un servidor web ultra-ligero de grado de producción (**Nginx Alpine**).
3. **Module Federation (Microfrontends):** La imagen de Nginx expone los encabezados CORS indispensables para que el host (o shell de la aplicación general del restaurante) pueda consumir remotamente `remoteEntry.js` y los componentes federados sin bloqueos del navegador.
4. **CI/CD automatizado:** En cada merge a la rama `main`, GitHub Actions compila la imagen Docker optimizada con multi-stage build y la publica en **GitHub Container Registry (GHCR)**.

---

## 2. Arquitectura de la Imagen (`Dockerfile`)

El proyecto utiliza una estrategia de compilación multi-etapa (**Multi-Stage Build**) definida en el [`Dockerfile`](../Dockerfile), garantizando imágenes de producción mínimas, seguras y sin código fuente ni dependencias de desarrollo:

```
┌────────────────────────────────────────────────────────┐
│  Stage 1: builder (node:20-alpine)                     │
│  - Instala pnpm de forma global                        │
│  - Copia package.json y pnpm-lock.yaml                 │
│  - pnpm install --frozen-lockfile                      │
│  - Compila la aplicación con Vite (pnpm run build)     │
└──────────────────────────┬─────────────────────────────┘
                           │ Extrae únicamente /app/dist
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 2: producción (nginx:alpine)                    │
│  - Copia /app/dist a /usr/share/nginx/html             │
│  - Inyecta configuración de Nginx con SPA routing      │
│  - Inyecta cabeceras CORS para Module Federation       │
│  - Expone el puerto 80                                 │
└────────────────────────────────────────────────────────┘
```

### Configuración de Nginx y Cabeceras CORS
La etapa de producción inyecta una configuración específica en `/etc/nginx/conf.d/default.conf` que resuelve dos necesidades críticas:
- **Enrutamiento SPA:** `try_files $uri $uri/ /index.html;` permite que las rutas del cliente (react-router) se resuelvan adecuadamente sin responder 404 al recargar el navegador.
- **Acceso Remoto CORS:** Permite que el host del microfrontend consuma los chunks JS y manifiestos desde cualquier origen:
  ```nginx
  add_header Access-Control-Allow-Origin * always;
  add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;
  add_header Access-Control-Allow-Headers "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization" always;
  ```
- **Preflights OPTIONS:** Responde de inmediato con status `204 No Content` para solicitudes preliminares CORS del navegador.

---

## 3. Comandos para Uso Local

Si deseas probar el comportamiento exacto de producción en tu máquina local mediante Docker:

### 3.1 Construir la Imagen Localmente
Desde la raíz del repositorio `orders-frontend`:

```powershell
docker build -t orders-frontend:local .
```

> **Nota:** El archivo [`.dockerignore`](../.dockerignore) filtra automáticamente carpetas como `node_modules`, `dist`, reportes de cobertura, suites de pruebas (`tests/`, `e2e/`) y variables locales (`.env.local`), acelerando la compilación y manteniendo la imagen limpia.

### 3.2 Ejecutar el Contenedor
Arranca el contenedor mapeando el puerto 80 del contenedor al puerto `8080` (o el de tu preferencia) en tu máquina:

```powershell
docker run -d --name orders-front-preview -p 8080:80 orders-frontend:local
```

### 3.3 Verificar el Funcionamiento
- Abre tu navegador en: [http://localhost:8080](http://localhost:8080)
- Comprueba que los activos de Module Federation estén disponibles:
  ```powershell
  curl -I http://localhost:8080/assets/remoteEntry.js
  ```
  Deberás observar las cabeceras `Access-Control-Allow-Origin: *` y HTTP `200 OK`.

### 3.4 Detener y Limpiar el Contenedor
```powershell
docker stop orders-front-preview
docker rm orders-front-preview
```

---

## 4. Empaquetamiento y Publicación en CI/CD (GitHub Actions)

El repositorio cuenta con automatización completa en [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) bajo el trabajo `build-and-push`:

### Requisitos previos en el pipeline
La imagen **únicamente se compila y publica** si se cumplen las siguientes condiciones:
1. El evento es un `push` directo a la rama `main`.
2. Todos los quality gates previos han sido aprobados exitosamente:
   - `sonarcloud` (calidad de código, 0 vulnerabilidades, cobertura requerida)
   - `build-federation` (compilación libre de errores de TypeScript y Vite)
   - `e2e` (pruebas funcionales end-to-end con Playwright)
   - `a11y` (auditoría de accesibilidad WCAG con axe-core)
   - `zap-baseline` (escaneo de seguridad dinámica OWASP ZAP)

### Registro de Contenedores y Versionado
- **Registro:** GitHub Container Registry (`ghcr.io`).
- **Ruta de la Imagen:** `ghcr.io/fmat-restaurant/orderskds-frontend`
- **Etiquetado automático:**
  - `ghcr.io/fmat-restaurant/orderskds-frontend:main`
  - `ghcr.io/fmat-restaurant/orderskds-frontend:sha-<commit>`
  - Etiquetas SemVer (ej. `v1.2.0`) al crear releases oficiales.
- **Caché:** Utiliza GitHub Actions Cache (`type=gha`) para reutilizar capas de Node y dependencias entre ejecuciones, minimizando los tiempos de compilación a menos de 2 minutos.
- **Notificaciones:** Envía automáticamente un reporte a Discord informando el resultado del empaquetamiento.

---

## 5. Variables de Entorno y Configuración

Al tratarse de una Single Page Application (SPA) compilada en el cliente, las variables que inician con `VITE_` (como `VITE_API_URL` o `VITE_WS_URL`) son inyectadas durante la fase de empaquetamiento (`pnpm run build`).

Para despliegues en diferentes entornos (staging, producción):
- Se pueden configurar argumentos de compilación (`--build-arg`) en el Dockerfile si se requiere fijar endpoints estáticos.
- O preferiblemente, la arquitectura de microfrontends del restaurante permite que el host shell inyecte las configuraciones y tokens dinámicamente en tiempo de ejecución.

---

## 6. Preguntas Frecuentes y Diagnóstico

### ¿Por qué la guía anterior mencionaba PostgreSQL, Redis y RabbitMQ?
La documentación inicial contenía una plantilla heredada del backend. En la arquitectura del restaurante:
- **Backend:** Requiere contenedores para servicios de base de datos, caché y colas de mensajes.
- **Frontend:** Es una aplicación cliente en React 19 / TypeScript / Vite que se sirve como contenido estático a través de Nginx.

### El contenedor arranca pero no puedo conectarme a la API local
Si tu backend está corriendo en tu máquina fuera de Docker (en `localhost:8000`), recuerda que desde el navegador de tu computadora `localhost:8000` sigue siendo accesible directamente. Asegúrate de que las políticas de CORS del backend permitan peticiones desde el puerto donde corre tu contenedor frontend (ej. `http://localhost:8080`).

### Ver logs del contenedor Nginx
```powershell
docker logs -f orders-front-preview
```
Esto mostrará cada petición HTTP recibida por Nginx, permitiendo verificar respuestas 200, 304 o posibles 404 de archivos estáticos.
