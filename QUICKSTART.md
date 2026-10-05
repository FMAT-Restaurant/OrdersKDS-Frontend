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
