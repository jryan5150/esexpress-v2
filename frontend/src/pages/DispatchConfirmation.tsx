import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";

/* -------------------------------------------------------------------------- */
/*  DispatchConfirmation — post-dispatch results: success/failure + tx log    */
/* -------------------------------------------------------------------------- */

type TxStatus = "ready" | "error";

interface TransactionRow {
  loadId: string;
  driver: string;
  weight: string;
  pcsSeq: string;
  status: TxStatus;
}

export function DispatchConfirmation() {
  const { wellId } = useParams<{ wellId: string }>();
  const navigate = useNavigate();

  // Mock data used while backend isn't connected
  const result = MOCK_RESULT;
  const transactions = MOCK_TRANSACTIONS;

  const failedCount = transactions.filter((t) => t.status === "error").length;
  const successCount = transactions.length - failedCount;

  return (
    <div className="p-8 pb-32 max-w-6xl mx-auto space-y-8">
      {/* Breadcrumb-style header */}
      <div className="flex items-center gap-2 text-[var(--text-xs)] text-[var(--text-tertiary)]">
        <span className="uppercase tracking-widest">Location /</span>
        <span className="font-semibold text-[var(--text-primary)]">
          {result.wellName}
        </span>
      </div>

      {/* Status Card */}
      <section className="bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] overflow-hidden flex shadow-[var(--shadow-lg)]">
        <div className="w-2 bg-[var(--status-error)]" />
        <div className="flex-1 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-[var(--status-error-dim)] flex items-center justify-center text-[var(--status-error)]">
              <span className="text-2xl">&#x26A0;</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                Partial Push Failure
              </h2>
              <p className="text-lg text-[var(--text-secondary)]">
                {successCount} loads successful,{" "}
                <span className="text-[var(--status-error)] font-semibold">
                  {failedCount} failed
                </span>
              </p>
              <p className="text-[var(--text-tertiary)] font-[var(--font-mono)] text-[var(--text-xs)] mt-1">
                REASON: {result.failureReason}
              </p>
            </div>
          </div>
          <Button variant="primary" className="px-8 py-3 font-bold shadow-lg">
            Retry Failed
          </Button>
        </div>
      </section>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          label="Success Rate"
          value={`${result.successRate}%`}
          detail={
            <div className="w-full bg-[var(--bg-base)] h-1 rounded-full overflow-hidden">
              <div
                className="bg-[var(--status-ready)] h-full rounded-full"
                style={{ width: `${result.successRate}%` }}
              />
            </div>
          }
          trend="up"
        />
        <MetricCard
          label="Avg Weight"
          value={result.avgWeight.toLocaleString()}
          unit="lbs"
          subtext={`Within \u00B1${result.weightTolerance}% tolerance`}
        />
        <MetricCard
          label="Push Duration"
          value={String(result.pushDurationSec)}
          unit="s"
          subtext="Optimized Performance"
          subtextColor="var(--status-ready)"
        />
      </div>

      {/* Transaction Log Table */}
      <div className="bg-[var(--bg-surface)] rounded-[var(--radius-lg)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex justify-between items-center">
          <h3 className="text-sm uppercase tracking-widest text-[var(--text-secondary)]">
            Transaction Log
          </h3>
          <div className="flex gap-2">
            <button
              className="p-1.5 hover:bg-[var(--bg-elevated)] rounded transition-colors text-[var(--text-secondary)]"
              aria-label="Filter"
            >
              &#x25A4;
            </button>
            <button
              className="p-1.5 hover:bg-[var(--bg-elevated)] rounded transition-colors text-[var(--text-secondary)]"
              aria-label="Download"
            >
              &#x2B07;
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--bg-base)]">
              <tr>
                {["Load ID", "Driver", "Weight", "PCS Seq #", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-[var(--text-xs)] uppercase text-[var(--text-tertiary)] tracking-tighter"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {transactions.map((tx) => (
                <tr
                  key={tx.loadId}
                  className="hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <td className="px-6 py-4 font-[var(--font-mono)] text-[var(--text-primary)]">
                    {tx.loadId}
                  </td>
                  <td className="px-6 py-4 text-sm">{tx.driver}</td>
                  <td className="px-6 py-4 font-[var(--font-mono)] text-sm">
                    {tx.weight}
                  </td>
                  <td className="px-6 py-4 font-[var(--font-mono)] text-sm text-[var(--text-tertiary)]">
                    {tx.pcsSeq}
                  </td>
                  <td className="px-6 py-4">
                    <TxStatusChip status={tx.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-6 py-3 bg-[var(--bg-base)] flex justify-between items-center text-[var(--text-xs)] text-[var(--text-tertiary)]">
          <span>
            Showing {transactions.length} of {result.totalLoads} loads
          </span>
          <div className="flex gap-4">
            <button className="hover:text-[var(--accent)] transition-colors flex items-center gap-1">
              &#x2190; Previous
            </button>
            <button className="hover:text-[var(--accent)] transition-colors flex items-center gap-1">
              Next &#x2192;
            </button>
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <footer className="fixed bottom-0 left-0 right-0 h-20 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] px-8 flex items-center justify-between z-40 ml-[240px]">
        <button
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[var(--text-xs)] uppercase tracking-widest"
          onClick={() => navigate("/")}
        >
          &#x2190; Back to Feed
        </button>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-widest">
              Next Queue
            </p>
            <p className="font-semibold text-[var(--text-primary)]">
              Browning SilverHill{" "}
              <span className="text-[var(--accent)] font-[var(--font-mono)] text-sm ml-2">
                (12 Loads)
              </span>
            </p>
          </div>
          <Button
            variant="primary"
            className="flex items-center gap-3 px-6 py-3 font-bold"
            onClick={() => navigate("/wells/browning-silverhill")}
          >
            Next Well &#x2192;
          </Button>
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline sub-components                                                     */
/* -------------------------------------------------------------------------- */

function MetricCard({
  label,
  value,
  unit,
  detail,
  subtext,
  subtextColor,
  trend,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: React.ReactNode;
  subtext?: string;
  subtextColor?: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-[var(--radius-sm)] p-5 space-y-2">
      <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-[var(--text-primary)]">
          {value}
        </span>
        {unit && <span className="text-[var(--text-tertiary)]">{unit}</span>}
        {trend === "up" && (
          <span className="text-[var(--status-ready)]">&#x2197;</span>
        )}
      </div>
      {detail}
      {subtext && (
        <p
          className="text-[var(--text-xs)]"
          style={{ color: subtextColor ?? "var(--text-tertiary)" }}
        >
          {subtext}
        </p>
      )}
    </div>
  );
}

function TxStatusChip({ status }: { status: TxStatus }) {
  const styles: Record<TxStatus, { bg: string; text: string; label: string }> =
    {
      ready: {
        bg: "bg-[var(--status-ready-dim)]",
        text: "text-[var(--status-ready)]",
        label: "Ready",
      },
      error: {
        bg: "bg-[var(--status-error-dim)]",
        text: "text-[var(--status-error)]",
        label: "Error",
      },
    };

  const s = styles[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${s.bg} ${s.text} text-[var(--text-xs)] font-bold uppercase`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === "error" ? "bg-[var(--status-error)]" : "bg-[var(--status-ready)]"}`}
      />
      {s.label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_RESULT = {
  wellName: "PENDLETON 1H",
  successRate: 95.7,
  avgWeight: 39420,
  weightTolerance: 1.2,
  pushDurationSec: 14,
  failureReason: "PCS Timeout on Load 4831 & 4835",
  totalLoads: 47,
};

const MOCK_TRANSACTIONS: TransactionRow[] = [
  {
    loadId: "4831",
    driver: "Marcus Vance",
    weight: "42,100",
    pcsSeq: "PEND-01A",
    status: "error",
  },
  {
    loadId: "4832",
    driver: "Sarah Jenkins",
    weight: "38,840",
    pcsSeq: "PEND-02A",
    status: "ready",
  },
  {
    loadId: "4833",
    driver: "Robert Chen",
    weight: "40,020",
    pcsSeq: "PEND-03A",
    status: "ready",
  },
  {
    loadId: "4834",
    driver: "Elena Rodriguez",
    weight: "39,150",
    pcsSeq: "PEND-04A",
    status: "ready",
  },
  {
    loadId: "4835",
    driver: "Marcus Vance",
    weight: "41,200",
    pcsSeq: "PEND-05A",
    status: "error",
  },
];
