#!/usr/bin/env bash
# One-click local dev: sets up (only what's missing) and runs the web app + RFID relay together.
#   bash scripts/dev.sh        (or: npm run dev:all)
# Ctrl+C stops both. Unix/macOS (bash). On Windows use the manual steps in docs/LOCAL.md.
set -euo pipefail
cd "$(dirname "$0")/.."
bold() { printf "\033[1m%s\033[0m\n" "$*"; }

# 1) .env — create from the example on first run, then stop so you can fill it in.
if [ ! -f .env ]; then
  cp .env.example .env
  bold "⚠  Created .env from .env.example."
  echo "   Fill in DATABASE_URL (session pooler :5432) and JWT_SECRET, then re-run."
  exit 1
fi

# 2) dependencies (app + relay), only if missing
[ -d node_modules ]       || { bold "Installing app dependencies…";   npm install; }
[ -d relay/node_modules ] || { bold "Installing relay dependencies…"; ( cd relay && npm install ); }

# 3) database schema + Prisma client
bold "Syncing database schema…"
npm run db:push
npm run db:generate >/dev/null

# 4) admin login — only if there are no users yet
HAS_USER=$(node -e 'require("dotenv").config({quiet:true});const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.user.count().then(n=>{process.stdout.write(String(n));return p.$disconnect();}).catch(()=>process.stdout.write("err"))')
if [ "$HAS_USER" = "0" ]; then
  bold "Creating admin login (admin / admin1234)…"
  npm run setup:admin
fi

# 5) run relay (:8081) + web app (:3000) together; Ctrl+C stops both
trap 'kill 0' EXIT INT TERM
if ss -ltn 2>/dev/null | grep -q ':8081\b'; then
  bold "↻ Relay already running on :8081 — reusing it."
else
  bold "Starting relay on :8081…"
  node relay/server.js &
fi
bold "Starting web app on http://localhost:3000  (Ctrl+C to stop)"
npm run dev
