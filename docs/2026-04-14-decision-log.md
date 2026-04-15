# Decision Log — 2026-04-14

One-paragraph-each record of the judgment calls made this session. Not a
progress report; a log of moments where options were weighed and one was
chosen. Written for future-you (or a future engineer) to understand why
things look the way they do.

---

## D-01. Separating the two Postgres services instead of collapsing them

**Context.** Discovered mid-morning that the Railway project has two
Postgres plugins (`Postgres` + `Postgres-gywY`), created 10 min apart on
2026-03-31. The local `.env` had been pointing at the phantom (`-gywY`)
for ~2 weeks; all `npm run db:migrate` runs since then had drifted the
phantom while the real `Postgres` (which the deployed backend uses)
stayed at migration 0002.

**Options weighed.**

1. Keep both, fix .env, apply migrations to real prod — zero data loss,
   minor cleanup debt
2. Delete `-gywY`, consolidate — simpler but risky without audit
3. Migrate data from phantom to real prod — unnecessary (phantom had 11
   test rows, no real data)

**Chose option 1.** Took pg_dump of real prod (8.9MB safety net),
updated .env, applied migrations 0003-0007 to real prod, redeployed.
Phantom remains but is documented and pointed away from.

**Why it matters.** The drift was silent — sync ran, matched records,
but every INSERT threw "column does not exist" because backend code
referenced columns (weight_lbs, historical_complete, match_audit) that
only existed in the phantom. Circuit breaker tripped. The fix taught
us: always verify which DB you're hitting before a migration.

---

## D-02. Scheduler user_id: 0 → 1 instead of creating a system user

**Context.** Auto-mapper scheduler was passing `systemUserId: 0` to
`createAssignment`. Users table has no row 0; FK violation; every
scheduled auto-map silently failed for 12+ days. 6,092 loads had
accumulated without assignments.

**Options weighed.**

1. Insert `INSERT INTO users (id=0, ...)` — non-idiomatic, fights seq
2. Create dedicated `system@esexpressllc.com` user + switch scheduler
3. Point scheduler at existing user id=1 (jryan@esexpress.com)

**Chose option 3** for expediency. Noted in scheduler comment that
option 2 is the proper fix post-MVP. User was validating within hours
and the dedicated-system-user work could wait.

**Why it matters.** Shipping fast is correct when the underlying cost
is small and the alternative is blocking on polish. Option 2 is
tracked; will land when user-invite flow (O-12) is built.

---

## D-03. Raising ERA_CUTOFF from 2026-01-01 to 2026-04-01

**Context.** After discovering Jan-Mar PropX/Logistiq loads were
actively dispatched outside v2 (via PCS, during build), they shouldn't
count as validation-queue work. Initial cutoff was Jan 1.

**Options weighed.**

1. Leave Jan 1, mark pre-Jan 1 archive — doesn't match reality
2. Raise cutoff to Apr 1 — every pre-April load becomes archive
3. Per-source cutoff — too clever for the actual data

**Chose option 2.** One-time SQL backfill flipped 18,178 Jan-Mar loads
to `historical_complete=true`. Plus updated `ERA_CUTOFF` constant in
code for future sync consistency. Validation queue dropped 31,239 → ~3,074.

**Why it matters.** The "looks like real work to do" number is what
Jessica sees. If it lies (shows dispatched loads as pending), every
other metric on the page is suspect. Fix the foundation, the rest falls
in line.

---

## D-04. Merge Jared's branch rather than cherry-pick

**Context.** User wanted logo + cobalt palette + collapsible sidebar
from `frontend-with-logo` branch. Branch was 8 days old; main had
absorbed all Round 4 work. Three files overlapped.

**Options weighed.**

1. Preview-deploy Jared's branch standalone (option A) — user tried,
   Vercel preview auth fought us
2. Cherry-pick just the logo asset + Login.tsx (option B) — shipped
   partial
3. Full 3-way merge (option C) — three overlapping files but auto-merge
   might work cleanly

**Chose option C** after B shipped the logo. Git's 3-way merge resolved
all conflicts cleanly. Verified no Round 4 feature lost (M8 BOL search
button, color coding) + all Jared's work present (cobalt, collapsible).

**Why it matters.** The merge vs cherry-pick decision is almost always
about whether the branches have diverged meaningfully. Here both had
well-scoped changes in non-overlapping files; merge was the correct
bet. When in doubt, dry-run the merge (`--no-commit --no-ff`) and let
git tell you if it's clean.

---

## D-05. Mirror Load Count Sheet colors exactly (not reinterpret)

**Context.** Team's spreadsheet "Color Key" uses saturated Google Sheets
defaults (pure green, cyan, magenta, yellow). Those colors would look
jarring against Jared's cobalt + cream UI palette.

**Options weighed.**

1. Use same hex values exactly — zero learning curve, clashes visually
2. Use same hue family but desaturate — cleaner UI, less 1:1 recognition
3. Hybrid — left-edge stripe in saturated color + pill with luminance-
   adjusted text, everything else uses refined palette

**Chose option 3.** Team gets instant visual recognition from the
stripe + pill (they recognize cyan = missing driver before reading).
The rest of the UI stays refined. Later added `pillTextColor` with Rec.
601 luminance so yellow/cyan/green pills render in near-black and
purple/magenta in white — readability without color compromise.

**Why it matters.** "Match the spreadsheet exactly" and "look good as
software" weren't actually in conflict once we found the hybrid. First-
impulse options were both wrong in isolation; the right answer
preserved both signals by scoping them differently (saturated for
status identification, refined for everything else).

---

## D-06. Validation page filters historical_complete server-side

**Context.** After raising ERA_CUTOFF, the validation queue summary
still counted 28K+ pending assignments — because the query joined
assignments without filtering the parent load's `historical_complete`
flag. UI showed a big number that wasn't work-to-do.

**Options weighed.**

1. Filter on the frontend — client-side misses count, pagination breaks
2. Delete/cancel the 27K stale pending assignments — drastic, data loss
3. Filter in the service query at the join — returns correct counts

**Chose option 3.** Added `innerJoin(loads, ...)` + `eq(loads.historicalComplete, false)`
to both the summary and tier queries. Validation queue fell 28K → 2,939.

**Why it matters.** Data surface and data source should agree. If the
number says "2,939 to validate", the table should show 2,939 items.
Filtering at the service boundary (not the UI) is the only way to keep
counts and content in sync.

---

## D-07. Inline notes via assignments.notes (existing half-wired path)

**Context.** Jessica's repeated ask for inline comments on loads ("held
for rate"). Discovered the assignments PUT route already accepted `notes`
in its schema but the column didn't exist in the table.

**Options weighed.**

1. New `load_comments` table — threaded, multi-user, future-proof
2. Reuse breadcrumbs table with `event_type='load_note'` — no schema change
3. Add `notes text` column on assignments — simplest, uses existing half-
   built endpoint

**Chose option 3.** Migration 0008 added single column; existing PUT
route started working immediately; ExpandDrawer got an editable textarea.
Future multi-user comments can migrate to a dedicated table when
threading becomes a real ask.

**Why it matters.** Half-built features in a codebase are often closer
to shipping than starting fresh. The route already accepted `notes`
because someone previously expected this would happen; completing the
thought was 1 line of schema vs 1 day of new table+routes+UI.

---

## D-08. Feedback loop via wells.matchFeedback (existing column)

**Context.** After shipping BOL manual-match UI, realized the loop was
aspirational — manual matches didn't feed back into auto-matching.
Validation page confirmations DID learn (via addWellAlias on
location_mappings) but BOL reconciliation didn't.

**Options weighed.**

1. New `match_signals` table — clean data model, requires migration
2. Reuse `wells.matchFeedback` jsonb (already exists with
   'manual_assign' action) — zero schema, minimal code
3. Machine-learning pipeline — overkill for current volume

**Chose option 2.** On manual match, append `{sourceName: driverName,
action: 'manual_assign', by, at}` to the matched well's matchFeedback.
In Tier 3 fuzzy disambiguation, query same jsonb to prefer wells with
most historical confirmations for this driver. Ships compounding
learning with no new tables.

**Why it matters.** Schema additions are expensive (migration risk, ORM
regen, operational overhead). When existing columns can carry the
signal with acceptable read/write patterns, use them. The `matchFeedback`
jsonb was literally designed for this; the `manual_assign` action was
already in the type union.

---

## D-09. Port Python validators to TypeScript, not rebuild

**Context.** Need deterministic BOL format validation to gate Tier 1
matching and surface OCR-quality signals. Existing Python implementation
in `jryan5150/bol-ocr-pipeline/lib/validators.py` is well-tested, domain-
specific, production-ready.

**Options weighed.**

1. Rebuild from scratch in TS — risks behavior drift
2. Call out to Python subprocess — latency, deploy complexity
3. Direct TypeScript port preserving function signatures — future
   interop with Bryan's Jetson output, zero runtime cost

**Chose option 3.** Ported validateTicketNumber, validateWeight,
validateNetTons, validateDate. Smoke-tested 11 edge cases (real BOLs
pass, dates/times/addresses/short-tokens fail). Kept `FIELD_VALIDATORS`
as an object mirroring the Python dict so drop-in when Jetson output
lands.

**Why it matters.** When Bryan's Jetson ships a ready-to-consume
extraction format, its fields will land in the same validator layer
without re-work. Parallel implementations of the same logic in two
languages stay in sync if the function surface stays identical; that's
cheaper than a single "shared" implementation through some IPC boundary.

---

## D-10. Two-tile photo source strategy (JotForm live, Jetson future)

**Context.** Photo pipeline has two sources: JotForm (live, working
today) and Jetson (Bryan's offline pipeline, TBD). JotForm sync had
stalled 12 days because it wasn't on cron.

**Options weighed.**

1. Wait for Jetson, then build pipeline — loses 12 days of photos, makes
   the demo today look broken
2. Stand JotForm back up + add to cron + treat as primary — ships value
   immediately, Jetson becomes additive
3. Build unified ingest that accepts either source — over-engineered for
   current scope

**Chose option 2.** Scheduled JotForm to run every 30 min, triggered
manual catch-up sync (+1,212 submissions in 24h), wired match → assignment.
photo_status. Jetson endpoint (Task #17) is planned but not blocking;
it'll feed the same matcher when sample arrives.

**Why it matters.** The tempting move when a new source is coming is to
wait and build once. The right move is usually to make the current
source first-class, prove the pipeline, and add new sources as they
arrive. Otherwise you're betting the demo on a vendor's timeline.

---

_Decisions are the portable part. Commits age; tables grow; UI changes.
Why something was built the way it was built is what lets the next
engineer make the next decision correctly._
