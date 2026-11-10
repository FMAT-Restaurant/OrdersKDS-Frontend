# QUICKSTART — Orders & KDS Frontend

- [English Version](#english-version)
- [Versión en Español](#versión-en-español)

---

## English Version

Quick reference for the CI/CD standard required by the course.
Full setup instructions are in [README.md](README.md); the contributing
workflow is in [docs/CONTRIBUTING_Frontend.md](docs/CONTRIBUTING_Frontend.md).

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
[docs/CONTRIBUTING_Frontend.md §15](docs/CONTRIBUTING_Frontend.md).

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
unit-tests
sonarcloud
build-federation
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
        ├─ lint-and-types        — gitleaks, ESLint, tsc --noEmit
        │
        └─ unit-tests            — vitest --coverage, uploads lcov.info + junit.xml
               │
               ├─ sonarcloud    — downloads artifacts, SonarCloud + Quality Gate
               │
               └─ build-federation — pnpm build, uploads federation-dist artifact
                        │
                        ├─ e2e          — Playwright (Chromium + WebKit)
                        ├─ a11y         — axe-core via Playwright
                        └─ zap-baseline — OWASP ZAP baseline against preview server (reports to Discord)

Runs after any failure:
        notify-on-failure        — Discord webhook alert

Runs only on push to main (after all checks pass):
        build-and-push           — Docker image → ghcr.io, Discord notification
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
| `tsc --noEmit` fails | Type error or missing type | Add type annotation; avoid `any` |
| `vitest` fails | Test assertion or import error | Run `pnpm run test:unit -u` locally |
| SonarCloud Quality Gate fails | Coverage < 85 % or new issues | Check the SonarCloud dashboard |
| `gitleaks` fails | Secret detected in a commit | Rotate the secret; see CONTRIBUTING §12 |
| `build-federation` fails | `vite build` error | Run `pnpm run build` locally; check `vite.config.ts` |
| `e2e` fails | Component or route broken | Run `pnpm run test:e2e` locally with `--headed` |
| `zap-baseline` fails (MEDIUM+) | Security issue in the app | Check `.zap/rules.tsv` and fix the finding |

---

### §5 — Machine requirements (install once per developer)

Every team member needs the tools below **before** running the setup steps.

#### 5.1 Required software

| Tool | Minimum version | Used for | Download |
|---|---|---|---|
| **Git** | 2.40+ | Clone, branches, commits | https://git-scm.com/downloads |
| **Docker Desktop** (includes Compose v2) | Docker 24+ | Backend services (postgres, redis, rabbitmq) when running full stack locally | https://www.docker.com/products/docker-desktop |
| **Node.js** | 24 LTS | JavaScript runtime for pnpm, Vite, Vitest, Playwright | https://nodejs.org |
| **pnpm** | 9+ | Package manager | `npm install -g pnpm` or `corepack enable && corepack prepare pnpm@latest --activate` |
| **VS Code** (recommended) | — | Editor with TypeScript and ESLint integration | https://code.visualstudio.com |

> You do **not** need Python, PostgreSQL, or any backend tooling on your
> machine to develop the frontend. The backend can be mocked using MSW
> (Mock Service Worker) while TASK-30 is implemented.

#### 5.2 VS Code extensions (recommended)

Install via the Extensions sidebar or `code --install-extension <id>`:

| Extension | ID | Purpose |
|---|---|---|
| ESLint | `dbaeumer.vscode-eslint` | Lint errors in-editor |
| Prettier | `esbenp.prettier-vscode` | Auto-format on save |
| SonarLint | `SonarSource.sonarlint-vscode` | Live quality issues (connected to SonarCloud) |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | Autocomplete for Tailwind classes |
| Playwright Test for VS Code | `ms-playwright.playwright` | Run/debug E2E tests in-editor |

#### 5.3 Windows-specific notes

1. Docker Desktop requires **WSL 2**. If it asks for it, run in an
   administrator PowerShell and restart:

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
pnpm --version          # 9.x
docker --version        # Docker version 24 or newer (optional, for full stack)
```

#### 5.5 Ports that must be free

| Port | Service |
|---|---|
| `5173` | Vite dev server |
| `4173` | Vite preview server (used by ZAP scan and Module Federation) |
| `8080` | API Gateway (backend) |

---

### §6 — Local development

#### 6.1 First-time setup (run once after cloning)

The bootstrap script verifies all prerequisites, installs dependencies with a
frozen lockfile, installs the Playwright browsers, and creates `.env.local`
from the template.

**Windows PowerShell:**

```powershell
git clone https://github.com/<org>/ordenes-kds-frontend.git
cd ordenes-kds-frontend
.\scripts\bootstrap.ps1
```

**macOS / Linux:**

```bash
git clone https://github.com/<org>/ordenes-kds-frontend.git
cd ordenes-kds-frontend
bash scripts/bootstrap.sh
```

The script prints the next steps when it finishes.  The only manual step is
editing `.env.local` to point at the backend:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws
```

Then start the dev server:

```bash
pnpm dev
# Dev harness available at http://localhost:5173
```

#### 6.2 Daily routine (every time you open the repo)

No activation step is needed (unlike the Python venv in the backend).
Open a terminal in the repository root and:

```bash
# Pull the latest changes
git pull --rebase origin develop

# Sync dependencies if package.json or pnpm-lock.yaml changed after the pull
# (safe to run always — fast no-op when nothing changed)
pnpm install --frozen-lockfile

# Start the development server
pnpm dev
```

Dev server is available at `http://localhost:5173`.

| Quick reference | Command |
|---|---|
| Run unit tests with coverage | `pnpm run test:coverage` |
| Run E2E tests | `pnpm run test:e2e` |
| Run accessibility tests | `pnpm run test:a11y` |
| Build the federation bundle | `pnpm run build` |
| Preview the built bundle | `pnpm run preview` |
| Lint | `pnpm run lint` |
| Type check | `pnpm exec tsc --noEmit` |

#### 6.3 After a dependency update (someone changed package.json)

If `pnpm-lock.yaml` changed after a `git pull`, the frozen install will fail
with a lockfile mismatch.  Run the regular install instead:

```bash
pnpm install
```

Commit the updated lockfile if you were the one adding the dependency.

#### 6.4 Working without the backend (MSW mocks)

While the backend is not yet implemented or not running locally, the frontend
uses **Mock Service Worker (MSW)** to intercept REST and WebSocket calls.
Handlers live in `src/mocks/`.  No additional configuration is required —
the dev server starts with mocks active by default when
`VITE_APP_ENV=development`.

#### 6.5 Testing the Module Federation remote

```bash
# Build the remote and serve it on port 4173
pnpm run build
pnpm run preview

# remoteEntry.js is now available at:
# http://localhost:4173/assets/remoteEntry.js
# Point the Auth Shell remote URL here during local integration.
```

#### 6.6 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm install` fails with lockfile mismatch | package.json changed | Run `pnpm install` (without `--frozen-lockfile`) |
| `pnpm dev` — port 5173 in use | Another Vite server running | Kill the other process or use `pnpm dev --port 5174` |
| TypeScript errors on start | Outdated types after `git pull` | Run `pnpm install` to update type definitions |
| E2E tests time out | Preview server not running | Ensure `pnpm run preview` is running, or check `webServer` in `playwright.config.ts` |
| `remoteEntry.js` not found | Bundle not built | Run `pnpm run build` before `pnpm run preview` |
| SonarLint shows no issues | Not connected to SonarCloud | Check `.sonarlint/connectedMode.json` and verify the token in VS Code settings |
| Playwright browsers missing | Bootstrap not run or browsers removed | Run `pnpm exec playwright install --with-deps chromium webkit` |

---

### §7 — Quick Test Environment Startup (Joint Testing with Backend, Terminal & Docker Desktop)

To run manual end-to-end functional tests (viewing real orders on the KDS board, starting preparation, marking items ready, voiding orders with the virtual keyboard, etc.), **this frontend must run alongside `orders-backend`**.

#### Step 1 — Start the Backend & Seed Data First (Terminal 1 + Docker Desktop)
Before starting the frontend, follow **§8 of the Backend `QUICKSTART.md`** in a first PowerShell window (**Terminal 1**):

1. Open **Docker Desktop** and wait until the bottom status bar shows **Engine running**.
2. In **Terminal 1** (inside `orders-backend`), run:
   ```powershell
   cd C:\path\to\orders-backend
   .\.venv\Scripts\Activate.ps1
   python scripts/setup_env.py
   docker compose up -d
   alembic upgrade head
   python scripts/seed_demo.py
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
3. Verify in **Docker Desktop → Containers** that `ordenes-postgres`, `ordenes-redis`, and `ordenes-rabbitmq` are **Running** (green dot), and leave `uvicorn` running on port `8000` in **Terminal 1**.

#### Step 2 — Configure `.env.local` in the Frontend (Terminal 2)
Open a **second PowerShell window (Terminal 2)** for the frontend.

> **Important port note:** `.env.example` defaults to `http://localhost:8080` (the API Gateway port). When testing locally directly against `orders-backend` (`uvicorn` on port `8000`) without the API Gateway, point `VITE_API_BASE_URL` and `VITE_WS_URL` to **`localhost:8000`**:

```powershell
# 1. Navigate to the frontend repository root
cd C:\path\to\orders-frontend

# 2. (First time only) If node_modules is not installed yet:
# .\scripts\bootstrap.ps1

# 3. Point .env.local to the local backend running on port 8000
Set-Content -Path .env.local -Value "VITE_API_BASE_URL=http://localhost:8000`nVITE_WS_URL=ws://localhost:8000/ws`nFEDERATION_REMOTE_URL=http://localhost:4173`nVITE_APP_ENV=development"
```

*(Optional)* By default in local development, `src/shared/api/client.ts` automatically generates a valid development JWT with the `kitchen` role. If you want to test the UI with a specific token generated by `orders-backend/scripts/dev_token.py` (for example `--role admin` or `--role chef`), add `VITE_API_TOKEN=<your-jwt>` to `.env.local`.

#### Step 3 — Start the Frontend Dev Server (Terminal 2)
In **Terminal 2**, start Vite:

```powershell
pnpm dev
```

Open **`http://localhost:5173`** in your browser.

*(Optional — Module Federation mode with Auth Shell)*: If you are testing remote integration with Team 6's Auth Shell, build and serve the federated bundle on port `4173` instead:

```powershell
pnpm run build
pnpm run preview
# Federated entry point available at: http://localhost:4173/assets/remoteEntry.js
```

#### Step 4 — Manual Testing Guide with the Seeded Orders
Once `http://localhost:5173` loads, the KDS board fetches the seeded orders from `http://localhost:8000/kds/queue`:

| Seeded Order (`seed_demo.py`) | Table | Status | Where it appears & what to test in the UI |
|---|---|---|---|
| `11111111-1111-1111-1111-111111111111` | **Table 5** | `RESERVED` | Appears in the **Activas** tab. Test clicking **"Iniciar preparación"** (or pressing `Enter` via Bump Bar) to transition it to `IN_PREPARATION`. |
| `22222222-2222-2222-2222-222222222222` | **Table 12** | `IN_PREPARATION` | Appears in the **Activas** tab with live elapsed timer and semaphore badge. Test clicking individual pending items (or pressing numeric keys `1`–`9`) to mark them `READY`, or test **Admin / Chef Void dialogs** with the on-screen virtual keyboard. |
| `33333333-3333-3333-3333-333333333333` | **Table 3** | `DELIVERED` | Switch to the **Entregadas** tab at the top of the KDS board to inspect completed orders. |
| `44444444-4444-4444-4444-444444444444` | **Table 8** | `CREATED` | Draft order (not yet in kitchen). Confirm it via Swagger (`POST /orders/{id}/confirm`) or test it with `OrderTicketWidget`. |

- **Resetting test data at any time:** If you finish testing transitions and want to restore the 4 orders to their initial state, run `python scripts/seed_demo.py --reset` in **Terminal 1** (backend) and refresh the browser.
- **Running visual Playwright E2E tests for evidence:**
  ```powershell
  # Run all E2E tests and open the HTML evidence report
  pnpm run test:e2e
  pnpm exec playwright show-report
  ```

---

---

## Versión en Español

Referencia rápida para el estándar de CI/CD requerido por el curso.
Las instrucciones completas están en [README.md](README.md); el flujo de contribución está en [docs/CONTRIBUTING_Frontend.md](docs/CONTRIBUTING_Frontend.md).

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
unit-tests
sonarcloud
build-federation
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
        ├─ lint-and-types        — gitleaks, ESLint, tsc --noEmit
        │
        └─ unit-tests            — vitest --coverage, sube lcov.info + junit.xml
               │
               ├─ sonarcloud    — descarga artefactos, SonarCloud + Quality Gate
               │
               └─ build-federation — pnpm build, sube artefacto federation-dist
                        │
                        ├─ e2e          — Playwright (Chromium + WebKit)
                        ├─ a11y         — axe-core vía Playwright
                        └─ zap-baseline — OWASP ZAP baseline contra el preview server (reporta a Discord)

Se ejecuta tras cualquier fallo:
        notify-on-failure        — alerta por webhook de Discord

Se ejecuta solo en push a main (después de que todos los checks pasen):
        build-and-push           — imagen Docker → ghcr.io, notificación a Discord
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
| `ESLint` falla | Violación de regla | Ejecuta `pnpm run lint` localmente |
| `tsc --noEmit` falla | Error de tipo o `any` | Agrega la anotación de tipo correcta |
| `vitest` falla | Assertion o import incorrecto | Ejecuta `pnpm run test:unit` localmente |
| SonarCloud Quality Gate falla | Cobertura < 85 % o nuevos issues | Revisa el dashboard de SonarCloud |
| `gitleaks` falla | Secreto detectado en un commit | Rota el secreto inmediatamente |
| `build-federation` falla | Error de `vite build` | Ejecuta `pnpm run build` localmente |
| `e2e` falla | Componente o ruta rota | Ejecuta `pnpm run test:e2e` con `--headed` |

---

### §5 — Requisitos de la máquina (instalar una sola vez por desarrollador)

#### 5.1 Software requerido

| Herramienta | Versión mínima | Para qué sirve | Descarga |
|---|---|---|---|
| **Git** | 2.40+ | Clonar, ramas, commits | https://git-scm.com/downloads |
| **Docker Desktop** (incluye Compose v2) | Docker 24+ | Servicios del backend cuando se ejecuta el stack completo localmente | https://www.docker.com/products/docker-desktop |
| **Node.js** | 24 LTS | Runtime de JavaScript para pnpm, Vite, Vitest, Playwright | https://nodejs.org |
| **pnpm** | 9+ | Manejador de paquetes | `npm install -g pnpm` |
| **VS Code** (recomendado) | — | Editor con integración de TypeScript y ESLint | https://code.visualstudio.com |

> **No necesitas** instalar Python, PostgreSQL ni ninguna herramienta del backend para desarrollar el frontend. El backend se puede simular con MSW (Mock Service Worker) mientras se implementa TASK-30.

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
pnpm --version          # 9.x
```

#### 5.4 Puertos que deben estar libres

| Puerto | Servicio |
|---|---|
| `5173` | Servidor de desarrollo Vite |
| `4173` | Servidor de preview Vite (usado por ZAP y Module Federation) |
| `8080` | API Gateway (backend) |

---

### §6 — Desarrollo local

#### 6.1 Configuracion inicial (ejecutar una sola vez al clonar el repo)

El script de bootstrap verifica todos los prerequisitos, instala las
dependencias con lockfile fijo, instala los navegadores de Playwright
y crea `.env.local` desde la plantilla.

**Windows PowerShell:**

```powershell
git clone https://github.com/<org>/ordenes-kds-frontend.git
cd ordenes-kds-frontend
.\scripts\bootstrap.ps1
```

**macOS / Linux:**

```bash
git clone https://github.com/<org>/ordenes-kds-frontend.git
cd ordenes-kds-frontend
bash scripts/bootstrap.sh
```

El script imprime los proximos pasos al terminar.  El unico paso manual es
editar `.env.local` para apuntar al backend:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws
```

Luego inicia el servidor de desarrollo:

```bash
pnpm dev
# Dev harness disponible en http://localhost:5173
```

#### 6.2 Rutina diaria (cada vez que abres el repo)

No se necesita activar ningun entorno virtual (a diferencia del backend con Python).
Abre una terminal en la raiz del repositorio y:

```bash
# Traer los ultimos cambios
git pull --rebase origin develop

# Sincronizar dependencias si package.json o pnpm-lock.yaml cambiaron
# (seguro ejecutar siempre — muy rapido si no hay cambios)
pnpm install --frozen-lockfile

# Iniciar el servidor de desarrollo
pnpm dev
```

El servidor de desarrollo estara disponible en `http://localhost:5173`.

| Referencia rapida | Comando |
|---|---|
| Pruebas unitarias con cobertura | `pnpm run test:coverage` |
| Pruebas E2E | `pnpm run test:e2e` |
| Pruebas de accesibilidad | `pnpm run test:a11y` |
| Construir el bundle de federacion | `pnpm run build` |
| Previsualizar el bundle | `pnpm run preview` |
| Lint | `pnpm run lint` |
| Verificacion de tipos | `pnpm exec tsc --noEmit` |

#### 6.3 Despues de que alguien actualizo dependencias

Si `pnpm-lock.yaml` cambio despues de un `git pull`, el install con lockfile
fijo fallara. En ese caso ejecuta el install normal:

```bash
pnpm install
```

Haz commit del lockfile actualizado si fuiste tu quien agrego la dependencia.

#### 6.4 Trabajar sin el backend (mocks MSW)

Mientras el backend no esta implementado o no esta corriendo localmente, el frontend
usa **Mock Service Worker (MSW)** para interceptar llamadas REST y WebSocket.
Los handlers viven en `src/mocks/`.  No se requiere configuracion adicional —
el servidor de desarrollo inicia con mocks activos por defecto cuando
`VITE_APP_ENV=development`.

#### 6.5 Probar el remoto de Module Federation

```bash
# Construir el remoto y servirlo en el puerto 4173
pnpm run build
pnpm run preview

# remoteEntry.js disponible en:
# http://localhost:4173/assets/remoteEntry.js
# Apunta la URL del remoto del Auth Shell aqui durante la integracion local.
```

#### 6.6 Problemas frecuentes

| Sintoma | Causa probable | Solucion |
|---|---|---|
| `pnpm install` falla por lockfile | package.json cambio | Ejecuta `pnpm install` (sin `--frozen-lockfile`) |
| `pnpm dev` — puerto 5173 en uso | Otro servidor Vite corriendo | Cierra el otro proceso o usa `pnpm dev --port 5174` |
| Errores de TypeScript al iniciar | Tipos desactualizados tras `git pull` | Ejecuta `pnpm install` |
| Pruebas E2E dan timeout | Servidor de preview no corriendo | Asegurate de que `pnpm run preview` este corriendo |
| `remoteEntry.js` no encontrado | Bundle no construido | Ejecuta `pnpm run build` antes de `pnpm run preview` |
| SonarLint no muestra issues | No conectado a SonarCloud | Verifica `.sonarlint/connectedMode.json` |
| Navegadores de Playwright faltantes | Bootstrap no ejecutado | Ejecuta `pnpm exec playwright install --with-deps chromium webkit` |

---

### §7 — Inicio de entorno rápido para pruebas manuales (en conjunto con el Backend, Terminal y Docker Desktop)

Para realizar pruebas manuales de funcionamiento de punta a punta en el Frontend (visualizar comandas reales en el tablero KDS, iniciar preparación, marcar platillos como listos, anular comandas con el teclado virtual, etc.), **es indispensable levantar primero en conjunto el repositorio `orders-backend`**.

#### Paso 1 — Levantar primero el Backend y sus datos de prueba (Terminal 1 + Docker Desktop)
Antes de iniciar el frontend, sigue la sección **§8 del `QUICKSTART.md` del repositorio `orders-backend`** en una primera ventana de PowerShell (**Terminal 1**):

1. Abre la aplicación **Docker Desktop** y espera a que la esquina inferior izquierda muestre el indicador en verde **Engine running**.
2. En la **Terminal 1** (ubicada en `orders-backend`), ejecuta paso a paso:
   ```powershell
   # 1. Entrar al repositorio del backend y activar su entorno virtual de Python (.venv)
   cd C:\ruta\a\orders-backend
   .\.venv\Scripts\Activate.ps1

   # 2. Asegurar el archivo .env y levantar PostgreSQL, Redis y RabbitMQ en Docker
   python scripts/setup_env.py
   docker compose up -d

   # 3. Correr migraciones e inyectar las 4 órdenes y el catálogo de prueba (seed)
   alembic upgrade head
   python scripts/seed_demo.py

   # 4. Dejar corriendo el servidor de la API en el puerto 8000
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
3. Verifica en **Docker Desktop → Containers** (desplegando `orders-backend`) que los 3 contenedores (`ordenes-postgres`, `ordenes-redis` y `ordenes-rabbitmq`) estén en estado **Running** (círculo verde), y **deja la Terminal 1 abierta** con `uvicorn` corriendo.

#### Paso 2 — Configurar `.env.local` en el Frontend para apuntar al Backend (Terminal 2)
Abre una **segunda ventana de PowerShell (Terminal 2)** para manejar el frontend.

> **Nota importante sobre el puerto:** La plantilla `.env.example` apunta por defecto a `http://localhost:8080` (el puerto del API Gateway). Cuando pruebas localmente conectando el frontend directo contra tu `orders-backend` (`uvicorn` en el puerto `8000`), debes apuntar `VITE_API_BASE_URL` y `VITE_WS_URL` a **`localhost:8000`**:

```powershell
# 1. Entrar a la carpeta raíz del repositorio frontend
cd C:\ruta\a\orders-frontend

# 2. (Solo la primera vez) Si aún no están instaladas las dependencias o Playwright:
# .\scripts\bootstrap.ps1

# 3. Configurar .env.local apuntando al puerto 8000 de tu backend local
Set-Content -Path .env.local -Value "VITE_API_BASE_URL=http://localhost:8000`nVITE_WS_URL=ws://localhost:8000/ws`nFEDERATION_REMOTE_URL=http://localhost:4173`nVITE_APP_ENV=development"
```

*(Opcional — Cambiar el rol del token JWT en el Frontend)*: En desarrollo local, `src/shared/api/client.ts` genera automáticamente un token JWT válido con rol `kitchen`. Si deseas probar la interfaz con un token específico generado por `orders-backend/scripts/dev_token.py` (por ejemplo `--role admin` o `--role chef`), puedes agregar la línea `VITE_API_TOKEN=<tu-token>` dentro de `.env.local`.

#### Paso 3 — Levantar el servidor del Frontend en la Terminal 2
En la **Terminal 2**, inicia el servidor de desarrollo de Vite:

```powershell
pnpm dev
```

Abre en tu navegador **`http://localhost:5173`**.

*(Opcional — Modo Module Federation con el Auth Shell)*: Si van a probar la integración del micro-frontend remoto cargándolo desde el *Auth Shell* (Equipo 6), compila y sirve el paquete federado en el puerto `4173`:

```powershell
pnpm run build
pnpm run preview
# El archivo federado quedará expuesto en: http://localhost:4173/assets/remoteEntry.js
```

#### Paso 4 — Cómo realizar las pruebas manuales en el KDS (con los datos de `seed_demo.py`)
Al abrir **`http://localhost:5173`**, el tablero KDS consultará `http://localhost:8000/kds/queue` y mostrará automáticamente las órdenes insertadas por `seed_demo.py`:

| Orden de prueba (`seed_demo.py`) | Mesa | Estado Inicial | Dónde aparece en el KDS y qué probar |
|---|---|---|---|
| `11111111-1111-1111-1111-111111111111` | **Mesa 5** | `RESERVED` | Aparece en la pestaña **Activas**. Prueba hacer clic en el botón **"Iniciar preparación"** (o presionar `Enter` con el Bump Bar) para pasarla a `IN_PREPARATION`. |
| `22222222-2222-2222-2222-222222222222` | **Mesa 12** | `IN_PREPARATION` | Aparece en la pestaña **Activas** con cronómetro en vivo y semáforo. Prueba marcar platillos pendientes como listos (clic táctil sobre el platillo o teclas numéricas `1`–`9`), o abrir los diálogos de **Anulación Admin / Anulación Chef** con teclado virtual en pantalla. |
| `33333333-3333-3333-3333-333333333333` | **Mesa 3** | `DELIVERED` | Haz clic en la pestaña superior **Entregadas** del tablero KDS para visualizar las órdenes terminadas por cocina. |
| `44444444-4444-4444-4444-444444444444` | **Mesa 8** | `CREATED` | Orden en borrador (aún no confirmada hacia cocina). Puedes confirmarla o editarla desde Swagger (`http://localhost:8000/docs`) o mediante el `OrderTicketWidget`. |

- **Cómo reiniciar los datos de prueba en cualquier momento:**
  Si durante la demostración ya marcaste como listas o anulaste las órdenes en pantalla y quieres volver a empezar, ve a la **Terminal 1** (`orders-backend`), ejecuta:
  ```powershell
  python scripts/seed_demo.py --reset
  ```
  y recarga `http://localhost:5173` en el navegador.
- **Cómo mostrar evidencia de pruebas E2E automatizadas (Playwright) y pruebas unitarias (Vitest):**
  En la **Terminal 2** (`orders-frontend`) puedes ejecutar:
  ```powershell
  # 1. Ejecutar todas las pruebas unitarias y de componentes
  pnpm run test:unit

  # 2. Ejecutar las pruebas End-to-End con Playwright y abrir el reporte visual en el navegador
  pnpm run test:e2e
  pnpm exec playwright show-report
  ```
