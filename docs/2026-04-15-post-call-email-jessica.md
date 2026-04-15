# Post-call follow-up email to Jessica (draft, ready to send)

**To:** Jessica Handlin
**Cc:** Jared, Bryan
**Subject:** ES Express — next-step clarity after this morning's call

---

Jessica,

Thanks for the direct conversation this morning. Sitting with it for
a minute, there are three things I want to address explicitly so you
and Mike have a clean picture to make a decision against.

## 1. The "100% match" with no photo

You hit on this and you were right to push. There are two distinct
states happening on the same load, and the UI was conflating them:

- **Match state** — whether the system identified the correct load
  for a given ticket (driver, well, BOL). This runs against the data
  we already have, instantly.
- **Photo state** — whether a driver-submitted JotForm photo has
  been paired to the load. This is a separate pipeline that runs
  every 30 minutes and works its way back through the historical
  corpus of photos.

A load can show "matched" (identity confident) while the photo
hasn't been paired yet because the matcher hasn't gotten to that
submission in the backfill sweep. That was confusing and the UI
should say so plainly. I'm shipping a fix today that shows three
distinct photo states in every row:

- **Attached** — photo bridged to the load (thumbnail shown)
- **Awaiting photo** — photo exists in JotForm, pipeline will
  pair it in the next sync cycle (clock icon)
- **No photo submitted** — 48+ hours past delivery with nothing
  in from the driver (grey icon, flag for manual search)

That should eliminate the "it says matched but nothing's there"
confusion in one pass.

## 2. The Validation / BOL Queue overlap

Two destinations for what feels like one decision. I saw you nod on
the mockup this morning — that merged view is what it should be, and
I agree it's the right target. I'm going to have a working version of
it live this week so you can actually use it instead of looking at
still frames. Tier 3 (needs decision) surfaces first, Tier 2 is
one-click confirm, Tier 1 stays collapsed unless you want to audit.
Same page, same workflow, one place.

## 3. Time to value — what "ready" looks like

You asked a fair question: _"if it's two more weeks, tell me."_
Here's the honest answer in the language Mike is asking for:

- **Today:** 66.2% match rate (2,797 of 4,223 photos auto-paired).
- **At current correction velocity**, the photo attachment backfill
  completes the historical corpus inside ~5-7 days, bringing the
  surfaced attachment rate up sharply even without any new training.
- **Match rate itself** compounds as your team makes corrections.
  Mechanically, at ~50 corrections a day that number moves to ~82%
  in three weeks.
- **The gate for "ready for the team to use daily"** isn't a specific
  percentage — it's three simple checks:
  1. Photos attach to 90%+ of matched loads within 1 hour of a
     driver submitting via JotForm
  2. Merged Validation/BOL view is live (see #2 above)
  3. PCS push is operational (still pending OAuth on their end)

When all three of those green up, the product is ready for daily
operations. Based on where we are today, #1 happens inside a week
purely from the pipeline catching up, #2 I'm building now, #3 is
PCS's timeline.

## What I'm asking from you

- **Review the documents** I sent (SOW, timeline, feedback ledger).
- **Tell me what you and Mike want to do** in terms of the
  engagement going forward. If you want to pause, I'll stop any new
  feature development immediately (the pipeline will keep running so
  data + photo attachment keeps accumulating in the background at
  zero cost to you). If you want to keep going toward the readiness
  checks above, I'll focus this week on #1 and #2.
- **If a sit-down with Mike would help** — I'm happy to walk him
  through any or all of this. Or Bryan can, if that's easier.

I understand the financial pressure this has put on Mike, and I want
to be respectful of that. The best way I can do that is give him a
clear picture of what exists, what's close, and what's waiting on
other people — which is what the documents attempt to do and what
the three checks above make concrete.

Appreciate your patience. Looking forward to hearing from you.

— Jace
