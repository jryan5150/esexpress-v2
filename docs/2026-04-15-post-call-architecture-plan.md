# Post-call architecture plan — 2026-04-15

**Context:** after this morning's call with Jessica, decision is to keep
building but on a tighter, more-controlled architecture we can move
forward on without outside dependencies blocking. The flow has to
produce a PCS-ready dataset regardless of when OAuth lands on their
side.

**Guiding principle:** there is no meaningful import to PCS if the
data aggregation layer doesn't already exist, complete, and
self-healing. So we build the aggregation layer properly, own it end
to end, and let PCS attach on whenever they're ready.

---

## The four phases, in order

### Phase 1 — Ship the merged Validation/BOL Desk (today)

Mockup Frame 1 + 2 made live. Single page replacing the current
Validation + BOL Queue split. Tier 3 (needs decision) surfaced at
top with the photo + candidate loads side-by-side. Tier 2
(one-click confirm) with thumbnail visible. Tier 1 collapsed as
"auto-validated today — N." Inline BOL search at top.

**Why first:** this is the surface where humans do the training
work. Everything in Phase 3/4 flows through here. Also gives
Jessica something visible to log in and use.

### Phase 2 — JotForm → GCS ingest pipeline

Replace the JotForm-CDN-proxy path (three proxy bugs fought over
the past 48 hours) with a write-once-read-forever pipeline:

```
JotForm webhook / API pull
   ↓
Our ingest service
   ↓
Google Cloud Storage bucket: photos/{submission_id}.{ext}
   ↓
App reads GCS via existing /photos/gcs/:submissionId proxy
```

**Benefits:**

- Stable storage we own. No auth quirks, no 302 redirects, no
  vendor content-type weirdness.
- Corpus sits in GCS ready for Vertex to process (Phase 3).
- Historical backfill is a one-time script pulling the existing
  4,200+ JotForm submissions into the bucket.

### Phase 3 — Vertex rule engine + OCR at ingest time

Move the work from display-time to ingest-time.

```
New photo arrives in GCS
   ↓
Vertex AI batch job
   ↓ runs:
      • Deterministic validators (already ported to TS, port to Python/
        Vertex workflow): validateTicketNumber, validateWeight,
        validateNetTons, validateDate
      • Document AI / Gemini OCR pass for fields
      • Match cascade: ticket → load → fuzzy
   ↓
Writes back:
   • matched_load_id (if confidence high)
   • ocr_fields (structured)
   • confidence_score
   • rule_version (which prompt/rule set produced this)
   ↓
App displays results; no matching work happens at display time
```

**Key change from today:** app stops doing matching in-flight. By
the time a photo surfaces in the Validation Desk, a confidence
score and candidate match set already exist. The human's job is to
confirm or override the decision the rules already made.

### Phase 4 — Feedback loop into rule set + prompt templates

Every human action in Phase 1's Validation Desk writes back:

- **Confirm on Tier 2** → positive signal; boosts the rule weight
  that produced this match.
- **Pick a candidate on Tier 3** → strong signal; adds the
  driver→well pairing to the priors table, bumps that rule's
  prompt template version.
- **Fix BOL inline** → records `(original_ocr_bol, corrected_bol,
photo_id)` as a labeled training pair for the next Vertex
  prompt tune.
- **Reject with reason** → negative signal + structured reason
  feeds the next prompt template revision.

Each week (or on-demand), run a tune job on accumulated labels.
New prompt version gets a rule_version tag, starts running on
new photos. Old photos keep their original decisions until
re-run is triggered.

**Closed loop:** the matcher gets better every day from your team's
corrections. Mike's "waiting on it to learn" becomes "watch the
confidence curve climb week over week." That's the actual ROI
story and it's mechanical, not speculative.

---

## Why this arrangement works

1. **We stop fighting JotForm's CDN.** GCS is ours; its quirks are
   our problem to solve once, not every time we render a photo.
2. **PCS push becomes a small layer on top of this.** When OAuth
   arrives, the ingest pipeline already produced PCS-ready load
   packages — push is a submit action, not a reconciliation action.
3. **The rules live where the compute lives.** Vertex runs them,
   versions them, tracks prompt templates. We stop hand-coding
   "if BOL looks like a date, reject" logic at the application
   layer.
4. **The training signal finally loops.** Today the loop exists
   conceptually (wells.matchFeedback jsonb) but doesn't feed back
   into the matcher at a rule-set level. After Phase 4 it does.

## Timeline, honest

- **Phase 1 (Validation/BOL Desk merge):** today / this afternoon.
  Existing backend endpoints + frontend rewrite of Validation page.
- **Phase 2 (JotForm → GCS):** 1-2 days. Endpoint to accept
  JotForm webhooks, service to pull-and-upload on sync, one-time
  backfill script for historical corpus.
- **Phase 3 (Vertex rule engine):** 3-5 days. Vertex workflow
  setup, port Python validators, wire Document AI / Gemini,
  round-trip to the DB.
- **Phase 4 (feedback loop):** 2-3 days of UI + tune-job
  scaffolding. Real improvement shows up week-over-week once
  running.

Total: roughly two focused weeks of engineering to get to a system
that's genuinely self-improving without external dependencies.
PCS push on top of that is ~1 additional week once credentials
land.

---

_This plan is the technical answer to "what happens while we wait
on PCS." The answer is: we build the thing PCS attaches to, and
when they're ready, the attachment is trivial._
