#!/usr/bin/env python3
"""
Bulk import JotForm weight ticket CSV exports into the v2 jotform_imports table.
Then runs auto-match against loads via the BOL operations API.

Usage:
  python3 scripts/import-jotform-csv.py /path/to/240655800307047.csv
  python3 scripts/import-jotform-csv.py  # defaults to the known weight ticket CSV
"""

import csv
import json
import sys
import urllib.request
from pathlib import Path
from datetime import datetime

API = "https://backend-production-7960.up.railway.app/api/v1"
CSV_PATH = "/tmp/jotform-csvs/240655800307047.csv"

# Field mapping from JotForm CSV to our jotform_imports schema
BOL_FIELD = "BOL #  (This is the weight ticket #)"


def login():
    req = urllib.request.Request(
        f"{API}/auth/login",
        data=json.dumps({"email": "jryan@esexpress.com", "password": "dispatch2026"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req).read())["data"]["token"]


def import_csv(token: str, csv_path: str):
    """Import weight ticket CSV rows into jotform_imports via direct DB insert endpoint."""

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Read {len(rows)} submissions from {Path(csv_path).name}")

    imported = 0
    skipped = 0
    errors = 0
    submission_ids = []

    # Use the JotForm sync endpoint doesn't work for CSV - we need to POST directly
    # Use the BOL submit endpoint? No, that's for photo uploads.
    # We need to insert into jotform_imports directly. Let's use a batch endpoint.
    # Since there's no CSV import endpoint, let's create the data and POST to a new one.

    # Actually, let's use the existing verification/bol/submissions endpoint structure
    # but for jotform_imports, we need a different approach.
    #
    # The cleanest way: POST each row as a JotForm import via a new batch endpoint.
    # But we don't have one. Let's build the payload and use a script endpoint.

    # For now: batch the rows and POST to a new import endpoint we'll create
    batch = []
    for row in rows:
        submission_id = row.get("Submission ID", "").strip()
        if not submission_id:
            skipped += 1
            continue

        first = row.get("First Name", "").strip()
        last = row.get("Last Name", "").strip()
        driver_name = f"{first} {last}".strip() if first or last else None
        truck_no = row.get("Truck #", "").strip() or None
        bol_no = row.get(BOL_FIELD, "").strip() or None
        photo_url = row.get("Weight Ticket Picture", "").strip() or None
        submitted_at = row.get("Submission Date", "").strip() or None

        batch.append({
            "jotformSubmissionId": submission_id,
            "driverName": driver_name,
            "truckNo": truck_no,
            "bolNo": bol_no,
            "photoUrl": photo_url,
            "imageUrls": [photo_url] if photo_url else [],
            "submittedAt": submitted_at,
            "status": "pending",
        })

    print(f"Prepared {len(batch)} records for import ({skipped} skipped)")

    # POST in chunks of 100
    chunk_size = 100
    for i in range(0, len(batch), chunk_size):
        chunk = batch[i:i + chunk_size]
        req = urllib.request.Request(
            f"{API}/verification/jotform/bulk-import",
            data=json.dumps({"submissions": chunk}).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            method="POST",
        )
        try:
            result = json.loads(urllib.request.urlopen(req).read())
            data = result.get("data", {})
            imported += data.get("imported", 0)
            skipped += data.get("skipped", 0)
            errors += data.get("errors", 0)
            print(f"  Chunk {i//chunk_size + 1}: imported={data.get('imported', 0)} skipped={data.get('skipped', 0)}")
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"  Chunk {i//chunk_size + 1} FAILED: {e.code} {body[:200]}")
            errors += len(chunk)

    print(f"\nImport complete: {imported} imported, {skipped} skipped, {errors} errors")
    return imported


def run_auto_match(token: str):
    """Trigger auto-matching on all unmatched JotForm imports."""
    print("\nRunning auto-match on unmatched submissions...")
    req = urllib.request.Request(
        f"{API}/verification/bol/operations/auto-match",
        data=json.dumps({}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        result = json.loads(urllib.request.urlopen(req).read())
        data = result.get("data", {})
        print(f"Auto-match: {data.get('matched', 0)} matched, {data.get('unmatched', 0)} unmatched out of {data.get('total', 0)}")
        return data
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Auto-match failed: {e.code} {body[:200]}")
        return None


def get_stats(token: str):
    """Get reconciliation stats."""
    req = urllib.request.Request(
        f"{API}/verification/bol/operations/stats",
        headers={"Authorization": f"Bearer {token}"},
    )
    result = json.loads(urllib.request.urlopen(req).read())
    data = result.get("data", {})
    print(f"\nReconciliation stats:")
    for k, v in data.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else CSV_PATH

    print("=" * 60)
    print("JotForm Weight Ticket CSV Import")
    print("=" * 60)

    token = login()
    print(f"Logged in.\n")

    count = import_csv(token, csv_file)

    if count > 0:
        run_auto_match(token)

    get_stats(token)
