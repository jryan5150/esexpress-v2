import { StatCard } from "../components/StatCard";
import { Sparkline } from "../components/Sparkline";
import { usePerformance } from "../hooks/use-diag";

export function Performance() {
  const { data, isLoading } = usePerformance();

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-on-surface-variant">
          Loading performance data...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-on-surface-variant">
          No performance data available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="font-headline text-lg font-bold text-on-surface">
        Performance
      </h2>

      {/* Hourly sparkline */}
      {data.hourlyAvg.length > 0 && (
        <div className="rounded-xl bg-surface-container p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-headline text-sm font-bold text-on-surface">
              Avg Response Time (24h)
            </h3>
            <span className="font-label text-xs text-on-surface-variant">
              {Math.round(data.hourlyAvg[data.hourlyAvg.length - 1] ?? 0)}ms
              current
            </span>
          </div>
          <Sparkline
            data={data.hourlyAvg}
            color="var(--color-primary)"
            width={600}
            height={48}
          />
        </div>
      )}

      {/* Latency cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="p50"
          value={`${Math.round(data.p50)}ms`}
          icon="timer"
        />
        <StatCard
          label="p95"
          value={`${Math.round(data.p95)}ms`}
          icon="timer"
        />
        <StatCard
          label="p99"
          value={`${Math.round(data.p99)}ms`}
          icon="timer"
        />
      </div>

      {/* Top slow endpoints */}
      {data.topSlow.length > 0 && (
        <div className="rounded-xl bg-surface-container p-5">
          <h3 className="mb-4 font-headline text-sm font-bold text-on-surface">
            Top 5 Slow Endpoints
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-container-highest">
                  <th className="pb-2 pr-4 font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
                    Endpoint
                  </th>
                  <th className="pb-2 pr-4 text-right font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
                    Avg (ms)
                  </th>
                  <th className="pb-2 text-right font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
                    Hits
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topSlow.slice(0, 5).map((ep) => (
                  <tr
                    key={ep.path}
                    className="border-b border-surface-container-highest/50 last:border-0"
                  >
                    <td className="py-2.5 pr-4 font-label text-xs text-on-surface">
                      {ep.path}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-label text-xs text-primary">
                      {Math.round(ep.avgMs)}
                    </td>
                    <td className="py-2.5 text-right font-label text-xs text-on-surface-variant">
                      {ep.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
