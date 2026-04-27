# ES Express v2 — Monday Update

**For:** Jessica Handlin, ES Express Dispatch
**From:** Lexcom Systems
**Date:** 2026-04-27 (post-call)

---

## Where the system stands

Six weeks of build have produced a working reconciliation surface. The system reads live from your Load Count Sheet and from PCS, and surfaces where they disagree. Your team can audit any number against its source.

| Function                                      | Status                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| Read from Load Count Sheet                    | Live, every 30 minutes                                        |
| Read from PCS                                 | Live, every 15 minutes                                        |
| Read from PropX (Liberty carrier feed)        | Live                                                          |
| Read from Logistiq (Logistix IQ carrier feed) | Live                                                          |
| Driver photo intake (JotForm)                 | Live, with EXIF rotation fix for sideways photos              |
| Discrepancy detection across sources          | Live, surfaced in `/admin/discrepancies`                      |
| Per-customer reconciliation                   | Live, surfaced in `/admin/sheet-truth` and `/admin/pcs-truth` |
| Write back to PCS                             | Built; awaiting second OAuth credential set from Kyle         |
| FSC toggle per well (miles vs ton)            | Schema shipped today; rates awaiting your input               |
| Inline editing in cell drawer                 | Pattern confirmed; rolling out this week                      |

---

## The numbers — verifiable against your own data

| Metric                                           | Value                                                   | How to verify                           |
| ------------------------------------------------ | ------------------------------------------------------- | --------------------------------------- |
| Q1 2026 PCS capture (in-scope carriers)          | **96.3%**                                               | `/admin/pcs-truth`                      |
| Sheet vs v2 weekly match                         | **84-99%** depending on week                            | `/admin/sheet-truth`                    |
| Liberty wells: per-well delta vs sheet           | within **0-10 loads per well**                          | `/admin/sheet-truth` per-well breakdown |
| Photo attachment rate across 55,000+ assignments | **97%**                                                 | `/admin/discrepancies` and load detail  |
| Sync run success last 24 hours                   | **97%+**                                                | `/admin/pcs-truth`                      |
| Open discrepancies right now                     | **11** (sheet drift, orphan destinations, status drift) | `/admin/discrepancies`                  |
| Discrepancies resolved over the engagement       | **44**                                                  | Same page, resolved tab                 |

The 3.7% PCS capture gap is two carriers (JRT Trucking Inc, Signal Peak) that don't have API feeds yet. Engineering items, not matcher gaps.

---

## What we caught this weekend

While reconciling against your Load Count Sheet on Saturday night, the system identified **1,023 duplicate Logistiq load rows** across 625 unique loads. The same physical load was being ingested 2-4 times because the source-id generator was falling through to an unstable fallback every time the load's billing state changed (`New → ReadyToBill → Billed`).

The root cause was a single missing field name in the field-resolution lookup. We fixed it Sunday morning and ran the cleanup migration to consolidate the duplicates.

**The implication:** without your sheet, we wouldn't have caught this. The system depends on your sheet being correct in order to validate itself. That isn't a one-time event — that's the working relationship.

---

## How the system learns from your painted colors

You and your team paint the Load Count Sheet by status — ten colors representing the workflow stages each well/day cell passes through (loads being built, loads completed, loads being cleared, loads cleared, waiting on rate, etc.). v2 reads those colors continuously. It does **not** paint them — yet.

**Today (read-only mirror):**

- v2 ingests every painted cell into its own database every 30 minutes
- For each cell, v2 also computes the color it _would_ paint based on its own state
- Where the two agree, it's a positive signal: v2's understanding matches your team's
- Where they disagree, it surfaces as a discrepancy for your team to correct

**The transition (over the next several weeks):**

- v2 will start _suggesting_ colors next to the cells you paint, marked clearly as suggestions
- You correct or accept; every correction is captured as feedback
- After enough corrections (the system measures itself against you), the suggestions stop being suggestions and start being defaults
- Cells with high confidence auto-color; cells where v2 is uncertain stay in your hands

**The deliberate restraint:** v2 does not guess. When the matcher isn't sure, the cell stays uncolored and surfaces in the inbox for you to decide. This is the "trust but verify" pattern — v2 earns automation cell-by-cell rather than asking you to trust it wholesale on day one.

**Concrete example from today's call:** orange in your sheet means "waiting on rate." You pointed out only two wells are truly orange — the rest have rates. In v2, when you set the rate on the well, the color computation updates automatically (orange to yellow). The color is a function of the data, not a separate annotation to maintain.

**Long-term goal:** the sheet becomes the audit log of v2's painting decisions, not the source. Your team paints exceptions; v2 paints the routine. Most of the workflow is automated; the human signal goes where it adds value.

---

## What we agreed on the call

- **Inline editing in the workbench panel** — when you click a load in a cell drawer, you edit values right there without losing context. Keep this pattern.
- **FSC toggle per well, miles or weight** — added today as a schema column. You'll provide rates and per-well basis in follow-up.
- **Hide loads without photos** until photo attaches — don't clutter the worksurface with unmatched JotForm submissions; surface them in the inbox instead.
- **Five admin sheets consolidated into one easier-to-read surface** — rolling out this week.
- **System sits in the middle, bi-directionally** — between your sheet (source of truth on the dispatch side) and PCS (source of truth on the billing side). v2 ingests both, surfaces where they disagree, asks you when it's confused.

---

## What we still need from you

These three answers unblock the next development cycle. Everything else the team can audit and verify on their own.

**1. FSC math per well** — for each well that has FSC, is the calculation `rate × miles` or `rate × tons`? You said you'd pull POs and confirm with specific examples. The toggle column is in the wells table waiting for your input.

**2. Liberty(FSC) vs Liberty** — your sheet has the customer name spelled five different ways totaling 16,666 Q1 loads. PCS shows 12,362 under "Liberty Energy Services, LLC." Same customer different rate sheet, or different billing entity? Once we know, v2 either consolidates them in reporting or keeps them separate.

**3. The canonical Driver Codes sheet** — the "Driver Codes" tab on the Master Dispatch sheet we currently sync has only 45 rows. The real roster is closer to 983. Which sheet has the canonical list?

The sheet we're reading right now: [Master Dispatch](https://docs.google.com/spreadsheets/d/1VFTH6-f-7CvQJElLTs5od_SMiMaaHZ-i69D5Qh-x2Sk/edit) — open the "Driver Codes" tab to see what we have. If this is the right sheet but wrong tab, point us at the right tab. If it's the wrong sheet entirely, share the right one with the service account email above and tell us the tab name.

Once we have the canonical roster, the matcher's third-tier fallback (driver + date + weight) becomes available.

**One additional follow-up:**

**4. Liberty alias list** — confirmation of which sheet spellings consolidate to "Liberty Energy Services, LLC" in billing and which (if any) remain separate.

---

## How to share more sheets with v2

If your team uses any spreadsheet we should be reading and you haven't shared it yet, share it with the v2 service account and the next 30-minute sync will pick it up automatically.

**Email to share with:**

```
esexpress-integration@esexpress.iam.gserviceaccount.com
```

**Steps:**

1. Open the sheet in Google Sheets
2. Click **Share**
3. Paste the email above
4. Set permission to **Viewer**
5. Uncheck "Notify people"
6. Click **Send**

We currently sync your Load Count Sheet, Master Dispatch, the 1560+ Invoice sheet, and two Liberty cuts. If there's anything else, share it the same way.

---

## What's live for you to poke right now

Site is up and stable as of this writing. All admin pages return clean. Every backend endpoint is healthy and responding under 400ms.

| Surface            | What it does                                                        | Path                    |
| ------------------ | ------------------------------------------------------------------- | ----------------------- |
| Worksurface        | Well grid for the week, click any cell to drill in                  | `/workbench`            |
| Load Center        | Single-load workspace; opens when you click a load in a cell drawer | `/load-center?load=ID`  |
| Sheet Truth        | Your sheet vs v2 per week, side by side                             | `/admin/sheet-truth`    |
| PCS Truth          | Q1 capture by customer, sync health, gap attribution                | `/admin/pcs-truth`      |
| Discrepancies      | Every cross-source mismatch v2 found, with severity                 | `/admin/discrepancies`  |
| Order of Invoicing | The matrix you build by hand on Friday, automated                   | `/admin/builder-matrix` |
| Sheet Status       | The painted colors from your sheet, mapped to workflow states       | `/admin/sheet-status`   |
| Aliases            | Sheet spelling variants → canonical (you can self-edit)             | `/admin/aliases`        |
| Wells admin        | Rate, FFC, FSC, mileage editable per well                           | `/admin/wells`          |
| BOL Center         | Driver photo submissions, OCR corrections, manual match             | `/bol`                  |

**Login:** [https://app.esexpressllc.com](https://app.esexpressllc.com) — use your `jess@esexpressllc.com` account, magic-link login.

---

## Continuous shipping while you're testing

The site stays up while we keep building. Specifically:

- **You can poke any surface above right now.** No maintenance windows, no downtime planned this week.
- **Each fix or feature deploys in ~30 seconds** without taking the site offline. If you find something broken, we can ship a correction while you're still on the page.
- **If you find a bug, the fastest path is text or email** with the URL you're on and what you saw. We instrument every page so we can see what state you were in when something failed.
- **Inline editing in the Load Center workspace** ships next — probably within the day. Other refinements (consolidating the five admin sheets into one view, surfacing the colors-learning suggestions, etc.) roll out through the week.

---

## Open items beyond today's call

- **PCS write back to production** — the code path is built. Waiting on Kyle to provision a second OAuth credential set for ES (the first set was for the Hairpin read test). When the credentials land, we flip the live push without any new code.
- **JRT Trucking and Signal Peak ingestion** — no API feeds exist for those carriers in our integration today. Closing this gap moves PCS coverage from 96.3% to effectively 100%.
- **Inline editing in the Load Center workspace** — the pattern is confirmed; rolling out this week.
- **Auto-color suggestions** — the next milestone after inline editing. The learning loop above only starts producing value once you can accept/correct a suggestion in the UI.

---

## What success looks like coming out of this call

You said it best: _"if this works like we intend for it to work, one person will probably be doing all of it."_

That's the bar. The system shouldn't replicate the spreadsheet — it should make the spreadsheet less necessary, and let the dispatch team work at the higher level (deciding, not transcribing).

The reconciliation surface is live. The audit confirms what's working. The remaining build is gated on your three answers (FSC method, Liberty(FSC), Driver Codes sheet) and on Kyle's OAuth credentials.

We're un-blocked on everything else. Keep poking — we keep shipping.

---

_All numbers in this document are reproducible from production data. The reconciliation logic is auditable per row. Questions, corrections, and disagreements are all welcome — they're how the system stays honest._
