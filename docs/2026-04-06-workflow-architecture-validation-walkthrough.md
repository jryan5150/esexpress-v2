# ES Express v2 — Workflow Architecture Validation Walkthrough

**Date:** 2026-04-06
**Audience:** Jace + Jessica (and Stephanie if time permits)
**Purpose:** Validate the four-surface workflow model + chain coordination concept + the Round 4+ ordering before any more code ships
**Format:** ~30 minute conversation, screen-share optional
**Companion doc:** `2026-04-06-workflow-architecture.md`

---

## Why we're doing this

The honest truth: Round 1, Round 2, and Round 3 of v2 have all built features from filtered persona reports — what each persona happened to be looking for in a code review. We re-loaded the source material this week (your team's actual recordings + the master dispatch CSV templates) and discovered the _chain_ concept that no persona report named explicitly. That tells us we have been working from a model of v2 that hasn't been validated against reality. Before we plan Round 4+, we want 30 minutes of your time to confirm or correct the model directly.

**The format is conversational, not interrogative.** Each question is paired with what we're trying to learn and what success looks like. If a question doesn't land or you have a better one, follow your instinct — we want to be wrong on the doc, not wrong on the system.

**The most valuable outcome of this walkthrough is a CORRECTION.** A walkthrough where Jessica says "yep, that all sounds right" is a walkthrough that didn't push hard enough. Lean into the disconfirmation questions (especially Q8).

---

## Setup (5 minutes before the call)

1. **Have the four-surface diagram open** from the companion doc, Part 1 (Daily Workbench / Reconciliation Loop / Operational Oversight / Configuration)
2. **Have the temporal pipeline diagram open** from Part 2 (Ingest → Match → Validate → Build → Clear → Dispatch → Deliver → Bill)
3. **Have a real load pulled up in v2** so Jessica can point at things and you can take notes against actual rows
4. **Have her phone or a tab with the master dispatch Google Sheet open** — you'll reference it in Q4
5. **Optional: pull up Stephanie too** if she has 30 minutes for Q7 specifically
6. **Have a notepad ready** — every quote she gives is gold; capture them verbatim (or record the call with consent so transcript can be re-read later)

---

## The Walkthrough (8 questions, ~30 minutes total)

### Question 1 — The four-surface model (~3 min)

> **"I'm going to describe how I think about v2 in four parts: the Workbench (where Stephanie builds loads), the Reconciliation Loop (where you fix BOL and Tier matches), the Oversight View (Today's Objectives + per-well health), and the Configuration (admin pages). Does that match how you think about v2 in your head, or do you see different natural pieces?"**

**What we're trying to learn:** Whether the four-surface model maps onto Jessica's mental model of v2. If she sees three pieces or five pieces, the doc is wrong.

**What success looks like:** Either confirmation, or "actually I think of it as \_\_\_" with a different framing we can incorporate.

**What to listen for:**

- Hesitation around any one of the four — that's where the disconnect is
- Does she group things differently? (e.g., "Validation IS part of the workbench to me")
- Does she add a fifth piece? (e.g., "what about Finance?")
- Does she collapse two of the four? (e.g., "BOL Queue and Validation are the same thing in my head")

**Probable answer:** She'll mostly agree but probably push back on whether Validation and BOL Queue are one thing or two. _Note her answer either way._

---

### Question 2 — The chain (~5 min, the most important question)

> **"Stephanie said in her recording from a couple months back that you guys are 'a chain' — she builds, then turns the row her color, and Katie clears. Is that still how the team works today? And does v2 currently help or hurt that chain?"**

**What we're trying to learn:** Whether the chain concept I extracted from the transcripts is still current (those recordings are from Feb 2026), and whether v2 supports or breaks the chain.

**What success looks like:** Confirmation that the chain is real + a description of where v2 falls down on it.

**What to listen for:**

- Does she say "we use the colors in v2 too"? (We're not surfacing them — confirms the rendering-backward hypothesis)
- Does she say "we don't really do that anymore, the system works differently now"? (The doc needs revising — chain might be an obsolete concept)
- Does she say "v2 has nothing for this"? (Confirms the chain coordination layer is the load-bearing missing concept)
- Does she name specific friction: "I can't tell who's working on what right now"? (That's the per-user counter / presence ask)
- Does she correct the chain order? (Maybe it's actually Stephanie → Jessica review → Katie clear, not Stephanie → Katie)

**This is the load-bearing question.** If Jessica says the chain is real and v2 is missing it, Round 4 priority #1 is locked. If she says the chain is no longer current, the entire framing of Part 0 needs to be rewritten.

---

### Question 3 — The CLEAR phase (~3 min)

> **"Stephanie builds, Katie clears. v2 has a 'Mark Entered' button but no concept of 'cleared.' Are those the same thing in your head, or are they two different actions Katie does separately from what Stephanie does?"**

**What we're trying to learn:** Whether the BUILD/CLEAR distinction is real or whether I'm splitting hairs.

**What success looks like:** A clear answer one way or the other.

**What to listen for:**

- "They're the same" → I'm overcomplicating; collapse the model
- "No, clearing is when Katie verifies the BOL photo matches and posts to billing" → that's a real second phase v2 should model
- "Actually clearing means [something I haven't guessed]" → bigger correction; the state machine needs rework
- "Katie doesn't do that anymore, Jessica does" → the chain has different roles than I described

**Implication:** If CLEAR is real, the schema needs `clearedBy` / `clearedAt` / `chainState` fields. If it's not, the chain-coordination spec gets simpler.

---

### Question 4 — The 38-field gap (~5 min)

> **"I pulled up the Master Dispatch Template CSV — it has 38 fields. v2 surfaces about 14. Of these 24 missing fields, which ones do you actually need to see in v2 daily, and which ones live happily in another system?"**
>
> **[Show the list — pull up the appendix from the companion doc]:**
>
> _Identity:_ Invoice #, ES Express #, Hairpin Express #, PO #, Order #
> _Operations:_ Loader, Shipper # BOL, Total Demurrage with Reasons
> _Time windows:_ Load In, Load Out, Load Time, ETA, Unload Appt, Unload In, Unload Out, Unload Time
> _Financial:_ Rate/Ton, LINE HAUL, Demurrage breakdown, Total Load, FSC, Settlement Date

**What we're trying to learn:** Which fields are actually load-bearing for the daily workflow vs. which ones are nice-to-have. We don't want to ship 24 fields if only 6 of them are load-bearing — and we don't want to miss the 6 that are critical.

**What success looks like:** A prioritized list in three buckets:

- "I need these every day" (Round 7 candidates)
- "These live in finance/billing, I only see them weekly" (deferred to Phase B/C)
- "I never look at these" (delete from the gap analysis)

**What to listen for:**

- The financial fields might be Finance's job, not Dispatch's. Don't assume Dispatch needs them.
- The identity refs might map onto things v2 already has but with different names ("ES Express # is what we call `loadNo`" or similar). **Critical to disambiguate.**
- "Hairpin Express" might be a sister company, an invoice routing thing, or a deprecated concept — none of which I currently understand.
- She might name fields NOT on the list that she actually needs ("you forgot Container # / Driver Phone / etc.") — write those down.

**Specific sub-question if there's time:** "When you call up a load and you have v2 open AND a Google Sheet open, what's in the Google Sheet that's NOT in v2 that you most often need to look at?"

---

### Question 5 — The bridge to PCS to replacement question (~3 min)

> **"Right now v2 is a bridge — you copy fields from v2 into PCS manually. The plan I have in my head is: today is the bridge, eventually we get the PCS REST keys from Kyle and v2 dispatches automatically, and eventually v2 IS the dispatch system. Is that timeline real, or is the bridge state where v2 lives forever? And if it's real — when do you think Phase B (REST integration) actually lands?"**

**What we're trying to learn:** Whether the team genuinely intends v2 to replace PCS or whether v2 is intentionally a permanent bridge layer. This dramatically changes Round 4+ priorities.

**What success looks like:** A confident answer about the long-term relationship between v2 and PCS.

**What to listen for:**

- "PCS isn't going away, v2 is permanent staging" → don't build for replacement, optimize the bridge forever
- "We want PCS dead in 12 months" → start building the replacement scaffolding now (real RBAC, audit log, multi-tenant)
- "Honestly we don't know" → the doc should hedge on Phase C and focus everything on Phase A wins
- "Kyle isn't actually going to deliver those keys" → we need a Plan B for Phase B

**Critical follow-up:** "Has anything changed on Kyle's end? Is there a date we're working toward, or is this an indefinite gate?"

---

### Question 6 — The admin blocker (~3 min)

> **"The single biggest hand-off blocker I'm seeing is that you can't edit `dailyTargetLoads` through the UI. The pencil button on Wells Admin is dead. The only way to change a target today is raw SQL. Is that the biggest admin gap, or is there something else higher on your list?"**

**What we're trying to learn:** Whether the admin gap I'm flagging matches her actual frustration, or whether there's a worse gap I'm missing.

**What success looks like:** Either confirmation that daily target editing is THE blocker, or a different blocker we hadn't surfaced.

**What to listen for:**

- "I just need the targets" → confirms Round 4 priority #2
- "I also need [user invite / password reset / archive a well / change carrier rate / etc.]" → adds to the Big Admin Push scope
- "Honestly daily targets aren't that important, what I really need is \_\_\_" → completely reorders the admin work
- "I haven't been touching the targets because Kyle does that for me" → the persona report's framing is wrong; targets aren't actually her job

**Do not lead her** — let her name the blocker first, then mention `dailyTargetLoads` as a check.

---

### Question 7 — Stephanie's keyboard nav (~3 min, ideally with Stephanie present)

> **"Stephanie's #1 ask across 3 rounds has been keyboard navigation — J/K to move between rows, auto-expand, Enter to mark entered. We haven't shipped it. Is that still her #1, or has she found a workaround that makes it less urgent? And what does her actual workflow look like today on a real keyboard?"**

**What we're trying to learn:** Whether the speed asks are still active and whether Stephanie has hardware-level shortcuts (custom mouse buttons) we should be aware of when designing v2 keyboard nav.

**What success looks like:** Direct from Stephanie if possible, or Jessica's secondhand observation.

**What to listen for:**

- Anything about hardware (custom mouse buttons, touchpad gestures, dual monitors)
- Stephanie said in her transcript "I just push one button to copy" — that's a custom mouse button. We should know about it before designing keyboard shortcuts that might compete.
- Whether she's adapted to v2's existing shortcuts (Shift+A/E/V) and what's still painful
- Whether she actually wants J/K specifically, or any keyboard nav, or something different
- Whether her speed bottleneck has shifted from "moving between rows" to something else (now that bulk validate exists)

**If Stephanie is on the call:** Ask her to do a real load entry while you watch. Count the clicks. Compare to Round 1's baseline of ~12 clicks/load.

---

### Question 8 — The disconnect check (~3 min, the disconfirmation question)

> **"I've been working from Round 2 persona reports for a few months. Re-reading the actual transcripts this week, I found things the persona reports missed — like the chain concept and the personal-color system. Where else do you think our engineering team's mental model has drifted from how you actually work? What's the thing we ALWAYS get wrong that you've stopped bothering to mention?"**

**What we're trying to learn:** The unspoken disconnects. The things she's stopped reporting because she assumes we know.

**What success looks like:** A piece of friction or assumption we hadn't named.

**What to listen for:**

- Anything that starts with "well, you know..." or "I figured you guys knew..." — that's the gold quote that reveals the gap
- Anything she answers with a long pause and then "actually..." — that's an unspoken frustration finally getting named
- Resistance to the question itself ("no, you guys are doing fine") — push gently: "humor me, even small things"

**This is the most important question in the walkthrough.** If you only get one substantive answer, this is the one that should be it. Push harder here than anywhere else.

---

## After the walkthrough — Triage (15 minutes after the call)

Take the 8 answers and bucket them into:

### Bucket A — Confirms the doc as written

For each: highlight the corresponding section in the strategic doc with a "validated 2026-04-XX by Jessica" footnote. No action beyond marking.

### Bucket B — Corrects the doc

For each: revise the relevant section. Re-name what changed. Bump the doc to v2. Commit with a message that explains what corrected and why.

### Bucket C — Adds something new the doc missed

For each: open a new section (or a new appendix). Save the dispatcher voice as a verbatim quote with a timestamp/citation.

### Bucket D — Reveals a deeper unknown

For each: queue a follow-up walkthrough or note that this needs another data-gathering pass before Round 4 can plan around it.

**The triage is the value.** A walkthrough that produces zero corrections is suspicious — it usually means we asked confirmation-bias questions instead of disconfirmation questions. If Bucket A is the only non-empty bucket, run Question 8 again with a colder framing.

---

## What to do with the result

After triage:

1. **Strategic doc gets a v2** with the corrections incorporated. Commit with a clear changelog at the top.
2. **The walkthrough notes get committed** to git (in `docs/2026-04-XX-workflow-validation-notes.md`) so future agents can see "this is what Jessica said on this date."
3. **Round 4 planning starts** from the validated v2 of the strategic doc — not from persona reports, not from intuition, not from the original v1 of the strategic doc.
4. **The Round 3 branch (`fix/round-3-quick-wins`) can be pushed in parallel** with this — the two are independent. Round 3 is tactical; the strategic doc is the Round 4+ frame.

If the validation surfaces something big enough to require a _second_ walkthrough — e.g., Jessica says "we don't actually do the chain anymore, here's what we do" and the new model is unclear from one conversation — schedule a second 30-minute session before Round 4 kicks off. **Never start Round 4 from a guess.**

---

## Notes on running the walkthrough well

**Do:**

- Record the call (with consent) so the transcript can be re-read
- Take screenshots of v2 as Jessica references it
- Let Jessica drive when she wants to (if she wants to point at her own screen, follow)
- Capture verbatim quotes — those are the gold for Round 4 planning
- Push on Question 8 even if it feels awkward
- Ask the same question to Stephanie separately if her perspective differs

**Don't:**

- Lead the answers ("don't you think the chain is the most important thing?")
- Defend Round 1-3 work — if she names something that didn't ship, just write it down
- Promise specific Round 4 commitments in the call — say "I'll incorporate this into Round 4 planning"
- Run over 45 minutes total — exhaustion produces shallow answers
- Skip Q8 for time — it's the most important question

**Companion materials to bring:**

- Companion strategic doc, Part 1 (four-surface diagram) and Part 2 (temporal pipeline) printed or on a second screen
- The 38-field list from Appendix A of the companion doc
- This walkthrough doc itself, as a reference if you lose your place

---

## After validation — what changes about Round 3 and Round 4

**The Round 3 branch (`fix/round-3-quick-wins`)** is independent of this walkthrough's outcome. It can be pushed and deployed regardless. Recommendation: push it the same day as the walkthrough so Jessica can verify the Round 3 fixes in production while the validation conversation is fresh.

**Round 4 planning** waits for the validated strategic doc v2. The validated doc is the input to a Round 4 plan, not this v1 draft.

**Memory updates** based on the walkthrough should be saved immediately:

- Any correction to the chain model → update or create a feedback memory
- Any new disconnect named in Q8 → save as a project memory
- Any change to the Phase B timeline → update `project_gap_analysis_status.md`
