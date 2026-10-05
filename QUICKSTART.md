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
| `DISCORD_WEBHOOK` | Discord → Channel Settings → Integrations → Webhooks → Copy URL | `notify-on-failure` and `build-and-push` jobs |

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
                        └─ zap-baseline — OWASP ZAP baseline against preview server

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
| **Node.js** | 20 LTS | JavaScript runtime for pnpm, Vite, Vitest, Playwright | https://nodejs.org |
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
node --version          # v20.x
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

#### 6.1 First-time setup

```powershell
# 1. Clone the repository
git clone https://github.com/<org>/ordenes-kds-frontend.git
cd ordenes-kds-frontend

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local — set VITE_API_BASE_URL and VITE_WS_URL to point to the backend

# 4. Install Playwright browsers (first time only)
pnpm exec playwright install --with-deps chromium webkit

# 5. Start the development server
pnpm dev
```

The standalone dev harness will be available at `http://localhost:5173`.
It mounts each exposed module so you can develop without the Auth Shell.

#### 6.2 Daily routine

| Goal | Command |
|---|---|
| Start the dev server | `pnpm dev` |
| Run unit tests (watch) | `pnpm run test:unit` |
| Run unit tests with coverage | `pnpm run test:coverage` |
| Run E2E tests | `pnpm run test:e2e` |
| Run accessibility tests | `pnpm run test:a11y` |
| Build the federation bundle | `pnpm run build` |
| Preview the built bundle | `pnpm run preview` |
| Lint | `pnpm run lint` |
| Type check | `pnpm exec tsc --noEmit` |

#### 6.3 Working without the backend (MSW mocks)

While the backend is not yet implemented or not running locally, the frontend
uses **Mock Service Worker (MSW)** to intercept REST and WebSocket calls.
Handlers live in `src/mocks/`. Import `setupWorker` in `src/main.tsx` for
development mode.

No additional configuration is required — the dev server starts with mocks
active by default when `VITE_APP_ENV=development`.

#### 6.4 Testing the Module Federation remote

```powershell
# Build the remote and serve it on port 4173
pnpm run build
pnpm run preview

# The remoteEntry.js is now available at:
# http://localhost:4173/assets/remoteEntry.js
# Point the Auth Shell's remote URL here during local integration.
```

#### 6.5 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm install` fails | Lockfile conflict | Delete `node_modules` and `pnpm-lock.yaml`, then `pnpm install` |
| `pnpm dev` port 5173 in use | Another Vite server running | Kill the other process or use `pnpm dev --port 5174` |
| TypeScript errors on start | Outdated types after `git pull` | Run `pnpm install` to update type definitions |
| E2E tests time out | Preview server not running | Ensure `pnpm run preview` is running, or check `playwright.config.ts` `webServer` |
| `remoteEntry.js` not found | Bundle not built | Run `pnpm run build` before `pnpm run preview` |
| SonarLint shows no issues | Not connected to SonarCloud | Check `.sonarlint/connectedMode.json` and verify the `SONAR_TOKEN` in VS Code settings |

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
| `DISCORD_WEBHOOK` | Discord → Ajustes del canal → Integraciones → Webhooks → Copiar URL | Jobs `notify-on-failure` y `build-and-push` |

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
                        └─ zap-baseline — OWASP ZAP baseline contra el preview server

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
| **Node.js** | 20 LTS | Runtime de JavaScript para pnpm, Vite, Vitest, Playwright | https://nodejs.org |
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
node --version          # v20.x
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

#### 6.1 Configuración inicial

```powershell
# 1. Clonar el repositorio
git clone https://github.com/<org>/ordenes-kds-frontend.git
cd ordenes-kds-frontend

# 2. Instalar dependencias
pnpm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Edita .env.local — establece VITE_API_BASE_URL y VITE_WS_URL apuntando al backend

# 4. Instalar navegadores de Playwright (solo la primera vez)
pnpm exec playwright install --with-deps chromium webkit

# 5. Iniciar el servidor de desarrollo
pnpm dev
```

El harness de desarrollo estará disponible en `http://localhost:5173`.
Monta cada módulo expuesto para que puedas desarrollar sin el Auth Shell.

#### 6.2 Rutina diaria

| Objetivo | Comando |
|---|---|
| Iniciar el servidor de desarrollo | `pnpm dev` |
| Ejecutar pruebas unitarias (modo watch) | `pnpm run test:unit` |
| Ejecutar pruebas unitarias con cobertura | `pnpm run test:coverage` |
| Ejecutar pruebas E2E | `pnpm run test:e2e` |
| Ejecutar pruebas de accesibilidad | `pnpm run test:a11y` |
| Construir el bundle de federación | `pnpm run build` |
| Previsualizar el bundle construido | `pnpm run preview` |
| Lint | `pnpm run lint` |
| Verificación de tipos | `pnpm exec tsc --noEmit` |

#### 6.3 Trabajar sin el backend (mocks MSW)

Mientras el backend no está implementado o no está corriendo localmente, el frontend usa **Mock Service Worker (MSW)** para interceptar llamadas REST y WebSocket.
Los handlers viven en `src/mocks/`. No se requiere configuración adicional — el servidor de desarrollo inicia con mocks activos por defecto cuando `VITE_APP_ENV=development`.

#### 6.4 Probar el remoto de Module Federation

```powershell
# Construir el remoto y servirlo en el puerto 4173
pnpm run build
pnpm run preview

# remoteEntry.js disponible en:
# http://localhost:4173/assets/remoteEntry.js
# Apunta la URL del remoto del Auth Shell aquí durante la integración local.
```

#### 6.5 Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `pnpm install` falla | Conflicto de lockfile | Elimina `node_modules` y `pnpm-lock.yaml`, luego `pnpm install` |
| `pnpm dev` — puerto 5173 en uso | Otro servidor Vite corriendo | Cierra el otro proceso o usa `pnpm dev --port 5174` |
| Errores de TypeScript al iniciar | Tipos desactualizados tras `git pull` | Ejecuta `pnpm install` para actualizar las definiciones de tipos |
| Pruebas E2E dan timeout | Servidor de preview no corriendo | Asegúrate de que `pnpm run preview` esté corriendo, o revisa `webServer` en `playwright.config.ts` |
| `remoteEntry.js` no encontrado | Bundle no construido | Ejecuta `pnpm run build` antes de `pnpm run preview` |
| SonarLint no muestra issues | No conectado a SonarCloud | Verifica `.sonarlint/connectedMode.json` y el token en la configuración de VS Code |
