import { useEffect, useState } from "react";

type Health = {
  status: "green" | "yellow" | "red";
  uptime: number;
  timestamp: string;
  version: string;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; health: Health }
  | { kind: "unreachable" };

const BASE = (import.meta.env.VITE_API_URL || "") + "/api/v1";
const POLL_MS = 30_000;

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * Small status pill next to the Live badge. Polls /diag/health every 30s
 * so Jessica can self-diagnose "is it me or the site?" before pinging
 * support. Green = healthy, yellow = degraded (elevated errors or slow
 * responses), red = errors high enough to likely affect her.
 * Unreachable = backend is down or CORS-blocked.
 */
export function StatusBanner() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/diag/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          success: boolean;
          data: Health;
        };
        if (!cancelled) setState({ kind: "ok", health: body.data });
      } catch {
        if (!cancelled) setState({ kind: "unreachable" });
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (state.kind === "loading") return null;

  if (state.kind === "unreachable") {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 shadow-[0_0_0_1px_rgba(220,38,38,0.3)]"
        title="Backend unreachable — see Jace"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        <span className="font-label text-[10px] text-red-700 tracking-wider uppercase">
          Offline
        </span>
      </div>
    );
  }

  const { status, uptime } = state.health;
  const dot =
    status === "green"
      ? "bg-emerald-500"
      : status === "yellow"
        ? "bg-amber-500"
        : "bg-red-500";
  const label =
    status === "green" ? "OK" : status === "yellow" ? "Slow" : "Degraded";
  const tooltip =
    status === "green"
      ? `Backend healthy — uptime ${formatUptime(uptime)}`
      : status === "yellow"
        ? "Backend degraded (elevated latency or errors). Check #dispatch Slack."
        : "Backend errors elevated. Check #dispatch Slack.";

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-container-low/50 shadow-[0_0_0_1px_rgba(0,0,0,0.05)]"
      title={tooltip}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="font-label text-[10px] text-on-surface/60 tracking-wider uppercase">
        {label}
      </span>
    </div>
  );
}
