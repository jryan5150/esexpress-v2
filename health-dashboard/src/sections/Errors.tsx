import { StatCard } from "../components/StatCard";
import { Sparkline } from "../components/Sparkline";
import { usePerformance } from "../hooks/use-diag";

export function Errors() {
  const { data, isLoading } = usePerformance();

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-on-surface-variant">Loading error data...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-on-surface-variant">
          No error data available.
        </p>
      </div>
    );
  }

  const count4xx = Object.entries(data.errorsByStatus)
    .filter(([code]) => {
      const n = Number(code);
      return n >= 400 && n < 500;
    })
    .reduce((sum, [, n]) => sum + n, 0);

  const count5xx = Object.entries(data.errorsByStatus)
    .filter(([code]) => Number(code) >= 500)
    .reduce((sum, [, n]) => sum + n, 0);

  const totalErrors = count4xx + count5xx;
  const errorRate =
    data.count > 0 ? ((totalErrors / data.count) * 100).toFixed(2) + "%" : "0%";

  // Build a rough error sparkline from hourly averages
  // (higher latency hours often correlate with error spikes -- best approximation from available data)
  const errorSparkline = data.hourlyAvg.length > 0 ? data.hourlyAvg : [];

  // Top error endpoints: filter topSlow for likely error-heavy routes
  const errorEndpoints = data.topSlow.filter(
    (ep) => ep.avgMs > (data.p95 ?? 500),
  );

  return (
    <div className="space-y-6">
      <h2 className="font-headline text-lg font-bold text-on-surface">
        Errors
      </h2>

      {/* Error count cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="4xx Errors" value={count4xx} icon="warning" />
        <StatCard label="5xx Errors" value={count5xx} icon="dangerous" />
        <StatCard label="Error Rate" value={errorRate} icon="percent" />
        <StatCard
          label="Total Requests"
          value={data.count}
          icon="query_stats"
        />
      </div>

      {/* Error rate sparkline */}
      {errorSparkline.length > 0 && (
        <div className="rounded-xl bg-surface-container p-5">
          <h3 className="mb-3 font-headline text-sm font-bold text-on-surface">
            Hourly Latency Trend (error correlation)
          </h3>
          <Sparkline
            data={errorSparkline}
            color="var(--color-error)"
            width={600}
            height={48}
          />
        </div>
      )}

      {/* Error by status breakdown */}
      {Object.keys(data.errorsByStatus).length > 0 && (
        <div className="rounded-xl bg-surface-container p-5">
          <h3 className="mb-4 font-headline text-sm font-bold text-on-surface">
            Errors by Status Code
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-container-highest">
                  <th className="pb-2 pr-4 font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
                    Status
                  </th>
                  <th className="pb-2 text-right font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.errorsByStatus)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => (
                    <tr
                      key={status}
                      className="border-b border-surface-container-highest/50 last:border-0"
                    >
                      <td className="py-2.5 pr-4 font-label text-xs text-on-surface">
                        {status}
                      </td>
                      <td className="py-2.5 text-right font-label text-xs text-error">
                        {count}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* High-latency endpoints (potential error hotspots) */}
      {errorEndpoints.length > 0 && (
        <div className="rounded-xl bg-surface-container p-5">
          <h3 className="mb-4 font-headline text-sm font-bold text-on-surface">
            High-Latency Endpoints
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
                {errorEndpoints.map((ep) => (
                  <tr
                    key={ep.path}
                    className="border-b border-surface-container-highest/50 last:border-0"
                  >
                    <td className="py-2.5 pr-4 font-label text-xs text-on-surface">
                      {ep.path}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-label text-xs text-error">
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
