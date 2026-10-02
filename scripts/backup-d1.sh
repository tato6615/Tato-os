#!/usr/bin/env bash
# Manual D1 backup (run from the repo root, after `npx wrangler login`).
# Output goes to ./backups/ which is git-ignored. This repo is PUBLIC: never commit a backup.
set -euo pipefail
DB="${1:-so_tato}"
mkdir -p backups
OUT="backups/${DB}-$(date -u +%Y-%m-%d_%H%M).sql"
npx wrangler d1 export "$DB" --remote --output="$OUT"
chmod 600 "$OUT"
echo "Saved $OUT ($(wc -c < "$OUT") bytes)"
echo "Move it somewhere private (e.g. encrypted drive / password manager attachment); it contains customer data."