import { useState } from "react";
import { Button } from "@/components/Button";

/* -------------------------------------------------------------------------- */
/*  FinanceBatches — batch management for driver settlements                  */
/* -------------------------------------------------------------------------- */

type BatchStatus = "paid" | "submitted" | "draft" | "reviewing";

interface DriverSettlement {
  name: string;
  initials: string;
  loadCount: number;
  amount: number;
  status: "ready" | "reviewing";
  flag?: string;
}

interface MockBatch {
  id: string;
  dateRange: string;
  loadCount: number;
  totalAmount: number;
  status: BatchStatus;
  settlements: DriverSettlement[];
}

const STATUS_DOT: Record<BatchStatus, string> = {
  paid: "bg-[var(--es-ready)]",
  submitted: "bg-[var(--es-accent)]",
  draft: "bg-[#e0c0b4]",
  reviewing: "bg-[var(--es-warning)]",
};

export function FinanceBatches() {
  const [selectedId, setSelectedId] = useState<string | null>("993-01");
  const selected = MOCK_BATCHES.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="pb-12">
      {/* Top App Bar */}
      <header
        className="bg-[var(--es-bg-base)]/80 backdrop-blur-md sticky top-0 z-40 flex justify-between items-center px-6 h-16 w-full shadow-xl"
        style={{ boxShadow: "0 20px 25px -5px rgba(240, 105, 44, 0.05)" }}
      >
        <nav className="hidden lg:flex items-center gap-6">
          <button className="text-[var(--es-text-primary)]/60 uppercase tracking-wider text-sm font-bold hover:text-[var(--es-accent)] transition-colors">
            Dashboard
          </button>
          <button className="text-[var(--es-text-primary)]/60 uppercase tracking-wider text-sm font-bold hover:text-[var(--es-accent)] transition-colors">
            Map View
          </button>
          <button className="text-[var(--es-text-primary)]/60 uppercase tracking-wider text-sm font-bold hover:text-[var(--es-accent)] transition-colors">
            Analytics
          </button>
        </nav>
        <div className="flex items-center gap-4">
          <div className="relative hidden sm:block">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--es-text-tertiary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="bg-[var(--es-bg-surface)] border-none rounded-lg pl-10 pr-4 py-1.5 text-sm w-64 text-[var(--es-text-primary)] placeholder:text-[var(--es-text-tertiary)] focus:ring-1 focus:ring-[var(--es-accent)] outline-none"
              placeholder="Search batches..."
              type="text"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              className="p-2 hover:bg-[var(--es-bg-elevated)] rounded-lg transition-colors text-[var(--es-text-primary)]/60 hover:text-[var(--es-accent)]"
              aria-label="Sync"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              className="p-2 hover:bg-[var(--es-bg-elevated)] rounded-lg transition-colors text-[var(--es-text-primary)]/60 hover:text-[var(--es-accent)] relative"
              aria-label="Notifications"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--es-accent)] rounded-full border-2 border-[var(--es-bg-base)]" />
            </button>
            <button
              className="p-2 hover:bg-[var(--es-bg-elevated)] rounded-lg transition-colors text-[var(--es-text-primary)]/60 hover:text-[var(--es-accent)]"
              aria-label="Profile"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm-4 7a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--es-text-primary)] mb-2">
              Batch Management
            </h1>
            <p className="text-[var(--es-text-secondary)] max-w-lg">
              Consolidate driver settlements, verify load documentation, and
              execute payment runs for the current cycle.
            </p>
          </div>
          <Button
            variant="primary"
            className="px-6 py-3 font-bold text-sm uppercase tracking-wide shadow-lg hover:scale-[1.02] active:scale-95"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M12 4v16m8-8H4" />
            </svg>
            Create Batch
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Open Batches"
            value="04"
            borderColor="border-[#ffb599]"
          />
          <StatCard
            label="Total Pending"
            value="$142,850.22"
            borderColor="border-[var(--es-ready)]"
          />
          <StatCard
            label="Last Pay Run"
            value="OCT 24"
            borderColor="border-[#bfc5e3]"
          />
          <StatCard
            label="Processing"
            value="12 BOL"
            borderColor="border-[var(--es-accent)]"
          />
        </div>

        {/* Batch Table */}
        <div className="bg-[#161b28] rounded-xl overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-[var(--es-bg-elevated)] flex justify-between items-center bg-[var(--es-bg-inset)]/50">
            <h3 className="font-bold text-sm uppercase tracking-widest text-[var(--es-text-primary)]">
              Active Payment Cycles
            </h3>
            <div className="flex gap-2">
              <button
                className="p-2 text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)] transition-colors"
                aria-label="Filter"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M3 4h18l-7 8v5l-4 2V12L3 4z" />
                </svg>
              </button>
              <button
                className="p-2 text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)] transition-colors"
                aria-label="Download"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[var(--es-text-secondary)] text-[10px] uppercase tracking-widest font-bold border-b border-[var(--es-bg-elevated)]/50">
                  <th className="px-6 py-4">Batch ID</th>
                  <th className="px-6 py-4">Date Range</th>
                  <th className="px-6 py-4">Load Count</th>
                  <th className="px-6 py-4">Total Amount</th>
                  <th className="px-6 py-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--es-bg-inset)]">
                {MOCK_BATCHES.map((batch) => {
                  const isFocused = selectedId === batch.id;
                  return (
                    <tr
                      key={batch.id}
                      className={`cursor-pointer transition-colors ${
                        isFocused
                          ? "bg-[var(--es-bg-elevated)] border-l-4 border-[#ffb599]"
                          : "group hover:bg-[var(--es-bg-elevated)]"
                      }`}
                      onClick={() => setSelectedId(batch.id)}
                    >
                      <td
                        className={`py-4 ${isFocused ? "pl-5 pr-6" : "px-6"}`}
                      >
                        <span className="font-[var(--es-font-mono)] text-[#ffb599] font-bold">
                          #{batch.id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-[var(--es-text-primary)]">
                          {batch.dateRange}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-[var(--es-font-mono)] text-sm text-[var(--es-text-primary)]">
                          {batch.loadCount} Loads
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-[var(--es-font-mono)] text-sm font-bold text-[var(--es-text-primary)]">
                          $
                          {batch.totalAmount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-2 bg-[var(--es-bg-overlay)] px-3 py-1 rounded-full text-[10px] font-bold tracking-tight font-[var(--es-font-mono)] capitalize">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[batch.status]}`}
                          />
                          {batch.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 bg-[var(--es-bg-inset)]/30 border-t border-[var(--es-bg-elevated)] flex items-center justify-between">
            <p className="text-xs text-[var(--es-text-secondary)] font-[var(--es-font-mono)]">
              Showing {MOCK_BATCHES.length} of 128 batches
            </p>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-[var(--es-bg-elevated)] rounded text-xs font-bold text-[var(--es-text-secondary)] hover:bg-[var(--es-bg-overlay)]">
                PREV
              </button>
              <button className="px-3 py-1 bg-[var(--es-bg-elevated)] rounded text-xs font-bold text-[var(--es-text-secondary)] hover:bg-[var(--es-bg-overlay)]">
                NEXT
              </button>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        {selected && (
          <aside
            className="fixed right-0 top-0 h-screen w-[400px] bg-[var(--es-bg-elevated)] border-l border-[var(--es-bg-overlay)] z-50 flex flex-col transition-transform duration-300"
            style={{ boxShadow: "-20px 0 50px rgba(0,0,0,0.5)" }}
          >
            {/* Panel Header */}
            <div className="p-6 bg-[var(--es-bg-surface)] flex justify-between items-center">
              <div>
                <h4 className="font-extrabold text-lg text-[#ffb599] tracking-tight">
                  Batch Details
                </h4>
                <p className="font-[var(--es-font-mono)] text-xs text-[var(--es-text-secondary)]">
                  Reference #{selected.id}
                </p>
              </div>
              <button
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--es-bg-overlay)] transition-colors text-[var(--es-text-secondary)]"
                onClick={() => setSelectedId(null)}
                aria-label="Close panel"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Summary */}
              <div className="bg-[var(--es-bg-inset)] p-4 rounded-lg space-y-3">
                <div className="flex justify-between text-xs uppercase tracking-widest font-bold text-[var(--es-text-secondary)]">
                  <span>Summary</span>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-sm text-[var(--es-text-primary)]">
                    Total Settlement
                  </span>
                  <span className="text-2xl font-[var(--es-font-mono)] font-bold text-[var(--es-text-primary)]">
                    $
                    {selected.totalAmount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--es-text-tertiary)]">
                    Total Loads
                  </span>
                  <span className="font-[var(--es-font-mono)] text-[var(--es-text-primary)]">
                    {selected.loadCount} Verified
                  </span>
                </div>
              </div>

              {/* Settlements */}
              <div className="space-y-4">
                <h5 className="text-xs font-bold uppercase tracking-widest text-[var(--es-text-secondary)] px-1">
                  Driver Settlements
                </h5>
                {selected.settlements.map((s) => (
                  <div
                    key={s.name}
                    className={`bg-[var(--es-bg-surface)] hover:bg-[var(--es-bg-overlay)] p-4 rounded-lg flex justify-between items-center transition-all group ${
                      s.status === "reviewing"
                        ? "border-l-2 border-[#ffb599]/40"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--es-bg-inset)] flex items-center justify-center text-sm font-bold text-[var(--es-text-secondary)]">
                        {s.initials}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-[var(--es-text-primary)]">
                          {s.name}
                        </p>
                        <p className="font-[var(--es-font-mono)] text-[10px] text-[var(--es-text-secondary)]">
                          {s.loadCount} LOADS
                          {s.flag ? ` — ${s.flag}` : " VERIFIED"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-[var(--es-font-mono)] font-bold text-sm text-[var(--es-text-primary)]">
                        $
                        {s.amount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                      <p
                        className={`text-[10px] font-bold ${
                          s.status === "ready"
                            ? "text-[var(--es-ready)]"
                            : "text-[#ffb599]"
                        }`}
                      >
                        {s.status === "ready" ? "READY" : "REVIEWING"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 bg-[var(--es-bg-inset)] border-t border-[var(--es-bg-elevated)] grid grid-cols-2 gap-3">
              <button className="px-4 py-3 border border-[var(--es-border-default)] rounded-lg font-bold text-xs uppercase text-[var(--es-text-primary)] hover:bg-[var(--es-bg-surface)] transition-colors">
                Export CSV
              </button>
              <button className="px-4 py-3 bg-[var(--es-accent)] text-[var(--es-text-inverse)] rounded-lg font-bold text-xs uppercase shadow-md hover:brightness-110 transition-all">
                Post Batch
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline sub-components                                                     */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  borderColor,
}: {
  label: string;
  value: string;
  borderColor: string;
}) {
  return (
    <div className={`bg-[#161b28] p-5 rounded-xl border-l-4 ${borderColor}`}>
      <p className="text-xs font-bold text-[var(--es-text-secondary)] uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-3xl font-[var(--es-font-mono)] font-bold text-[var(--es-text-primary)]">
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_BATCHES: MockBatch[] = [
  {
    id: "992-04",
    dateRange: "Oct 14 — Oct 21, 2023",
    loadCount: 42,
    totalAmount: 28450.0,
    status: "paid",
    settlements: [],
  },
  {
    id: "992-05",
    dateRange: "Oct 21 — Oct 28, 2023",
    loadCount: 38,
    totalAmount: 31120.5,
    status: "submitted",
    settlements: [],
  },
  {
    id: "993-01",
    dateRange: "Oct 28 — Nov 04, 2023",
    loadCount: 12,
    totalAmount: 12800.0,
    status: "draft",
    settlements: [
      {
        name: "Marcus Vance",
        initials: "MV",
        loadCount: 5,
        amount: 4250.0,
        status: "ready",
      },
      {
        name: "Elena Rodriguez",
        initials: "ER",
        loadCount: 4,
        amount: 3850.0,
        status: "ready",
      },
      {
        name: "Sam Peterson",
        initials: "SP",
        loadCount: 3,
        amount: 4700.0,
        status: "reviewing",
        flag: "1 FLAG",
      },
    ],
  },
  {
    id: "991-88",
    dateRange: "Oct 07 — Oct 14, 2023",
    loadCount: 56,
    totalAmount: 44190.75,
    status: "paid",
    settlements: [],
  },
];
