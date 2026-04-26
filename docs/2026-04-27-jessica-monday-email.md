# Email Draft — Monday 2026-04-27 morning to Jessica

**To:** Jessica Coon <jess@esexpressllc.com>
**From:** jryan@lexcom.com
**Subject:** ES Express v2 — your sheet, compiled
**Attachments:**

- `2026-04-24-esexpress-validation-numbers.pdf` (updated with §0b weekend changes)
- `2026-04-25-load-count-sheet-analysis.md` (deep read of the sheet structure — what we found, what we mirrored)

---

Jessica,

Quick context before Monday — this past weekend changed how v2 sees what your team does, and I want you to walk in already knowing what you'll see when you log in.

**The shift, in one paragraph.** Friday we showed you that v2 ingests cleanly. This weekend we proved something different: **v2 now reads what your team has been painting in your Load Count Sheet for four years and compiles it.** Your Color Key tab is the state machine. Your Order of Invoicing matrix is the team-routing model. Your "Other Jobs to be Invoiced (Jenny)" section is a discrete work category. Your weekly Notes are per-week metadata. v2 read all of it via service-account share — no copy-paste, no manual setup — and is now showing you the same vocabulary, on the same axes, with the same labels.

**You've been specifying this software since 2022.** The sheet was the spec. The painted colors were the lifecycle states. The Discrepancy column you compute by hand every Friday was the audit. We just had to read it carefully enough to understand what to compile against. We did.

**What you'll see when you log in to /workbench:**

- **Top strip = your Order of Invoicing matrix.** Bill To × Builder × daily counts × week total. Same numbers you would put at the bottom of every weekly tab — automated. (Caught a fourth builder we'd missed: Crystal, ~300 loads/week. Steph's row was being split because of a sand-provider mis-attribution; that's fixed too — her week now correctly shows ~914.)

- **Main canvas = your well grid.** Bill To × Wells × Sun-Sat. Each cell shows a count and a color. **The color is the same color you'd paint that cell** — derived live from the underlying load lifecycle (missing tickets / missing driver / loads being built / loads completed / loads being cleared / loads cleared / invoiced + the "need rate info" exception). When a cell disagrees with what you painted, you'll see two stripes (top = sheet, bottom = v2) so the disagreement is visible, not hidden.

- **Click any cell → drawer.** Cell summary on top (well + bill to + day + v2 status + count), then the loads in that cell as an inline table. Action button changes verbatim with the painted color: "Confirm" on `loads_being_built`, "Match BOL" on `missing_tickets`, "Assign Driver" on `missing_driver`, "Set rate on Well page" on `need_rate_info`. **Hit Confirm and the cell repaints in your color within a few seconds.** The work IS the status change.

- **Three expand-down sections (collapsed by default):**
  - **Your Inbox** — workflow-first urgency: missing photos → uncertain matches → PCS discrepancies → sheet drift. Filtered to your loads only (you'll see everything since you're the manager).
  - **Today's Intake** — last 4 hrs of BOL/JotForm landings, with manual-match expand for anything unmatched.
  - **Jenny's Queue** — the "Other Jobs to be Invoiced" section, surfaced as a category v2 understands.

**The PCS truth check.** v2 captures **96.2% of what PCS bills you for** on the carrier feeds we have ingest paths for. The 3.8% gap is two named carriers (JRT 447 loads/Q, Signal Peak 58) that don't have an API feed yet — clean engineering items, not matcher gaps. Live at `/admin/pcs-truth`. Two perfect-match weeks in Q1 (12/29 +8, 2/16 +1).

**Walk through it before our meeting if you can.** Specifically:

1. Open `/workbench`, look at the well grid for last week (`/workbench?week=2026-04-19`). Find a cell where the top stripe and bottom stripe disagree. Click it. Read me back what you'd expect to see vs what's there.
2. Open `/admin/sheet-truth` — your weekly Discrepancy column, automated. The number on the right is v2's count for the same week.
3. Open `/admin/sheet-status` — v2's read of your Color Key tab. The mismatch tally near the top is "where v2 disagrees with your paint" — that's the rule we refine next week with you.

**What I want from Monday is your eyes, not my pitch.** Where does the vocabulary still feel foreign? Where does v2 see a state your team would have painted differently? What did we get wrong about Crystal's role? Bring the disagreements — they're the rule corpus we tune from.

**Time** — same 10 AM CDT slot is held; reply if anything's shifted.

Thanks again for hanging in this week.

Jace
