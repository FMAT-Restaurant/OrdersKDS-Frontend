# bootstrap.ps1 -- Orders & KDS Frontend: one-shot development environment setup
#
# Run this script once after cloning the repository.  It verifies the required
# tools, installs all dependencies with pnpm, and generates .env.local from
# .env.example.
#
# Usage (from the repository root):
#   .\scripts\bootstrap.ps1
#
# If PowerShell blocks execution due to policy, run first (once per machine):
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
#
# Prerequisites: Node.js 24 LTS and pnpm 9+ must be on your PATH.
#   Node.js : https://nodejs.org
#   pnpm    : npm install -g pnpm

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    [OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "    [!!] $Message" -ForegroundColor Yellow
}

function Abort {
    param([string]$Message)
    Write-Host ""
    Write-Host "[ABORTED] $Message" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Step 1 -- Verify Node.js 24+
# ---------------------------------------------------------------------------
Write-Step "Checking Node.js version"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Abort "Node.js not found.  Install Node.js 24 LTS from https://nodejs.org"
}

$nodeVersion = node --version 2>&1
if ($nodeVersion -match "v(\d+)\.") {
    $nodeMajor = [int]$Matches[1]
    if ($nodeMajor -lt 24) {
        Abort "Node.js 24+ required.  Found: $nodeVersion"
    }
    Write-Ok "Found Node.js $nodeVersion"
} else {
    Abort "Could not determine Node.js version from: $nodeVersion"
}

# ---------------------------------------------------------------------------
# Step 2 -- Verify pnpm
# ---------------------------------------------------------------------------
Write-Step "Checking pnpm"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Abort "pnpm not found.  Install it with: npm install -g pnpm"
}

$pnpmVersion = pnpm --version 2>&1
Write-Ok "Found pnpm $pnpmVersion"

# ---------------------------------------------------------------------------
# Step 3 -- Install dependencies
# ---------------------------------------------------------------------------
Write-Step "Installing dependencies (pnpm install --frozen-lockfile)"

pnpm install --frozen-lockfile
Write-Ok "All packages installed"

# ---------------------------------------------------------------------------
# Step 4 -- Install Playwright browsers
# ---------------------------------------------------------------------------
Write-Step "Installing Playwright browsers (Chromium and WebKit)"

pnpm exec playwright install --with-deps chromium webkit
Write-Ok "Playwright browsers installed"

# ---------------------------------------------------------------------------
# Step 5 -- Generate .env.local
# ---------------------------------------------------------------------------
Write-Step "Generating .env.local from .env.example"

if (Test-Path ".env.local") {
    Write-Warn ".env.local already exists -- skipping generation."
    Write-Warn "Edit it manually or delete it and re-run this script to regenerate."
} else {
    Copy-Item ".env.example" ".env.local"
    Write-Ok ".env.local created from .env.example"
}

# ---------------------------------------------------------------------------
# Done -- print next steps
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Bootstrap complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Edit .env.local and set the API and WebSocket URLs:" -ForegroundColor White
Write-Host "       VITE_API_BASE_URL=http://localhost:8080" -ForegroundColor DarkYellow
Write-Host "       VITE_WS_URL=ws://localhost:8080/ws" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "  2. Start the development server:" -ForegroundColor White
Write-Host "       pnpm dev" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "  Dev server : http://localhost:5173" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  For the full daily workflow see QUICKSTART.md section 6." -ForegroundColor White
Write-Host ""
