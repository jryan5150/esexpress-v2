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

const RELEASE_KEY = "esexpress-whatsnew-2026-04-24";

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
              What's New &mdash; Week of Apr 21
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              Guided Tour // Verifiable Numbers
            </p>
          </div>
          <Link
            to="/validation"
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
              The system is open for your validation.
            </strong>{" "}
            This page summarizes what's changed since you last saw it, what each
            new surface answers, and where to click. Every number you see is
            queryable in your own tools &mdash; nothing here is a promise, it's
            all inventory. Walk through at your pace; everything is reachable
            from the sidebar after you skip out.
          </p>
        </div>

        {/* 01 — Pre-Dispatch Verification */}
        <Section
          number="01"
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

        {/* 02 — Date filter */}
        <Section
          number="02"
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

        {/* 03 — Photo-gated bulk approve */}
        <Section
          number="03"
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

        {/* 04 — Cross-check */}
        <Section
          number="04"
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

        {/* 05 — Photo rotation for PCS push */}
        <Section
          number="05"
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

        {/* 06 — Numbers refresh */}
        <Section
          number="06"
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
