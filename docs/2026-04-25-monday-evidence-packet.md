# Monday Evidence Packet — Quotes, History, 147-Gap Resolution

**Compiled:** 2026-04-25 PM via cross-corpus mining (v1 + v2 docs, transcripts, project memory)
**Use:** Source-of-truth backup for every claim made in Monday's email/walkthrough/ROI doc.

---

## 1. JRT as No-API Source — Confirmed

**Direct quote (04-06 validation call, 1:09:26):**

> "JRT is a carrier that doesn't have an API and currently gets uploaded via sheets."

**Direct quote (04-06 validation call, 1:09:35):**

> "For like the wells that were live dispatching, J.R.T. is gonna use sheets, and but there's a way to upload that already."

**Source files:**

- `docs/2026-04-06-validation-call-findings.md` line 316–319
- `docs/2026-04-06-workflow-architecture-v2.md` line 26 (builder pairing schema: `JRT → Keli`)

**Implication for Monday:** When walking the 27-load JRT chunk of the gap, lead with Jessica's own words. _"You told me on April 6th JRT doesn't have an API. That's why those 27 loads aren't in v2 — there's no feed to catch them. The data lives wherever Keli puts it manually."_

**Open question to ask:** "Keli shows 0 loads built last week. Was Keli out, did JRT have no work, or did her loads get reattributed to Crystal?" (Per `docs/2026-04-25-load-count-sheet-analysis.md` line 70 ambiguity.)

---

## 2. Jenny's Queue — 8 Categories Documented

**Categories that appear in the Load Count Sheet's "Other Jobs to be Invoiced (Jenny)" section:**

1. Truck Pushers (Logistix subset)
2. Truck Pushers (Liberty subset)
3. Equipment Moves
4. Flatbed Loads
5. Frac Chem
6. Finoric
7. JoeTex
8. Panel Truss

**Source files:**

- `docs/2026-04-25-load-count-sheet-analysis.md` lines 74–87
- Memory: `project_sheets_truth_source.md`

**v2 status:** Zero concept of this category today. Loads without wells fall into JotForm pending or "no-match" buckets — reframe as "Jenny's Queue."

**Open question for Monday:** "Are non-standard loads (Truck Pushers, Equipment Moves, etc.) going into manual entry today, or somewhere else? We want to give Jenny her own queue surface in v2."

---

## 3. Per-Well Naming Mismatches — Mechanism Proven, Already Resolving

**Already-resolved this week (54 loads absorbed via one-click alias workflow):**

| PropX name                               | Aliased to v2 well                       | Loads absorbed |
| ---------------------------------------- | ---------------------------------------- | -------------: |
| `Apache-Formentera-Wrangler`             | Liberty Apache Formentera Wrangler       |             34 |
| `Spectre-Crescent-SIMUL Briscoe Cochina` | Liberty Spectre Crescent Briscoe Cochina |             13 |
| `DNR-Chili-117X`                         | Liberty Titan DNR Chili 117X             |             ~7 |

**Source files:**

- `docs/2026-04-24-esexpress-validation-numbers.md` line 21
- `docs/2026-04-24-day-arc.md` lines 20–22
- `docs/2026-04-22-jessica-wells-ask.md` lines 10–14

**Today's addition:** Olympus → Greenlake alias added (1 load) for week 04/12-04/18.

**Three new wells still missing from v2 master** (would need to be created with Jessica during the demo via existing orphan_destination workflow):

- Falcon Expand Wells (361 sheet / 358 v2 raw — would close 358 of the 361 if added)
- Exco Craven 16HU (32 sheet / 27 v2 raw)
- Exco (DF-DGB) Little 6-7-8 HC (207 sheet / 228 v2 raw — v2 over-counts because of dedup leakage)

**Walk-with-Jessica moment:** open `/admin/discrepancies`, click each of the 3 orphan_destination items, walk through the "create well" form together. 5-minute live exercise.

---

## 4. Top 5 Quotable Jessica Moments — Smoking-Gun Evidence

These quotes prove the team was specing the system before there was a system. Use one per demo "exhibit."

### Quote 1 — Validation as the gate

**File:** `docs/2026-04-24-esexpress-validation-numbers.md` line 15
**Quote:** _"Nothing would go to dispatch desk until it had been validated."_
**v2 artifact:** Validate page is now the single front door. Three sections on one screen: assignments awaiting confirmation, photos without loads, loads without tickets.
**Monday line:** "You said this on April 15. Look at the Validate page — that's exactly what we built."

### Quote 2 — Photo as a hard gate

**File:** `docs/2026-04-06-validation-call-findings.md` lines 166–168 (call timestamp 14:02)
**Quote:** _"I don't feel like anything can be 100% because we don't want it to push out to PCS unless it has the photo anyways. And so I don't feel like it can be, you know, 100% without that."_
**v2 artifact:** Photo gate rule active: `isTier1 = hasAllFieldMatches && hasPhoto`. Bulk approve skips loads without confirmed photos.
**Monday line:** "You told me April 6th 'no 100% without a photo.' We made it impossible to push without one."

### Quote 3 — Date range filtering / batch workflow

**File:** `docs/2026-04-24-esexpress-validation-numbers.md` line 16
**Quote:** _"I can put in those dates in / do a day's worth at a time."_
**v2 artifact:** Validate page date filter (Today / Yesterday / This Week / Last Week / All / Custom). Defaults to Today.
**Monday line:** "You wanted to work a day at a time. Click the date filter — there it is."

### Quote 4 — Audit trail (replacing color ownership)

**File:** `docs/2026-04-06-validation-call-findings.md` lines 113–116 (Jodi at 49:46)
**Quote:** _"It shows who's done what to that. Yeah, somebody, somebody cleared the load or somebody re-dispatched the load or somebody changed the rate."_
**v2 artifact:** Audit trail in every load drawer — cleared / re-dispatched / rate-changed events tracked with user + timestamp.
**Monday line:** "You said you wanted PCS-style audit logs, not personal-color ownership. The drawer's timeline does exactly that."

### Quote 5 — Search hotkey

**File:** `docs/2026-04-06-validation-call-findings.md` lines 75–87 (Jessica at 23:15)
**Quote:** _"Is there a way to search like if I come to this and I'm not seeing the well I want?"_ and 18 seconds later _"Maybe I'm not. Oh, okay. So perfect. Forward slash. Okay. Good."_
**v2 artifact:** Search visible as a button on Validate + Workbench. `/` hotkey still works — no longer hidden.
**Monday line:** "You discovered the `/` shortcut by accident on April 6. We made it visible — you don't have to know it's there."

---

## 5. v1 History Relevant to the 147-Gap Pattern

**Key insight:** v1 ran into the same gap. Built reactive patches. Never solved root cause.

**v1 commit evidence** (from `git log --all` in `/home/jryan/projects/work/EsExpress/`):

- `9d1d6a3` feat: tiered validation, inline photos, well override
- `ab3d972` feat: WellPicker — inline well search, suggest, create
- `2e74463` fix: auto-mapper matches against all wells, not just active
- `254e308` feat: reconciliation service — 3-strategy auto-match with discrepancy detection
- `10c7975` feat: well suggestion engine with Levenshtein fuzzy matching

**v1 README premise (line 1–5):**

> "Replaces a 6–8 step manual workflow (PropX → Excel → Google Sheets → color-coding → JotForm → PCS) with a single interface: reconcile loads in EsExpress, click Push to PCS."

**Strategic reframe v2 made:**

- v1 assumed PropX/Logistiq deliver clean well names → patched matcher when they didn't
- v2 inverted: PCS becomes the truth-checker. Sheet becomes the truth-source. Matcher discrepancies are a _signal_, not a _failure_.

**Monday line:** "The previous attempt patched the matcher to fight the data. v2 lets the data prove itself by comparing your sheet, our matcher, and PCS in one place. The gap that existed in v1 still exists — but now you can see it before it costs anyone."

---

## SYNTHESIS — Monday Demo Path

Walk these in order:

1. **Open with the narrative** (`docs/2026-04-27-monday-opening-narrative.md`) — "Your team has been specing this since 2021..."
2. **Open `/admin/sheet-truth`** — show last week's parity card (1509 sheet vs 1362 v2, −147)
3. **Walk the 147 in three named buckets:**
   - 27 = JRT (Quote #1 above — Jessica's own April 6 words)
   - 103 = Jenny's Queue (8 documented categories)
   - 17 = naming mismatches (3 wells missing in v2 master — resolve LIVE in `/admin/discrepancies` orphan_destination workflow)
4. **Pivot to the 5 Jessica quotes mapped to shipped features** — each is a 60-second beat
5. **Close on the v1 reframe** — "v1 patched. v2 surfaces. Different orientation, same problem."

**Total demo:** ~25 minutes. Keep it tight.
