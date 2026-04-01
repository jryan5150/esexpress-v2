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
  paid: "bg-[var(--status-ready)]",
  submitted: "bg-[var(--accent)]",
  draft: "bg-[var(--text-tertiary)]",
  reviewing: "bg-[var(--status-warning)]",
};

export function FinanceBatches() {
  const [selectedId, setSelectedId] = useState<string | null>("993-01");
  const selected = MOCK_BATCHES.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="p-6 pb-12 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-[var(--text-2xl)] font-extrabold tracking-tight text-[var(--text-primary)]">
            Batch Management
          </h1>
          <p className="text-[var(--text-secondary)] max-w-lg">
            Consolidate driver settlements, verify load documentation, and
            execute payment runs for the current cycle.
          </p>
        </div>
        <Button variant="primary" className="px-6 py-3 font-bold">
          + Create Batch
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Open Batches"
          value="04"
          borderColor="border-[var(--accent)]"
        />
        <StatCard
          label="Total Pending"
          value="$142,850.22"
          borderColor="border-[var(--status-ready)]"
        />
        <StatCard
          label="Last Pay Run"
          value="OCT 24"
          borderColor="border-[var(--status-info)]"
        />
        <StatCard
          label="Processing"
          value="12 BOL"
          borderColor="border-[var(--accent)]"
        />
      </div>

      {/* Batch Table */}
      <div className="bg-[var(--bg-surface)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-lg)]">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-base)]">
          <h3 className="font-bold text-sm uppercase tracking-widest text-[var(--text-primary)]">
            Active Payment Cycles
          </h3>
          <div className="flex gap-2">
            <Button variant="ghost">Filter</Button>
            <Button variant="ghost">Export</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[var(--text-tertiary)] text-[10px] uppercase tracking-widest font-bold border-b border-[var(--border-subtle)]">
                <th className="px-6 py-4">Batch ID</th>
                <th className="px-6 py-4">Date Range</th>
                <th className="px-6 py-4">Load Count</th>
                <th className="px-6 py-4">Total Amount</th>
                <th className="px-6 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {MOCK_BATCHES.map((batch) => {
                const isFocused = selectedId === batch.id;
                return (
                  <tr
                    key={batch.id}
                    className={`cursor-pointer transition-colors ${
                      isFocused
                        ? "bg-[var(--bg-elevated)] border-l-4 border-[var(--accent)]"
                        : "group hover:bg-[var(--bg-elevated)]"
                    }`}
                    onClick={() => setSelectedId(batch.id)}
                  >
                    <td className="px-6 py-4">
                      <span className="font-[var(--font-mono)] text-[var(--accent)] font-bold">
                        #{batch.id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {batch.dateRange}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-[var(--font-mono)] text-sm text-[var(--text-primary)]">
                        {batch.loadCount} Loads
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-[var(--font-mono)] text-sm font-bold text-[var(--text-primary)]">
                        $
                        {batch.totalAmount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center gap-2 bg-[var(--bg-overlay)] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight font-[var(--font-mono)]">
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

        <div className="px-6 py-4 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] flex items-center justify-between">
          <p className="text-xs text-[var(--text-tertiary)] font-[var(--font-mono)]">
            Showing {MOCK_BATCHES.length} of 128 batches
          </p>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-[var(--bg-elevated)] rounded text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]">
              PREV
            </button>
            <button className="px-3 py-1 bg-[var(--bg-elevated)] rounded text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]">
              NEXT
            </button>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      {selected && (
        <aside className="fixed right-0 top-0 h-screen w-[400px] bg-[var(--bg-elevated)] shadow-2xl border-l border-[var(--border-subtle)] z-50 flex flex-col">
          {/* Panel Header */}
          <div className="p-6 bg-[var(--bg-surface)] flex justify-between items-center border-b border-[var(--border-subtle)]">
            <div>
              <h4 className="font-extrabold text-lg text-[var(--accent)] tracking-tight">
                Batch Details
              </h4>
              <p className="font-[var(--font-mono)] text-xs text-[var(--text-tertiary)]">
                Reference #{selected.id}
              </p>
            </div>
            <button
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--bg-overlay)] transition-colors text-[var(--text-secondary)]"
              onClick={() => setSelectedId(null)}
            >
              &times;
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Summary */}
            <div className="bg-[var(--bg-base)] p-4 rounded-[var(--radius-md)] space-y-3">
              <div className="flex justify-between text-xs uppercase tracking-widest font-bold text-[var(--text-tertiary)]">
                <span>Summary</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm text-[var(--text-primary)]">
                  Total Settlement
                </span>
                <span className="text-2xl font-[var(--font-mono)] font-bold text-[var(--text-primary)]">
                  $
                  {selected.totalAmount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-tertiary)]">Total Loads</span>
                <span className="font-[var(--font-mono)] text-[var(--text-primary)]">
                  {selected.loadCount} Verified
                </span>
              </div>
            </div>

            {/* Settlements */}
            <div className="space-y-4">
              <h5 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)] px-1">
                Driver Settlements
              </h5>
              {selected.settlements.map((s) => (
                <div
                  key={s.name}
                  className={`bg-[var(--bg-surface)] hover:bg-[var(--bg-overlay)] p-4 rounded-[var(--radius-md)] flex justify-between items-center transition-all ${
                    s.status === "reviewing"
                      ? "border-l-2 border-[var(--accent)]"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--bg-base)] flex items-center justify-center text-sm font-bold text-[var(--text-secondary)]">
                      {s.initials}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-[var(--text-primary)]">
                        {s.name}
                      </p>
                      <p className="font-[var(--font-mono)] text-[10px] text-[var(--text-tertiary)]">
                        {s.loadCount} LOADS
                        {s.flag ? ` - ${s.flag}` : " VERIFIED"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-[var(--font-mono)] font-bold text-sm text-[var(--text-primary)]">
                      $
                      {s.amount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                    <p
                      className={`text-[10px] font-bold ${
                        s.status === "ready"
                          ? "text-[var(--status-ready)]"
                          : "text-[var(--accent)]"
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
          <div className="p-6 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              className="py-3 font-bold text-xs uppercase"
            >
              Export CSV
            </Button>
            <Button
              variant="primary"
              className="py-3 font-bold text-xs uppercase"
            >
              Post Batch
            </Button>
          </div>
        </aside>
      )}
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
    <div
      className={`bg-[var(--bg-surface)] p-5 rounded-[var(--radius-lg)] border-l-4 ${borderColor}`}
    >
      <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-3xl font-[var(--font-mono)] font-bold text-[var(--text-primary)]">
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
    dateRange: "Oct 14 - Oct 21, 2023",
    loadCount: 42,
    totalAmount: 28450.0,
    status: "paid",
    settlements: [],
  },
  {
    id: "992-05",
    dateRange: "Oct 21 - Oct 28, 2023",
    loadCount: 38,
    totalAmount: 31120.5,
    status: "submitted",
    settlements: [],
  },
  {
    id: "993-01",
    dateRange: "Oct 28 - Nov 04, 2023",
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
    dateRange: "Oct 07 - Oct 14, 2023",
    loadCount: 56,
    totalAmount: 44190.75,
    status: "paid",
    settlements: [],
  },
];
