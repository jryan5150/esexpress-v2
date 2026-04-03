import { usePipeline } from "../hooks/use-diag";
import type { PipelineSource } from "../lib/api";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const sourceConfig: {
  key: string;
  name: string;
  icon: string;
}[] = [
  { key: "propx", name: "PropX Sync", icon: "cloud_download" },
  { key: "logistiq", name: "Logistiq Sync", icon: "local_shipping" },
  { key: "automap", name: "Auto-map", icon: "hub" },
  { key: "jotform", name: "JotForm Sync", icon: "photo_camera" },
];

function RunDots({ source }: { source: PipelineSource }) {
  // Show up to 5 most recent runs as colored circles
  const runs = source.recentRuns.slice(0, 5);
  return (
    <div className="flex items-center gap-1.5">
      {runs.map((run, i) => (
        <span
          key={i}
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            run.status === "success"
              ? "bg-tertiary"
              : run.status === "error"
                ? "bg-error"
                : "bg-surface-container-highest"
          }`}
          title={`${run.status} - ${new Date(run.startedAt).toLocaleString()}`}
        />
      ))}
      {/* Pad to 5 if fewer */}
      {Array.from({ length: Math.max(0, 5 - runs.length) }).map((_, i) => (
        <span
          key={`empty-${i}`}
          className="inline-block h-2.5 w-2.5 rounded-full bg-surface-container-highest/40"
        />
      ))}
    </div>
  );
}

function PipelineCard({
  config,
  source,
}: {
  config: (typeof sourceConfig)[number];
  source: PipelineSource;
}) {
  const lastRun = source.recentRuns[0];
  const lastStatus = lastRun?.status ?? "skipped";

  return (
    <div className="rounded-xl bg-surface-container p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant">
            {config.icon}
          </span>
          <h3 className="font-headline text-sm font-bold text-on-surface">
            {config.name}
          </h3>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 font-label text-[10px] uppercase tracking-wider ${
            lastStatus === "success"
              ? "bg-tertiary/15 text-tertiary"
              : lastStatus === "error"
                ? "bg-error/15 text-error"
                : "bg-surface-container-highest text-on-surface-variant"
          }`}
        >
          {lastStatus}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
            Last Run
          </p>
          <p className="mt-0.5 text-sm font-medium text-on-surface">
            {source.lastRun ? timeAgo(source.lastRun) : "Never"}
          </p>
        </div>
        <div>
          <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
            Duration
          </p>
          <p className="mt-0.5 text-sm font-medium text-on-surface">
            {lastRun ? formatDuration(lastRun.durationMs) : "--"}
          </p>
        </div>
        <div>
          <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
            Records
          </p>
          <p className="mt-0.5 text-sm font-medium text-on-surface">
            {lastRun?.recordsProcessed ?? "--"}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
          Recent Runs
        </p>
        <RunDots source={source} />
      </div>
    </div>
  );
}

export function Pipeline() {
  const { data, isLoading } = usePipeline();

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-on-surface-variant">
          Loading pipeline data...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-on-surface-variant">
          No pipeline data available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="font-headline text-lg font-bold text-on-surface">
        Pipeline Status
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {sourceConfig.map((cfg) => {
          const source = data[cfg.key as keyof typeof data];
          if (!source) return null;
          return <PipelineCard key={cfg.key} config={cfg} source={source} />;
        })}
      </div>
    </div>
  );
}
