#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
export PATH=$HOME/.nvm/versions/node/v24.13.0/bin:$PATH

# Remove DEV_MODE (already in prod)
vercel env rm DEV_MODE production --yes 2>&1 | tail -2 || true

# Push each env var (one per line in .env-to-push)
while IFS= read -r line; do
  [ -z "$line" ] && continue
  KEY="${line%%=*}"
  VAL="${line#*=}"
  # Remove any existing value first (silent fail if doesn't exist)
  vercel env rm "$KEY" production --yes >/dev/null 2>&1 || true
  printf "%s" "$VAL" | vercel env add "$KEY" production 2>&1 | tail -1
done < .env-to-push

echo "--- Deploy ---"
vercel deploy --prod --yes 2>&1 | tail -5
