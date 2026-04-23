# Friday function-test checklist — pre-Jessica send

**Purpose:** verify every interactive surface works before Jessica gets the validation email. Form-vs-function — we're testing function only. UI looking slightly off is fine; broken function is fatal.

**Run by:** human walking through manually, OR claude agent via chrome-devtools MCP pointed at the deployed URL.

**Pass criteria:** every checkbox checked OR has an open ticket linked. No checkbox left ambiguous.

**Failure protocol:** any FAIL → log it inline → fix → re-run that section. If a fix takes >30 min, escalate (drop the feature from the demo, route around it, or push deadline).

---

## Pre-flight (5 min)

- [ ] Vercel deploy succeeded — `vercel deploy --prod --yes` returned a URL, not an error
- [ ] Visit deployed URL → returns SPA (not maintenance page)
- [ ] `curl -sI https://app.esexpressllc.com/` → `200`, `last-modified` is today
- [ ] `curl https://backend-production-7960.up.railway.app/api/v1/diag/health` → `status: green`
- [ ] `curl https://backend-production-7960.up.railway.app/api/v1/diag/cron-health` → 200, all sources `ok: true`
- [ ] Check Railway logs for last 4 hours — no recurring 500s or unhandled promise rejections

---

## Auth (10 min)

- [ ] **Login page renders** — navigate to /login, see form
- [ ] **Password login works** — admin credentials → lands on home (ExceptionFeed)
- [ ] **Logout works** — sidebar logout → returns to /login
- [ ] **Magic link request works** — enter email → "check your email" message
- [ ] **Magic link landing renders** — paste a valid magic-link URL → lands authenticated on home
- [ ] **Bad credentials** — wrong password → red error visible, doesn't crash
- [ ] **Auth-protected routes redirect** — log out, try /workbench → bounces to /login
- [ ] **Token refresh works** — leave logged-in tab open 10+ min, do an action → no 401 surprise

---

## Home page (ExceptionFeed) (10 min)

- [ ] **Page loads with no console errors** — DevTools console clean
- [ ] **"Loads Mapped" stat renders a real number** (not "..." stuck)
- [ ] **"Photos Attached" stat renders**
- [ ] **"Wells Active Today" stat renders**
- [ ] **"Needs Attention" / "Confirmed & Ready" cards render with counts**
- [ ] **Click "Needs Attention" → navigates to /validation**
- [ ] **Click "Confirmed & Ready" → navigates to /dispatch-desk** (or /workbench)
- [ ] **Matcher pill renders** with a percentage
- [ ] **Click Matcher pill → navigates to /admin/missed-loads**
- [ ] **NEW: PCS pill renders** — either "PCS: N items" (amber) or "PCS: aligned" (green)
- [ ] **NEW: Click PCS pill → navigates to /admin/discrepancies**
- [ ] **Wells table renders** with rows
- [ ] **Click a well row → navigates to /wells/<id> well workspace**
- [ ] **SyncPipelineStrip shows recent sync activity**
- [ ] **"Updated" timestamp pill shows recent time**

---

## Sidebar nav (5 min)

- [ ] Every link is keyboard-tab accessible
- [ ] Focus state visible on tab-focus
- [ ] **All sidebar links navigate to a real page** — click each:
  - [ ] Home / Exception Feed
  - [ ] Workbench
  - [ ] BOL
  - [ ] Validation
  - [ ] Dispatch Desk (or its redirect)
  - [ ] Finance
  - [ ] Load Report
  - [ ] Admin → Wells
  - [ ] Admin → Companies
  - [ ] Admin → Users
  - [ ] Admin → Load Diagnostics (Missed Loads)
  - [ ] Admin → Scope Discovery
  - [ ] **NEW: Admin → What PCS Sees**
  - [ ] Settings
  - [ ] Archive
- [ ] Sidebar collapse/expand works (if collapsible)
- [ ] Active link highlighted differently from inactive

---

## Workbench (the highest-traffic surface) (15 min)

- [ ] Page loads with rows
- [ ] **All filter chips work** — Uncertain, Ready-to-Build, Built Today, All
- [ ] **Search box works** — type a ticket/load no, results filter
- [ ] **Date range filter works**
- [ ] **Truck filter works**
- [ ] **Well filter works**
- [ ] **Pagination works** — next/prev page, page-size dropdown
- [ ] **Click a row → drawer opens**
- [ ] **Click row again → drawer closes**
- [ ] **Click DIFFERENT row → drawer switches to new row**
- [ ] **NEW: Workbench row tint** — assignment 185590 (TEST-202604222102) renders with amber left border (has open status_drift discrepancy). Hover → tooltip says "PCS cross-check: warning..."
- [ ] **Inline-edit a field** (driver name, ticket no) → save → value persists on reload
- [ ] **Photo thumbnails render in row**
- [ ] **Bulk-select checkboxes work**
- [ ] **Advance Stage button** advances on a real load
- [ ] **Flag Back button** opens resolve modal
- [ ] **Tabular view toggle works** (if exposed)
- [ ] **Tabular view → click well in left pane → rows narrow**
- [ ] **JotForm freshness chip renders + is green/yellow/red appropriately**
- [ ] **"Run Check" button works** (if visible to dispatcher role)

---

## Workbench drawer (10 min)

- [ ] All sections render: identity fields, weights, rates, timeline, audit log, NEW cross-check
- [ ] **Photo carousel works** — next/prev arrows, lightbox opens, lightbox closes, zoom works
- [ ] **Photo URLs are reachable** (no broken-image icons)
- [ ] **Editable fields save** — click value, edit, blur → persists
- [ ] **Notes textarea saves on blur**
- [ ] **NEW: Cross-Check section renders**:
  - On a load WITH discrepancies (assignment 185590 — status_drift): shows "What PCS sees · 1 issue" header + "Stage differs from PCS" card with v2 + PCS values
  - On a load WITHOUT discrepancies: shows "What PCS sees" + "v2 and PCS agree on this load" check
- [ ] **NEW: "resolve" button on a discrepancy works** — click → discrepancy disappears from drawer + admin index
- [ ] **Audit log entries render** — gear icon for system, person icon for human
- [ ] **Stage transition timeline renders**
- [ ] **Drawer error boundary works** — if a render fails, fallback shows error, not blank

---

## /admin/discrepancies (NEW — primary new surface) (10 min)

- [ ] Page loads with header "What PCS sees"
- [ ] Header subtitle reads correctly
- [ ] "Last refreshed" timestamp shows
- [ ] **Type filter chips** render — All, Stage differs, Weight differs, Different well, Photo missing, Rate differs, Destination not mapped
- [ ] **Type filter chips work** — click each → list narrows
- [ ] **"All" chip restores full list**
- [ ] **Severity filter chips** render and work — Info, Warning, Critical
- [ ] **3 discrepancy rows visible** (status_drift on 185590, 2 orphan_destinations)
- [ ] **Each row shows**: type label, timestamp, ticket/well info if available, message, v2 vs PCS values
- [ ] **Severity dot color matches severity** (info=blue, warning=amber, critical=red)
- [ ] **Type description renders** below row in italic muted text
- [ ] **NEW: Orphan rows show suggested-well callout** (after next cron tick) — "Closest existing well: <name> (<n>% match)"
- [ ] **Click "open load" link** on per-assignment row → workbench expands that assignment
- [ ] **Click "open suggested well" / "add to wells"** on orphan row → /admin/wells with optional `?well=N` query
- [ ] **Click "resolve"** → row disappears from list, count updates
- [ ] **Empty state renders correctly** — apply a filter that returns 0 → "v2 and PCS agree" + check icon
- [ ] **Auto-refresh works** — leave page open 5 min, count updates without manual reload

---

## /admin/scope-discovery (10 min)

- [ ] Page loads
- [ ] **"Wells We Discovered" tab** renders with the 163-well list
- [ ] **"In PCS, Not in v2" tab** renders with the 43 missed-by-v2 entries
- [ ] **Tab switching works**
- [ ] **Each entry shows full enriched detail** (city, count, top-city, classification)
- [ ] **No truncated/cut-off rows**

---

## /admin/missed-loads (Load Diagnostics) (5 min)

- [ ] Page loads
- [ ] Matcher accuracy chart renders
- [ ] Recent decisions table renders
- [ ] Sync run history renders

---

## /admin/wells (5 min)

- [ ] Page loads with wells list
- [ ] **Click a well → opens detail with editable fields**
- [ ] **Edit a field → save → persists**
- [ ] **Add alias works** (don't actually add — just verify the input + save button render and respond)
- [ ] **`?well=<id>` query parameter** opens that well's detail directly (per orphan-suggestion link)

---

## BOL Queue (5 min)

- [ ] Page loads
- [ ] BOL submissions render with photos
- [ ] Photo carousel works
- [ ] Match/unmatch actions render
- [ ] Filter by status works

---

## Load Report (5 min)

- [ ] Page loads
- [ ] **Group dropdown** offers None / Truck / Day / Well
- [ ] **Group selection persists in URL**
- [ ] **CSV export button** works (downloads a file)
- [ ] **PCS number column** present

---

## Settings (5 min)

- [ ] Page loads
- [ ] **PCS dispatch toggles** render (Hairpin, ES Express)
- [ ] **Toggle states match DB** (Hairpin: ON, ES Express: OFF, legacy: OFF)
- [ ] **Last-changed timestamp** visible per toggle
- [ ] **DON'T flip toggles** — just verify they render. Flipping is the client's action.

---

## Empty / edge / error states (10 min)

- [ ] **Workbench with zero rows** (apply a filter that returns nothing) → empty-state copy renders, not blank
- [ ] **Drawer on a load with zero photos** → "no photos" message, not broken-image icons
- [ ] **Drawer on a load with no audit log entries** → graceful fallback
- [ ] **Cross-check on a load with no discrepancies** → "v2 and PCS agree" line
- [ ] **Admin discrepancies with all filters that return 0** → empty state with check icon
- [ ] **Network failure simulation** — DevTools throttle to offline → reload → graceful "couldn't load" instead of blank
- [ ] **API 500 simulation** (if possible via diag tool) → UI shows error toast, doesn't crash

---

## Accessibility basics (10 min)

- [ ] **Tab through home page** — focus visible on every interactive element
- [ ] **Tab through workbench** — same
- [ ] **Tab through drawer** — same
- [ ] **Enter/Space activate buttons** (not just click)
- [ ] **Escape closes drawer + lightbox + modals**
- [ ] **Color contrast on body text** ≥ 4.5:1 (eyeball check, or use Lighthouse)
- [ ] **Lighthouse accessibility score** ≥ 90 on /workbench (run via DevTools)
- [ ] **No `outline: none` without alternative** — focus rings visible
- [ ] **Photo alt text** present (won't be perfect, but present)

---

## Mobile breakpoint sanity (5 min)

Open DevTools, switch to iPhone 14 Pro viewport.

- [ ] **Login renders** without horizontal scroll
- [ ] **Home renders** without obviously-broken layout
- [ ] **Workbench rows** readable (may be cramped — that's OK, just not broken)
- [ ] **Drawer opens** in some sensible way on mobile (full-screen overlay or stacked)
- [ ] **Sidebar accessible** via hamburger or overlay
- [ ] **Photos render** (may be smaller — that's OK)

Mobile pass-criteria is loose: "doesn't crash, isn't visibly broken." Polish is post-Monday.

---

## Cross-check specific deep-dive (10 min)

Special section because it's the new feature carrying the Monday narrative.

- [ ] **Home pill** appears + pulses appropriate color
- [ ] **Home pill count matches** /admin/discrepancies open count
- [ ] **Click home pill → admin index loads with that exact count**
- [ ] **Drawer cross-check section** appears for assignment 185590 (status_drift)
- [ ] **Drawer says "Stage differs from PCS"** + v2: ready_to_build + PCS: Cancelled
- [ ] **Resolve a discrepancy from the drawer** → it disappears from drawer AND from admin index AND home pill count drops by 1
- [ ] **Re-run sync (or wait 15 min)** → resolved discrepancy DOESN'T reappear (auto-resolve sticks)
- [ ] **Workbench amber tint** on row 185590
- [ ] **Tooltip on tinted row** matches actual discrepancy
- [ ] **Orphan rows show suggested-well callout** with a real well name + score
- [ ] **Click suggested well link → /admin/wells?well=<id> opens the right well**

---

## Browser compatibility (5 min)

Test in 2+ browsers if possible.

- [ ] **Chrome** (primary) — full pass
- [ ] **Safari** (Jessica might use this) — at minimum login + workbench + drawer + admin discrepancies
- [ ] **Edge** if a Mike-equivalent uses it — basic pass
- [ ] **No console errors** in any browser tested

---

## Final pre-send checklist (5 min)

- [ ] **Maintenance page is OFF** — visit / as anonymous user, see SPA not maintenance
- [ ] **Validation-numbers doc final read** — every number checked against current DB state
- [ ] **Walkthrough script final read** — flows make sense, no stale references
- [ ] **Mike one-pager final read** — numbers consistent with validation doc
- [ ] **Kyle email sent** (or scheduled to send manually)
- [ ] **Email draft to Jessica composed** with attachment + correct CC list (Jessica + Jeri + Mike + Bryan per 4/22 thread)
- [ ] **Pinned tabs in your browser** for the demo: home, workbench, /admin/discrepancies, /admin/scope-discovery
- [ ] **Phone in another room** for the actual send
- [ ] **Take 5 min off** before clicking Send

---

## What "PASS" means in aggregate

This checklist passes if EVERY checkbox above is either checked OR has an inline note: `[FAIL — fix description / ticket]`. Half-passes are fail.

If you hit 5+ fails: stop, triage, decide if any are demo-killers. Demo-killer = blocks Mike from clicking through the home → drawer → admin discrepancies happy path. Anything else can ship "rough" and be patched Saturday.

If you hit 0 fails: send the email at 3:30 with confidence. The system isn't perfect but it isn't broken, and that's the bar.
