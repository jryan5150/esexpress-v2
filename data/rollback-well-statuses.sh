#!/bin/bash
# Rollback well statuses to pre-activation state (2026-04-02)
# Restores 42 wells from active back to standby
set -e

API="https://backend-production-7960.up.railway.app/api/v1"
SNAPSHOT="$(dirname "$0")/well-status-snapshot-2026-04-02.json"

if [ ! -f "$SNAPSHOT" ]; then
  echo "Snapshot file not found: $SNAPSHOT"
  exit 1
fi

echo "Logging in..."
TOKEN=$(curl -sf "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"jryan@esexpress.com","password":"dispatch2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "Restoring well statuses from snapshot..."
python3 -c "
import json, urllib.request

token = '$TOKEN'
api = '$API'
snapshot = json.load(open('$SNAPSHOT'))

restored = 0
for w in snapshot['wells']:
    if w['original_status'] == 'standby':
        req = urllib.request.Request(
            f\"{api}/dispatch/wells/{w['id']}\",
            data=json.dumps({'status': 'standby'}).encode(),
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
            method='PUT'
        )
        urllib.request.urlopen(req)
        restored += 1
        print(f'  [{w[\"id\"]:3}] {w[\"name\"]:40} -> standby')

print(f'\nRestored {restored} wells to standby.')
"
