#!/usr/bin/env bash
# bootstrap.sh -- Orders & KDS Frontend: one-shot development environment setup
#
# Run this script once after cloning the repository.  It verifies the required
# tools, installs all dependencies with pnpm, and generates .env.local from
# .env.example.
#
# Usage (from the repository root):
#   bash scripts/bootstrap.sh
#   # or, after making it executable:
#   chmod +x scripts/bootstrap.sh && ./scripts/bootstrap.sh
#
# Prerequisites: Node.js 24 LTS and pnpm 9+ must be on your PATH.
#   Node.js : https://nodejs.org
#   pnpm    : npm install -g pnpm

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'  # no color

step()  { echo -e "\n${CYAN}==> $1${NC}"; }
ok()    { echo -e "    ${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "    ${YELLOW}[!!]${NC} $1"; }
abort() { echo -e "\n${RED}[ABORTED]${NC} $1"; exit 1; }

# ---------------------------------------------------------------------------
# Step 1 -- Verify Node.js 24+
# ---------------------------------------------------------------------------
step "Checking Node.js version"

if ! command -v node &>/dev/null; then
    abort "Node.js not found.  Install Node.js 24 LTS from https://nodejs.org"
fi

NODE_VERSION=$(node --version 2>&1)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed -n 's/v\([0-9]*\)\..*/\1/p')

if [ -z "$NODE_MAJOR" ]; then
    abort "Could not parse Node.js version from: $NODE_VERSION"
fi

if [ "$NODE_MAJOR" -lt 24 ]; then
    abort "Node.js 24+ required.  Found: $NODE_VERSION"
fi

ok "Found Node.js $NODE_VERSION"

# ---------------------------------------------------------------------------
# Step 2 -- Verify pnpm
# ---------------------------------------------------------------------------
step "Checking pnpm"

if ! command -v pnpm &>/dev/null; then
    abort "pnpm not found.  Install it with: npm install -g pnpm"
fi

PNPM_VERSION=$(pnpm --version 2>&1)
ok "Found pnpm $PNPM_VERSION"

# ---------------------------------------------------------------------------
# Step 3 -- Install dependencies
# ---------------------------------------------------------------------------
step "Installing dependencies (pnpm install --frozen-lockfile)"

pnpm install --frozen-lockfile
ok "All packages installed"

# ---------------------------------------------------------------------------
# Step 4 -- Install Playwright browsers
# ---------------------------------------------------------------------------
step "Installing Playwright browsers (Chromium and WebKit)"

pnpm exec playwright install --with-deps chromium webkit
ok "Playwright browsers installed"

# ---------------------------------------------------------------------------
# Step 5 -- Generate .env.local
# ---------------------------------------------------------------------------
step "Generating .env.local from .env.example"

if [ -f ".env.local" ]; then
    warn ".env.local already exists -- skipping generation."
    warn "Edit it manually or delete it and re-run this script to regenerate."
else
    cp .env.example .env.local
    ok ".env.local created from .env.example"
fi

# ---------------------------------------------------------------------------
# Done -- print next steps
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================"
echo -e "  Bootstrap complete!"
echo -e "========================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Edit .env.local and set the API and WebSocket URLs:"
echo -e "       ${YELLOW}VITE_API_BASE_URL=http://localhost:8080${NC}"
echo -e "       ${YELLOW}VITE_WS_URL=ws://localhost:8080/ws${NC}"
echo ""
echo "  2. Start the development server:"
echo -e "       ${YELLOW}pnpm dev${NC}"
echo ""
echo "  Dev server : http://localhost:5173"
echo ""
echo "  For the full daily workflow see QUICKSTART.md section 6."
echo ""
