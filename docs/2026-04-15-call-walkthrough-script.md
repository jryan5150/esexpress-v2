# Call Walk-Through Script — Jessica, 10:30 AM CT, 2026-04-15

**You go first.** Take the first 10–12 minutes. Don't cede the frame to
"what's broken" questions — establish what shipped, what's coming, and
why the one remaining unlock is external.

Read this tab during the call. Paraphrase, don't read verbatim. The
bold sentences are the ones to land cleanly.

---

## Opening (45 sec)

> "Before we get into screens, let me frame the last 72 hours and where
> we are. We pushed a big reconciliation + correction layer this week,
> fixed three compounding photo-display bugs overnight, and I have some
> mockups of what's coming in the next two weeks. I'd like to drive for
> ~10 minutes, then open it up."

**Why this sentence:** claims the first 10 minutes without asking
permission. Sets the narrative (what we shipped) before she sets hers
(what she noticed).

---

## Demo Section 1 — Home / Sync Freshness (60 sec)

Share screen. Navigate to app.esexpressllc.com.

1. Hard refresh once in front of her if you haven't already this morning.
2. Land on Today's Objectives.
3. Point to Data Pipeline strip (4 tiles).

> "Four tiles, all green, all recent. PropX ran at 4 AM, Logistiq at
> 4:15, JotForm every 30 minutes. Before this you'd have no way to know
> if the data you're looking at is fresh or not."

4. Point to Wells table on the same page.

> "Review and Missing columns — these are your eyes on what's off.
> We fixed these late yesterday so the counts reflect live work, not
> historical backfill."

**If she says "numbers look off":** ask her to hard refresh (Cmd+Shift+R).
Cached bundle from before yesterday's fix can still be sticky.

---

## Demo Section 2 — Dispatch Desk (2 min)

Click into any well with at least 10 loads. **Apache-Gulftex-Fred Gooth**
is a good pick — has matched photos + a few pending.

1. **Point out the color stripe on each row.**

   > "Same color scheme as your Load Count Sheet. We mirrored your
   > Color Key tab exactly. Nine statuses. Four of them — the PCS-
   > related ones — aren't wired yet because we don't have PCS
   > credentials. I'll come back to that."

2. **Click the Color Key button (top right).** Walk the legend quickly.
   Say "these five are live today, these four light up when PCS OAuth
   lands."

3. **Demonstrate keyboard nav.** Press `j` a few times.

   > "Stephanie asked for this in Round 1. She moves 94 loads a day.
   > `j` and `k` step through rows without a mouse."

4. **Expand a load.** Click a row to open the drawer.

   > "Dispatcher Notes, inline-editable fields, photo inline. Click the
   > photo — pops up full-size, no new tab." _(Click the photo; lightbox
   > opens; click to close.)_

5. **Show the Copy Report button.** Click it. Alt-tab to Teams or a
   text editor, paste.

   > "Tab-separated. Paste into Teams, into PCS, into a spreadsheet.
   > It's a bridge to kill the retype friction until PCS unblocks."

**Time check:** you should be ~3:45 into the call at this point.

---

## Demo Section 3 — BOL Queue (2 min, the star of the show)

Sidebar → BOL Queue. **Jess should see a red count badge next to the
link — that's the 1,415 pending photos.** If she doesn't, she needs
to hard refresh.

1. **Frame the number first.**

   > "1,415 driver photos where the matcher couldn't auto-pair to a
   > load. Usually because the OCR read the BOL field wrong — pulled
   > a date, an address, or just got digits wrong."

2. **Click a pending row** — expand it.

3. **Show the photo renders inline.** Then point to the BOL number at
   the top.

   > "See this? Matcher extracted `Stas26860938` from the photo. That's
   > garbage. Here's what shipped last night: click the BOL number,
   > edit it inline."

   _Click the BOL number. Input appears. Type the real number from the
   photo. Press Enter._

   > "Toast confirms. Matcher re-runs with the corrected BOL. If it
   > finds a load, the row promotes from pending to matched, photo
   > bridges to the assignment. One keystroke, no context switch."

4. **Critical sentence:**

   > "And here's why this matters — every correction writes the
   > original OCR value to a separate column. So a year from now,
   > when you ask me 'why doesn't the matcher know that B584 prefix
   > means Apache,' I'll point at this column and say 'here are 500
   > photo→correct-BOL pairs your team generated; we use them to
   > retrain.' The feedback loop IS the product."

---

## Demo Section 4 — Reconciliation Discrepancies (60 sec)

Still in BOL Queue. Find a matched submission that has a mismatch flag
(first row of the matched list usually has one).

1. Expand the row. Point to the discrepancy panel.

   > "When the photo data doesn't match the load record, we flag it.
   > Photo weight vs load weight, photo BOL vs load BOL. You decide
   > whether to fix the load, re-match, or accept."

2. **Critical sentence:**

   > "Before this existed, a driver could write the wrong weight and
   > it would silently become the truth. Now the system tells you
   > before you enter it in PCS."

---

## Demo Section 5 — Missed Loads Report (45 sec)

Sidebar → Reference → Missed Loads. (We moved it out of Admin last night
so it lives next to Archive.)

> "This is the 'did anything fall through' report. Duplicate BOLs,
> sync errors, stale-sync loads. Pull this whenever you suspect
> something didn't come through. Today it has 1 duplicate BOL
> flagged — probably PropX re-inserting under a slightly different
> identifier."

Stop the demo here. You should be ~8 minutes in.

---

## Transition to Slides (30 sec)

> "That's what's live. I want to show you three things that are
> coming and one way to frame the moment we're in. Let me switch
> tabs."

Open **app.esexpressllc.com/mockups-call.html** in a new tab. Scroll
to top.

---

## Slide Walk-Through (4 min)

These are mockups, not shipped. Say that up front:

> "These aren't live. They're how I'd want to respond to what you
> flagged last night plus where PCS unblock takes us."

### Frame 1 + 2 — Validation Redesigned

Scroll to Frame 1.

> "Right now Validation and Dispatch Desk feel like two places to do
> one job. Here's what I think the validation side wants to become —
> a tier-bucketed queue where Tier 3 (red) is what needs your
> decision today, Tier 2 is one-click confirm, Tier 1 is the
> matcher's work overnight."

Scroll to Frame 2.

> "And when you click a Tier 3, this is the decision surface —
> photo on the left, candidate loads on the right with match scores.
> One click picks the match, or 'none of these' kicks you to manual
> search. Every decision you make here writes back to the matcher
> as training."

### Frames 3 + 4 — PCS Unblock

Scroll to Frame 3.

> "Once PCS OAuth access comes through, this is what the Dispatch
> Desk becomes. 'Push to PCS' button per load. Pushed loads show a
> green timestamp badge."

Scroll to Frame 4.

> "And this is the batch flow. Select 12 ready loads, one click,
> they upload to PCS, Katie sees them server-side as if you'd typed
> them. Today that's 20 minutes of tab-switching. After OAuth, it's
> 15 seconds."

### Frame 5 — Notifications & Assign

Scroll to Frame 5.

> "Last one. @mention a teammate on a load, assign a load to Scout,
> ping a driver. Driver contact is greyed here because PropX gives
> us driver ID and name but no email — that's a roster-import
> conversation we need to have with Katie at some point."

---

## The Feedback Loop Slides (2 min)

**[Added for this call — see Frames 6-8 in mockup]**

Scroll to Frame 6.

> "One more thing I want to show you — the compounding math.
> Today we're at 66.4% auto-match on JotForm photos. That sounds
> mediocre until you look at what's moving it. Every manual match
> your team makes gets written to a driver-to-well feedback table.
> The next time that driver's photo comes in, the matcher preferences
> the well they've historically run to. We've already got 2,619
> confirmed pairs in that table from the backfill alone."

Scroll to Frame 7.

> "Here's the projection — not a promise, a mechanical result of the
> math. If your team corrects 50 photos a day, at current driver
> distribution we hit 80% auto-match in ~3 weeks. 90% in ~2 months.
> The curve is the curve; we don't have to do anything clever."

Scroll to Frame 8.

> "And this is the moment we're in — a transitional period by design.
> Validation page is training the matcher. BOL queue is where
> corrections happen. Dispatch Desk is where the real work lives.
> All three exist right now because we're between 'matcher is new'
> and 'PCS is connected.' When PCS lands, Validation shrinks. When
> the matcher's accuracy compounds, BOL queue shrinks. Dispatch Desk
> is the permanent surface. The other two are scaffolding."

---

## The Framing Sentence (30 sec)

This is the line to land if nothing else does:

> **"We've been creatively engineering a system we hope gives your
> team what you asked for, and juggling how to make that giving feel
> natural while the biggest obstacle to a frictionless flow — PCS and
> their OAuth block — is still open. The rail is built. The
> reconciliation catches errors your spreadsheet couldn't. The
> feedback loop makes tomorrow better than today. The last unlock is
> the PCS push side, and that's the piece we're waiting on with
> them."**

---

## Opening the Conversation (Q&A)

Hand it back to her:

> "That's what I wanted to drive. What did you see last night that
> we need to talk about?"

**Do not:**

- Dwell on anything broken that you shipped a fix for last night (just
  confirm it's fixed and move on)
- Quote specific dollar amounts or billing math — that's Bryan's lane
- Promise a date for PCS unblock (it's not yours to promise)

**Do:**

- Let her pick-at-details; that's normal and useful
- If Scout/Steph are on the call, explicitly pull them in ("Steph,
  does the j/k navigation feel right?")
- If Mike comes up, pivot: "that's a Bryan conversation — he knows
  the engagement"

---

## Likely Questions — Short Answers

See `docs/2026-04-15-jessica-call-prep.md` for the full Q&A prep doc.
Highest-probability ones, restated short:

| Q                                 | A                                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "What about the 1,300 unmatched?" | OCR ceiling. Most have valid BOL format but no matching load — either PropX hasn't ingested yet or BOL is one character off. The inline-edit fixes that one at a time. |
| "When does Validation go away?"   | When the matcher's accuracy means Tier 2/3 are rare. Few weeks of real use will tell us.                                                                               |
| "What am I paying for?"           | What's shipped: pipeline, reconciliation, training capture, admin. What's blocked: PCS push, on their OAuth.                                                           |
| "Other vendors?"                  | "What's the criteria you're evaluating on? I can speak to ours honestly."                                                                                              |
| "Is the data safe?"               | Yes. Audit trail on every assignment. match_audit logs why each match was made. Backup taken before every migration.                                                   |

---

## If You Freeze

One-liner from the prep doc:

> "We've gotten v2 to the point where the system is more than your
> spreadsheet — it catches reconciliation errors, surfaces photos
> automatically, and learns from every correction your team makes.
> We've been creatively engineering around the one obstacle to making
> the whole flow feel natural, which is the PCS OAuth piece. Let me
> show you what that looks like."

Say it, share your screen, start the demo.

---

## After the Call

- Update `docs/2026-04-14-feedback-ledger.md` with anything new
- Write a short handoff at `docs/2026-04-15-post-jessica-call.md`
- Text Bryan before end of day on anything expense/continuation related

---

**Credentials:** `jess@esexpressllc.com` / `dispatch2026` if she needs
to log in live. You already logged in as her from your machine for the
photo test at 06:00 UTC so any cached bundle on her side is probably
fine.

**Backup plan if anything doesn't load:** I have Railway logs open.
Text me mid-call if you hit a 500 — I'll triage while you talk.
