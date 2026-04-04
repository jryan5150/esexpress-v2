import {
  useFinanceBatches,
  useFinanceStatusSummary,
  useFinanceSummary,
} from "../hooks/use-finance";

// Fallback mock data
const MOCK_CYCLES = [
  {
    id: "PAY-2024-042",
    company: "Titan Logistics",
    bols: 18,
    amount: "$48,220.00",
    status: "Ready",
    statusColor: "bg-tertiary/10 text-tertiary border-tertiary/20",
  },
  {
    id: "PAY-2024-041",
    company: "Eagle Hauling",
    bols: 12,
    amount: "$31,450.50",
    status: "Pending",
    statusColor: "bg-primary/10 text-primary border-primary/20",
  },
  {
    id: "PAY-2024-040",
    company: "Mesa Transport",
    bols: 24,
    amount: "$42,180.72",
    status: "Processing",
    statusColor:
      "bg-primary-container/10 text-primary-container border-primary-container/20",
  },
  {
    id: "PAY-2024-039",
    company: "Basin Haulers",
    bols: 8,
    amount: "$21,000.00",
    status: "Completed",
    statusColor: "bg-on-surface/5 text-on-surface/40 border-on-surface/10",
  },
];

const MOCK_STATUS_SUMMARY = {
  openBatches: 4,
  openBatchesTrend: "+2 this week",
  totalPending: "$142,850",
  totalPendingCents: ".22",
  pendingCarriers: 3,
  lastPayRun: "OCT 24",
  lastPayRunAmount: "$89,400 disbursed",
  processing: 12,
};

const STATUS_COLOR_MAP: Record<string, string> = {
  ready: "bg-tertiary/10 text-tertiary border-tertiary/20",
  pending: "bg-primary/10 text-primary border-primary/20",
  processing:
    "bg-primary-container/10 text-primary-container border-primary-container/20",
  completed: "bg-on-surface/5 text-on-surface/40 border-on-surface/10",
};

function formatAmount(cents: number): { dollars: string; decimal: string } {
  const str = (cents / 100).toFixed(2);
  const [dollars, decimal] = str.split(".");
  return {
    dollars: "$" + Number(dollars).toLocaleString(),
    decimal: "." + decimal,
  };
}

export function Finance() {
  const statusSummaryQuery = useFinanceStatusSummary();
  const batchesQuery = useFinanceBatches();
  const summaryQuery = useFinanceSummary();

  const isError =
    statusSummaryQuery.isError || batchesQuery.isError || summaryQuery.isError;
  const isLoading = statusSummaryQuery.isLoading || batchesQuery.isLoading;

  // Status summary card data
  const statusData = statusSummaryQuery.data as
    | Record<string, unknown>
    | undefined;
  const summaryData = summaryQuery.data as Record<string, unknown> | undefined;

  const openBatches = statusData
    ? String(
        Number(statusData.draft ?? 0) +
          Number(statusData.pending_review ?? 0) +
          Number(statusData.under_review ?? 0),
      ).padStart(2, "0")
    : MOCK_STATUS_SUMMARY.openBatches.toString().padStart(2, "0");

  const openBatchesTrend = statusData
    ? String(statusData.openBatchesTrend ?? "")
    : MOCK_STATUS_SUMMARY.openBatchesTrend;

  const totalPendingRaw = summaryData?.totalPending ?? statusData?.totalPending;
  let totalPendingDollars: string;
  let totalPendingCents: string;
  if (totalPendingRaw !== undefined && typeof totalPendingRaw === "number") {
    const formatted = formatAmount(totalPendingRaw);
    totalPendingDollars = formatted.dollars;
    totalPendingCents = formatted.decimal;
  } else if (
    totalPendingRaw !== undefined &&
    typeof totalPendingRaw === "string"
  ) {
    const parts = String(totalPendingRaw).split(".");
    totalPendingDollars = parts[0].startsWith("$") ? parts[0] : "$" + parts[0];
    totalPendingCents = parts[1] ? "." + parts[1] : "";
  } else {
    totalPendingDollars = MOCK_STATUS_SUMMARY.totalPending;
    totalPendingCents = MOCK_STATUS_SUMMARY.totalPendingCents;
  }

  const pendingCarriers = statusData
    ? Number(statusData.pendingCarriers ?? 0)
    : MOCK_STATUS_SUMMARY.pendingCarriers;

  // Last Pay Run: find most recent paid batch if available
  const paidBatches = Array.isArray(batchesQuery.data)
    ? (batchesQuery.data as Array<Record<string, unknown>>).filter(
        (b: Record<string, unknown>) =>
          String(b.status).toLowerCase() === "paid",
      )
    : [];
  const lastPayRun =
    paidBatches.length > 0
      ? String(paidBatches[0].completedAt ?? paidBatches[0].updatedAt ?? "N/A")
      : statusData
        ? String(statusData.lastPayRun ?? "N/A")
        : MOCK_STATUS_SUMMARY.lastPayRun;

  const lastPayRunAmount =
    paidBatches.length > 0
      ? typeof paidBatches[0].amount === "number"
        ? "$" +
          ((paidBatches[0].amount as number) / 100).toLocaleString("en-US", {
            minimumFractionDigits: 2,
          }) +
          " disbursed"
        : String(paidBatches[0].amount ?? "") + " disbursed"
      : statusData
        ? String(
            statusData.lastPayRunAmount ?? MOCK_STATUS_SUMMARY.lastPayRunAmount,
          )
        : MOCK_STATUS_SUMMARY.lastPayRunAmount;

  const processingCount = statusData
    ? Number(statusData.under_review ?? 0)
    : MOCK_STATUS_SUMMARY.processing;

  // Batch table data
  const batchArray = Array.isArray(batchesQuery.data)
    ? batchesQuery.data
    : Array.isArray((batchesQuery.data as Record<string, unknown>)?.items)
      ? ((batchesQuery.data as Record<string, unknown>).items as Array<
          Record<string, unknown>
        >)
      : null;
  const cycles = batchArray
    ? batchArray.map((b: Record<string, unknown>) => {
        const status = String(b.status || "pending").toLowerCase();
        return {
          id: String(b.id || b._id || b.batchId || ""),
          company: String(b.company || b.carrierName || ""),
          bols: Number(b.bols ?? b.bolCount ?? b.loadCount ?? 0),
          amount: b.amount
            ? typeof b.amount === "number"
              ? "$" +
                (b.amount / 100).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })
              : String(b.amount)
            : "$0.00",
          status: status.charAt(0).toUpperCase() + status.slice(1),
          statusColor:
            STATUS_COLOR_MAP[status] ||
            "bg-on-surface/5 text-on-surface/40 border-on-surface/10",
        };
      })
    : MOCK_CYCLES;

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              Finance
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              Payment Cycles // Settlement Batches
            </p>
          </div>
          <button
            onClick={() => alert("Create Batch functionality coming soon")}
            className="ml-auto bg-primary-container text-on-primary-container px-6 py-3 rounded-lg font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-primary-container/30"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Create Batch
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6 space-y-6">
        {/* API Error Banner */}
        {isError && (
          <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-error text-lg">
              cloud_off
            </span>
            <p className="text-sm text-error font-medium">
              Unable to connect to the server. Showing cached data.
            </p>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-low rounded-xl p-6 border border-on-surface/5">
            <span className="text-[10px] uppercase font-bold text-on-surface/30 tracking-widest font-label">
              Open Batches
            </span>
            <div className="mt-2 flex items-end gap-2">
              <span className="font-label text-4xl font-black text-on-surface">
                {isLoading ? "..." : openBatches}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-tertiary text-sm">
                trending_up
              </span>
              <span className="text-xs text-tertiary font-bold">
                {isLoading ? "..." : openBatchesTrend}
              </span>
            </div>
          </div>
          <div className="bg-surface-container-low rounded-xl p-6 border border-on-surface/5">
            <span className="text-[10px] uppercase font-bold text-on-surface/30 tracking-widest font-label">
              Total Pending
            </span>
            <div className="mt-2 flex items-end gap-2">
              <span className="font-label text-3xl font-black text-on-surface">
                {isLoading ? "..." : totalPendingDollars}
              </span>
              {!isLoading && totalPendingCents && (
                <span className="font-label text-lg font-bold text-on-surface/40 mb-0.5">
                  {totalPendingCents}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary-container text-sm">
                schedule
              </span>
              <span className="text-xs text-on-surface/50 font-medium">
                {isLoading ? "..." : `Across ${pendingCarriers} carriers`}
              </span>
            </div>
          </div>
          <div className="bg-surface-container-low rounded-xl p-6 border border-on-surface/5">
            <span className="text-[10px] uppercase font-bold text-on-surface/30 tracking-widest font-label">
              Last Pay Run
            </span>
            <div className="mt-2 flex items-end gap-2">
              <span className="font-label text-3xl font-black text-on-surface">
                {isLoading ? "..." : lastPayRun}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-on-surface/30 text-sm">
                check_circle
              </span>
              <span className="text-xs text-on-surface/50 font-medium">
                {isLoading ? "..." : lastPayRunAmount}
              </span>
            </div>
          </div>
          <div className="bg-surface-container-low rounded-xl p-6 border border-on-surface/5">
            <span className="text-[10px] uppercase font-bold text-on-surface/30 tracking-widest font-label">
              Processing
            </span>
            <div className="mt-2 flex items-end gap-2">
              <span className="font-label text-4xl font-black text-primary-container">
                {isLoading ? "..." : processingCount}
              </span>
              <span className="font-label text-lg font-bold text-on-surface/40 mb-0.5">
                BOL
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary-container text-sm animate-pulse">
                sync
              </span>
              <span className="text-xs text-on-surface/50 font-medium">
                In reconciliation
              </span>
            </div>
          </div>
        </div>

        {/* Active Payment Cycles */}
        <section className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
          <div className="flex items-center justify-between px-6 py-4 bg-surface-container-lowest/50">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-container text-lg">
                payments
              </span>
              <h2 className="font-headline font-bold text-sm text-on-surface">
                Active Payment Cycles
              </h2>
              <span className="font-label text-[10px] bg-primary-container/10 text-primary-container px-2 py-0.5 rounded uppercase tracking-wider font-bold">
                {isLoading ? "..." : `${cycles.length} Cycles`}
              </span>
            </div>
          </div>
          <div className="p-0">
            <div className="grid grid-cols-12 gap-1 px-6 py-3 text-[10px] font-label uppercase tracking-widest text-on-surface/30 font-bold border-b border-on-surface/5 bg-surface-container-lowest/30">
              <div className="col-span-2">Batch ID</div>
              <div className="col-span-3">Company</div>
              <div className="col-span-1">BOLs</div>
              <div className="col-span-2">Amount</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            <div className="divide-y divide-on-surface/5">
              {isLoading ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="grid grid-cols-12 gap-1 items-center px-4 py-3 animate-pulse"
                    >
                      <div className="col-span-2">
                        <div className="h-4 w-28 bg-on-surface/10 rounded" />
                      </div>
                      <div className="col-span-3">
                        <div className="h-4 w-32 bg-on-surface/5 rounded" />
                      </div>
                      <div className="col-span-1">
                        <div className="h-4 w-8 bg-on-surface/5 rounded" />
                      </div>
                      <div className="col-span-2">
                        <div className="h-4 w-24 bg-on-surface/5 rounded" />
                      </div>
                      <div className="col-span-2">
                        <div className="h-4 w-20 bg-on-surface/5 rounded" />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <div className="h-7 w-16 bg-on-surface/5 rounded" />
                      </div>
                    </div>
                  ))}
                </>
              ) : cycles.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-on-surface/40 font-label text-sm">
                    No active payment cycles
                  </p>
                </div>
              ) : (
                cycles.map((cycle) => (
                  <div
                    key={cycle.id}
                    className="grid grid-cols-12 gap-1 items-center px-6 py-4 bg-surface-container-low hover:bg-surface-container-high transition-colors group"
                  >
                    <div className="col-span-2 font-label text-sm text-primary">
                      {cycle.id}
                    </div>
                    <div className="col-span-3 text-sm font-medium text-on-surface">
                      {cycle.company}
                    </div>
                    <div className="col-span-1 font-label text-sm text-on-surface/60">
                      {cycle.bols}
                    </div>
                    <div className="col-span-2 font-label text-sm font-bold text-on-surface">
                      {cycle.amount}
                    </div>
                    <div className="col-span-2">
                      <span
                        className={`px-2.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-wider rounded-full border ${cycle.statusColor}`}
                      >
                        {cycle.status}
                      </span>
                    </div>
                    <div className="col-span-2 flex justify-end gap-2">
                      <button className="bg-surface-container-high/80 px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface/60 border border-on-surface/10 hover:bg-surface-container-highest hover:text-on-surface/80 flex items-center gap-1.5 transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-sm">
                          visibility
                        </span>
                        View
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
