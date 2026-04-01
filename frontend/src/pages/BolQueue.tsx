import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBolQueue } from "@/hooks/use-bol-queue";
import { Button } from "@/components/Button";
import type { BolItem, BolQueueData } from "@/hooks/use-bol-queue";

/* -------------------------------------------------------------------------- */
/*  BolQueue — BOL reconciliation: matched, unmatched, discrepancy, missing   */
/* -------------------------------------------------------------------------- */

export function BolQueue() {
  const navigate = useNavigate();
  const { data, isLoading } = useBolQueue();
  const queue = data ?? MOCK_BOL_QUEUE;
  const [matchedExpanded, setMatchedExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--es-text-secondary)]">Loading BOL queue...</p>
      </div>
    );
  }

  const matchedPct =
    queue.matched.length > 0
      ? Math.round(
          (queue.matched.length /
            (queue.matched.length +
              queue.unmatched.length +
              queue.discrepancies.length +
              queue.missingTickets.length)) *
            100,
        )
      : 0;

  return (
    <div className="min-h-full pb-28 space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-[var(--es-text-primary)] tracking-wide uppercase">
            BOL RECONCILIATION
          </h1>
          <div className="h-4 w-px bg-[var(--es-border-subtle)]" />
          <span className="text-xs text-[var(--es-text-tertiary)] uppercase tracking-widest">
            Active Shift: 08:00 - 20:00
          </span>
        </div>
        <div className="flex items-center gap-2 bg-[var(--es-bg-surface)] px-3 py-1.5 rounded-[var(--es-radius-sm)] focus-within:ring-1 ring-[var(--es-accent)]">
          <span className="text-[var(--es-text-tertiary)] text-sm">
            &#x1F50D;
          </span>
          <input
            className="bg-transparent border-none focus:ring-0 focus:outline-none text-xs w-48 text-[var(--es-text-primary)] placeholder:text-[var(--es-text-tertiary)]"
            placeholder="Search BOL Queue..."
            type="text"
          />
        </div>
      </div>

      {/* Section 1: Matched (collapsed) */}
      <section
        className="bg-[var(--es-bg-surface)] rounded-sm overflow-hidden border-l-[3px] transition-all"
        style={{ borderColor: "rgba(52, 211, 153, 0.8)" }}
      >
        <div
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--es-bg-elevated)] transition-colors"
          onClick={() => setMatchedExpanded((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            e.key === "Enter" && setMatchedExpanded((prev) => !prev)
          }
        >
          <div className="flex items-center gap-4 flex-1">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--es-ready)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <div className="flex-1 max-w-xl">
              <div className="flex justify-between mb-1.5">
                <span className="text-xs font-bold text-[var(--es-text-secondary)] uppercase tracking-wider">
                  Matched &mdash; {queue.matched.length} loads
                </span>
                <span className="font-[var(--es-font-mono)] text-[10px] text-[var(--es-ready)]">
                  {matchedPct}% Complete
                </span>
              </div>
              <div className="w-full bg-[var(--es-bg-elevated)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[var(--es-ready)] h-full rounded-full transition-all"
                  style={{ width: `${matchedPct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              className="px-4 py-1.5 text-xs text-[var(--es-ready)] bg-[var(--es-bg-elevated)] hover:bg-[var(--es-bg-overlay)] rounded-sm transition-colors"
              style={{ border: "1px solid rgba(52, 211, 153, 0.2)" }}
              onClick={(e) => e.stopPropagation()}
            >
              Bulk Approve
            </button>
            <SectionChevron direction={matchedExpanded ? "up" : "down"} />
          </div>
        </div>
      </section>

      {/* Section 2: Unmatched */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold text-[var(--es-text-secondary)] uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--es-warning)]" />
            Unmatched
            <span className="text-[var(--es-text-tertiary)] font-normal ml-2">
              {queue.unmatched.length} loads
            </span>
          </h3>
          <SectionChevron direction="up" />
        </div>
        <div className="space-y-0.5">
          {queue.unmatched.map((item) => (
            <UnmatchedRow key={item.bolNumber} item={item} />
          ))}
        </div>
      </section>

      {/* Section 3: Discrepancy */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold text-[var(--es-text-secondary)] uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--es-warning)]" />
            Discrepancy
            <span className="text-[var(--es-text-tertiary)] font-normal ml-2">
              {queue.discrepancies.length} loads
            </span>
          </h3>
          <SectionChevron direction="up" />
        </div>
        <div className="space-y-0.5">
          {queue.discrepancies.map((item) => (
            <DiscrepancyRow key={item.bolNumber} item={item} />
          ))}
        </div>
      </section>

      {/* Section 4: Missing Ticket */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold text-[var(--es-text-secondary)] uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--es-error)]" />
            Missing Ticket
            <span className="text-[var(--es-text-tertiary)] font-normal ml-2">
              {queue.missingTickets.length} loads
            </span>
          </h3>
          <SectionChevron direction="up" />
        </div>
        <div className="space-y-0.5">
          {queue.missingTickets.map((item) => (
            <MissingTicketRow
              key={item.bolNumber ?? item.driverName}
              item={item}
            />
          ))}
        </div>
      </section>

      {/* Sticky Action Bar */}
      <footer className="fixed bottom-0 left-0 w-full bg-[var(--es-bg-base)] border-t border-[var(--es-border-subtle)] z-40">
        <div
          className="h-16 px-8 flex items-center justify-between"
          style={{ marginLeft: "240px" }}
        >
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--es-text-tertiary)] uppercase tracking-widest">
                Total Exceptions:
              </span>
              <span className="font-[var(--es-font-mono)] text-sm font-bold text-[var(--es-text-primary)]">
                {queue.totalExceptions}
              </span>
            </div>
            <div className="h-4 w-px bg-[var(--es-border-subtle)]" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--es-text-tertiary)] uppercase tracking-widest">
                Ready for Export:
              </span>
              <span className="font-[var(--es-font-mono)] text-sm font-bold text-[var(--es-ready)]">
                {queue.readyForExport}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="px-6 py-2.5 text-sm font-medium rounded-sm transition-all flex items-center gap-2 bg-[var(--es-bg-surface)] text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)]"
              style={{ border: "1px solid var(--es-border-default)" }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </button>
            <button
              className="px-8 py-2.5 text-sm font-bold rounded-sm shadow-lg transition-all flex items-center gap-2 text-white hover:opacity-90"
              style={{
                background: "var(--es-accent)",
                boxShadow: "0 4px 12px rgba(240, 105, 44, 0.2)",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              Approve All Matched
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline sub-components                                                     */
/* -------------------------------------------------------------------------- */

function SectionChevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--es-text-tertiary)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="cursor-pointer"
    >
      {direction === "up" ? (
        <polyline points="18 15 12 9 6 15" />
      ) : (
        <polyline points="6 9 12 15 18 9" />
      )}
    </svg>
  );
}

function UnmatchedRow({ item }: { item: BolItem }) {
  return (
    <div className="bg-[var(--es-bg-surface)] hover:bg-[var(--es-bg-elevated)] transition-colors p-4 flex items-center justify-between border-l-[3px] border-[var(--es-warning)]">
      <div className="flex items-center gap-8">
        <div className="w-32">
          <p className="text-[10px] text-[var(--es-text-tertiary)] mb-0.5 uppercase tracking-wider">
            BOL NUMBER
          </p>
          <p className="font-[var(--es-font-mono)] text-sm font-medium text-[var(--es-text-primary)]">
            {item.bolNumber}
          </p>
        </div>
        <div
          className="flex items-center gap-3 text-[var(--es-warning)]"
          style={{ opacity: 0.9 }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18.84 12.25l1.72-1.71a4.04 4.04 0 0 0-5.72-5.71l-1.71 1.71" />
            <path d="M5.17 11.75l-1.71 1.71a4.04 4.04 0 0 0 5.71 5.71l1.71-1.71" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
          <p className="text-sm font-medium">No Matching Ticket</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="px-4 py-2 text-xs rounded-sm transition-colors bg-[var(--es-bg-overlay)] hover:bg-[var(--es-bg-elevated)] text-[var(--es-text-primary)]">
          Search JotForm
        </button>
        <button className="px-4 py-2 text-xs font-bold rounded-sm transition-colors bg-[var(--es-accent)] hover:opacity-90 text-[var(--es-text-inverse)]">
          Assign Manually
        </button>
      </div>
    </div>
  );
}

function DiscrepancyRow({ item }: { item: BolItem }) {
  return (
    <div className="bg-[var(--es-bg-surface)] hover:bg-[var(--es-bg-elevated)] transition-colors p-4 flex items-center justify-between border-l-[3px] border-[var(--es-warning)]">
      <div className="flex items-center gap-8">
        <div className="w-32">
          <p className="text-[10px] text-[var(--es-text-tertiary)] mb-0.5 uppercase tracking-wider">
            BOL NUMBER
          </p>
          <p className="font-[var(--es-font-mono)] text-sm font-medium text-[var(--es-text-primary)]">
            {item.bolNumber}
          </p>
        </div>
        <div className="flex flex-col">
          <p className="text-xs text-[var(--es-text-tertiary)] mb-0.5 uppercase tracking-tighter">
            Variance Detected
          </p>
          <div className="flex items-center gap-2 text-[var(--es-text-primary)]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--es-warning)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 3l-8 0" />
              <path d="M12 3l0 18" />
              <path d="M3 13l4-8 4 8" />
              <path d="M5 17l4 0" />
              <path d="M13 13l4-8 4 8" />
              <path d="M15 17l4 0" />
            </svg>
            <p className="text-sm font-medium">
              Weight mismatch:{" "}
              <span className="font-[var(--es-font-mono)] text-[var(--es-warning)]">
                {item.weightPropx?.toLocaleString()}
              </span>{" "}
              vs{" "}
              <span className="font-[var(--es-font-mono)] text-[var(--es-text-secondary)]">
                {item.weightTicket?.toLocaleString()}
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="text-xs">
          Accept PropX
        </Button>
        <button
          className="px-4 py-2 text-xs font-bold rounded-sm transition-colors text-[var(--es-accent)] border hover:bg-[var(--es-accent-dim)]"
          style={{ borderColor: "rgba(240, 105, 44, 0.4)" }}
        >
          Use Ticket
        </button>
      </div>
    </div>
  );
}

function MissingTicketRow({ item }: { item: BolItem }) {
  return (
    <div className="bg-[var(--es-bg-surface)] hover:bg-[var(--es-bg-elevated)] transition-colors p-4 flex items-center justify-between border-l-[3px] border-[var(--es-error)]">
      <div className="flex items-center gap-12">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[var(--es-bg-overlay)] flex items-center justify-center border border-[var(--es-border-default)]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--es-text-secondary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] text-[var(--es-text-tertiary)] mb-0.5 uppercase tracking-wider">
              DRIVER
            </p>
            <p className="font-medium text-sm text-[var(--es-text-primary)]">
              {item.driverName}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-3 text-[var(--es-error)]"
          style={{ opacity: 0.9 }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </svg>
          <p className="text-sm font-medium">No submission found</p>
        </div>
      </div>
      <button
        className="px-4 py-2 text-xs font-bold rounded-sm transition-colors text-[var(--es-error)] flex items-center gap-2 opacity-60 hover:opacity-100"
        style={{ border: "1px solid rgba(248, 113, 113, 0.3)" }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        Flag Driver
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_BOL_QUEUE: BolQueueData = {
  matched: Array.from({ length: 84 }, (_, i) => ({
    bolNumber: `TX-${10000 + i}`,
    status: "matched" as const,
  })),
  unmatched: [
    { bolNumber: "TX-49202-A", status: "unmatched" as const },
    { bolNumber: "OK-91823-C", status: "unmatched" as const },
    { bolNumber: "NM-22109-B", status: "unmatched" as const },
  ],
  discrepancies: [
    {
      bolNumber: "TX-33821-X",
      status: "discrepancy" as const,
      detail: "Weight mismatch",
      weightPropx: 42000,
      weightTicket: 41850,
    },
    {
      bolNumber: "TX-33822-Y",
      status: "discrepancy" as const,
      detail: "Weight mismatch",
      weightPropx: 45100,
      weightTicket: 44900,
    },
  ],
  missingTickets: [
    {
      bolNumber: "MT-001",
      status: "missing_ticket" as const,
      driverName: 'Marcus "Wheels" Rodriguez',
    },
    {
      bolNumber: "MT-002",
      status: "missing_ticket" as const,
      driverName: "Sarah J. Miller",
    },
  ],
  totalExceptions: 10,
  readyForExport: 84,
};
