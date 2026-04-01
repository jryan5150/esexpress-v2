import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";

/* -------------------------------------------------------------------------- */
/*  DispatchConfirmation — post-dispatch results: success/failure + tx log    */
/* -------------------------------------------------------------------------- */

type TxStatus = "pushed" | "failed";

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

  const failedCount = transactions.filter((t) => t.status === "failed").length;
  const successCount = transactions.length - failedCount;

  return (
    <div className="p-8 pb-32 max-w-6xl mx-auto space-y-8">
      {/* Breadcrumb-style header */}
      <div className="flex items-center gap-2 text-xs text-[var(--es-text-tertiary)]">
        <span className="uppercase tracking-widest">Location /</span>
        <span className="font-semibold text-[var(--es-text-primary)]">
          {result.wellName}
        </span>
      </div>

      {/* Status Card */}
      <section
        className="bg-[var(--es-bg-elevated)] rounded-[var(--es-radius-lg)] overflow-hidden flex"
        style={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)" }}
      >
        <div className="w-2 bg-[var(--es-error)]" />
        <div className="flex-1 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-[var(--es-error-dim)] flex items-center justify-center text-[var(--es-error)]">
              <span className="text-2xl">&#x26A0;</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[var(--es-text-primary)]">
                Partial Push Failure
              </h2>
              <p className="text-lg text-[var(--es-text-secondary)]">
                {result.totalLoads - failedCount} loads successful,{" "}
                <span className="text-[var(--es-error)] font-semibold">
                  {failedCount} failed
                </span>
              </p>
              <p className="text-[var(--es-text-tertiary)] font-[var(--es-font-mono)] text-xs mt-1">
                REASON: {result.failureReason}
              </p>
            </div>
          </div>
          <button
            className="px-8 py-3 font-bold rounded-sm shadow-lg transition-all text-sm hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(to bottom right, #f0692c, #d1541e)",
              color: "var(--es-text-inverse)",
              boxShadow: "0 4px 12px rgba(240, 105, 44, 0.2)",
            }}
          >
            Retry Failed
          </button>
        </div>
      </section>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          label="Success Rate"
          value={`${result.successRate}%`}
          detail={
            <div className="w-full bg-[var(--es-bg-inset)] h-1 rounded-full overflow-hidden">
              <div
                className="bg-[var(--es-ready)] h-full rounded-full"
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
          mono
        />
        <MetricCard
          label="Push Duration"
          value={String(result.pushDurationSec)}
          unit="s"
          subtext="Optimized Performance"
          subtextColor="var(--es-ready)"
          mono
        />
      </div>

      {/* Transaction Log Table */}
      <div className="bg-[var(--es-bg-surface)] rounded-[var(--es-radius-lg)] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
          <h3 className="text-sm uppercase tracking-widest text-[var(--es-text-secondary)]">
            Transaction Log
          </h3>
          <div className="flex gap-2">
            <button
              className="p-1.5 hover:bg-[var(--es-bg-elevated)] rounded transition-colors text-[var(--es-text-secondary)]"
              aria-label="Filter"
            >
              &#x25A4;
            </button>
            <button
              className="p-1.5 hover:bg-[var(--es-bg-elevated)] rounded transition-colors text-[var(--es-text-secondary)]"
              aria-label="Download"
            >
              &#x2B07;
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--es-bg-inset)]">
              <tr>
                {["Load ID", "Driver", "Weight", "PCS Seq #", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-[10px] uppercase text-[var(--es-text-tertiary)] tracking-tighter font-bold"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {transactions.map((tx) => (
                <tr
                  key={tx.loadId}
                  className="hover:bg-[var(--es-bg-elevated)] transition-colors"
                >
                  <td className="px-6 py-4 font-[var(--es-font-mono)] text-[var(--es-text-primary)]">
                    {tx.loadId}
                  </td>
                  <td className="px-6 py-4 text-sm">{tx.driver}</td>
                  <td className="px-6 py-4 font-[var(--es-font-mono)] text-sm">
                    {tx.weight}
                  </td>
                  <td className="px-6 py-4 font-[var(--es-font-mono)] text-sm text-[var(--es-text-tertiary)]">
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
        <div className="px-6 py-3 bg-[var(--es-bg-inset)] flex justify-between items-center text-xs text-[var(--es-text-tertiary)]">
          <span>
            Showing {transactions.length} of {result.totalLoads} loads
          </span>
          <div className="flex gap-4">
            <button className="hover:text-[var(--es-accent)] transition-colors flex items-center gap-1">
              &#x2190; Previous
            </button>
            <button className="hover:text-[var(--es-accent)] transition-colors flex items-center gap-1">
              Next &#x2192;
            </button>
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <footer
        className="fixed bottom-0 left-0 right-0 h-20 border-t px-8 flex items-center justify-between z-40"
        style={{
          marginLeft: "240px",
          background: "rgba(2, 6, 23, 0.9)",
          backdropFilter: "blur(24px)",
          borderColor: "rgba(255, 255, 255, 0.05)",
        }}
      >
        <button
          className="flex items-center gap-2 text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)] transition-colors text-xs uppercase tracking-widest"
          onClick={() => navigate("/")}
        >
          &#x2190; Back to Feed
        </button>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] text-[var(--es-text-tertiary)] uppercase tracking-widest">
              Next Queue
            </p>
            <p className="font-bold text-[var(--es-text-primary)]">
              Browning SilverHill{" "}
              <span className="text-[var(--es-accent)] font-[var(--es-font-mono)] text-sm ml-2 font-medium">
                (12 Loads)
              </span>
            </p>
          </div>
          <button
            className="flex items-center gap-3 px-6 py-3 font-bold rounded-sm hover:opacity-90 transition-opacity text-sm"
            style={{
              background: "var(--es-accent)",
              color: "var(--es-text-inverse)",
            }}
            onClick={() => navigate("/wells/browning-silverhill")}
          >
            Start Next &#x2192;
          </button>
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
  mono,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: React.ReactNode;
  subtext?: string;
  subtextColor?: string;
  trend?: "up" | "down";
  mono?: boolean;
}) {
  return (
    <div className="bg-[var(--es-bg-surface)] rounded-[var(--es-radius-sm)] p-5 space-y-2">
      <span className="text-xs text-[var(--es-text-tertiary)] uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-4xl font-bold text-[var(--es-text-primary)] ${mono ? "font-[var(--es-font-mono)]" : ""}`}
        >
          {value}
        </span>
        {unit && <span className="text-[var(--es-text-tertiary)]">{unit}</span>}
        {trend === "up" && (
          <span className="text-[var(--es-ready)]">&#x2197;</span>
        )}
      </div>
      {detail}
      {subtext && (
        <p
          className="text-xs"
          style={{ color: subtextColor ?? "var(--es-text-tertiary)" }}
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
      pushed: {
        bg: "bg-[var(--es-ready-dim)]",
        text: "text-[var(--es-ready)]",
        label: "Pushed",
      },
      failed: {
        bg: "bg-[var(--es-error-dim)]",
        text: "text-[var(--es-error)]",
        label: "Failed",
      },
    };

  const s = styles[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${s.bg} ${s.text} text-[10px] font-bold uppercase`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === "failed" ? "bg-[var(--es-error)]" : "bg-[var(--es-ready)]"}`}
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
    status: "failed",
  },
  {
    loadId: "4832",
    driver: "Sarah Jenkins",
    weight: "38,840",
    pcsSeq: "PEND-02A",
    status: "pushed",
  },
  {
    loadId: "4833",
    driver: "Robert Chen",
    weight: "40,020",
    pcsSeq: "PEND-03A",
    status: "pushed",
  },
  {
    loadId: "4834",
    driver: "Elena Rodriguez",
    weight: "39,150",
    pcsSeq: "PEND-04A",
    status: "pushed",
  },
  {
    loadId: "4835",
    driver: "Marcus Vance",
    weight: "41,200",
    pcsSeq: "PEND-05A",
    status: "failed",
  },
];
