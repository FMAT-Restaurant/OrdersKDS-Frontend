# QUICKSTART — Orders & KDS Frontend

- [English Version](#english-version)
- [Versión en Español](#versión-en-español)

---

## English Version

Quick reference for the CI/CD standard required by the course.
Full setup instructions are in [README.md](README.md); the contributing
workflow is in [docs/CONTRIBUTING_Frontend.md](docs/CONTRIBUTING_Frontend.md).
Docker setup (standard single image + optional dual-remote `cocinaApp` build)
is in [docs/GUIA_DOCKER.md](docs/GUIA_DOCKER.md).

---

### §1 — Repository prerequisites

Before the CI/CD pipeline can run successfully, a maintainer must configure
the following once per repository.

#### 1.1 GitHub Actions permissions

`Settings → Actions → General → Workflow permissions`

Select **Read and write permissions** and save. This is required by the
`build-and-push` job in `ci.yml`, which publishes images to GHCR and needs
`packages: write`.

#### 1.2 Secrets

`Settings → Secrets and variables → Actions → New repository secret`

| Secret name | Where to get it | Required by |
|---|---|---|
| `SONAR_TOKEN` | SonarCloud → My Account → Security → Generate Token (type: **User Token**) | `sonarcloud` job |
| `DISCORD_WEBHOOK_ALERTS` | Discord → Channel Settings → Integrations → Webhooks → Copy URL (Alerts channel) | `notify-on-failure` job and release failure alerts |
| `DISCORD_WEBHOOK_REPORTS` | Discord → Channel Settings → Integrations → Webhooks → Copy URL (Reports channel) | `e2e` (Playwright) and `zap-baseline` jobs |
| `DISCORD_WEBHOOK_RELEASES` | Discord → Channel Settings → Integrations → Webhooks → Copy URL (Releases channel) | `build-and-push` job (Docker image release notifications) |

`GITHUB_TOKEN` is injected automatically by GitHub Actions — **do not create it**.

---

### §2 — Branch protection

Branch protection is configured in `Settings → Branches` (or Rulesets) for
**both** `develop` and `main`. The full rule set is documented in
[docs/CONTRIBUTING_Frontend.md](docs/CONTRIBUTING_Frontend.md).

Summary:

| Rule | `develop` | `main` |
|---|:---:|:---:|
| Require PR before merge | ✅ | ✅ |
| Required approvals | ≥ 1 | ≥ 1 |
| Dismiss stale approvals on new commits | ✅ | ✅ |
| Require resolved conversations | ✅ | ✅ |
| Require status checks (CI green) | ✅ | ✅ |
| Require branch up to date | ✅ | ✅ |
| No direct push, no force push | ✅ | ✅ |
| No branch deletion | ✅ | ✅ |
| Merge method | Squash only | Merge commit only |

**Required status checks** — job names to add in the selector:

```
lint-and-types
build-federation
unit-tests
sonarcloud
e2e
a11y
zap-baseline
```

> **Note:** Status check names only appear in GitHub's selector after the
> workflow has run at least once on that branch. Mark them after
> TASK-02 completes its first successful run.

Also enable **Automatically delete head branches** in
`Settings → General → Pull Requests`.

---

### §3 — CI workflow overview

File: `.github/workflows/ci.yml`

```
push/PR to develop or main
        │
        ├─ validate-pr          (PR only) — branch name + Conventional Commits title
        └─ lint-and-types       — gitleaks, ESLint, tsc --noEmit
                │
                └─ build-federation — pnpm run build (uploads federation-dist)
                        │
                        ├─ unit-tests   — pnpm run test:coverage → sonarcloud
                        ├─ e2e          — Playwright (Chromium + WebKit)
                        ├─ a11y         — axe-core via Playwright
                        └─ zap-baseline — OWASP ZAP baseline on preview (:4173)

Runs after any failure:
        notify-on-failure       — Discord webhook alert

Runs only on push to main (after all checks pass):
        build-and-push          — Docker image → ghcr.io, Discord notification
```

---

### §4 — Diagnosing a failing job

1. Go to **Actions** (tab at the top of the repository).
2. Click the failing workflow run.
3. Click the red ❌ job name in the left panel.
4. Expand the failing step to read the log.
5. For coverage and test reports: scroll to the bottom of the run page and
   open the **Artifacts** section. Download `unit-test-results` and open
   `coverage/index.html` in a browser for a line-by-line coverage view.

Common failures and fixes:

| Symptom | Likely cause | Fix |
|---|---|---|
| `ESLint` fails | Rule violation | Run `pnpm run lint --fix` locally |
| `tsc --noEmit` fails | Type error or missing type | Run `pnpm exec tsc --noEmit` locally and add proper types |
| `vitest` fails | Test assertion or missing `dist/` | Run `pnpm run build && pnpm run test:unit` locally |
| SonarCloud Quality Gate fails | Coverage < 85 % or new issues | Check the SonarCloud dashboard |
| `gitleaks` fails | Secret detected in a commit | Rotate the secret; see `docs/CONTRIBUTING_Frontend.md` |
| `build-federation` fails | `vite build` error | Run `pnpm run build` and `pnpm run build:cocina` locally |
| `e2e` fails | Component or route broken | Run `pnpm run test:e2e` locally with `--headed` |
| `zap-baseline` fails (MEDIUM+) | Security issue in headers/app | Check `.zap/rules.tsv` and `vite.config.ts` headers |

---

### §5 — Machine requirements (install once per developer)

Every team member needs the tools below **before** running the setup steps.

#### 5.1 Required software

| Tool | Minimum version | Used for | Download |
|---|---|---|---|
| **Git** | 2.40+ | Clone, branches, commits | https://git-scm.com/downloads |
| **Docker Desktop** (includes Compose v2) | Docker 24+ | Backend services (`orders-backend`) and optional Nginx container build | https://www.docker.com/products/docker-desktop |
| **Node.js** | 24 LTS | JavaScript runtime for pnpm, Vite, Vitest, Playwright | https://nodejs.org |
| **pnpm** | 9+ (pinned `12.18.0` via Corepack/CI) | Package manager | `corepack enable` or `npm install -g pnpm` |
| **VS Code** (recommended) | — | Editor with TypeScript and ESLint integration | https://code.visualstudio.com |

> You do **not** need Python or PostgreSQL to run unit/E2E tests against MSW/Playwright mocks. To test real end-to-end flows, run `orders-backend` locally or in Docker (see §7).

#### 5.2 VS Code extensions (recommended)

| Extension | ID | Purpose |
|---|---|---|
| ESLint | `dbaeumer.vscode-eslint` | Lint errors in-editor |
| Prettier | `esbenp.prettier-vscode` | Auto-format on save |
| SonarLint | `SonarSource.sonarlint-vscode` | Live quality issues |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | Autocomplete for Tailwind classes |
| Playwright Test for VS Code | `ms-playwright.playwright` | Run/debug E2E tests in-editor |

#### 5.3 Windows-specific notes

1. Docker Desktop requires **WSL 2**. If prompted, run in an administrator PowerShell and restart:
   ```powershell
   wsl --install
   ```
2. If PowerShell blocks scripts, run once per machine:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

#### 5.4 Verify the installation

```powershell
git --version           # 2.40 or newer
node --version          # v24.x
pnpm --version          # 9.x or 12.x
docker --version        # Docker version 24 or newer (needed for backend/container testing)
```

#### 5.5 Ports that must be free

| Port | Service |
|---|---|
| `5177` | `ordenesApp` Vite dev / preview server (`http://localhost:5177`) |
| `5179` | `cocinaApp` Vite dev / preview server (`http://localhost:5179`) |
| `8000` | `orders-backend` / Kong API Gateway (`REST` + `WebSocket`) |
| `4173` | Optional CI `zap-baseline` preview port |

---

### §6 — Local development

#### 6.1 First-time setup (run once after cloning)

The bootstrap script verifies Node.js 24+ and pnpm, installs dependencies with `--frozen-lockfile`, installs Playwright Chromium + WebKit browsers, and creates `.env.local` from `.env.example`.

**Windows PowerShell:**

```powershell
git clone https://github.com/FMAT-Restaurant/OrdersKDS-Frontend.git
cd OrdersKDS-Frontend
.\scripts\bootstrap.ps1
```

**macOS / Linux:**

```bash
git clone https://github.com/FMAT-Restaurant/OrdersKDS-Frontend.git
cd OrdersKDS-Frontend
bash scripts/bootstrap.sh
```

`.env.example` already configures `auto` mode (`VITE_API_BASE_URL=auto`, `VITE_WS_URL=auto`), which resolves automatically to `http://<current-host>:8000/api/v1/orders` (for `ordenesApp`) or `/api/v1/kitchen` (for `cocinaApp`).

Start the dev server:

```bash
pnpm dev
# Available at http://localhost:5177
```

#### 6.2 Daily routine

No virtual environment activation is needed:

```bash
git pull --rebase origin develop
pnpm install --frozen-lockfile
pnpm dev
```

| Quick reference | Command |
|---|---|
| Start dev server (`ordenesApp`, port `5177`) | `pnpm dev` |
| Build `ordenesApp` (`dist/`) | `pnpm run build` |
| Build `cocinaApp` (`dist-cocina/`) | `pnpm run build:cocina` |
| Build + preview `ordenesApp` (`:5177`) | `pnpm run dev:federation` |
| Build + preview `cocinaApp` (`:5179`) | `pnpm run dev:federation:cocina` |
| Run unit tests | `pnpm run test:unit` |
| Run unit tests with coverage | `pnpm run test:coverage` |
| Run E2E tests (Chromium + WebKit) | `pnpm run test:e2e` |
| Run accessibility tests (`axe-core`) | `pnpm run test:a11y` |
| Lint | `pnpm run lint` |
| Type check | `pnpm exec tsc --noEmit` |

#### 6.3 After a dependency update

If `pnpm-lock.yaml` changed after a `git pull`, run `pnpm install` (without `--frozen-lockfile` only when you are updating dependencies) and commit the lockfile if you added the package.

#### 6.4 Working without the backend (Dev Sandbox & MSW)

- **Automated tests (Vitest / Playwright):** MSW handlers and fixtures live in `tests/mocks/` and `e2e/fixtures/`.
- **Interactive local sandbox:** When running standalone without a Shell session, `DevSandboxApp` (`src/DevSandboxApp.tsx` + `src/features/dev-sandbox/mockSandboxFetch.ts`) provides role/view switching (`Admin`, `Chef`, `Cocinero`, `Mesero`) and simulated flows.

#### 6.5 Testing Module Federation remotes (`ordenesApp` & `cocinaApp`)

With `@originjs/vite-plugin-federation`, `remoteEntry.js` is emitted during build:

```bash
# Terminal 1 — Waiter / Orders remote (ordenesApp on :5177)
pnpm run dev:federation
# Exposed at: http://localhost:5177/assets/remoteEntry.js

# Terminal 2 — Kitchen remote (cocinaApp on :5179)
pnpm run dev:federation:cocina
# Exposed at: http://localhost:5179/assets/remoteEntry.js
```

#### 6.6 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm install` fails with lockfile mismatch | `package.json` changed | Run `pnpm install` |
| `css-scoping.test.ts` fails during `test:unit` | `dist/` has not been built yet | Run `pnpm run build` before `pnpm run test:unit` |
| `pnpm preview` — port `5177` or `5179` in use | Another Vite server running | Stop the conflicting process (`strictPort: true`) |
| `remoteEntry.js` returns 404 | Bundle not built | Run `pnpm run dev:federation` or `pnpm run dev:federation:cocina` |
| Playwright browsers missing | Bootstrap not run | Run `pnpm exec playwright install --with-deps chromium webkit` |

---

### §7 — Exact Step-by-Step Joint Testing Guide (Frontend + `orders-backend` + Docker)

To test real end-to-end flows (real PostgreSQL persistence, Redis catalog, RabbitMQ Saga events, and live WebSocket push), run **`orders-backend`** and **`orders-frontend`** together.

#### Step 0 — Optional: Build and Run the Frontend Docker Container

In normal local or standalone Docker usage, you only need **1 single Docker image** (`orders-frontend:latest`). The [`Dockerfile`](Dockerfile) uses `node:20-alpine` (with Corepack + `pnpm@12.18.0`) and `nginxinc/nginx-unprivileged:alpine` listening on unprivileged port `8080`, and that single image already bundles all **5 modules** (`./App`, `./KdsApp`, `./OrderTicketWidget`, `./ReadyOrdersAlert`, `./IntermediateDishesApp`) so both Waiter and Kitchen views work from one container.

```powershell
cd C:\path\to\orders-frontend

# 1. Build and run the single frontend image on http://localhost:5177
docker build -t orders-frontend:latest .
docker rm -f orders-frontend 2>$null
docker run -d --name orders-frontend -p 5177:8080 orders-frontend:latest

# 2. Verify app and Module Federation manifest respond 200 OK
curl -I http://localhost:5177/
curl -I http://localhost:5177/assets/remoteEntry.js
```

> **Optional / Advanced — Separate `cocinaApp` image (`:5179`, only for 6-module Auth Shell + Kong dual-remote integration `INT-06`/`INT-07`):**
> `vite.config.ts` sets the Module Federation remote name (`ordenesApp` vs `cocinaApp`) and default Kong API prefix (`/api/v1/orders` vs `/api/v1/kitchen`) at build time. Only when integrating with the **Auth Shell + Kong** team setup that explicitly loads two separate remotes (`ordenesApp` on `:5177` and `cocinaApp` on `:5179`), also build the kitchen remote image:
> ```powershell
> docker build --build-arg BUILD_MODE=cocina -t cocina-frontend:latest .
> docker rm -f cocina-frontend 2>$null
> docker run -d --name cocina-frontend -p 5179:8080 cocina-frontend:latest
> curl -I http://localhost:5179/assets/remoteEntry.js
> ```

#### Step 1 — Start `orders-backend` First (Terminals 1 & 2 + Docker Desktop)

1. Open **Docker Desktop** and wait for **Engine running**.
2. In **Terminal 1** (`orders-backend`):
   ```powershell
   cd C:\path\to\orders-backend
   .\.venv\Scripts\Activate.ps1
   python scripts/setup_env.py
   docker compose up -d postgres redis rabbitmq
   docker compose ps
   alembic upgrade head
   python scripts/seed_demo.py --reset
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   *(You can also start all 6 backend containers with `docker-compose.ci.yml` — see `orders-backend/QUICKSTART.md §8 Mode B`. Remember `seed_demo.py --reset` generates **fresh random UUIDv4s** and prints the 8 seeded `OrderId`s in stdout.)*
3. In **Terminal 2** (`orders-backend`), start the background workers so outbox events, Saga timeout (60 s), RabbitMQ consumers, and live WebSocket updates work:
   ```powershell
   cd C:\path\to\orders-backend
   .\.venv\Scripts\Activate.ps1
   python -m app.workers.run_all
   ```

#### Step 2 — Configure `.env.local` in `orders-frontend` (Terminal 3)

```powershell
cd C:\path\to\orders-frontend

# First time only (if node_modules is not installed yet):
# .\scripts\bootstrap.ps1

# Copy .env.example (already sets VITE_API_BASE_URL=auto and VITE_WS_URL=auto for :8000)
Copy-Item .env.example .env.local -Force
```

> **How `auto` works:** `resolveDefaultApiBaseUrl()` and `resolveDefaultWsBaseUrl()` automatically target `http://<host>:8000/api/v1/orders` (`ws://.../api/v1/orders`) in standard mode and `http://<host>:8000/api/v1/kitchen` in `cocina` mode. You can override them explicitly in `.env.local` if connecting to a remote host or Kong Gateway on another port.

#### Step 3 — Start the Frontend (Terminal 3)

```powershell
# Development server (HMR) on http://localhost:5177
pnpm dev

# Or serve built Module Federation remote locally:
# pnpm run dev:federation         -> http://localhost:5177
```

#### Step 4 — Manual Verification with Seeded Data (`seed_demo.py --reset`)

Each `seed_demo.py` run assigns **new random UUIDv4 IDs** printed in Terminal 1 (`OrderId: <uuid>`) and visible in the KDS cards / `GET /orders` by Shift **Folio (`#1`–`#8`)**:

| Folio | Location | Initial Status | Where it appears & what to test |
|---|---|---|---|
| `#1` | **Mesa 5** | `RESERVED` | **Activas** tab in KDS. Click **"Iniciar preparación"** (or press `Enter`) → moves to `IN_PREPARATION`. |
| `#2` | **Mesa 12** | `IN_PREPARATION` | **Activas** tab with live timer. Mark items `READY` (touch or keys `1`–`9`), or test Admin/Chef void dialogs with the virtual keyboard. |
| `#3` | **Mesa 3** | `DELIVERED` | **Entregadas** tab in KDS (`view=delivered`). Test dish redo (`PATCH .../items/{itemId}/redo`) or request bill (`POST .../request-bill`). |
| `#4` | **Mesa 8** | `CREATED` | Draft order in `OrderTicketWidget`. Edit items, confirm (`POST .../confirm`), or cancel (`PATCH .../cancel`). |
| `#5` | **Para llevar** | `CREATED` | Takeaway draft order (`isTakeaway: true`) for testing confirm / RabbitMQ Saga. |
| `#6` | **Mesa 15** | `RESERVED` | Multi-station items (`parrilla` + `fria`) for KDS station selector filtering. |
| `#7` | **Mesa 9** | `REJECTED` | Shows `rejectionDetails` in `OrderTicketWidget` for modification or cancellation. |
| `#8` | **Mesa 11** | `RESERVED` | Reserved > 15 min ago; appears in the **"Caducados"** KDS tab with 10 min grace countdown. |

Reset seeded state with fresh random UUIDv4s at any time from **Terminal 1** (`orders-backend`):
```powershell
python scripts/seed_demo.py --reset
```

Run automated verification suites from **Terminal 3** (`orders-frontend`):
```powershell
pnpm run build
pnpm run test:unit
pnpm run test:e2e
pnpm run test:a11y
```

---
---

## Versión en Español

Referencia rápida para el estándar de CI/CD requerido por el curso.
Las instrucciones completas están en [README.md](README.md); el flujo de contribución está en [docs/CONTRIBUTING_Frontend.md](docs/CONTRIBUTING_Frontend.md).
La configuración Docker (imagen única estándar + build dual opcional para `cocinaApp`) está en [docs/GUIA_DOCKER.md](docs/GUIA_DOCKER.md).

---

### §1 — Requisitos previos del repositorio

Antes de que el pipeline de CI/CD pueda ejecutarse, un mantenedor debe configurar lo siguiente una sola vez por repositorio.

#### 1.1 Permisos de GitHub Actions

`Settings → Actions → General → Workflow permissions`

Selecciona **Read and write permissions** y guarda. Esto es requerido por el job `build-and-push` en `ci.yml`, que publica imágenes a GHCR y necesita `packages: write`.

#### 1.2 Secretos

`Settings → Secrets and variables → Actions → New repository secret`

| Nombre del secreto | Dónde obtenerlo | Requerido por |
|---|---|---|
| `SONAR_TOKEN` | SonarCloud → My Account → Security → Generate Token (tipo: **User Token**) | Job `sonarcloud` |
| `DISCORD_WEBHOOK_ALERTS` | Discord → Ajustes del canal → Integraciones → Webhooks → Copiar URL (Canal de Alertas) | Job `notify-on-failure` y alertas de fallo al empaquetar |
| `DISCORD_WEBHOOK_REPORTS` | Discord → Ajustes del canal → Integraciones → Webhooks → Copiar URL (Canal de Reportes) | Jobs `e2e` (Playwright) y `zap-baseline` |
| `DISCORD_WEBHOOK_RELEASES` | Discord → Ajustes del canal → Integraciones → Webhooks → Copiar URL (Canal de Releases) | Job `build-and-push` (notificación de éxito al empaquetar Docker) |

`GITHUB_TOKEN` es inyectado automáticamente por GitHub Actions — **no lo crees**.

---

### §2 — Protección de ramas

La protección de ramas se configura en `Settings → Branches` para **ambas** ramas `develop` y `main`. Las reglas completas están en [docs/CONTRIBUTING_Frontend.md](docs/CONTRIBUTING_Frontend.md).

Resumen:

| Regla | `develop` | `main` |
|---|:---:|:---:|
| Requerir PR antes del merge | ✅ | ✅ |
| Aprobaciones requeridas | ≥ 1 | ≥ 1 |
| Descartar aprobaciones en nuevos commits | ✅ | ✅ |
| Requerir conversaciones resueltas | ✅ | ✅ |
| Requerir comprobaciones de estado (CI en verde) | ✅ | ✅ |
| Requerir que la rama esté actualizada | ✅ | ✅ |
| Sin direct push, sin force push | ✅ | ✅ |
| Sin borrado de rama | ✅ | ✅ |
| Método de merge | Solo Squash | Solo Merge commit |

**Comprobaciones de estado requeridas** — nombres de jobs a agregar en el selector:

```
lint-and-types
build-federation
unit-tests
sonarcloud
e2e
a11y
zap-baseline
```

> **Nota:** Los nombres de status checks solo aparecen en el selector de GitHub después de que el workflow se ejecute al menos una vez en esa rama. Márcalos después de que TASK-02 complete su primera ejecución exitosa.

Activa también **Automatically delete head branches** en `Settings → General → Pull Requests`.

---

### §3 — Resumen del workflow de CI

Archivo: `.github/workflows/ci.yml`

```
push/PR a develop o main
        │
        ├─ validate-pr          (solo PR) — nombre de rama + título Conventional Commits
        └─ lint-and-types       — gitleaks, ESLint, tsc --noEmit
                │
                └─ build-federation — pnpm run build (sube artefacto federation-dist)
                        │
                        ├─ unit-tests   — pnpm run test:coverage → sonarcloud
                        ├─ e2e          — Playwright (Chromium + WebKit)
                        ├─ a11y         — axe-core vía Playwright
                        └─ zap-baseline — OWASP ZAP baseline contra preview (:4173)

Se ejecuta tras cualquier fallo:
        notify-on-failure       — alerta por webhook de Discord

Se ejecuta solo en push a main (después de que todos los checks pasen):
        build-and-push          — imagen Docker → ghcr.io, notificación a Discord
```

---

### §4 — Diagnóstico de un job fallido

1. Ve a **Actions** (pestaña en la parte superior del repositorio).
2. Haz clic en la ejecución del workflow fallida.
3. Haz clic en el job con ❌ en el panel izquierdo.
4. Expande el step fallido para leer el log.
5. Para cobertura y reportes de pruebas: baja hasta la sección **Artifacts** y descarga `unit-test-results`.

Fallos comunes y soluciones:

| Síntoma | Causa probable | Solución |
|---|---|---|
| `ESLint` falla | Violación de regla | Ejecuta `pnpm run lint --fix` localmente |
| `tsc --noEmit` falla | Error de tipo o `any` | Ejecuta `pnpm exec tsc --noEmit` localmente |
| `vitest` falla | Aserción incorrecta o falta `dist/` | Ejecuta `pnpm run build && pnpm run test:unit` localmente |
| SonarCloud Quality Gate falla | Cobertura < 85 % o nuevos issues | Revisa el dashboard de SonarCloud |
| `gitleaks` falla | Secreto detectado en un commit | Rota el secreto inmediatamente |
| `build-federation` falla | Error de `vite build` | Ejecuta `pnpm run build` y `pnpm run build:cocina` localmente |
| `e2e` falla | Componente o ruta rota | Ejecuta `pnpm run test:e2e` con `--headed` |
| `zap-baseline` falla (MEDIUM+) | Cabeceras o configuración de seguridad | Revisa `.zap/rules.tsv` y `vite.config.ts` |

---

### §5 — Requisitos de la máquina (instalar una sola vez por desarrollador)

#### 5.1 Software requerido

| Herramienta | Versión mínima | Para qué sirve | Descarga |
|---|---|---|---|
| **Git** | 2.40+ | Clonar, ramas, commits | https://git-scm.com/downloads |
| **Docker Desktop** (incluye Compose v2) | Docker 24+ | Servicios de `orders-backend` y empaquetamiento Docker opcional | https://www.docker.com/products/docker-desktop |
| **Node.js** | 24 LTS | Runtime de JavaScript para pnpm, Vite, Vitest, Playwright | https://nodejs.org |
| **pnpm** | 9+ (fijado `12.18.0` vía Corepack/CI) | Manejador de paquetes | `corepack enable` o `npm install -g pnpm` |
| **VS Code** (recomendado) | — | Editor con integración de TypeScript y ESLint | https://code.visualstudio.com |

> **No necesitas** instalar Python ni PostgreSQL para correr pruebas unitarias o E2E con mocks MSW/Playwright. Para probar flujos reales de punta a punta, levanta `orders-backend` (ver §7).

#### 5.2 Notas específicas de Windows

1. Docker Desktop requiere **WSL 2**. Si lo solicita, ejecuta en PowerShell como administrador y reinicia:
   ```powershell
   wsl --install
   ```
2. Si PowerShell bloquea scripts, ejecuta una vez por máquina:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

#### 5.3 Verificar la instalación

```powershell
git --version           # 2.40 o superior
node --version          # v24.x
pnpm --version          # 9.x o 12.x
docker --version        # Docker version 24 o superior (para backend / contenedores)
```

#### 5.4 Puertos que deben estar libres

| Puerto | Servicio |
|---|---|
| `5177` | Servidor Vite dev / preview de `ordenesApp` (`http://localhost:5177`) |
| `5179` | Servidor Vite dev / preview de `cocinaApp` (`http://localhost:5179`) |
| `8000` | `orders-backend` / API Gateway Kong (`REST` + `WebSocket`) |
| `4173` | Puerto temporal usado por `zap-baseline` en CI |

---

### §6 — Desarrollo local

#### 6.1 Configuración inicial (ejecutar una sola vez al clonar el repo)

El script de bootstrap verifica Node.js 24+ y pnpm, instala las dependencias con `--frozen-lockfile`, instala los navegadores de Playwright (Chromium y WebKit) y crea `.env.local` desde `.env.example`.

**Windows PowerShell:**

```powershell
git clone https://github.com/FMAT-Restaurant/OrdersKDS-Frontend.git
cd OrdersKDS-Frontend
.\scripts\bootstrap.ps1
```

**macOS / Linux:**

```bash
git clone https://github.com/FMAT-Restaurant/OrdersKDS-Frontend.git
cd OrdersKDS-Frontend
bash scripts/bootstrap.sh
```

`.env.example` ya viene configurado en modo `auto` (`VITE_API_BASE_URL=auto`, `VITE_WS_URL=auto`), resolviendo automáticamente hacia `http://<host-actual>:8000/api/v1/orders` (para `ordenesApp`) o `/api/v1/kitchen` (para `cocinaApp`).

Inicia el servidor de desarrollo:

```bash
pnpm dev
# Disponible en http://localhost:5177
```

#### 6.2 Rutina diaria

No se necesita activar ningún entorno virtual:

```bash
git pull --rebase origin develop
pnpm install --frozen-lockfile
pnpm dev
```

| Referencia rápida | Comando |
|---|---|
| Servidor de desarrollo (`ordenesApp`, puerto `5177`) | `pnpm dev` |
| Compilar `ordenesApp` (`dist/`) | `pnpm run build` |
| Compilar `cocinaApp` (`dist-cocina/`) | `pnpm run build:cocina` |
| Compilar y previsualizar `ordenesApp` (`:5177`) | `pnpm run dev:federation` |
| Compilar y previsualizar `cocinaApp` (`:5179`) | `pnpm run dev:federation:cocina` |
| Pruebas unitarias | `pnpm run test:unit` |
| Pruebas unitarias con cobertura | `pnpm run test:coverage` |
| Pruebas E2E (Chromium + WebKit) | `pnpm run test:e2e` |
| Pruebas de accesibilidad (`axe-core`) | `pnpm run test:a11y` |
| Lint | `pnpm run lint` |
| Verificación de tipos | `pnpm exec tsc --noEmit` |

#### 6.3 Después de actualizar dependencias

Si `pnpm-lock.yaml` cambió tras un `git pull`, ejecuta `pnpm install` (sin `--frozen-lockfile` solo si tú agregaste/actualizaste dependencias) y haz commit del lockfile actualizado.

#### 6.4 Trabajar sin el backend (Sandbox de desarrollo y MSW)

- **Pruebas automatizadas (Vitest / Playwright):** Los handlers y fixtures MSW viven en `tests/mocks/` y `e2e/fixtures/`.
- **Sandbox interactivo local:** Al abrir la app sin sesión del Shell, `DevSandboxApp` (`src/DevSandboxApp.tsx` + `src/features/dev-sandbox/mockSandboxFetch.ts`) ofrece selector de rol/vista y datos simulados en memoria.

#### 6.5 Probar los remotos de Module Federation (`ordenesApp` y `cocinaApp`)

Con `@originjs/vite-plugin-federation`, `remoteEntry.js` se genera al compilar:

```bash
# Terminal 1 — Remoto de Órdenes / Mesero (ordenesApp en :5177)
pnpm run dev:federation
# Disponible en: http://localhost:5177/assets/remoteEntry.js

# Terminal 2 — Remoto de Cocina (cocinaApp en :5179)
pnpm run dev:federation:cocina
# Disponible en: http://localhost:5179/assets/remoteEntry.js
```

#### 6.6 Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `pnpm install` falla por lockfile | `package.json` cambió | Ejecuta `pnpm install` |
| `css-scoping.test.ts` falla en `test:unit` | No se ha generado `dist/` aún | Ejecuta `pnpm run build` antes de `pnpm run test:unit` |
| `pnpm preview` falla por puerto `5177` o `5179` | Otro proceso usa el puerto | Detén el otro proceso (`strictPort: true`) |
| `remoteEntry.js` responde 404 | Bundle no compilado | Ejecuta `pnpm run dev:federation` o `pnpm run dev:federation:cocina` |
| Navegadores de Playwright faltantes | Bootstrap no ejecutado | Ejecuta `pnpm exec playwright install --with-deps chromium webkit` |

---

### §7 — Guía Exacta Paso a Paso para Pruebas en Conjunto (Frontend + `orders-backend` + Docker)

Para probar flujos reales de punta a punta (PostgreSQL real, catálogo en Redis, Saga por RabbitMQ y push WebSocket en vivo), levanta **`orders-backend`** y **`orders-frontend`** siguiendo estos pasos en orden.

#### Paso 0 — Opcional: Empaquetar y Levantar el Contenedor Docker del Frontend (1 sola imagen)

Para uso local o en contenedor independiente solo necesitas **1 única imagen Docker** (`orders-frontend:latest`). El [`Dockerfile`](Dockerfile) multi-etapa compila con `node:20-alpine` (Corepack + `pnpm@12.18.0`) y sirve con `nginxinc/nginx-unprivileged:alpine` en el puerto `8080`, incluyendo en el mismo contenedor los **5 módulos federados** (`./App`, `./KdsApp`, `./OrderTicketWidget`, `./ReadyOrdersAlert`, `./IntermediateDishesApp`) para operar tanto vista de Mesero como KDS de Cocina.

```powershell
cd C:\ruta\a\orders-frontend

# 1. Construir y levantar la imagen única en http://localhost:5177
docker build -t orders-frontend:latest .
docker rm -f orders-frontend 2>$null
docker run -d --name orders-frontend -p 5177:8080 orders-frontend:latest

# 2. Verificar que la app y el manifiesto de Module Federation respondan 200 OK
curl -I http://localhost:5177/
curl -I http://localhost:5177/assets/remoteEntry.js
```

> **Opcional / Avanzado — Segunda imagen separada `cocinaApp` (`:5179`, solo para integración dual con Shell de Auth + Kong `INT-06`/`INT-07`):**
> `vite.config.ts` define en tiempo de compilación el nombre del remoto (`ordenesApp` vs `cocinaApp`) y el prefijo de API detrás de Kong (`/api/v1/orders` vs `/api/v1/kitchen`). Solo cuando integres con el **Auth Shell + Kong** que consume dos remotos por separado (`ordenesApp` en `:5177` y `cocinaApp` en `:5179`), compila también la imagen de cocina:
> ```powershell
> docker build --build-arg BUILD_MODE=cocina -t cocina-frontend:latest .
> docker rm -f cocina-frontend 2>$null
> docker run -d --name cocina-frontend -p 5179:8080 cocina-frontend:latest
> curl -I http://localhost:5179/assets/remoteEntry.js
> ```

#### Paso 1 — Levantar Primero `orders-backend` y sus Datos Demo (Terminales 1 y 2 + Docker Desktop)

1. Abre **Docker Desktop** y espera el indicador verde **Engine running**.
2. En **Terminal 1** (`orders-backend`):
   ```powershell
   cd C:\ruta\a\orders-backend
   .\.venv\Scripts\Activate.ps1
   python scripts/setup_env.py
   docker compose up -d postgres redis rabbitmq
   docker compose ps
   alembic upgrade head
   python scripts/seed_demo.py --reset
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   *(También puedes levantar los 6 contenedores del backend con `docker-compose.ci.yml`; ver `orders-backend/QUICKSTART.md §8 Modo B`. Recuerda que `seed_demo.py --reset` genera **UUIDv4 aleatorios nuevos** e imprime los 8 `OrderId` en consola.)*
3. En **Terminal 2** (`orders-backend`), inicia los workers en segundo plano para que el outbox, el watcher de 60 s, RabbitMQ y el puente WebSocket funcionen en vivo:
   ```powershell
   cd C:\ruta\a\orders-backend
   .\.venv\Scripts\Activate.ps1
   python -m app.workers.run_all
   ```

#### Paso 2 — Configurar `.env.local` en `orders-frontend` (Terminal 3)

```powershell
cd C:\ruta\a\orders-frontend

# Solo la primera vez (si aún no instalaste dependencias):
# .\scripts\bootstrap.ps1

# Copiar .env.example (ya usa VITE_API_BASE_URL=auto y VITE_WS_URL=auto hacia :8000)
Copy-Item .env.example .env.local -Force
```

> **Cómo funciona `auto`:** `resolveDefaultApiBaseUrl()` y `resolveDefaultWsBaseUrl()` apuntan automáticamente a `http://<host-actual>:8000/api/v1/orders` en modo normal y a `http://<host-actual>:8000/api/v1/kitchen` en modo `cocina`. Si necesitas apuntar a otro host o puerto, define las URLs explícitamente en `.env.local`.

#### Paso 3 — Levantar el Frontend (Terminal 3)

```powershell
# Servidor de desarrollo (HMR) en http://localhost:5177
pnpm dev

# O servir el remoto compilado de Module Federation:
# pnpm run dev:federation         -> http://localhost:5177
```

#### Paso 4 — Pruebas Manuales con los Datos Sembrados (`seed_demo.py --reset`)

Cada ejecución de `seed_demo.py` genera **UUIDv4 aleatorios nuevos** visibles en la Terminal 1 (`OrderId: <uuid>`) y en las tarjetas del KDS / `GET /orders` identificados por su **Folio de turno (`#1`–`#8`)**:

| Folio | Mesa | Estado Inicial | Dónde aparece en el KDS / Widget y qué probar |
|---|---|---|---|
| `#1` | **Mesa 5** | `RESERVED` | Pestaña **Activas** del KDS. Pulsa **"Iniciar preparación"** (o `Enter`) → pasa a `IN_PREPARATION`. |
| `#2` | **Mesa 12** | `IN_PREPARATION` | Pestaña **Activas** con cronómetro. Marca ítems `READY` (táctil o teclas `1`–`9`) o prueba diálogos de anulación Admin/Chef con teclado virtual. |
| `#3` | **Mesa 3** | `DELIVERED` | Pestaña **Entregadas** del KDS (`view=delivered`). Prueba rehechura (`PATCH .../items/{itemId}/redo`) o solicitud de cuenta (`POST .../request-bill`). |
| `#4` | **Mesa 8** | `CREATED` | Borrador en `OrderTicketWidget`. Edita platillos, confirma (`POST .../confirm`) o cancela (`PATCH .../cancel`). |
| `#5` | **Para llevar** | `CREATED` | Borrador para llevar (`isTakeaway: true`) para probar confirmación y Saga en RabbitMQ. |
| `#6` | **Mesa 15** | `RESERVED` | Ítems multi-estación (`parrilla` + `fria`) para probar el selector de estación del KDS. |
| `#7` | **Mesa 9** | `REJECTED` | Muestra `rejectionDetails` en `OrderTicketWidget` para modificar ítems o cancelar. |
| `#8` | **Mesa 11** | `RESERVED` | Reservada hace > 15 min; aparece en la pestaña **"Caducados"** del KDS con cuenta regresiva de 10 min de gracia. |

Reiniciar los datos (generando nuevos UUIDv4) en cualquier momento desde la **Terminal 1** (`orders-backend`):
```powershell
python scripts/seed_demo.py --reset
```

Ejecutar suites automatizadas desde la **Terminal 3** (`orders-frontend`):
```powershell
pnpm run build
pnpm run test:unit
pnpm run test:e2e
pnpm run test:a11y
```
