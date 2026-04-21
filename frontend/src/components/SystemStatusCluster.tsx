import { useEffect, useState } from "react";
import { usePipelineStatus } from "../hooks/use-wells";

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

function StatusDot({ color }: { color: "green" | "yellow" | "red" | "gray" }) {
  const cls =
    color === "green"
      ? "bg-emerald-500"
      : color === "yellow"
        ? "bg-amber-500"
        : color === "red"
          ? "bg-red-500"
          : "bg-on-surface/30";
  // Pulsing ring draws the eye to degraded/red states so dispatchers notice
  // pipeline stalls before symptoms reach Jessica.
  const pulse =
    color === "red" || color === "yellow"
      ? "before:absolute before:inset-0 before:rounded-full before:animate-ping before:bg-current before:opacity-40"
      : "";
  return (
    <span
      className={`relative inline-block w-2 h-2 rounded-full ${cls} ${pulse}`}
    />
  );
}

interface PillProps {
  icon: string;
  label: string;
  color: "green" | "yellow" | "red" | "gray";
  tooltip: string;
}

function StatusPill({ icon, label, color, tooltip }: PillProps) {
  const ringColor =
    color === "green"
      ? "shadow-[0_0_0_1px_rgba(13,150,104,0.2)]"
      : color === "yellow"
        ? "shadow-[0_0_0_1px_rgba(217,119,6,0.3)]"
        : color === "red"
          ? "shadow-[0_0_0_1px_rgba(220,38,38,0.3)]"
          : "shadow-[0_0_0_1px_rgba(0,0,0,0.05)]";
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-container-low/50 ${ringColor}`}
      title={tooltip}
    >
      <span className="material-symbols-outlined icon-filled text-sm text-on-surface-variant">
        {icon}
      </span>
      <StatusDot color={color} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * System-status cluster — three always-visible icon pills at the top of the
 * app. Live (Vercel CDN reachable), Backend (Railway diagnostics green), and
 * Pipeline (ingest scheduler running + last sync recent). Icons + status
 * dots only, no labels — keeps the header compact while giving Jessica
 * a self-diagnose surface before she pings support.
 */
export function SystemStatusCluster() {
  const [backend, setBackend] = useState<State>({ kind: "loading" });
  const pipeline = usePipelineStatus();

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/diag/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { success: boolean; data: Health };
        if (!cancelled) setBackend({ kind: "ok", health: body.data });
      } catch {
        if (!cancelled) setBackend({ kind: "unreachable" });
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Live = the frontend itself loaded + the Vercel edge returned a 200. If
  // the user can see this header at all, Live is green by definition. Only
  // way to turn red is if the backend is telling us something is wrong with
  // the delivery path (reserved for future; today it's always green).
  const liveColor: "green" = "green";

  // Backend color from /diag/health
  const backendColor: "green" | "yellow" | "red" | "gray" =
    backend.kind === "loading"
      ? "gray"
      : backend.kind === "unreachable"
        ? "red"
        : backend.health.status;
  const backendTooltip =
    backend.kind === "ok"
      ? `Backend ${backend.health.status} — uptime ${formatUptime(backend.health.uptime)} · v${backend.health.version}`
      : backend.kind === "unreachable"
        ? "Backend unreachable. Likely a deploy in progress or a Railway blip — retry in 30s."
        : "Checking backend…";

  // Pipeline color: derive from the freshness of the last run across all
  // syncs. If no pipelines have run in > 30 minutes, go yellow; > 2h red.
  // This catches the "sync silently stopped" failure mode Jessica hit on
  // Apr 14 when the PropX env vars got pulled.
  const pipelineColor: "green" | "yellow" | "red" | "gray" = (() => {
    if (pipeline.isLoading) return "gray";
    if (pipeline.error) return "red";
    const data = pipeline.data ?? {};
    const entries = Object.values(data);
    if (entries.length === 0) return "gray";
    const mostRecent = entries
      .map((e) => e.lastRun?.startedAt)
      .filter(Boolean) as string[];
    if (mostRecent.length === 0) return "red";
    const newestMs = Math.max(...mostRecent.map((s) => new Date(s).getTime()));
    const ageMin = (Date.now() - newestMs) / 60_000;
    const anyFailed = entries.some((e) => e.lastRun?.status === "failed");
    if (anyFailed) return "red";
    if (ageMin > 120) return "red";
    if (ageMin > 30) return "yellow";
    return "green";
  })();
  const pipelineTooltip = (() => {
    if (pipeline.isLoading) return "Checking pipeline status…";
    if (pipeline.error)
      return `Pipeline status check failed: ${String((pipeline.error as Error).message ?? pipeline.error)}`;
    const data = pipeline.data ?? {};
    const entries = Object.entries(data);
    if (entries.length === 0) return "No pipeline runs recorded yet.";
    const summary = entries
      .map(([name, entry]) => {
        if (!entry.lastRun) return `${name}: no runs yet`;
        const age = Math.floor(
          (Date.now() - new Date(entry.lastRun.startedAt).getTime()) / 60_000,
        );
        return `${name}: ${entry.lastRun.status} ${age}m ago`;
      })
      .join(" · ");
    return `Pipeline — ${summary}`;
  })();

  return (
    <div className="flex items-center gap-1.5">
      <StatusPill
        icon="cloud_done"
        label="Live"
        color={liveColor}
        tooltip="Live — app loaded from the Vercel edge."
      />
      <StatusPill
        icon="monitor_heart"
        label="Backend"
        color={backendColor}
        tooltip={backendTooltip}
      />
      <StatusPill
        icon="sync"
        label="Pipeline"
        color={pipelineColor}
        tooltip={pipelineTooltip}
      />
    </div>
  );
}
