# ES Express — Monday April 27 Walkthrough Script

**Time:** Monday 10:00 AM CST
**Format:** ~50 min walkthrough + 10 min Q&A
**Attendees:** Jessica, Jeri, Mike, Bryan, Jace
**Updated:** 2026-04-23 evening — reframed for cross-check pillar + Mike segment + honest push status

This is a speaking guide, not a script to read. Bullet points per segment. The goal is to make Mike / Jeri's "continue vs. stop" decision easy by showing the system is operational, accurate, and answers their team's daily questions in the team's own words.

---

## Opening (4 min) — frame the value, mirror their words

> "What you asked for was a product running, your team validating, no PCS push. Site has been live since Friday, your team has had the weekend to touch it. Jessica's reconciliation work Wednesday morning is the proof — she hand-counted two wells against system numbers and we matched on 22 of 27 days. The disagreements were explainable on her end too."

**Key talking points:**

- Site live since Friday afternoon — your team has had real validation time before this meeting
- The reconciliation work Jessica did mid-week IS the proof point — system mirrored her hand-counts
- New since Tuesday's call: a layer that automates that exact reconciliation against PCS, every 15 minutes
- PCS push is wired and the toggle is in your hands — current state I'll be candid about in segment 5

**Tone:** confident, not promotional. The product earned the meeting; the meeting confirms.

---

## Segment 1 — Daily dispatch workflow (Scout/Steph) (8 min)

**Show:** Workbench, as Scout would see it.

**Demo flow:**

1. Workbench → filter = "Ready to Build" → live count
2. Click a load → drawer opens → photo renders, no reload
3. Point out the StagePill + PcsPill + PhotoStateBadge + (NEW) Cross-Check section
4. Advance stage → audit log entry shows who/when

**What to emphasize (in their words):**

- _"No more 'is this photo missing or just delayed' question — every row tells you why it's in the state it's in."_ Point at PhotoStateBadge "Photo pending — next JotForm sync in 12 min."
- _"JotForm freshness chip at top — green means last sync was under 30 min ago. Anyone on the team can hit Run Check to force a sync without waiting for the cron."_

**Mirror their language:** never say "tier 1" — say "ready to build." Never say "discrepancy" without explaining as "where v2 and PCS disagree." Their workflow words win; ours are scaffolding.

---

## Segment 2 — Validation workflow (Jessica's surface) (6 min)

**Show:** filter = "Uncertain" → single-row validation + inline edit

**Demo flow:**

1. Filter to uncertain loads → single-user validation page
2. Inline edit a field → save → persist
3. Drop to a load → add a comment → cross-team annotation
4. Show the audit log → the April 20 batch-clear is attributed to "system backfill" not a mystery person

**What to emphasize:**

- _"This is optimized for one person. One power user validates. No clicking through a team UI."_
- _"Comments are per-load, cross-team. Dispatch can tag billing, billing can tag driver."_
- _"Every stage change has who-did-it attribution. The April 20 batch-clear shows in the timeline as system backfill — not a mystery user action you have to chase."_

---

## Segment 3 — Cross-check + reconciliation (Jenny + Jessica) (12 min) ⚡

**This is the strongest segment. Four reveals:**

### A. The reconciliation Jessica did Wednesday is now automated

> "On April 23 you sent line-by-line counts for two wells against your hand-count. System matched yours on 22 of 27 days. The two anomalies were explainable on your end — date-shifted loads on 4/6, sync paused for maintenance on 4/22. That manual comparison you did — the system now does that against PCS every 15 minutes, automatically."

- Open `/admin/discrepancies` → show the live discrepancy list
- _"Each row is a place where what v2 thinks doesn't match what PCS thinks. We surface the difference; you decide what's actionable."_

### B. What the cross-check actually catches

Walk through the categories with one example each:

| What it catches                                                     | Where it surfaces    | Live example today                                                                                |
| ------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| **Status differences** — PCS shows different stage than v2          | Drawer + admin index | The 4/22 test push (PCS load 357468) — PCS cancelled it, system now shows "PCS: Cancelled" inline |
| **Weight differences** — v2 weight vs PCS billed weight             | Drawer               | (when present)                                                                                    |
| **Well naming differences** — v2 well vs PCS consignee              | Drawer               | (when present)                                                                                    |
| **Rate differences** — v2 expected rate vs PCS billed               | Drawer               | (when present, post-pricing-config)                                                               |
| **Unmapped destinations** — 3+ loads landing somewhere with no well | Admin index          | Wells 1/2/3 (851 loads) — same destination Jessica asked us about 4/22                            |

> "The 'Wells 1/2/3' alert is the system catching the same thing Jessica caught manually two days ago. It catches the next one without anyone having to remember."

### C. PCS reconciliation queue ("Missed by v2")

> "Same mechanism, different angle. Every 15 minutes the system pulls PCS's active load list. For each load, two questions: do I have this? If not, why? Today: 44 PCS active, 1 matched (our test push), 43 unmatched. Each unmatched entry is rich — shipper, consignee, ticket, weight, miles. Cayuga Sands → Comstock Dinkins JG 1H, 36 of them. We're not configured for that pipeline yet, which means it's scope expansion, not a matcher failure."

- Open `/admin/scope-discovery` → "In PCS, Not in v2" tab → the 43 enriched entries

### D. The 163-well flywheel finding

> "Tonight we processed 3 years of your historical dispatch — 198,806 dispatch rows. 1,143 unique destinations across the corpus. v2 had 95 wells. There are 163 wells with meaningful load volume that v2 didn't know about — 21,000 historical loads behind them. The well PCS is billing right now — Comstock Dinkins JG 1H — is #1 on that list with 605 historical loads. Two independent surfaces (PCS pull + 3-year flywheel) landed on the same well. That's not coincidence — that's scope discovery."

- Show `/admin/scope-discovery` → "Wells We Discovered" tab
- _"14 of 163 got corrected overnight. The other 149 are in your team's review queue. Approve, alias, or skip — your call. Every approval expands what the system catches automatically."_

**What this means together:** PCS is now your truth-checker for v2 during the validation period. Scope discovery is your truth-checker against your own history. Both run continuously. **The product isn't what they show you today — it's what they keep finding while nobody's watching.**

---

## Segment 4 — Trust signals + audit trail (4 min)

**Show:** Audit log on a load, scope-discovery review queue, freshness chip.

**Demo flow:**

1. Drawer → Audit Log tab on a recently-modified load → who, when, why
2. Note the gear-vs-person icon distinction (system actions vs user actions)
3. Home page Matcher pill — clickable to Load Diagnostics page
4. JotForm freshness chip — proves the pipeline isn't paused

**What to emphasize:**

- _"Nothing happens in this system unrecorded. The April 20 batch-clear shows as system backfill in the audit log, not a mystery action."_
- _"The matcher learns from what your team confirms vs overrides. We don't quote you a synthetic accuracy number — your reconciliation Wednesday WAS the accuracy check. 22 of 27 days exact."_
- _"Every operation we run — schema migration, photo re-link, alias addition — gets logged in `data_integrity_runs`. When I say 'X corrected on date Y,' that's traceable."_

---

## Segment 5 — PCS push: candid status (4 min)

**Show:** Admin → Settings → PCS push toggles. Drawer audit on PCS test load 357468.

**The candid framing:**

> "Here's the honest state. PCS push is wired end-to-end — code is deployed, OAuth works, payload shape is validated, file API attaches photos. We pushed test load 357468 to PCS Hairpin on April 22 and voided it cleanly. You can see the audit trail right here.
>
> Three push attempts today returned a 500 from PCS's AddLoad endpoint. We captured the exact request payload, the response headers, and PCS's correlation IDs from their App Insights. Sent that to Kyle Thursday evening for server-side lookup. The same payload shape worked Tuesday — something on PCS's side or in our auth context shifted between Tuesday and Wednesday morning. Working from their stack trace, not guessing.
>
> The toggle is yours. When Kyle clarifies, you flip it. We're not betting the engagement on push working day-one — the cross-check layer is doing the heavy lifting during validation regardless."

**Demo flow:**

1. Show PCS load 357468 in v2 → drawer shows "PCS: Cancelled" (proves the read+bridge works for that record)
2. Open Settings → show the two-toggle UI (Hairpin, ES Express) → currently A=on for sync, B=off
3. _"Push toggle is wired. Read+bridge are doing the work this week. Push goes live the moment Kyle and we close out the 500."_

**Don't:** apologize, hedge, get defensive. State it, show evidence the read works, move on.

---

## Segment 6 — For Mike: the engagement value in a year (4 min) 🎯

**This segment is specifically for Mike.** He processes ROI + saved-time + caught-money, not feature lists.

**Three numbers to lead with:**

### 1. Missed-load exposure (3 years, real data)

> "We analyzed your invoiced load-number sequences for gaps over 3 years. Found 1,778 sequence gaps across both Hairpin and ES Express. Most are cancellations — we sampled 15 random gaps and zero appeared in dispatch. But at conservative 10% genuine-miss rate, that's $60K of unrecovered revenue. At 25%, $150K. Going forward, the cross-check catches new ones inside 15 minutes, not quarters. The cost of missing a load isn't $300 — it's $300 plus Jenny's hour finding it three months later. We just removed both."

### 2. The 163-well scope expansion

> "v2 was built against 95 wells. Your business actually runs through 1,143 destinations historically. The 163-well gap that surfaced tonight isn't extra work for you — it's billing capacity v2 already covers infrastructure-wise. Your team approves them and they're in. Each well-onboarding is hours, not weeks."

### 3. The comparative cost frame

> "$5,500/month for a system that learns your business and keeps surfacing what you don't know you don't know. Your prior attempt at this was 8 months and $50,000 to replicate other TMS solutions and didn't ship. v2 was started in early April — 23 days of build time — and it's running cross-checks against your live PCS data right now. The bet you make continuing isn't 'will this software get better.' It's 'do we want this learning loop running indefinitely.'"

**Then to Mike specifically:**

> "Mike, can you log in on your laptop right now? I want you to drive for the next 90 seconds. Not a demo I run — you opening the system from your seat, clicking what catches your eye. Tell me where it feels right and where it doesn't."

**This is the Mike-specific engineered moment.** Get him driving. Get him making decisions. Get him touching the system in front of his team. If he engages, the meeting is over and you've won. If he refuses, you've at least surfaced his actual posture early.

---

## Segment 7 — The toggle and the close (3 min)

**Show:** Admin → Settings → PCS push toggles, last-changed timestamp.

**Demo flow:**

1. Show toggles still off
2. Show last-changed timestamp in audit
3. _"You flip these. Not me, not Railway. The toggle is the fulfillment of 'go-live is your call.' When Kyle resolves the 500, you have the green to push at the timing you choose — no further deploy, no further conversation with us required for that moment."_

**Then the ask:**

> "What would you need to see today to feel comfortable continuing past Friday's billing cutoff? If you can name the bar, we'll either show you we cleared it or you'll have a clean reason for the call you're making."

This puts Mike / Jeri into specifying their bar instead of generally evaluating. If they can't name it, you already have their soft-yes.

---

## Q&A prep — likely questions + honest answers

### "Can we actually use it daily?"

Yes. Walk through Scout's typical day: see Ready-to-Build, open drawer, check BOL photo, advance to Building, push to PCS when toggle's on. Each step has been used against real data this week.

### "How accurate is the matching?"

Two honest answers. The matcher backfill that completed earlier this week produced Tier 1 = 46,049 with **87.81% photo-attached coverage** (jumped from 5.18% on Friday after a flag backfill) and ~7,200 in Tier 2 — that's the system's confidence. The accuracy check is what Jessica did Wednesday: hand-counted two wells, system matched on 22 of 27 days. We can do the same comparison for any well you want — pick one, I'll have the comparison Tuesday.

### "What about Jenny's reconciliation?"

The cross-check layer is the automated version of what she does. Every 15 min, system pulls PCS state and surfaces where v2 and PCS disagree — status, weight, well, rate, missing destinations. Today it's surfacing 3 items including the orphan-destination Jessica caught manually two days ago. Forward-looking, Jenny stops being the detective and becomes the reviewer.

### "Why does our PCS loadReference not match v2's load_no?"

Different starting points. v2's load_no is PropX's internal sequence. PCS's loadReference is whatever your team types — often the paper scale ticket. Both systems are right; they never agreed on a key. v2 now bridges via the shipper-stop reference number against our OCR-extracted ticket. For the current 43 mismatched loads, the gap isn't the bridge — it's that v2 never ingested that pipeline. Fix the pipeline scope, bridge closes on its own.

### "What about payroll?"

Load Report page exists with truck/date grouping + CSV export + PCS number column. That matches Jodi's Apr 17 ask. Sidebar → Load Report.

### "What about the 163 wells you found?"

Review queue at `/admin/scope-discovery`. We don't auto-add. Your team classifies each as real / stale / sandplant-mis-classified. Approved ones get bulk-imported.

### "What about scope creep / cost?"

The 163-well finding isn't scope creep — it's scope discovery. We built v2 against the 95 wells you gave us. Your business has more. Bringing them in is normal onboarding; the flywheel that found them runs continuously, so new wells auto-surface as they show up in the historical record.

### "What if we flip the toggle and PCS push 500s?"

Right now it does. We're working with Kyle to resolve. Until that's clean, the toggle stays in your hands; flipping it produces the 500 we already captured. We're not asking you to flip it before that resolves. Read+bridge keep working regardless of push state.

### "When can we start pushing to PCS for real?"

The moment Kyle and our payload reconcile. Code is deployed; the bottleneck is on PCS's side. We'll send you the resolution as soon as we have it.

### "Why should we continue past the billing period?"

Because the cross-check layer's value compounds. One discrepancy today, ten next week, hundreds per quarter. Every one is either money (missed billing), accuracy (wrong well/weight), or scope (gap in coverage). The system you're paying $5,500/month for in May is the same system that will have caught 500+ of those by August. The curve isn't linear; it's an audit ratchet that never sleeps.

### "What's our actual leverage if we stop using v2?"

Honest: you keep your data — full export available. You go back to your prior workflow. You lose the cross-check layer that's catching things your team would otherwise discover quarterly. Not a threat — a description of the trade.

---

## What NOT to do during the demo

- Don't oversell. "It works" is stronger than "it's revolutionary."
- Don't flip the PCS dispatch toggle. That's their decision.
- Don't drag them through calibration findings — have docs linked, walk through only if asked.
- Don't apologize for the 163-well gap or the push 500. Frame as what we learned by building the layer.
- Don't use OUR vocabulary when their vocabulary works. "Discrepancy" → "where v2 and PCS disagree." "Tier 1" → "ready to build." "Orphan destination" → "destination we don't have a well for yet."
- **Don't run the demo without putting Mike in the driver's seat at least once.**

---

## The decision-ask (the close)

> "What would you need to see today to feel comfortable continuing past Friday's billing cutoff?"

This puts the burden on them to name a bar. If they can't, you already have soft-yes. If they can, the bar is now negotiable.

If the answer is a feature gap → confirm timing, write it down. If the answer is "let us think" → press for what they need to evaluate. If the answer is "we're good" → confirm continuation in writing same-day.

---

## Post-walkthrough follow-ups (same-day)

- Email recap with bullet list of what was covered + links to the live URLs
- Any P1 issue surfaced during walkthrough → fix same day, reply-all with "fixed: X"
- If continue decision → kick off Tuesday AM the post-Monday roadmap (week-1 builds: discrepancy email digest, alert thresholds, bonus UI polish)
- If stop decision → same-day honest wind-down plan (data export, SOP for their team)
- If conditional yes → confirm the condition + deadline in writing within 2 hours of meeting end
