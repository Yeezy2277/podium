#!/bin/bash
# Writes the Neon connection strings into apps/api/.env (git-ignored). Input is hidden, never printed.
set -euo pipefail
cd "$(dirname "$0")"
read -r -s -p "DATABASE_URL (pooled, from Vercel → Storage → Neon): " POOLED; echo
read -r -s -p "DATABASE_URL_UNPOOLED (Enter to reuse the same): " DIRECT; echo
DIRECT="${DIRECT:-$POOLED}"
umask 077
printf 'DATABASE_URL="%s"\nDATABASE_URL_UNPOOLED="%s"\n' "$POOLED" "$DIRECT" > apps/api/.env
git check-ignore -q apps/api/.env && echo "apps/api/.env written (git-ignored ✓)"
