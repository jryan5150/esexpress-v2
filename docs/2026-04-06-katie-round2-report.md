# Katie Round 2 Report

**Date:** 2026-04-06
**Tested via:** code review only (Chrome DevTools MCP unreachable, skipped after first attempt per instructions)
**Persona:** Katie, 1-week-new dispatcher, five minutes of Jessica's walkthrough, zero institutional context.

---

## Executive Summary

Round 1 shipped real polish — filter labels read like English, the login feels warm, inline editing is delightful when I find it. But for a **new hire**, v2 is still a foreign language textbook with no dictionary. I counted **14 undefined acronyms/jargon terms** across 4 pages, the only "help" I can reach is a `title` tooltip on _one_ field (PCS Start #) that still assumes I know what PCS is, and the single-load Validate button has **no confirmation dialog** — a misclick immediately flips a load's state with no undo prompt. There is still zero `?` button, no glossary, no tour, no onboarding copy anywhere in the nav. I will be asking Jessica somewhere between 8 and 15 questions on my first unsupervised morning, most of them repeats of what I asked last week.

---

## Verified Fixes from Round 1

| #   | Fix                                                                     | Verdict                        | Notes                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Login monogram "Es" + ghosted "Express" + breathing + hover             | ⚠ works                        | Aesthetic is beautiful but brand means nothing to me without context. See "Login First-Impression" below.                                                                                                                                                                                   |
| 2   | Sidebar matches login branding                                          | ✓ helps                        | `Sidebar.tsx:66-72` — consistency is reassuring on day one.                                                                                                                                                                                                                                 |
| 3   | Wells/Loads toggle when no well selected; pagination both views         | ⚠ works                        | Toggle exists (`DispatchDesk.tsx:636-689`) but "Loads (set date)" is confusing copy — see NEW issue #3.                                                                                                                                                                                     |
| 4   | Select All checkbox in column headers                                   | ✓ helps                        | `DispatchDesk.tsx:897-915, 1026-1045` — works, has `title="Select all"`.                                                                                                                                                                                                                    |
| 5   | Individual checkboxes work (stopPropagation)                            | ✓ helps                        | `LoadRow.tsx:118-131`.                                                                                                                                                                                                                                                                      |
| 6   | Filter tabs human labels "Ready to Build", "BOL Issues"                 | ✗ **REGRESSION**               | `FilterTabs.tsx:38` applies `capitalize` CSS class which renders "BOL Issues" → "Bol Issues" and "Ready to Build" is fine but "BOL" is now mangled. See NEW issue #1.                                                                                                                       |
| 7   | "Mark Entered" checkmark button (was "Copy")                            | ⚠ partial                      | `LoadRow.tsx:252-262` renders "Entered" as the button label, not "Mark Entered". The command bar button says "Mark All Entered" but the per-row CTA says just "Entered" — ambiguous: is that a label or a status?                                                                           |
| 8   | "Photo BOL" label (was "JotForm")                                       | ✓ helps                        | `ExpandDrawer.tsx:428` — "Photo BOL" is kinder than "JotForm", but still undefined.                                                                                                                                                                                                         |
| 9   | Trailer # + Delivered Date inline-editable                              | ✓ helps                        | `ExpandDrawer.tsx:374-379, 454-465`. The date picker is a nice touch.                                                                                                                                                                                                                       |
| 10  | Photo thumbnail larger + click-to-zoom                                  | ✓ helps                        | `ExpandDrawer.tsx:289-297` with `title="Click to view full size"`.                                                                                                                                                                                                                          |
| 11  | Validation page inline editing for Driver, Carrier, Weight, BOL, Ticket | ⚠ works but hidden             | `Validation.tsx:648-677` — editing only appears in the expanded detail panel. I have to click the row's chevron to see it; nothing tells me that's where the editing lives.                                                                                                                 |
| 12  | PCS Start # tooltip                                                     | ⚠ tooltip exists, doesn't help | `DispatchDesk.tsx:504` — tooltip text: _"The starting sequence number in PCS for this batch. Loads are numbered sequentially from this value when marked as entered."_ It defines the **number**, but never tells me what **PCS** is or where I'd get a starting number from. Still opaque. |
| 13  | validateFromSheet bug fixed                                             | ⊘ not tested                   | backend fix, no code path for Katie.                                                                                                                                                                                                                                                        |
| 14  | Date filter at page header level, defaults empty                        | ✓ helps                        | `DispatchDesk.tsx:425-455`.                                                                                                                                                                                                                                                                 |

---

## Still Open from Round 1

- **PCS Starting #** — still confusing. Tooltip says "starting sequence number in PCS" — what is PCS? Where does that number come from? Do I make one up? Ask Jessica? Leaving it blank seems to default to 0 which would probably be wrong.
- **BOL undefined** — appears 102 times in the dispatch desk code alone. Never defined in UI. I had to Google it last week (Bill of Lading).
- **No confirm on single Validate** — `DispatchDesk.tsx:1104` calls `handleValidateSingle` directly. No prompt, no undo. Confirmed by reading `handleValidateSingle` at line 226 — it fires the mutation immediately. Only **bulk** Validate has a `window.confirm` (`DispatchDesk.tsx:207`).
- **Demurrage amber section** — `ExpandDrawer.tsx:604-645` uses `bg-[#fef3c7]` (amber) with `warning`-style coloring. It looks exactly like a critical alert but it's just a financial line item. No explanation.
- **No help link anywhere** — grep confirms: zero "Help" nav items, zero "?" buttons, zero glossary links. Only `title=` hover tooltips on a handful of micro-elements. `FeedbackWidget.tsx` exists but it's for _submitting_ feedback, not getting help.
- **Reconciled filter still cryptic** — `FilterTabs.tsx:22` label is literally `Reconciled`. No tooltip, no description. I have no idea what this means vs "Validated" vs "Assigned".

---

## Jargon Audit (HIGH PRIORITY)

| Term                                                          | Where (file:line)                                                                                                                                                           | What I think it means                                           | What it probably actually is                                                                                                                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BOL**                                                       | `FilterTabs.tsx:24` ("BOL Issues"); `LoadRow.tsx:197-199`; `ExpandDrawer.tsx:409`; `Sidebar.tsx:88` ("BOL Queue")                                                           | Something truck-related?                                        | Bill of Lading — the shipping document                                                                                                                                                                           |
| **PCS**                                                       | `DispatchDesk.tsx:504, 509` ("PCS Start #")                                                                                                                                 | Some kind of counter?                                           | A separate dispatch/accounting system Jessica enters loads into. Never named in UI.                                                                                                                              |
| **FSC**                                                       | `ExpandDrawer.tsx:578` ("FSC")                                                                                                                                              | ???                                                             | Fuel Surcharge — in the Financial panel, no tooltip                                                                                                                                                              |
| **Demurrage**                                                 | `ExpandDrawer.tsx:605-645`                                                                                                                                                  | Looks like a warning because it's amber — maybe "load is late"? | Fee charged when a truck is detained beyond loading/unloading grace period. **Amber color makes it look like an error but it's a normal billing line.**                                                          |
| **Reconciled**                                                | `FilterTabs.tsx:11, 22`; `DispatchDesk.tsx:108, 120, 152`                                                                                                                   | Some kind of approved?                                          | Internal status: assignment's photo/ticket data has been matched to the load record but not yet fully validated.                                                                                                 |
| **Validated** vs **Approved** vs **Confirmed** vs **Entered** | `FilterTabs.tsx:23`; `LoadRow.tsx:36-45, 140`; Validation.tsx buttons "Confirm"/"Approve All Tier 1" (line 341, 436, 588); `DispatchDesk.tsx:568, 574` ("Mark All Entered") | Four words for "done"?                                          | Each has a distinct meaning in the workflow: **Confirmed/Validated** = tier match accepted; **Approved** = Tier 1 bulk-accepted; **Entered** = typed into PCS manually. I would have guessed they were synonyms. |
| **Tier 1 / Tier 2 / Tier 3**                                  | `Validation.tsx:106-141`                                                                                                                                                    | Priority levels?                                                | Confidence of auto-match: T1 = Job ID hit, T2 = fuzzy match, T3 = no match. Descriptions are there ("High Confidence -- Job ID Match") but the phrase "Job ID Match" assumes I know what a Job ID is.            |
| **Dispatch Ready** / **Ready to Build** / **ready**           | `FilterTabs.tsx:23`; `DispatchDesk.tsx:123, 319, 573`                                                                                                                       | Ready for what?                                                 | "Ready to Build" means "ready to be typed into PCS". The word _build_ confused me — I thought it meant build the load (assemble cargo).                                                                          |
| **Job ID**                                                    | `Validation.tsx:119` ("Job ID Match")                                                                                                                                       | ???                                                             | Some kind of customer work order ID. Never defined.                                                                                                                                                              |
| **Clipboard Bridge // Pre-PCS Staging**                       | `DispatchDesk.tsx:420` (subtitle under "Dispatch Desk")                                                                                                                     | Metaphor — like a clipboard?                                    | Marketing-speak subtitle. I genuinely cannot tell if "Clipboard" is a metaphor or a real feature.                                                                                                                |
| **Photo BOL** (fka JotForm)                                   | `ExpandDrawer.tsx:428`                                                                                                                                                      | The photo of the BOL document?                                  | Correct guess. OK this one I'd probably figure out.                                                                                                                                                              |
| **Mark Entered** / **Entered**                                | `LoadRow.tsx:261, 265`; `DispatchDesk.tsx:573`                                                                                                                              | Marked as entered… into what?                                   | "Entered into PCS". Again, PCS is never defined.                                                                                                                                                                 |
| **Assignment**                                                | `Validation.tsx:698` ("Assignment"); `DispatchDesk.tsx:212`                                                                                                                 | A task I'm assigned?                                            | A row that links a load to a well — the unit of work in validation. Not the user's assigned task.                                                                                                                |
| **Well**                                                      | Everywhere                                                                                                                                                                  | A water well?                                                   | Oil/gas production well — these are the destinations loads go to. Industry-obvious, but worth noting for dispatchers coming from general freight.                                                                |
| **Well Picker** / **Dispatch Desk**                           | `Sidebar.tsx:83` ("Dispatch Desk")                                                                                                                                          | A desk in the office?                                           | The primary working screen. "Desk" is a spatial metaphor; not a page noun I'd have guessed.                                                                                                                      |
| **PropX**                                                     | (not found in frontend code)                                                                                                                                                | ???                                                             | Round 1 complaint said to watch for it — I don't see it in the frontend src, so either it's been removed or it's in the backend/help-text that doesn't render. Not a jargon risk in the UI right now.            |
| **BOL last-4 match**                                          | `ExpandDrawer.tsx:428`; `LoadRow.tsx:203` (`title="BOL last-4 match"`)                                                                                                      | Last 4 digits of what, matched against what?                    | Last 4 digits of the BOL number on the load record vs. the photo's captured BOL number. It's a sanity check. Not explained in UI.                                                                                |
| **Tier 3 -- Unresolved -- Manual Required**                   | `Validation.tsx:136`                                                                                                                                                        | Broken?                                                         | The load couldn't be auto-mapped to a well. I need to pick the well manually. Copy is good here — "Manual Required" actually helps.                                                                              |

---

## NEW Issues (HIGHEST PRIORITY)

### 1. **"BOL Issues" filter tab is now rendered as "Bol Issues"** — **HIGH** (Round 1 regression)

- **Where:** `frontend/src/components/FilterTabs.tsx:38`
- **How I hit it:** I clicked around Dispatch Desk and saw "Bol Issues" as a tab label. Round 1 notes said this was fixed to say "BOL Issues" but the button has `className="... capitalize ..."` which downcases all but the first letter of each word. The FILTER_LABELS map sets "BOL Issues" but the CSS mangles it at render time.
- **What I'd expect:** The literal label from FILTER_LABELS. **Fix:** remove `capitalize` from the className (line 38). Same risk on `BolQueue.tsx:206`.

### 2. **Single-load Validate button has no confirm dialog** — **HIGH**

- **Where:** `frontend/src/pages/DispatchDesk.tsx:226-240` (`handleValidateSingle`) and `:1104` (onValidate binding on `LoadRow`)
- **How I hit it:** I mis-scrolled with my cursor over the green `Validate` button on a load row. The click went through instantly. A `POST /dispatch/validation/confirm` fires, the load state flips, and I get a toast "Load validated" — no way to undo.
- **What I'd expect:** At minimum, a confirmation modal like the bulk version already has. Better: a toast with an "Undo" affordance for ~5 seconds.

### 3. **"Loads (set date)" toggle copy is confusing** — **MEDIUM**

- **Where:** `frontend/src/pages/DispatchDesk.tsx:676`
- **How I hit it:** I clicked the Loads toggle while no date was set. The button says "Loads (set date)" and the content area shows an icon + "Set a date above to view loads across all wells". It's a two-step instruction hidden in a parenthetical. I didn't realize the date picker at the top-right of the page was what I needed to set — I was looking for a "Set date" button inside the empty state.
- **What I'd expect:** The empty state's "Set a date above" text should point visually (arrow, highlight, or literal "Click the date picker in the top-right corner →"). Or better, make the date picker inline when loads view is empty.

### 4. **"Today's Objectives" homepage card is clickable only if pending validations exist** — **LOW**

- **Where:** `frontend/src/pages/ExceptionFeed.tsx:82-95`
- **How I hit it:** I landed on the homepage. The "Needs Attention" card is a button that navigates to `/validation`. But the "Confirmed & Ready" (line 98) and "System" (line 108) cards look identical — same size, same border treatment, same hover affordances on the container — but they're plain `<div>`s with no onClick. I tried to click "Confirmed & Ready" to see the list of ready loads. Nothing happened. See "Confusing Affordances" below.

### 5. **Validation page: expanded detail panel is the only place to edit fields — not announced** — **MEDIUM**

- **Where:** `frontend/src/pages/Validation.tsx:608-706`
- **How I hit it:** I went to Validation, saw a row, saw its Confirm/Reject buttons. I wanted to correct a driver name before confirming (Jessica said this happens often). There's no visible "edit" icon on the collapsed row. I clicked around and eventually noticed a `chevron_right` arrow at the far left that I had missed. Expanding the row reveals inline edit fields. This feature is invisible at first glance.
- **What I'd expect:** Either a visible "Expand to edit" hint, or edit icons next to editable fields on the collapsed row.

### 6. **"Demurrage" amber block looks exactly like a warning alert** — **MEDIUM**

- **Where:** `frontend/src/components/ExpandDrawer.tsx:604-645`
- **How I hit it:** I opened a load in the drawer to look at its details. I saw a big amber (`#fef3c7` background, `#92400e` text, `#f59e0b` border) panel with bold numbers in it. My instinct: there's a problem with this load. I started looking for what I did wrong. Actually it's a routine financial line item. The color language (amber = warning in every other web app on earth) is actively misleading.
- **What I'd expect:** Use neutral/info coloring (matching the Financial Detail panel style at line 563-601) unless the demurrage is _excessive_, in which case add an explicit warning badge. Or at least a `title=` tooltip: "Demurrage = detention fees when a truck waits beyond free time."

### 7. **"Mark Entered" per-row button is just the word "Entered"** — **LOW/MEDIUM**

- **Where:** `frontend/src/components/LoadRow.tsx:252-267`
- **How I hit it:** On a validated row I see the label "Entered" both as a clickable button and as a non-clickable status text after entering. Same word, two very different states. Round 1 notes promised a checkmark icon which _is_ there (`check_circle`), but the text is still just "Entered" — not "Mark Entered" like the command bar.
- **What I'd expect:** "Mark Entered" before, "✓ Entered" after. Match the command bar's copy.

---

## Login First-Impression

The animation is actually lovely. The staggered letter fade-in + breathing opacity reads as "alive, not dead" rather than "broken, loading forever". No `prefers-reduced-motion` guard though (`grep` finds zero matches) — someone with motion sensitivity would get the full 1.2s entrance plus perpetual random letter dimming on the background. On a slow morning the entrance is fast enough not to feel like a barrier (~1.2s total). The brand itself, though — "Es" in purple, "Express" in ghost grey, "Command Center" in tiny uppercase — gives me zero information about _what I'm logging into_. A one-line tagline like "Oilfield water dispatch" or "Loads, wells, tickets" would have told new-hire-me what company I work at. Right now it could be a Netflix dashboard or a crypto exchange.

`Login.tsx:1-338` is beautiful code, would ship. Just add the `prefers-reduced-motion` escape hatch and a one-line product subtitle.

---

## Confusing Affordances

1. **"Confirmed & Ready" and "System" cards on homepage look clickable but aren't** (`ExceptionFeed.tsx:98-142`). Same border, same shadow, same hover would trigger... but they're `<div>`s, not `<button>`s. The "Needs Attention" card next to them is a button. Visual pattern mismatch.
2. **"Demurrage" panel looks like a warning** — covered above. Not a button, but reads as an urgent alert.
3. **"Validate" green button on each load row fires instantly** — it _looks_ like an action button (good) but there's no dangerous-action affordance (red border, two-step click, modal). Single click = committed state.
4. **Tier cards on Validation page** (`Validation.tsx:348-385`) are clickable accordion toggles but look like stat cards. I spent ~10 seconds trying to figure out if they were counters or buttons. The chevron shows up on the right eventually.
5. **`title="Click to edit"` on InlineEdit buttons** — the tooltip only appears on hover, and the visual styling is identical to a plain text value. I didn't realize the Validation page driver name was editable until I accidentally moused over.
6. **"Today's Objectives" on homepage vs "Today's Objectives" on Dispatch Desk** (`ExceptionFeed.tsx:64`, `DispatchDesk.tsx:755`) — two completely different widgets with the same heading. Confusing when I navigate between them.
7. **"Clipboard Bridge // Pre-PCS Staging"** subtitle under Dispatch Desk heading — I cannot tell if this is metaphor or real. No other page has a subtitle like this.

---

## Quick Wins for Round 3 (<30 min each)

1. **Remove `capitalize` class from FilterTabs** (`FilterTabs.tsx:38`) — one-character fix that restores "BOL Issues" and doesn't lowercase other labels. Same fix at `BolQueue.tsx:206`.
2. **Add `window.confirm` to `handleValidateSingle`** (`DispatchDesk.tsx:226`) — copy the pattern from `handleBulkValidate` at line 207. 3-line change.
3. **Define jargon in `title=` tooltips on the labels themselves.** For each of the ~6 worst offenders (BOL, PCS, Demurrage, FSC, Reconciled, Tier), add `title="Bill of Lading — shipping document"` etc. to the element bearing that text. Zero DOM additions.
4. **Make the 2 non-interactive homepage cards into real buttons.** Point "Confirmed & Ready" to `/dispatch-desk?filter=ready`. Point "System" somewhere useful or make it visually distinct (different border, no shadow). `ExceptionFeed.tsx:98-142`.
5. **Add `@media (prefers-reduced-motion: reduce)` in the login `<style>` block** — kill the breathing animation + entrance for motion-sensitive users. 6 lines.

---

## Bigger Asks

1. **A `?` help button in the header or sidebar** opening a drawer with (a) a glossary of the 15 jargon terms above and (b) a short "your first day" checklist. This single addition would cut my Jessica-questions in half. The FeedbackWidget proves the team can ship right-side floating drawers already.
2. **A `/glossary` route** with the jargon table above, linkable from the help button. Could be static markdown rendered in a Layout-wrapped page. ~2 hours of work.
3. **Onboarding tour** (e.g. Driver.js, Shepherd, Intro.js) that runs once on first login. Walks through Login → Today's Objectives → Dispatch Desk → Validation with callouts explaining each term.
4. **Undo toast on single-load Validate** — "Load #1234 validated. [Undo]" for 5s before committing backend state. Better UX than a confirm dialog.
5. **Replace "Reconciled" with a plainer label.** "Data Matched" or "Ticket Matched" would telegraph what the state means. Or drop the filter entirely if Reconciled is a transient state Katie shouldn't be looking at.
6. **Color audit of the Demurrage panel.** Amber = warning is deeply baked into user expectations. Use the same neutral treatment as Financial unless the value is problematic.
7. **Rename "Clipboard Bridge // Pre-PCS Staging"** to something a new hire can parse. "Loads ready to type into PCS" is plainer.

---

## Notes for Next Session

- Browser MCP still unreachable (Chrome at 172.17.96.1:9222 refused connection). Skipped per spec after first attempt.
- The 6-word `capitalize` regression on FilterTabs is the lowest-effort Round 1 follow-up and should be the first fix.
- The lack of a confirmation on single-load Validate is the highest-risk finding from a new-hire-safety standpoint — a misclick directly modifies production data with no prompt.
- Interesting side-effect I noticed: `LoadRow.tsx:100-114` uses `grid-template-columns` with 9 columns of fixed widths + `1fr`. On narrow screens the "BOL / Truck" column will clip. Not my audit scope, but worth flagging.
- Nothing in the frontend/src tree references "PropX". It's either backend-only or has been removed. Not a jargon risk in current UI.
- FeedbackWidget (`components/FeedbackWidget.tsx`) has an icon labeled `help` in its category dropdown (line 11). This is the _closest thing_ to a help surface in the app — but it's a _submit feedback_ form, not a _get help_ form. A new hire might click it thinking they'd get answers.
