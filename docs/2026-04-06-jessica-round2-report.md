# Jessica Round 2 Report

**Date:** 2026-04-06
**Tested via:** code review only (Chrome DevTools MCP was unreachable — "Could not connect to Chrome" — fell back to code-only per the handoff's fallback instructions)

## Verified Fixes from Round 1

1. **Login monogram "Es" + ghosted "Express"** — works as expected. `frontend/src/pages/Login.tsx:259-273`. "Es" is solid primary-container, "Express" is `text-on-surface/[0.25]` rendered through `GhostTitle` with a per-letter random breathe cycle. Monogram, accent bar, and subtitle all animate in sequence (`loginEntrance` 1.2s, `accentGrow` 0.8s at +1s, `subtitleFade` 0.8s at +1.2s, `fieldSlide` 0.6s at +1.4s). See caveat in NEW issues.
2. **Sidebar branding matches login** — works. `frontend/src/components/Sidebar.tsx:65-73` shows the same "Es" + faded "Express" + "Command Center" subtitle. Correctly static (no breathing) in the sidebar so it's not distracting.
3. **Wells / Loads toggle when no well selected** — works with caveats. `frontend/src/pages/DispatchDesk.tsx:636-689`. See caveats in Wells/Loads findings.
4. **Pagination both views, 25/50/100/200 sizes** — works. `frontend/src/components/Pagination.tsx:1` exports `PAGE_SIZES = [25, 50, 100, 200]`. `DispatchDesk.tsx:1213-1230` conditionally renders the `Pagination` both for single-well and all-wells/Loads view. Page resets to 1 when page size changes.
5. **Select All checkbox in column headers** — works. Two header rows at `DispatchDesk.tsx:889-938` (all-wells Loads view) and `DispatchDesk.tsx:1017-1069` (single-well view). Both render a working "select all / deselect all" checkbox keyed on `selectedIds.size === filteredLoads.length`.
6. **Individual checkboxes work (stopPropagation fix)** — works with caveats. `LoadRow.tsx:119` has `onClick={(e) => { e.stopPropagation(); if (!isMissing) onToggleSelect(); }}`. Caveat: the `<input type="checkbox">` itself has `readOnly`, `pointer-events-none`, and no `onChange` handler (lines 124-130). It is NOT keyboard accessible. A user Tab'ing through the row cannot focus and space-bar-toggle the checkbox. Click works, keyboard doesn't.
7. **Filter tabs human labels ("Ready to Build", "BOL Issues")** — works in the label map (`FilterTabs.tsx:17-25`) but BUG: line 38 still has `capitalize` CSS class, which will transform "Ready to Build" into "Ready To Build" and "BOL Issues" into "Bol Issues". See NEW issues.
8. **"Mark Entered" button with checkmark icon** — partially works. `LoadRow.tsx:253-261` renders a check_circle icon + label "Entered". The label is literally "Entered" — not "Mark Entered". `DispatchCard.tsx:314` (an unused-in-desk component) correctly reads `"Mark Entered"`. In the DispatchDesk view the dispatcher sees a button labeled "Entered" which reads like a status not an action.
9. **"Photo BOL" label (was "JotForm")** — works. `ExpandDrawer.tsx:428` shows `Photo BOL: ...${jotLast4}` on mismatch. Grep for "JotForm" in user-facing labels came back clean.
10. **Trailer # + Delivered Date now inline-editable** — Trailer works (`ExpandDrawer.tsx:374-380`, backend PATCH schema whitelists `trailerNo`). **Delivered Date is BROKEN.** See NEW issues — this is the highest-severity finding.
11. **Photo thumbnail h-48 + click-to-zoom** — works. `ExpandDrawer.tsx:292` is `className="w-full h-48 object-cover ... cursor-zoom-in"` and onClick opens the resolved URL in a new tab.
12. **Validation page inline editing for Driver/Carrier/Weight/BOL/Ticket** — works for those five fields. `Validation.tsx:648-677` uses `InlineEdit` which calls `useUpdateLoad`; the backend schema at `loads.ts:95-111` declares all five. Toast confirms. Caveat: you must click the row to expand it first before you can see the editable fields — two clicks to edit, not one. Jessica's friction prediction: a dispatcher who wants to quickly fix a weight on 5 loads will click, expand, click field, type, enter, collapse, click next row, expand, etc.
13. **PCS Start # tooltip** — works. `DispatchDesk.tsx:504-505` has `title="The starting sequence number in PCS for this batch. Loads are numbered sequentially from this value when marked as entered."`. Still confusing — see Still Open.
14. **validateFromSheet bug fixed (no more invalid "matched" status)** — partially. Grep for `photoStatus.*matched` finds `backend/src/plugins/sheets/services/sheets.service.ts:1052` still has `assignment.photoStatus === "matched"` as a READ comparison (dead branch — production photoStatus values are `attached`/`pending`/`missing` per MEMORY.md). It won't crash because nothing is being WRITTEN as "matched" any more, but the dead branch is misleading and should be removed.

## Still Open from Round 1

- **PCS Starting # still confusing despite tooltip.** The tooltip only fires on hover — mobile/touch users never see it. And the label "PCS Start #" gives no hint of what it's for until you hover the whole box. Would be better as a small `?` icon with an accessible popover, or an inline helper line below the field.
- **No "ready for PCS" handoff report — no shareable list to hand to Stephanie.** VERIFIED STILL BROKEN. I grep'd the entire repo for export/csv/pdf/handoff/report endpoints and there is NOTHING. The closest thing is `ExpandDrawer.handleCopyAll` (lines 258-277) which copies a SINGLE load's fields as text. No way to select N loads, click one button, and get a text/CSV block to paste into a chat message or email. I'm still texting Stephanie my list every morning. This is the single biggest missing workflow fix.
- **No "last refreshed" timestamp on home page.** VERIFIED STILL BROKEN. `ExceptionFeed.tsx` renders the date of today (line 66-72) but nowhere uses React Query's `dataUpdatedAt` to show "data as of HH:MM". Data DOES refresh every 30s via `refetchInterval` (`use-wells.ts:42,51,60,68,76,100`) but I have no way to know when the last successful refresh was. If the backend hiccups for 2 minutes I would not know I'm looking at stale numbers.
- **Photo thumbnail size vs full photo.** The h-48 thumbnail is bigger than before and click-to-zoom works, but there's still no side-by-side comparison view. Round 1 complaint partially addressed.
- **No overall validated progress counter in well header.** The well header in the single-well view shows counts by filter in the FilterTabs legend (`FilterTabs.tsx:57-73`), including "N validated", but there's no "X of Y validated" progress bar specific to the selected well. Today's Objectives has a global progress bar (`DispatchDesk.tsx:747-773`) but inside a well view there's no equivalent.

## NEW Issues (HIGHEST PRIORITY)

### 1. CRITICAL: Delivered Date inline-edit is broken at the backend

- **Severity:** critical
- **Where:** `frontend/src/components/ExpandDrawer.tsx:454-465` sends `fieldKey="deliveredOn"`, routed through `useUpdateLoad` at `frontend/src/hooks/use-wells.ts:145-162`, which PATCHes `/dispatch/loads/:id`. The backend route at `backend/src/plugins/dispatch/routes/loads.ts:95-111` has body schema with `additionalProperties: false` and does NOT list `deliveredOn` in its `properties`.
- **Repro:** Open any load's ExpandDrawer. Click the "Delivered" field. Pick a new date. Press Enter or blur. In the current deployed code the frontend will call PATCH with `{deliveredOn: "2026-04-06"}`; Fastify will reject it with a 400 "must NOT have additional properties" validation error; `EditField.commit` will hit the `onError` branch and show a toast "Update failed: ...". The date in the UI will revert.
- **Why it matters to me (Jessica):** The whole point of fix #9 was so we could fix a wrong delivery date inline without paging Kyle. Round 1 fix ships a UI for a capability that doesn't actually exist on the backend. Dispatcher clicks, types, gets an error toast, feels stupid, opens a ticket. Worst possible outcome — we built the button but didn't wire it up. The underlying `loads.service.updateLoad` already handles `deliveredOn` correctly (converts string to Date, `loads.service.ts:82-95`), so this is a one-line fix: add `deliveredOn: { type: ["string", "null"], format: "date" }` to the PATCH schema properties list.
- **Screenshot:** n/a (code-only review)

### 2. HIGH: "capitalize" class destroys the human filter labels

- **Severity:** high (visual/trust; tiny fix)
- **Where:** `frontend/src/components/FilterTabs.tsx:38` — button className contains `capitalize`, applied to a label that already reads `"Ready to Build"` (from `FILTER_LABELS` dictionary line 22) and `"BOL Issues"` (line 24).
- **Repro:** Load DispatchDesk, pick a well, look at filter tabs. CSS `text-transform: capitalize` will uppercase the first letter of every word. "Ready to Build" becomes "Ready To Build", "BOL Issues" becomes "Bol Issues" (and lowercases everything else — the "BOL" acronym is destroyed). This is exactly the fix Round 1 was supposed to ship and the CSS class nukes it.
- **Why it matters to me (Jessica):** "Bol Issues" looks broken and unprofessional, especially after we specifically fixed it. Trivial fix — remove the `capitalize` class since the label dictionary already has the exact casing we want.

### 3. HIGH: Checkbox not keyboard-accessible (WCAG failure)

- **Severity:** high (accessibility / compliance)
- **Where:** `frontend/src/components/LoadRow.tsx:117-131`. The outer `<div>` has `onClick` that calls `stopPropagation + onToggleSelect`, but the actual `<input type="checkbox">` has `readOnly`, `pointer-events-none`, and no onChange. Keyboard users Tab'ing through the page cannot toggle selection.
- **Repro:** Open DispatchDesk with any well. Tab through the page — the checkbox is focusable only if it's not pointer-events-none, but even if it is, the `readOnly` + missing onChange prevents space-bar toggling. Screen reader users cannot select loads.
- **Why it matters to me (Jessica):** I know ES Express isn't WCAG-certified, but Katie uses keyboard shortcuts all the time and Stephanie has RSI so she bounces between keyboard and mouse. If selection only works by mouse click, our fastest people are slower. Also creates compliance risk if we ever pitch this to a bigger client. Fix: drop `readOnly` and `pointer-events-none`, stopPropagation on the input's own onChange, and move the toggle there.

### 4. MEDIUM: "Mark Entered" button in LoadRow reads "Entered" (label regression)

- **Severity:** medium
- **Where:** `frontend/src/components/LoadRow.tsx:253-261`. Renders `<button>...Entered</button>` with a check_circle icon. Round 1 said "Mark Entered button with checkmark icon" — the icon is there, the label is not. The unrelated `DispatchCard.tsx:314` correctly says "Mark Entered" but DispatchCard isn't the desk view.
- **Repro:** On DispatchDesk with a well with validated (but not entered) loads, look at the rightmost button. It says "Entered", identical in label to the post-click state on line 264 (`<span>Entered</span>`). Confusing: is it an action or a status?
- **Why it matters to me (Jessica):** New hires will definitely think the load is already entered and skip it. Should read "Mark Entered" pre-click and "Entered" post-click for clarity.

### 5. MEDIUM: Login animation ignores `prefers-reduced-motion`

- **Severity:** medium (accessibility)
- **Where:** `frontend/src/pages/Login.tsx:239-256`. Four `@keyframes` (`loginEntrance`, `accentGrow`, `subtitleFade`, `fieldSlide`) plus the `GhostTitle` breathing component — all hardcoded `setTimeout` / CSS transitions. No `@media (prefers-reduced-motion: reduce)` override.
- **Repro:** Turn on "Reduce motion" in your OS accessibility settings. Open the login page. You'll still see the full 2-second staggered entrance and the ghost-letter breathing animation runs indefinitely.
- **Why it matters to me (Jessica):** Two of our drivers have vestibular sensitivity. Also, on a busy Monday morning where I'm logging in on my phone during my commute, 2 seconds of animation before the form is interactive feels slow. Should respect the OS setting. At minimum wrap the keyframes in `@media (prefers-reduced-motion: no-preference)`.

### 6. LOW: Empty Loads view doesn't suggest fix

- **Severity:** low
- **Where:** `frontend/src/pages/DispatchDesk.tsx:866-874`. When `pickerView === "loads"` and `!dateFilter`, the view shows "Set a date above to view loads across all wells".
- **Repro:** Open DispatchDesk without a well selected, click the Loads tab. You see the message. It tells you to "set a date above" but the date picker is 300px up in the page header, not inside the Loads card. The first time a user clicks Loads, their eyes are on the center of the page — they have to scan back up to find the picker.
- **Why it matters to me (Jessica):** Minor, but our new hires will definitely hit this. A small inline date picker inside the empty state would remove one cognitive step.

### 7. LOW: Loads tab count only shows when date is set

- **Severity:** low
- **Where:** `frontend/src/pages/DispatchDesk.tsx:676-687`. The Loads tab button reads `Loads {dateFilter ? "" : "(set date)"}` and only renders its count pill when a date is set.
- **Repro:** No date → tab reads "Loads (set date)", no count. Set a date → tab reads "Loads" with count "23". Inconsistent with the Wells tab which always shows a count.
- **Why it matters to me (Jessica):** Asymmetry looks buggy. Could instead always show the count with an em-dash when date is empty, or use a small icon hint.

## Validation Workflow Findings

Specifically: does inline editing on Validation page improve flow?

**Partial improvement, new friction created.**

Code review of `Validation.tsx:484-708` shows the edit fields are inside an expanded row panel (`expandedId === a.id` check at line 609). That means the workflow for fixing a Tier 2 match with a typo'd weight is:

1. Click row to expand (`setExpandedId`)
2. Click the weight field to enter edit mode (`setEditing(true)` inside `InlineEdit`)
3. Type new value, press Enter
4. Click Confirm (which is in the collapsed row, so you have to look away from the expanded panel to click it)
5. Click the next row to move on (previous row collapses automatically because only one can be expanded: `expandedId === a.id ? null : a.id`)

Compared to Round 1 where editing was impossible at all (you had to go to Dispatch Desk, find the load, edit in ExpandDrawer, come back), this is an improvement. But two clicks to edit + Confirm button visually separated from the edit panel means it's not a clean "edit as you review" flow. A cleaner approach: display all editable fields as always-visible on the row in a compact form, with Confirm/Reject at the right — no expand step needed. Worth considering for the next sprint.

**Does saving work?** Yes for `driverName, carrierName, weightTons, bolNo, ticketNo` — backend schema accepts those. If anyone ever adds a `deliveredOn` or `destinationName` edit here, it will silently break unless the backend schema is updated (same root cause as NEW issue #1).

**Speed:** No meaningful speed improvement in Tier 2 review loop because of the expand/collapse dance. Tier 1 bulk-approve is blazingly fast (great), but that wasn't Round 1's target.

## Wells/Loads Toggle Findings

**Discoverability:** Medium. The toggle is at the top of the page body (`DispatchDesk.tsx:636-689`) below the page header and wells tabs, with decent visual weight (text-xs, bold, purple-on-active). It's clear it's a toggle. But a first-timer wouldn't know what "Loads" means versus "Wells" without trying it. A one-line help text underneath the toggle would fix this.

**Useful for me (Jessica):** Wells view for my morning sweep ("which wells are behind today"). Loads view I would use when a specific driver has been running all day and I want to see every load that's posted regardless of well. Both are valuable.

**Empty states:**

- `pickerView === "wells"` + no wells → "No wells with loads found" (line 852-861). Fine.
- `pickerView === "loads"` + no date → "Set a date above to view loads across all wells" (line 866-874). See NEW issue #6.
- `pickerView === "loads"` + date set + no loads → "No loads found for this date" (line 985-994). Fine.

**Pagination across views:** Works in both views — `DispatchDesk.tsx:1213-1230` renders the `<Pagination>` component when either (a) a well is selected and has loads or (b) no well but loads view with date. Page resets to 1 when pickerView changes (`setPage(1)` at lines 640 and 665). Correct.

**Pagination + filter interaction:** Potential bug — when you change the filter tab (e.g., all → BOL Issues), the `page` state is NOT reset. If you were on page 5 of 23 under "all" and then click "BOL Issues" which only has 4 items total, you'd be on page 5 of 1 and the list would be empty. Let me read the filter handler at `DispatchDesk.tsx:583-586`: yep, it only calls `setActiveFilter` and `track`, doesn't reset page. Filter switch should reset page to 1. Not in my top 5 but worth fixing.

## Quick Wins for Round 3 (each <30 min)

1. Remove `capitalize` class from FilterTabs button (NEW #2). Single-line change.
2. Add `deliveredOn` to the backend PATCH body schema in `loads.ts:95-111` (NEW #1). Also one line, but save-the-dispatcher impact is huge.
3. Change LoadRow button label to "Mark Entered" pre-click (NEW #4). Two-character change.
4. Reset `page` to 1 in the filter tab onChange handler (Wells/Loads findings). One line.
5. Add "last refreshed HH:MM" to ExceptionFeed header using `wellsQuery.dataUpdatedAt` (Round 1 complaint #3). ~10 lines.

## Bigger Asks (next sprint)

1. **Handoff report to Stephanie.** This is the #1 unmet Round 1 ask. Options:
   - "Copy ready loads as text" button in the FilterTabs legend, when `activeFilter === "ready"` — one click, dumps the visible loads as a clipboard-ready text block with load#, driver, BOL, ticket, weight.
   - Or a proper endpoint `GET /dispatch/dispatch-desk/:wellId/export?format=csv` that returns a CSV.
   - Stephanie said she'd paste it into Teams chat, so text is probably better than CSV.

2. **Validation page: always-visible editable row** (not hidden inside expand). Remove the `expandedId` gate or auto-expand the row on hover/focus.

3. **WCAG-accessible LoadRow checkbox.** Refactor away from `readOnly` + `pointer-events-none` pattern; let the native input handle onChange + keyboard.

4. **Reduced-motion support site-wide.** Login is one case, but the breathing GhostTitle, hover-lift cards, stat-glow, etc. should all respect `prefers-reduced-motion: reduce` via a global CSS media query in the root stylesheet.

5. **Diagnostics surface.** Not strictly UX but related: Jessica wants a "am I looking at fresh data?" signal. Per the project's patterns.md diagnostics convention, a small badge in the sidebar showing backend `/diag/health` state + most-recent fetch age would kill three of my Round 1 complaints in one shot.

## Notes for Next Session

- Browser was unreachable (Chrome DevTools MCP returned "Could not connect to Chrome. Check if Chrome is running" from `http://172.17.96.1:9222`) so I could not verify the animation visual quality, the actual rendered "capitalize" CSS effect, or reproduce the Delivered Date error toast. All findings here are code-traced. Recommend re-running browser verification on the three bugs marked CRITICAL/HIGH once the browser is free.
- `backend/src/plugins/sheets/services/sheets.service.ts:1052` still references `"matched"` as a READ comparison in a photoStatus check. It's dead code (photoStatus is only ever written as `attached`/`pending`/`missing` per MEMORY.md) but it's misleading. A one-line cleanup.
- MEMORY.md note about "Fastify strips undeclared params" is specifically for query strings. For request bodies with `additionalProperties: false`, Fastify's default ajv config REJECTS with a 400 error instead of stripping. This is relevant to NEW issue #1 — the delivered-date edit would fail with an error toast, not silently. Dispatcher will see "Update failed: body/deliveredOn must NOT have additional properties" (or similar), which is at least honest but still broken.
- I did not test the actual animation frame rate / jank of the Login particle background (`Login.tsx:115-207`). On a low-end laptop the `requestAnimationFrame` loop drawing 120 particles + pairwise distance checks (O(n²) = 14,400 ops/frame) could cause CPU spikes. Worth profiling in a browser session.
- The `bol_mismatch` filter logic is duplicated three times in `DispatchDesk.tsx` (lines 140-145, 160-167, 959-969) — same last-4-digit comparison each time. A utility function `isBolMismatch(load)` would be cleaner. Not a bug, just tech debt.
