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
        <p className="text-[var(--text-secondary)]">Loading BOL queue...</p>
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
          <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-wide uppercase">
            BOL RECONCILIATION
          </h1>
          <div className="h-4 w-px bg-[var(--border-subtle)]" />
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-widest">
            Active Shift: 08:00 - 20:00
          </span>
        </div>
        <div className="flex items-center gap-2 bg-[var(--bg-surface)] px-3 py-1.5 rounded-[var(--radius-sm)] focus-within:ring-1 ring-[var(--accent)]">
          <span className="text-[var(--text-tertiary)] text-sm">&#x1F50D;</span>
          <input
            className="bg-transparent border-none focus:ring-0 focus:outline-none text-[var(--text-xs)] w-48 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            placeholder="Search BOL Queue..."
            type="text"
          />
        </div>
      </div>

      {/* Section 1: Matched (collapsed) */}
      <section className="bg-[var(--bg-surface)] rounded-[var(--radius-sm)] overflow-hidden border-l-[3px] border-[var(--status-ready)] transition-all">
        <div
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors"
          onClick={() => setMatchedExpanded((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            e.key === "Enter" && setMatchedExpanded((prev) => !prev)
          }
        >
          <div className="flex items-center gap-4 flex-1">
            <span className="text-[var(--status-ready)]">&#x2713;</span>
            <div className="flex-1 max-w-xl">
              <div className="flex justify-between mb-1.5">
                <span className="text-[var(--text-xs)] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  &#x2713; Matched -- {queue.matched.length} loads
                </span>
                <span className="font-[var(--font-mono)] text-[var(--text-xs)] text-[var(--status-ready)]">
                  {matchedPct}% Complete
                </span>
              </div>
              <div className="w-full bg-[var(--bg-elevated)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[var(--status-ready)] h-full rounded-full transition-all"
                  style={{ width: `${matchedPct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              className="px-4 py-1.5 text-[var(--text-xs)] text-[var(--status-ready)]"
              onClick={(e) => e.stopPropagation()}
            >
              Bulk Approve
            </Button>
            <span className="text-[var(--text-tertiary)]">
              {matchedExpanded ? "&#x25B2;" : "&#x25BC;"}
            </span>
          </div>
        </div>
      </section>

      {/* Section 2: Unmatched */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[var(--text-xs)] font-bold text-[var(--text-secondary)] uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--status-warning)]" />
            Unmatched
            <span className="text-[var(--text-tertiary)] font-normal ml-2">
              {queue.unmatched.length} loads
            </span>
          </h3>
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
          <h3 className="text-[var(--text-xs)] font-bold text-[var(--text-secondary)] uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--status-warning)]" />
            Discrepancy
            <span className="text-[var(--text-tertiary)] font-normal ml-2">
              {queue.discrepancies.length} loads
            </span>
          </h3>
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
          <h3 className="text-[var(--text-xs)] font-bold text-[var(--text-secondary)] uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--status-error)]" />
            Missing Ticket
            <span className="text-[var(--text-tertiary)] font-normal ml-2">
              {queue.missingTickets.length} loads
            </span>
          </h3>
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
      <footer className="fixed bottom-0 left-0 w-full bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] z-40">
        <div className="h-16 px-8 flex items-center justify-between ml-[240px]">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-widest">
                Total Exceptions:
              </span>
              <span className="font-[var(--font-mono)] text-sm font-bold text-[var(--text-primary)]">
                {queue.totalExceptions}
              </span>
            </div>
            <div className="h-4 w-px bg-[var(--border-subtle)]" />
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-widest">
                Ready for Export:
              </span>
              <span className="font-[var(--font-mono)] text-sm font-bold text-[var(--status-ready)]">
                {queue.readyForExport}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="flex items-center gap-2">
              &#x2B07; Export CSV
            </Button>
            <Button
              variant="primary"
              className="font-bold flex items-center gap-2"
            >
              &#x2713; Approve All Matched
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline sub-components                                                     */
/* -------------------------------------------------------------------------- */

function UnmatchedRow({ item }: { item: BolItem }) {
  return (
    <div className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors p-4 flex items-center justify-between border-l-[3px] border-[var(--status-warning)]">
      <div className="flex items-center gap-8">
        <div className="w-32">
          <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] mb-0.5">
            BOL NUMBER
          </p>
          <p className="font-[var(--font-mono)] text-sm font-medium text-[var(--text-primary)]">
            {item.bolNumber}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[var(--status-warning)]">
          <span>&#x1F517;</span>
          <p className="text-sm font-medium">No Matching Ticket</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="text-[var(--text-xs)]">
          Search JotForm
        </Button>
        <Button variant="primary" className="text-[var(--text-xs)] font-bold">
          Assign Manually
        </Button>
      </div>
    </div>
  );
}

function DiscrepancyRow({ item }: { item: BolItem }) {
  return (
    <div className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors p-4 flex items-center justify-between border-l-[3px] border-[var(--status-warning)]">
      <div className="flex items-center gap-8">
        <div className="w-32">
          <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] mb-0.5">
            BOL NUMBER
          </p>
          <p className="font-[var(--font-mono)] text-sm font-medium text-[var(--text-primary)]">
            {item.bolNumber}
          </p>
        </div>
        <div className="flex flex-col">
          <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] mb-0.5 uppercase tracking-tighter">
            Variance Detected
          </p>
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <span className="text-[var(--status-warning)]">&#x2696;</span>
            <p className="text-sm font-medium">
              Weight mismatch:{" "}
              <span className="font-[var(--font-mono)] text-[var(--status-warning)]">
                {item.weightPropx?.toLocaleString()}
              </span>{" "}
              vs{" "}
              <span className="font-[var(--font-mono)] text-[var(--text-secondary)]">
                {item.weightTicket?.toLocaleString()}
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="text-[var(--text-xs)]">
          Accept PropX
        </Button>
        <Button
          variant="ghost"
          className="text-[var(--text-xs)] font-bold text-[var(--accent)] border border-[var(--accent)] opacity-40 hover:opacity-100"
        >
          Use Ticket
        </Button>
      </div>
    </div>
  );
}

function MissingTicketRow({ item }: { item: BolItem }) {
  return (
    <div className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors p-4 flex items-center justify-between border-l-[3px] border-[var(--status-error)]">
      <div className="flex items-center gap-12">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[var(--bg-overlay)] flex items-center justify-center border border-[var(--border-default)]">
            <span className="text-[var(--text-secondary)]">&#x1F464;</span>
          </div>
          <div>
            <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] mb-0.5">
              DRIVER
            </p>
            <p className="font-medium text-sm text-[var(--text-primary)]">
              {item.driverName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[var(--status-error)]">
          <span>&#x2716;</span>
          <p className="text-sm font-medium">No submission found</p>
        </div>
      </div>
      <Button
        variant="ghost"
        className="text-[var(--text-xs)] font-bold text-[var(--status-error)] border border-[var(--status-error)] opacity-60 hover:opacity-100 flex items-center gap-2"
      >
        &#x2691; Flag Driver
      </Button>
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
