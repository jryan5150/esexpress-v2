import { Link } from "react-router-dom";
import { useEffect } from "react";

/**
 * Guided tour / What's New page. Auto-opens on first login per release
 * cycle (localStorage flag `whatsnew-shown-2026-04-24`). Re-accessible
 * any time from sidebar.
 *
 * Design choice: NO screenshots. Stale captures from earlier weeks
 * would mislead. Each section uses inline mockups, icons, and live
 * deep-links so the operator can click straight into the actual surface.
 *
 * Replaces the "feature inventory" paragraph that bloated the Friday
 * EOD email — operator's words: "we don't bloat with what's added,
 * just make sure we tell the verifiable numbers story". Numbers go in
 * the email + PDF; how-to lives here, in-context.
 */

// Bumped 2026-04-28-pm-4 — forces re-show after Flagged rename
// (was /exceptions), main-nav promotion, and inline 4-reason flag
// picker on the cell-drawer expand.
const RELEASE_KEY = "esexpress-whatsnew-2026-04-28-pm-4";

export function markWhatsNewSeen() {
  try {
    localStorage.setItem(RELEASE_KEY, new Date().toISOString());
  } catch {
    // localStorage unavailable — non-blocking
  }
}

export function hasSeenWhatsNew(): boolean {
  try {
    return Boolean(localStorage.getItem(RELEASE_KEY));
  } catch {
    return true; // fail-closed: if we can't check, don't auto-show
  }
}

interface SectionProps {
  number: string;
  title: string;
  why: string;
  how: React.ReactNode;
  cta?: { label: string; to: string };
}

function Section({ number, title, why, how, cta }: SectionProps) {
  return (
    <section className="bg-surface-container-lowest rounded-[12px] p-6 border border-outline-variant/40 card-rest">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-data text-2xl font-bold text-primary-container tabular-nums leading-none">
          {number}
        </span>
        <h2 className="font-headline text-lg font-extrabold tracking-tight text-on-surface uppercase leading-tight">
          {title}
        </h2>
      </div>
      <p className="text-sm text-on-surface-variant italic mb-4">{why}</p>
      <div className="text-sm text-on-surface space-y-2">{how}</div>
      {cta && (
        <Link
          to={cta.to}
          className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-md bg-primary text-on-primary text-xs font-bold uppercase tracking-wider hover:brightness-110 transition-all"
        >
          {cta.label}
          <span className="material-symbols-outlined text-base">
            arrow_forward
          </span>
        </Link>
      )}
    </section>
  );
}

/** A small visual "chip" showing what a sidebar/button looks like inline. */
function UiChip({
  icon,
  label,
  variant = "neutral",
}: {
  icon: string;
  label: string;
  variant?: "neutral" | "primary" | "tertiary" | "error";
}) {
  const cls =
    variant === "primary"
      ? "border-primary-container/50 text-primary-container bg-primary-container/10"
      : variant === "tertiary"
        ? "border-tertiary/50 text-tertiary bg-tertiary/10"
        : variant === "error"
          ? "border-error/50 text-error bg-error/10"
          : "border-outline-variant/50 text-on-surface bg-surface-container-high";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold uppercase tracking-wider ${cls}`}
    >
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </span>
  );
}

export function WhatsNew() {
  useEffect(() => {
    markWhatsNewSeen();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div className="flex-1">
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              What's New &mdash; Tue Apr 28
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              Post-call updates // since Monday's review
            </p>
          </div>
          <Link
            to="/workbench"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high text-xs font-semibold uppercase tracking-wider"
          >
            Skip to work
            <span className="material-symbols-outlined text-sm">
              arrow_forward
            </span>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pt-6 pb-8 space-y-5 max-w-4xl">
        {/* Intro */}
        <div className="bg-primary-container/5 border-l-4 border-primary-container rounded-r-md p-5">
          <p className="text-sm text-on-surface leading-relaxed">
            <strong className="font-bold">
              Continuous shipping since Monday's call.
            </strong>{" "}
            Every change below is live right now. Most are reachable from the
            sidebar (Today / BOL Center / Load Report) — a few legacy or
            drill-down pages live under <strong>Reference</strong> to keep the
            main nav clean. We pushed each item without taking the site down, so
            you've been free to keep poking around the whole time. If you see
            anything odd, text or email the URL plus what you saw and we'll
            patch in minutes.
          </p>
        </div>

        {/* Tue PM 4 — Flagged page + inline flag button */}
        <Section
          number="00"
          title="🚩 Flagged is now your central queue"
          why="The page that was Exceptions / Today's Objectives is now Flagged — one front door for everything that needs a human. Promoted to the main sidebar between Today and BOL Center because that's where it belongs in the daily loop."
          how={
            <div className="space-y-3">
              <p>
                Anything that lands in the flagged queue groups itself
                automatically by reason:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "🖼  Photos to match",
                  "🚩 Flagged for review",
                  "⚠️ Discrepancies",
                  "📊 Sheet drift",
                  "🎫 Missing ticket",
                  "👤 Missing driver",
                  "💵 Needs rate",
                ].map((s) => (
                  <span
                    key={s}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-outline-variant/40 bg-surface-container-high text-on-surface-variant"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <p>
                <strong>Builders</strong> see only their customer's flagged
                items. <strong>Admins</strong> see everything. Each row links
                straight to Load Center for that load.
              </p>
              <p>
                <strong>New: inline 🚩 Flag button</strong> on every load in the
                cell drawer's expand. Click it, pick one of four reasons (Needs
                Rate · Missing Ticket · Missing Driver · Other / BOL off), and
                the load lands on Flagged for whoever's scoped to see it. Saves
                you from bouncing between pages just to mark something as
                needing a look.
              </p>
            </div>
          }
          cta={{ label: "Open Flagged", to: "/flagged" }}
        />

        {/* Tue PM 3 — Roles + role-aware /exceptions */}
        <Section
          number="00a"
          title="Roles are live — admin, builder, finance, viewer"
          why="Up to now everyone effectively had admin powers. With more of the team poking around (and finance/viewers coming in), we needed a clean role split so the right buttons surface for the right people. No one's permissions silently shrank — every existing account stays admin until you say otherwise."
          how={
            <div className="space-y-3">
              <p>The four roles + what they can do:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-outline-variant/40">
                  <thead className="bg-surface-container-high">
                    <tr>
                      <th className="text-left px-3 py-2 font-headline">
                        Role
                      </th>
                      <th className="text-left px-3 py-2 font-headline">Who</th>
                      <th className="text-left px-3 py-2 font-headline">
                        Can do
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    <tr>
                      <td className="px-3 py-2 font-bold">admin</td>
                      <td className="px-3 py-2">Jess, Bryan, Mike, Jace</td>
                      <td className="px-3 py-2">Everything</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-bold">builder</td>
                      <td className="px-3 py-2">
                        Scout, Steph, Keli, Crystal, Katie, Jenny
                      </td>
                      <td className="px-3 py-2">
                        Edit dispatch fields, advance stage, push to PCS, match
                        BOLs. Today defaults to their customer but sees
                        everything.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-bold">finance</td>
                      <td className="px-3 py-2">TBD</td>
                      <td className="px-3 py-2">
                        Edit rate fields + Wells rate page + /finance. Read-only
                        on dispatch surfaces.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-bold">viewer</td>
                      <td className="px-3 py-2">Auditors / observers</td>
                      <td className="px-3 py-2">Read-only across the app.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-on-surface-variant">
                Buttons hide when you don't have permission instead of graying
                out, so the UI stays clean for each role. Backend also enforces
                the same rules — the green Push to PCS button isn't hideable
                from a finance account, the API rejects it independently.
              </p>
            </div>
          }
        />

        {/* Tue PM 3 — /exceptions becomes role-aware */}
        <Section
          number="00b"
          title="/exceptions is now your role's morning queue"
          why="Old Today's Objectives page was a mixed dashboard nobody opened twice. Now it's a personal punch-list scoped to your role, so it gives you the actual list of things you should look at first."
          how={
            <div className="space-y-3">
              <ul className="list-disc list-inside space-y-1.5 text-sm">
                <li>
                  <strong>Builders</strong> see <em>My Queue</em> — your
                  customer's photos to match, loads stuck Uncertain,
                  discrepancies to resolve, sheet drift, missing tickets. Each
                  row links straight to the load.
                </li>
                <li>
                  <strong>Admins</strong> (Jess + Mike + Bryan + Jace) see the
                  full system pulse — wells overview, dispatch readiness,
                  validation summary, pipeline status, plus the cross-check
                  pill.
                </li>
                <li>
                  <strong>Finance</strong> gets a placeholder for now (AR aging
                  coming) with quick links to Finance, Discrepancies, Sheet
                  Truth, and Wells.
                </li>
                <li>
                  <strong>Viewers</strong> redirect to Today since their
                  read-only flow lives there.
                </li>
              </ul>
              <p className="text-xs text-on-surface-variant">
                Open it from Reference → Exception Feed in the sidebar.
              </p>
            </div>
          }
          cta={{ label: "Open my queue", to: "/exceptions" }}
        />

        {/* Tue PM 2 — Load Center now mirrors the cell-drawer action surface */}
        <Section
          number="00c"
          title="Stage controls + Push to PCS now in Load Center too"
          why="If you land on Load Center directly (from the sidebar search, an inbox link, or a deep-linked URL), you'd previously have to bounce back to Today to actually move the load through the workflow. No more — the same five stage buttons and the green Push to PCS sit right at the top of the editable workspace."
          how={
            <div className="space-y-3">
              <p>
                Open <strong>Load Center</strong> (sidebar Reference → Load
                Center, or click any load in the cell drawer). Above the field
                grid you'll see:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {["Uncertain", "Ready", "Building", "Entered", "Cleared"].map(
                  (s) => (
                    <span
                      key={s}
                      className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border border-outline-variant/40 bg-surface-container-high text-on-surface-variant"
                    >
                      {s}
                    </span>
                  ),
                )}
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-emerald-600 text-white">
                  → Push to PCS
                </span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  Hover any stage to read what it means (no more guessing the
                  difference between "Entered" and "Cleared").
                </li>
                <li>
                  Click any stage to set it directly — green = past, accent =
                  current, neutral = future. Backwards moves work too if you
                  advanced too early.
                </li>
                <li>
                  <strong>Push to PCS</strong> is the same button as in the cell
                  drawer. Success shows the new PCS load number; failure shows
                  the actual PCS reason so you can fix and retry.
                </li>
              </ul>
              <p className="text-xs text-on-surface-variant">
                Stage changes here also tick the cell color forward on Today
                instantly — no refresh needed.
              </p>
            </div>
          }
          cta={{ label: "Open Load Center", to: "/load-center" }}
        />

        {/* Tue PM 2 — Comment attribution + nav cleanup */}
        <Section
          number="00d"
          title="Quality-of-life: comment attribution, stage tooltips, nav cleanup"
          why="Three small fixes that unblock confusion the first time you hit them."
          how={
            <div className="space-y-3">
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>
                  <strong>Add Comment</strong> in the cell drawer now shows a
                  load picker when the cell has multiple loads, plus a caption
                  above Save: "→ Will land on load #X (driver, ticket)". No more
                  silent attribution to the first row.
                </li>
                <li>
                  <strong>Stage strip tooltips</strong> on every Uncertain /
                  Ready / Building / Entered / Cleared button — hover for a
                  one-line definition.
                </li>
                <li>
                  Old Today's Objectives page (the legacy gap-list) moved to{" "}
                  <strong>Reference → Exception Feed</strong>. Visiting the bare{" "}
                  <code>/</code> URL now goes straight to Today.
                </li>
                <li>
                  Today tooltip in the sidebar rewritten — old version described
                  the deleted Inbox / Intake / Jenny strips.
                </li>
              </ul>
            </div>
          }
        />

        {/* Post-Monday-call shipped — Tue Apr 28 */}
        <Section
          number="00"
          title="Click a load → edit it → push to PCS, all in one spot"
          why='From the call: "if I can just get in and kind of start pushing those through" — the build-then-push workflow validated against the transcript. Edit inline, no bouncing between screens.'
          how={
            <div className="space-y-3">
              <p>
                In the worksurface, click any cell → drawer opens on the right →
                click any load row → it expands inline with the photo on the
                left and editable fields on the right. Eleven editable fields:
              </p>
              <div className="flex flex-wrap gap-2">
                <UiChip icon="person" label="Driver" />
                <UiChip icon="local_shipping" label="Truck #" />
                <UiChip icon="local_shipping" label="Trailer #" />
                <UiChip icon="business" label="Carrier" />
                <UiChip icon="receipt" label="Ticket #" />
                <UiChip icon="numbers" label="BOL #" />
                <UiChip icon="scale" label="Weight (tons)" />
                <UiChip icon="scale" label="Net Weight" />
                <UiChip icon="speed" label="Mileage" />
                <UiChip icon="payments" label="Rate" />
                <UiChip icon="event" label="Delivered" />
              </div>
              <p>
                Below the fields, a 5-stage Workflow strip lets you move the
                load through Uncertain → Ready → Building → Entered → Cleared
                with one click. And a green <strong>→ Push to PCS</strong>{" "}
                button at the bottom is the terminal action — when you click it,
                v2 hands off to PCS and stops tracking. You'll see a green
                confirmation with the new PCS load number, or a red error with
                the actual PCS reason if something went wrong.
              </p>
            </div>
          }
          cta={{ label: "Open Worksurface", to: "/workbench" }}
        />

        {/* Tue PM batch — page-strip + manual rotate + archive fix + load-center fix */}
        <Section
          number="00b"
          title="Today page slimmed + manual ↻ rotate on every photo"
          why='From your Tue feedback: "lets just keep the bill to / well grid" and "the rotation fix for the images isnt functioning either on some of the photos that are sideways." Both done.'
          how={
            <div className="space-y-3">
              <p>
                <strong>Today page is just the grid now.</strong> The Inbox,
                Today's Intake, and Jenny's Queue blocks below the well grid are
                gone — those were noise on a page that should be one glance:
                who's working, what cells need attention. The cell drawer +
                inline-expand on the right still does everything.
              </p>
              <p>
                <strong>↻ Rotate button on every photo.</strong> Auto-EXIF
                rotation handled most sideways shots, but a handful of driver
                photos were still landing rotated. There's now a circular ↻
                button on every photo (cell drawer, Load Center, lightbox zoom).
                Click it once for 90°, twice for 180°, etc. Your rotation choice
                is remembered per-load — next time the same load loads, the
                photo comes back the way you left it.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  <strong>Archive page fixed</strong> — was throwing on the
                  stats banner load. Now renders the historical capture stats +
                  paginated table of pre-Jan-2026 loads.
                </li>
                <li>
                  <strong>Load Center sidebar entry now useful</strong> —
                  clicking it lands on a searchable list of every recent load
                  (filter by BOL, ticket #, driver, truck, well, customer). Pick
                  a row to open the editable workspace for that load. Moved into
                  Reference for tidiness.
                </li>
                <li>
                  <strong>Today's Objectives</strong> moved under Reference — it
                  was the old Phase-1 page; the active workflow lives on Today.
                </li>
              </ul>
            </div>
          }
          cta={{ label: "Open Today", to: "/workbench" }}
        />

        <Section
          number="01"
          title="What the photo says vs what's saved — side-by-side"
          why="When we read the BOL photo and got a number that disagrees with what's on the load record, you'd be retyping by hand. Now both values sit next to each other and you accept the photo's read with one click."
          how={
            <div className="space-y-3">
              <p>
                When you expand a load row in the cell drawer, a{" "}
                <strong>From the photo</strong> panel appears above the editable
                fields (only when we've already read the photo). Each field
                shows:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  <span className="text-emerald-700 font-semibold">
                    ✓ matches
                  </span>{" "}
                  in green when the photo's value agrees with the saved load
                </li>
                <li>
                  A blue <strong>use →</strong> button when they differ — one
                  click overwrites the load with what the photo said
                </li>
                <li>Overall confidence % top-right (when we have one)</li>
              </ul>
              <p>
                There's also a <strong>Re-read photo</strong> button in the same
                panel — useful when the first read missed text or the photo
                loaded better the second time.
              </p>
            </div>
          }
        />

        <Section
          number="02"
          title="Photos clickable everywhere → zoom"
          why="You couldn't read the BOL numbers at thumbnail size. Now every photo opens a full-screen lightbox on click."
          how={
            <p>
              Click any photo in the cell drawer's inline expand or in the
              standalone Load Center page. Esc closes. ←/→ cycles through
              multiple photos when a JotForm submission has multiple angles.
            </p>
          }
        />

        <Section
          number="03"
          title="Photo column now reflects reality, not stored field"
          why='From your testing: "why does the photo column say no photo when clearly photo." The stored photo_status field on legacy matches was never updated when the photo got attached.'
          how={
            <div className="space-y-3">
              <p>Three things fixed:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  Backend now computes <code>effective_photo_status</code> from
                  live evidence (photos table OR matched JotForm submission)
                </li>
                <li>
                  All UI surfaces (per-load row dot, week-list table, inline
                  panel) read this corrected value
                </li>
                <li>
                  One-time backfill: 655 legacy assignments updated from
                  'missing' → 'attached' in the underlying data. No more red ✕
                  on loads that genuinely have photos.
                </li>
              </ul>
            </div>
          }
          cta={{ label: "Open Worksurface", to: "/workbench" }}
        />

        <Section
          number="04"
          title="Admin Overview — one page, five surfaces"
          why="From the call: too many tabs to flip between. The five reconciliation pages now have a single overview that summarizes each one."
          how={
            <p>
              <strong>Admin → Overview</strong> shows compact summaries of Sheet
              Truth, PCS Truth, Discrepancies, Order of Invoicing, and Sheet
              Status. Each section header links to its full page for drilling
              in. Read-only — edits happen on the dedicated pages.
            </p>
          }
          cta={{ label: "Open Admin Overview", to: "/admin/overview" }}
        />

        <Section
          number="05"
          title="Aliases admin — fix sheet spellings yourself"
          why="Your sheet has Liberty as Liberty, Liberty(FSC), Liberty (FSC), LIberty (typo). v2 was fragmenting your numbers across all five spellings. Now collapsed to canonical via aliases you can edit."
          how={
            <p>
              <strong>Admin → Aliases</strong> shows two tables: customer-name
              aliases (sheet spelling → canonical customer) and well aliases
              (sheet name → canonical well). Add or remove any time. The next
              sheet sync (every 30 min) picks up the changes. No code deploy
              needed.
            </p>
          }
          cta={{ label: "Open Aliases", to: "/admin/aliases" }}
        />

        <Section
          number="06"
          title="If we have a sheet you use that we're not reading…"
          why="Found mid-call — we don't see the canonical Driver Codes sheet (we see a 45-row tab; you have the 983-row roster somewhere)."
          how={
            <div className="space-y-3">
              <p>
                Share any spreadsheet with our service-account email and the
                next 30-minute sync picks it up automatically:
              </p>
              <code className="block bg-surface-container-high px-3 py-2 rounded text-xs font-mono">
                esexpress-integration@esexpress.iam.gserviceaccount.com
              </code>
              <p className="text-xs text-on-surface-variant">
                Steps: open sheet → Share → paste email → Viewer → uncheck
                "Notify people" → Send.
              </p>
            </div>
          }
        />

        <div className="bg-tertiary/5 border-l-4 border-tertiary rounded-r-md p-5">
          <p className="text-sm text-on-surface leading-relaxed">
            <strong className="font-bold">Below this line:</strong> the earlier
            What's New entries from the run-up to Monday's call. Still relevant
            — the Pre-Dispatch Verification, date filter, sheet-truth setup, and
            PCS push proof all still apply. Skim or skip to your work.
          </p>
        </div>

        {/* 07 — Pre-Dispatch Verification */}
        <Section
          number="07"
          title="Pre-Dispatch Verification"
          why='Per your Apr 15 ask: "nothing would go to dispatch desk until it had been validated." One front door for everything that gates dispatch.'
          how={
            <div className="space-y-3">
              <p>
                The page formerly called <em>Validation Desk</em> is now{" "}
                <strong>Pre-Dispatch Verification</strong>. It surfaces three
                queues on one screen:
              </p>
              <div className="flex flex-wrap gap-2">
                <UiChip
                  icon="fact_check"
                  label="Confirm Assignments"
                  variant="primary"
                />
                <UiChip
                  icon="add_a_photo"
                  label="Awaiting Photo Match"
                  variant="primary"
                />
                <UiChip
                  icon="warning"
                  label="Missing Tickets"
                  variant="error"
                />
              </div>
              <p>
                A new <strong>Cross-Surface Queue</strong> header at the top of
                the page shows the photo-match and missing-ticket counts and
                links straight to the matching workflow.
              </p>
            </div>
          }
          cta={{ label: "Open Validate", to: "/validation" }}
        />

        {/* 08 — Date filter */}
        <Section
          number="08"
          title="Date Filter on Validate"
          why='Your Apr 15 quote: "if you actually put in like the 13th to the 15th, which would be more like what we&apos;re working on" / "do a day&apos;s worth at a time."'
          how={
            <div className="space-y-3">
              <p>
                Validate now defaults to <strong>Today</strong> so you land on
                today&apos;s work, not 6,000+ pending. Six presets plus a Custom
                range:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Today",
                  "Yesterday",
                  "This Week",
                  "Last Week",
                  "All",
                  "Custom",
                ].map((p) => (
                  <span
                    key={p}
                    className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${p === "Today" ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface-variant border border-outline-variant/40"}`}
                  >
                    {p}
                  </span>
                ))}
              </div>
              <p>
                The tier counts at the top match whatever range you pick.
                Today's snapshot: <strong>1,281 loads this week</strong>,{" "}
                <strong>23 today</strong>.
              </p>
            </div>
          }
          cta={{ label: "Try the date filter", to: "/validation" }}
        />

        {/* 09 — Photo-gated bulk approve */}
        <Section
          number="09"
          title="Photo-Gated Bulk Approve"
          why="Your Apr 15 trust risk: &quot;loads that don't have an image there, but they're saying they're 100% matched.&quot; Closed by design."
          how={
            <div className="space-y-3">
              <p>
                The big{" "}
                <UiChip
                  icon="done_all"
                  label="Approve All Tier 1"
                  variant="tertiary"
                />{" "}
                button now{" "}
                <strong>only approves rows with a confirmed photo</strong>. The
                confirm dialog tells you exactly how many got skipped:
              </p>
              <div className="bg-surface-container-low rounded-md p-4 border border-outline-variant/30 font-label text-xs">
                <div className="text-on-surface">
                  Approve <strong>42</strong> Tier 1 assignments with confirmed
                  photos? This will move them to dispatch.
                </div>
                <div className="text-on-surface-variant mt-2">
                  6 other Tier 1 assignments will be skipped (no photo attached
                  yet &mdash; those need manual review).
                </div>
              </div>
            </div>
          }
        />

        {/* 10 — Cross-check */}
        <Section
          number="10"
          title="Cross-Check Loop (PCS ↔ v2)"
          why="Every 15 minutes v2 pulls PCS, compares, and surfaces any well or load where the two systems disagree. This is the thing that catches what a manual reconciliation would catch — same day, automatically."
          how={
            <div className="space-y-3">
              <p>Three discrepancy types it can flag:</p>
              <ul className="text-sm text-on-surface-variant space-y-1.5 ml-2">
                <li>
                  <span className="text-on-surface font-semibold">
                    Orphan destination
                  </span>{" "}
                  &mdash; PCS knows a well v2 doesn&apos;t (often a naming
                  variant). Single-click absorb if it&apos;s an alias of one you
                  already have.
                </li>
                <li>
                  <span className="text-on-surface font-semibold">
                    Status drift
                  </span>{" "}
                  &mdash; v2 says ready_to_build, PCS says cancelled (or
                  inverse). Catches stale state before bad dispatches.
                </li>
                <li>
                  <span className="text-on-surface font-semibold">
                    Bridge match
                  </span>{" "}
                  &mdash; PCS shipper-stop ticket# matches a v2 OCR-extracted
                  ticket. Deterministic key, proves the data flow works.
                </li>
              </ul>
              <p className="text-xs text-on-surface-variant">
                Currently 4 open items in the queue. None require action tonight
                &mdash; review at your pace.
              </p>
            </div>
          }
          cta={{ label: "Open Discrepancies", to: "/admin/discrepancies" }}
        />

        {/* 11 — Photo rotation for PCS push */}
        <Section
          number="11"
          title="Photo Rotation for PCS Push"
          why="Driver-mobile photos often carry an EXIF orientation tag that browsers don't reliably honor. When a load goes to PCS, the photo is rotated server-side first so PCS receives an upright BOL ready to read."
          how={
            <div className="space-y-3">
              <p>
                The PCS push pipeline reads each photo, applies the EXIF
                rotation, strips the tag, and re-encodes before uploading so PCS
                sees the photo in its true orientation. This is the bytes that
                go into the BOL attachment field on the PCS load.
              </p>
              <p className="text-xs text-on-surface-variant">
                Heads-up &mdash; in-app thumbnails and the drawer may still show
                some photos sideways until we ship the lighter resize-and-rotate
                variant for the live UI (planned this weekend). What goes to PCS
                is upright today; what you preview in v2 will catch up shortly.
              </p>
            </div>
          }
        />

        {/* 12 — Numbers refresh */}
        <Section
          number="12"
          title="Numbers Refresh — Verifiable Today"
          why="Two coverage numbers moved this week. Both are verifiable in your own tools."
          how={
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-surface-container-low rounded-md p-4 border border-outline-variant/30">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                    Tier 1 Photo Coverage
                  </div>
                  <div className="font-data text-2xl font-bold text-tertiary tabular-nums mt-1">
                    87.81%
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-1">
                    was 5.18% Friday morning
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-md p-4 border border-outline-variant/30">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                    JotForm Match Rate
                  </div>
                  <div className="font-data text-2xl font-bold text-tertiary tabular-nums mt-1">
                    87.2%
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-1">
                    was 63.9% &mdash; recovered 813 stuck submissions
                  </div>
                </div>
              </div>
              <p className="text-xs text-on-surface-variant">
                Both visible in the Pre-Dispatch Verification page. Full
                breakdown in the Validation Numbers PDF in your inbox.
              </p>
            </div>
          }
        />

        {/* 07 — Honest list of in-flight */}
        <Section
          number="07"
          title="In Flight (Honest List)"
          why="Three things still moving. Calling them out so they don't surprise you."
          how={
            <div className="space-y-3">
              <ul className="text-sm text-on-surface space-y-2.5">
                <li className="flex gap-3">
                  <span className="text-amber-500 font-bold shrink-0">→</span>
                  <span>
                    <strong>PCS push.</strong> Wired and proven on the Hairpin
                    test side. Last 3 attempts on the ES Express side hit a 500
                    from PCS&apos;s AddLoad endpoint. Wire payload sent to Kyle
                    for App Insights lookup. Push toggle stays off until that
                    resolves.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-amber-500 font-bold shrink-0">→</span>
                  <span>
                    <strong>Inline photo-match on Validate.</strong> Today the
                    "Awaiting Photo Match" card sends you to BOL Center. Monday
                    it&apos;ll happen inline so you don&apos;t switch pages.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-amber-500 font-bold shrink-0">→</span>
                  <span>
                    <strong>Smaller polish items</strong> on Workbench
                    consistency. Not blocking anything you&apos;ll do this
                    weekend.
                  </span>
                </li>
              </ul>
            </div>
          }
        />

        {/* Ask footer */}
        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[12px] p-6 text-center">
          <p className="text-sm text-on-surface mb-2">
            Have a question or see something that doesn&apos;t match what
            you&apos;d expect?
          </p>
          <a
            href="mailto:jryan@lexcom.com?subject=ES%20Express%20v2%20question"
            className="inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
          >
            <span className="material-symbols-outlined text-base">mail</span>
            jryan@lexcom.com
          </a>
          <p className="text-xs text-on-surface-variant mt-3">
            Same-day response over the weekend.
          </p>
        </div>
      </div>
    </div>
  );
}
