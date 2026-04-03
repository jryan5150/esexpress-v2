import { StatCard } from "../components/StatCard";
import { StatusDot } from "../components/StatusDot";
import {
  useHealth,
  usePerformance,
  useVolume,
  usePresence,
  usePipeline,
} from "../hooks/use-diag";
import { useFeedbackList } from "../hooks/use-feedback";

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return `${days}d ${rem}h`;
  }
  return `${hours}h`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const statusLabel: Record<string, string> = {
  green: "All Systems Operational",
  yellow: "Degraded Performance",
  red: "System Issues Detected",
};

const statusBanner: Record<string, string> = {
  green: "border-tertiary/30 bg-tertiary/5",
  yellow: "border-amber-400/30 bg-amber-400/5",
  red: "border-error/30 bg-error/5",
};

const pipelineNames: Record<string, string> = {
  propx: "PropX",
  logistiq: "Logistiq",
  automap: "Auto-map",
  jotform: "JotForm",
};

export function Overview() {
  const health = useHealth();
  const perf = usePerformance();
  const presence = usePresence();
  const pipeline = usePipeline();
  const feedback = useFeedbackList();

  const status = health.data?.status ?? "green";
  const errorCount = perf.data
    ? Object.entries(perf.data.errorsByStatus)
        .filter(([code]) => Number(code) >= 400)
        .reduce((sum, [, n]) => sum + n, 0)
    : 0;
  const totalRequests = perf.data?.count ?? 0;
  const errorRate =
    totalRequests > 0
      ? ((errorCount / totalRequests) * 100).toFixed(1) + "%"
      : "0%";

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {health.data && (
        <div
          className={`flex items-center gap-3 rounded-xl border p-4 ${statusBanner[status]}`}
        >
          <StatusDot status={status} size="md" />
          <div>
            <p className="font-headline text-sm font-bold text-on-surface">
              {statusLabel[status]}
            </p>
            <p className="mt-0.5 font-label text-xs text-on-surface-variant">
              Uptime: {formatUptime(health.data.uptime)}
            </p>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Uptime"
          value={health.data ? formatUptime(health.data.uptime) : "--"}
          icon="schedule"
        />
        <StatCard
          label="p95 Latency"
          value={perf.data ? `${Math.round(perf.data.p95)}ms` : "--"}
          icon="speed"
        />
        <StatCard
          label="Error Rate (24h)"
          value={errorRate}
          icon="error_outline"
        />
        <StatCard
          label="Active Users"
          value={presence.data?.activeUsers.length ?? 0}
          icon="group"
        />
      </div>

      {/* Pipeline Summary + Feedback Preview */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline Summary */}
        <div className="rounded-xl bg-surface-container p-5">
          <h2 className="mb-4 font-headline text-sm font-bold text-on-surface">
            Pipeline Status
          </h2>
          <ul className="space-y-3">
            {pipeline.data &&
              (
                Object.keys(pipelineNames) as Array<keyof typeof pipelineNames>
              ).map((key) => {
                const src = pipeline.data[key as keyof typeof pipeline.data];
                if (!src) return null;
                const lastStatus =
                  src.lastRun?.status === "error" ? "red" : "green";
                return (
                  <li key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot status={lastStatus} />
                      <span className="text-sm text-on-surface">
                        {pipelineNames[key]}
                      </span>
                    </div>
                    <span className="font-label text-xs text-on-surface-variant">
                      {src.lastRun?.startedAt
                        ? timeAgo(src.lastRun.startedAt)
                        : "never"}
                    </span>
                  </li>
                );
              })}
            {!pipeline.data && (
              <li className="text-sm text-on-surface-variant">Loading...</li>
            )}
          </ul>
        </div>

        {/* Latest Feedback */}
        <div className="rounded-xl bg-surface-container p-5">
          <h2 className="mb-4 font-headline text-sm font-bold text-on-surface">
            Latest Feedback
          </h2>
          {feedback.data && feedback.data.length > 0 ? (
            <ul className="space-y-3">
              {feedback.data.slice(0, 3).map((fb) => (
                <li
                  key={fb.id}
                  className="rounded-lg bg-surface-container-low p-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 font-label text-[10px] uppercase tracking-wider ${
                        fb.category === "issue"
                          ? "bg-error/15 text-error"
                          : fb.category === "suggestion"
                            ? "bg-tertiary/15 text-tertiary"
                            : "bg-secondary/15 text-secondary"
                      }`}
                    >
                      {fb.category}
                    </span>
                    <span className="font-label text-[10px] text-on-surface-variant">
                      {timeAgo(fb.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-on-surface">
                    {fb.description}
                  </p>
                </li>
              ))}
            </ul>
          ) : feedback.data ? (
            <p className="text-sm text-on-surface-variant">No feedback yet.</p>
          ) : (
            <p className="text-sm text-on-surface-variant">Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
}
