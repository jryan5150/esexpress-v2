#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
export PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH"
vercel deploy --prod --yes 2>&1 | tail -8
