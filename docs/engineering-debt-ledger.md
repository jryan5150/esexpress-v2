# Engineering Debt Ledger — ES Express

**Started:** 2026-04-15
**Purpose:** capture process failures in real-time so the next project doesn't repeat them. Not a blame doc — a teaching doc. Every entry is a _pattern_ (what went wrong), a _consequence_ (what it cost), and a _rule_ (what to do differently next time).

This is a living doc. Append to it whenever a failure pattern gets named.

---

## F-01. We built a good product. It wasn't what the client needed.

**Pattern.** Engineering ambition ran ahead of client proximity. We
stood up an ingestion pipeline, a matcher, a validation tier
system, a reconciliation service, 4 dispatcher surfaces, an auto-
mapper, a photo bridge, a feedback loop. All of it technically
correct. On 2026-04-15 the client said "we can't utilize this" —
because none of it maps to the 4-person chain protocol their team
actually runs on.

**Consequence.** 60+ days of build time, ~215 engineer-hours, a
client relationship on the brink of "we're pausing," and Mike
considering ending the engagement over perceived value.

**Rule for next time.** Before building a second feature in a
workflow product, shadow the team for a half-day. Watch a real
shift. Build from what people actually do, not what the data model
implies they should do. "The system gives to the user" only works
if you've watched the user first.

**Signals that would have caught this earlier:**

- Stephanie said "J/K keyboard nav" three times before we shipped it.
  We shipped other features first. Should have been triaged as
  P0 at Round 1 ask, not Round 4 ship.
- The workflow-architecture doc (2026-04-06) identified the 4-person
  chain as "the load-bearing missing concept." We filed it, built
  around it, shipped things that didn't address it.
- Jessica used the word "sheet" 40+ times in the validation
  walkthrough. The sheet IS the product today. We treated it as an
  export target. It's actually the coordination protocol.

---

## F-02. We treated "validation" and "BOL queue" as separate surfaces because the backend separated them.

**Pattern.** We let our data model drive our UX taxonomy. Validation
was an "assignments with auto_map_tier" concern. BOL Queue was a
"jotform_imports" concern. Two database domains, two surfaces.
But the user has one job: "figure out what's off, fix it, release
it."

**Consequence.** Client had to hold a mental model that mapped
their single job to our two surfaces. She eventually said
"we can't utilize this" — because we made her reason about our
schema when she wanted to reason about her work.

**Rule for next time.** UI taxonomy follows user jobs-to-be-done,
not backend object boundaries. If the answer to "why are these
two separate pages" is "because they're two different tables,"
merge them.

---

## F-03. We shipped a hedged design when a confident one was warranted.

**Pattern.** In the post-call re-design, I proposed a "PCS Ready
filter tab on Dispatch Desk" instead of a real PCS Ready surface —
rationalized as "reduces scope, less risky." The user called it
"pidly" and forced me to design for conviction, not comfort.

**Consequence.** Would have shipped a compromised design that
didn't match the user's mental model. They wanted two clear
surfaces, not a filter tab hiding inside a third.

**Rule for next time.** When brainstorming with a trusting user,
present the strongest version of the design first. Hedges are a
retreat into comfort. If the design is wrong, the user tells you.
If it's right, you haven't pre-compromised it.

---

## F-04. We designed the team's workflow without reading their actual workflow sessions.

**Pattern.** I proposed role-grouping (driver-by-driver) for
Scout/Steph/Katie without consulting the Stephanie Venn workflow
session from 2026-02-04. That session explicitly documents
wells-view as her 90%-of-day workflow because PCS creation is a
duplication pattern (build 1, duplicate 5-51 for the well). The
session existed; I didn't look at it.

**Consequence.** First two rounds of post-call design were
directionally wrong. Had to revise to v3 after the user prompted
"go read their workflow sessions."

**Rule for next time.** Before designing role-specific UI, locate
every workflow recording/transcript for those roles and read them
in full. There is no shortcut. The team has already told us how
they work — we just have to listen.

---

## F-05. We built the chain protocol into the data model but rendered it as chrome.

**Pattern.** `assignedTo`, `assignedToColor`, `OperatorPresence`
all exist in v2. The 4-person dispatcher chain (Ingest → Validate
→ Build → Clear) is the team's coordination protocol. We modeled
the fields. We rendered the color as a 9-pixel dot and the assignee
as a text pill. The primary visual signal on every Google Sheet
row — the row color — was not reproduced.

**Consequence.** The team kept using the spreadsheet for
coordination, because our UI didn't replace their handoff protocol.
v2 became a data viewer; the sheet stayed the workflow tool. Jessica
said in the call: "at some point, it's going to be really
challenging for the girls to work here and on the sheets."

**Rule for next time.** When the user's existing tool has a strong
visual signal (color, highlight, bold, placement), reproduce it as
the _primary_ UI element in the replacement tool. Secondary chrome
is for secondary signals.

---

## F-06. We let "feature flags" and "graduated rollout" become hiding-places for hedge-thinking.

**Pattern.** My first post-call design included a 5%-override-rate
threshold for "graduating to auto-flow." That's a number I made up
with no calibration data. It sounded engineering-rigorous. It was
actually a way to avoid committing to a human conversation.

**Consequence.** Would have built feature-flag infrastructure to
defer a decision that Jessica herself should make directly.
Engineering complexity added to postpone a 30-second chat.

**Rule for next time.** If a design includes "we'll flip a flag
when <metric> hits <threshold>," ask whether a human-timed
conversation would work as well. Usually it does.

---

## F-07. We built "copy one load to PCS" when the actual workflow is "build one, duplicate many."

**Pattern.** I scoped Stephanie's surface as "copy fields, paste
into PCS, mark entered." Her own Feb 4 workflow session explicitly
describes a duplication pattern — build one load for a well,
duplicate 5-51 times for the rest of that well's run. She estimates
this saves her majority of her day. It's her core action, not a
bonus optimization.

**Consequence.** A v3 design that would have shipped without a
duplicate-N action, which is the thing she reaches for most.
Would have felt to her like "pidly" copy-paste ergonomics on top
of her existing workflow, not a replacement.

**Rule for next time.** For any workflow UX, the question isn't
"what does the user do per load" — it's "what does the user do per
shift." If the per-shift action is batch-build, the UI primitive is
batch-build. Per-load clicks are the loss function, not the design
target.

---

## F-08. We noticed "there are two color systems" and chose to model one.

**Pattern.** The 2026-04-06 workflow-architecture doc explicitly
documented both color systems (personal-color chain handoff + phase-
color pickup/delivery). My v3 design modeled only the chain handoff.
"Green = sand plant pickup, blue = delivery location" is literally
how Steph reads the sheet; it's a lifecycle primitive, not a decoration.

**Consequence.** A v3 design that would have replaced one of her
two visual signals and left the other in the spreadsheet. She would
have kept the sheet open for the phase color alone — defeating the
entire purpose of replacing the sheet.

**Rule for next time.** When the existing tool has N distinct
visual signals, the replacement tool reproduces all N, not the
ones the engineer found most interesting. The user's visual model
is a system; partial reproduction breaks it.

---

_Appended as failures are named. This ledger travels with the next
project._
