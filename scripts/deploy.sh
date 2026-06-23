#!/usr/bin/env bash
# One-click production deploy (with confirmation).
#   bash scripts/deploy.sh           → web app to Vercel (prod)
#   bash scripts/deploy.sh --relay   → web app + relay (Fly.io)
# See docs/DEPLOY.md for env vars + first-time relay setup.
set -euo pipefail
cd "$(dirname "$0")/.."
bold() { printf "\033[1m%s\033[0m\n" "$*"; }

read -rp "Deploy to PRODUCTION (tak-rfid-showroom.vercel.app)? [y/N] " ans
case "$ans" in y|Y) ;; *) echo "Aborted."; exit 0 ;; esac

bold "▲ Deploying web app to Vercel (prod)…"
vercel deploy --prod --yes

if [ "${1:-}" = "--relay" ]; then
  bold "🛩  Deploying relay to Fly.io…"
  ( cd relay && fly deploy )
fi

bold "✓ Done → https://tak-rfid-showroom.vercel.app"
echo "  Reminder: Settings → Media → Cloud Relay URL must point at the live relay (wss://…)."
