# Load Count Sheet — Structural & Behavioral Analysis

**Sheet:** `Load Count Sheet - Daily (Billing)` (id `1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM`)
**Captured:** 2026-04-25 by `esexpress-photos@pbx-59376783.iam.gserviceaccount.com` (read-only via v2 sheets plugin, GCS-key fallback)
**Tabs:** 21 (Current + Previous + 17 dated weekly historicals back to 2022-05-23 + HOP + Color Key + Prev Thurs-Fri)
**Why this matters:** This sheet is the **single source of truth** the team has been quietly running their entire dispatch operation against for 4+ years. Every claim about "what we built this week," "what we missed," and "who built what" is reconciled here — by hand, every day, by Jess. v2 has never seen this layer until today.

---

## 1. The Headline Finding

**The status pipeline is not data. It's paint.**

The 8-stage workflow that determines whether a load is shippable, billable, or stuck — `Missing Tickets → Missing Driver → Loads being built → Loads Completed → Loads Being cleared → Loads cleared → Export (Transfers) Completed → Invoiced`, plus the exception state `Need Well Rate Info / New Loading Facility Rate` — lives in **cell background color**, not cell value. The `Color Key` tab is a literal paint legend: a column of 8 colored swatches with the workflow phase name beside each.

This is why the team's mental model never matched what we instrumented in v2:

- We see _records_. They see _colors_.
- We track _state transitions_. They look at a row and intuitively read the color block.
- We've been arguing about whether a load is "validated" or "ready to build." They've been painting cells green or yellow for years.

**Implication for v2:** to read state from this sheet via API we must call `sheets.spreadsheets.get({ includeGridData: true })` to receive the `effectiveFormat.backgroundColor` per cell, then map RGB to the legend. The pure values endpoint (`spreadsheets.values.get`) returns _nothing_ about state — and that's most of the dispatch desk's working knowledge.

---

## 2. Structural Anatomy of "Current" Tab (Today's Working Surface)

```
Cols A–B   : Well Name | Bill To
Cols C–I   : Sun | Mon | Tue | Wed | Thu | Fri | Sat   ← daily load counts per well
Cols J–O   : (buffer / blank columns)
Col  P     : Loads left over           ← carry-over from prior week
Col  Q     : Loads for the work week   ← new orders received
Col  R     : Missed load               ← NEW column on Current, not on Previous (added recently)
Col  S     : Total to build            ← P + Q
Col  T     : Total Built               ← what they actually built
Col  U     : Discrepancy               ← T − S
```

**The Discrepancy column is THEIR discrepancy detector.** They've been computing the same `expected vs actual` delta we just built into v2 — manually, in a spreadsheet, every week, since 2022-05. When we ship our `discrepancies` table to Jessica on Monday and she nods, _this is what she's nodding at._ The shape needs to mirror this surface, not introduce a new framing.

**Live week-over-week numbers we just pulled:**

|                           | Loads left over | Loads for week   | Total to build | Total Built | Discrepancy |
| ------------------------- | --------------- | ---------------- | -------------- | ----------- | ----------- |
| Previous (04/12–04/18)    | 348             | 1078             | 1426           | 1509        | **+83**     |
| Current (04/19–04/25 WIP) | 326             | (still accruing) | —              | —           | —           |

That `+83` is loaded with meaning. Built > expected = either (a) backfill from prior weeks landing in this week, (b) double-counting somewhere in attribution, or (c) loads built without a matching expected entry. Each of those maps to a distinct v2 discrepancy class. **We should ask Jessica which of these she sees most often** — that one answer scopes a real chunk of Phase 2 work.

---

## 3. The Builder Attribution Matrix (bottom-right of Current/Previous)

```
Order of Invoicing | Mon  Tues  Wed   Thur  Fri   Sat   Sun  Total
Liberty   → Scout  | 175  165   119    75   107    ·     ·    641
Logistix  → Steph  |  84   53    72    72    ·     ·     ·    281
JRT       → Keli   |   0    0     0     0    ·     ·     ·      0
          → Crystal| 119   75     0    32    73    ·     ·    299
                                                       Total: 1221
```

**Three things this matrix tells us we didn't have:**

1. **Crystal exists as a fourth builder.** CLAUDE.md and the call notes only named Scout/Steph/Keli. Crystal does ~300 loads/week (a quarter of total throughput). She may be a floater across carriers or a specialist — we need to ask. Right now v2 has no concept of her.

2. **Builder load counts are tracked daily, not just weekly.** This is operational telemetry on _people_, not just loads. Performance management lives in this same sheet. Surface implication: if v2 ever shows "loads built per builder per day," it needs to match this matrix exactly — that's how Jess will spot-check.

3. **JRT's Keli has 0 loads this week.** Either Keli is out, JRT had no work, or Keli's loads got reattributed to Crystal (notice Crystal's column shows numbers but no carrier in column to her left). The structure assumes a builder-carrier pairing that's _usually_ fixed but bleeds when needed. v2's auto-mapper assumes hard pairings. Jess works in soft pairings. **Match the soft model.**

---

## 4. The "Other Jobs to be Invoiced (Jenny)" Section

A separate queue immediately below the well grid:

```
Other Jobs to be Invoiced (Jenny)  | Bill to
Truck Pushers
Truck Pushers                       Logistix
Truck Pushers                       Liberty
```

**Jenny's queue is for non-standard work** — equipment moves, truck pushers, flatbed loads, Frac Chem, Finoric, JoeTex, Panel Truss (these all appear in historical tabs as line items). They don't fit the well-day grid because they don't have a well. v2 has zero concept of this category. Loads we don't recognize today probably end up in Jenny's queue in their world; in v2 they end up in the JotForm pending bucket or get marked "no-match." This is the missing classification.

**The rename to consider:** v2's "manual load" path should probably be reframed as "Jenny's queue" or "non-standard load" to align with their vocabulary.

---

## 5. The "Notes:" Convention at Bottom of Each Weekly Tab

From `WK of 5/23/22`:

> The Bulk loads just need to be finalized in ES Express, I will finalize in the morning 5/28/22
> The Equipment moves are waiting on billing from ATMZ

This is **week-scoped human metadata**. Context that explains anomalies in the numbers, written on Friday/Saturday for the next-week reader. v2's comment system is per-load, not per-week. **There's no surface in v2 to capture "this week's context"** — and Jess writes one every Friday. If we want the comments tab to feel native, it needs a per-week or per-day note slot, not just per-load.

---

## 6. Format Evolution — The Sheet Is a Living Document

| Weekly tab                  | Days tracked | Cols   | Notable                                                                                        |
| --------------------------- | ------------ | ------ | ---------------------------------------------------------------------------------------------- |
| `WK of 5/23/22` (genesis)   | Mon–Fri only | 27     | Notes section at bottom. No discrepancy column. No invoice attribution matrix.                 |
| `1/11`–`04/05` (~2026 H1)   | Sun–Sat      | 28     | Full grid + Builder matrix + Jenny queue. No "Missed load" column.                             |
| `Previous` (04/12–04/18)    | Sun–Sat      | 28     | Same as above. `Total to build / Total Built / Discrepancy` columns at right.                  |
| `Current` (04/19–04/25 WIP) | Sun–Sat      | **29** | **NEW: "Missed load" column inserted between "Loads for the work week" and "Total to build."** |

**The "Missed load" column was added within the last 1–2 weeks.** This is the most important behavioral finding in the entire analysis. It coincides with v2's discrepancy work going live. Two interpretations:

1. **They saw v2 catching missed loads → wanted to track them in their truth surface.** v2 is changing their workflow already.
2. **They have a recurring missed-load problem → added the column to manage it independently.** Either way, "missed load" is now a tracked metric in _their_ mental model. v2 shipping a "missed loads" surface on Monday lands directly into a slot they just carved out.

Either reading is good for Monday. Both confirm v2 is operating on top of a workflow that's already moving toward our model.

---

## 7. Hidden Identifiers (Bottom of Historical Tabs)

The `03/29` tab ends with a vertical list of `Terminal PO` numbers:

```
Terminal PO
2298602
2298602
2298601
2298601
...
```

These are 7-digit PropX terminal POs. Their existence in this sheet means **the team is hand-mapping PropX POs into the load count rollup**. Every week. We should be able to derive this automatically from PropX, but they don't trust the auto-mapping enough not to also keep their own list. Trust, here, isn't in the system — it's in the manual capture step.

---

## 8. The HOP Tab (Empty)

`HOP` exists as tab #18 with 1029 rows × 26 columns but zero content in our sample. Likely a "hopper" / staging area for paste-and-process workflow, or a deprecated layout being kept as a backup. **Don't ingest. Don't presume meaning. Ask Jessica what HOP is for** — the answer is probably either "we used to use that for X" or "that's where we paste stuff before sorting." Either way, low priority.

---

## 9. The Throughput Number That Anchors Every Argument

Pulling totals from the Balance row of the last 4 weeks of data we have access to:

| Week                                        | Total built    |
| ------------------------------------------- | -------------- |
| 03/29                                       | 1,837          |
| 04/05                                       | (need to pull) |
| 04/12 → 04/18 (Previous)                    | 1,406          |
| 04/19 → 04/25 (Current, WIP through Friday) | 1,236          |

**The business runs at ~1,400–1,800 loads/week.** That's the denominator for every claim about v2 coverage, miss rate, and impact. v2 reports 30K loads in production. If we assume 1,500/week × 50 weeks/year = 75K loads/year and v2 holds 30K, **v2 has roughly 5 months of historical depth.** This is the "what window does v2 cover" answer — and it matters for any "we caught X% of loads" claim Monday.

We should also pull _v2's_ count for week 04/12–04/18 and compare directly to their 1,509 built. If v2 says 1,510 ± a few, we have airtight discrepancy parity. If v2 says 1,200, we have a coverage gap to investigate before Monday.

---

## 10. Freudian Read — What This Sheet Reveals About How They Think

1. **Color is cognition.** They reason in _colored regions_, not in records. Anything we ship has to translate clean state into clean color or it'll feel foreign. Don't ship a 12-column status table — ship a colored grid with the same legend and they'll feel at home immediately.

2. **The sheet is the team's external memory.** Four years of weekly snapshots, archived as separate tabs, with hand-written notes per week. They don't trust software memory yet. Until they do, v2 should _export back_ into a sheet shape they can paste into the truth file each week — making v2 a feeder into their existing memory, not a replacement.

3. **Discrepancy is already the mental model.** They already think in `expected − actual`. We just spent days building this. **The win on Monday isn't "we built discrepancy detection," it's "we automated the discrepancy column you've been computing by hand for 4 years."** That's a much sharper framing.

4. **Builders are first-class entities.** Scout/Steph/Keli/Crystal show up _every week_, _every tab_, by name, with daily counts. The system tracks people doing work, not just work being done. v2 doesn't have a `builder` entity yet. We should — and the matrix above is the literal grid we should reproduce.

5. **They have non-standard work and they don't lose track of it.** Jenny's queue captures Truck Pushers, Equipment Moves, Flatbed Loads, Frac Chem, Finoric, JoeTex, Panel Truss. v2's matcher can't match these because they don't have wells. Right now they fall into our "no-match" pile. **In their world they're not no-match — they're "Jenny's queue."** The renaming is the difference between "a problem v2 created" and "a category v2 understands."

6. **They added a Missed Load column the same week we shipped discrepancy detection.** Whether it's coincidence or not, it's a leading signal that they're already adapting their workflow toward what v2 will surface. Lean into this on Monday — the conversation is "you've already started thinking this way; we're catching up to it."

7. **The legend lives in the sheet.** Every weekly tab has the Color Key embedded near the data, not just in the dedicated `Color Key` tab. They re-paste the legend everywhere because they assume someone might forget. **v2's UI should always show the legend nearby**, not behind a settings page or tooltip.

---

## 11. What v2 Should Do With This (Ranked by Leverage)

### A — Replicate the Discrepancy column (highest, smallest, ships today)

- Pull Previous + Current tabs daily.
- Sum each week's `Total Built`.
- Compare to v2's count of loads with `assignmentStatus IN ('built','reconciled')` for the same date range.
- Surface the delta as a discrepancy: `discrepancy_type='sheet-vs-v2-load-count', expected=<sheet>, actual=<v2>`.
- Render alongside the existing PCS discrepancies on `/admin/discrepancies`.
- This makes Jessica's Monday demo answer "did v2 catch this week's loads?" with a single number that matches her sheet.

### B — Driver Codes ingest (foundation)

- From `Master Dispatch` → `Driver Codes` tab (983 rows): Tractor / Trailer / Driver Code / Driver Name / Company.
- Persist to a new `driver_roster` table. Refresh nightly.
- Wire matcher Tier 3 fuzzy-match to consult this roster when JotForm submissions can't be paired with a load.
- Reduces "no-match" rate on JotForm pending; improves carrier attribution accuracy.

### C — Color (status) reading

- Switch sheets read from `values.get` to `spreadsheets.get({ includeGridData: true, fields: 'sheets(properties.title,data.rowData.values.effectiveFormat.backgroundColor)' })`.
- Map RGB → legend states from the Color Key tab.
- Now we can read _their_ status assignments and reconcile against v2's lifecycle states.
- Heaviest engineering. Save for after A and B prove value.

### D — Builder roster + daily attribution matrix

- New entity: `builder` (Scout, Steph, Keli, Crystal, +).
- New table: `builder_daily_counts` (carrier, builder, date, count).
- Reproduces the Order of Invoicing matrix. Lets Jess validate "the system shows what I show."

### E — Jenny's Queue (non-standard work)

- Rename or alias the existing manual-load surface to "Jenny's Queue" or "Non-Standard Loads" in the UI.
- Add a `category` field to manual loads: Truck Pusher / Equipment Move / Flatbed / Frac Chem / Other.
- Aligns vocabulary with their truth surface.

### F — Per-week Notes

- Add a `weekly_notes` table or comment slot keyed on (year, week-of-year).
- Surface in Workbench as a "This Week's Notes" panel.
- Mirrors the Notes section at the bottom of every weekly sheet tab.

---

## 12. What to Ask Jessica on Monday

1. **HOP** — what's it for?
2. **Crystal** — fourth builder. Carrier? Floater? When did she join?
3. **Missed Load column** — when did you add it, and why?
4. **+83 discrepancy this week** — when this number is positive (built > expected), what's usually causing it?
5. **Color Key** — has the legend changed in the last year? Are there colors in use that aren't in the Color Key tab?
6. **Notes section** — would you want v2 to capture this and email it Friday afternoon as a weekly recap?
7. **Terminal PO list** at the bottom of weekly tabs — is that something the team copies in by hand, or is it computed?
8. **Sheet-as-truth vs v2-as-truth** — when v2 and the sheet disagree, which one wins today? Which one _should_ win after Monday?

---

## Appendix — Raw Data

- `docs/2026-04-25-sheets-recon-load-count.json` — full Load Count Sheet recon (21 tabs, 50 sample rows each)
- `docs/2026-04-25-sheets-recon-master-dispatch.json` — Master Dispatch (Driver Codes + Sand Tracking included)
- `docs/2026-04-25-sheets-recon-invoice.json` — 1560+ Invoice Sheet (TEMPLATE tab with five-ID model)
- `docs/2026-04-25-sheets-recon-liberty-billing.json` — Liberty Billing Downloads (PropX direct dump format)
- `docs/2026-04-25-sheets-recon-liberty-superSnake.json` — Per-job dispatch cut

**Service account with view access:** `esexpress-photos@pbx-59376783.iam.gserviceaccount.com`
**Production endpoint:** `GET /api/v1/sheets/inspect?id=<spreadsheetId>&sample=N` (admin-gated, JSON response with tabs + headers + sample rows)
