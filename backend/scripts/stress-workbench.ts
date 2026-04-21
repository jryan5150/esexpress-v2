/**
 * Concurrent-user stress test for the workbench list endpoint.
 *
 * Simulates N parallel dispatchers loading the workbench at the same time,
 * plus a photo-proxy burst that mimics a 50-row page lazy-loading thumbs.
 * Verifies pool starvation + rate-limit exemption fixes hold under load.
 *
 * Usage:
 *   cd backend
 *   API_URL=https://backend-production-7960.up.railway.app \
 *   JWT=<paste from DevTools: localStorage.getItem('esexpress-token')> \
 *   CONCURRENCY=30 \
 *     npx tsx scripts/stress-workbench.ts
 *
 * Pass/fail gate (printed at end):
 *   - All responses 200
 *   - p95 < 1000ms on workbench list
 *   - Photo proxy burst: 200+ parallel requests all OK
 *
 * If p95 > 1000ms or any non-2xx status: exit code 1.
 */

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const JWT = process.env.JWT;
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "30", 10);
const PROXY_BURST = parseInt(process.env.PROXY_BURST ?? "200", 10);

if (!JWT) {
  console.error("JWT env var required.");
  console.error(
    "  In DevTools console on app.esexpressllc.com:\n" +
      "  copy(localStorage.getItem('esexpress-token'))",
  );
  process.exit(1);
}

type Result = {
  status: number;
  ms: number;
  error?: string;
};

async function hit(path: string, label: string): Promise<Result> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${JWT}` },
    });
    const ms = performance.now() - start;
    // Drain body so the server isn't holding a half-open response
    await res.arrayBuffer();
    if (!res.ok) {
      console.error(
        `  [${label}] ${res.status} ${res.statusText} (${Math.round(ms)}ms)`,
      );
    }
    return { status: res.status, ms };
  } catch (err) {
    const ms = performance.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [${label}] network error: ${msg}`);
    return { status: 0, ms, error: msg };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

function summarize(label: string, results: Result[]) {
  const oks = results.filter((r) => r.status >= 200 && r.status < 300);
  const nonOks = results.length - oks.length;
  const durations = [...results.map((r) => r.ms)].sort((a, b) => a - b);
  const p50 = Math.round(percentile(durations, 50));
  const p95 = Math.round(percentile(durations, 95));
  const p99 = Math.round(percentile(durations, 99));
  const max = Math.round(durations[durations.length - 1] ?? 0);

  console.log(`\n=== ${label} ===`);
  console.log(`  requests: ${results.length}`);
  console.log(`  200s:     ${oks.length}`);
  console.log(`  errors:   ${nonOks}`);
  console.log(`  p50:      ${p50}ms`);
  console.log(`  p95:      ${p95}ms`);
  console.log(`  p99:      ${p99}ms`);
  console.log(`  max:      ${max}ms`);

  return { oks: oks.length, nonOks, p95 };
}

async function run() {
  console.log(`API_URL:      ${API_URL}`);
  console.log(`CONCURRENCY:  ${CONCURRENCY} (workbench)`);
  console.log(`PROXY_BURST:  ${PROXY_BURST} (photo proxy)`);

  console.log("\nWarming up…");
  await hit("/api/v1/dispatch/workbench/?filter=all", "warmup");

  console.log(`\nFiring ${CONCURRENCY} parallel workbench requests…`);
  const workbenchStart = performance.now();
  const workbenchResults = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      hit("/api/v1/dispatch/workbench/?filter=all", `wb#${i}`),
    ),
  );
  const workbenchWallMs = Math.round(performance.now() - workbenchStart);
  console.log(`  wall time: ${workbenchWallMs}ms`);
  const wb = summarize("workbench list", workbenchResults);

  // Find a real photo URL to proxy. Any assignment photo is fine — we just
  // need to verify the proxy handles a burst without 429ing after the rate-
  // limit allowList fix in app.ts.
  console.log(`\nFiring ${PROXY_BURST} parallel photo-proxy requests…`);
  const sampleUrl = "https://www.jotform.com/uploads/sample-nonexistent.jpg";
  const proxyPath = `/api/v1/verification/photos/proxy?url=${encodeURIComponent(sampleUrl)}`;
  const proxyStart = performance.now();
  const proxyResults = await Promise.all(
    Array.from({ length: PROXY_BURST }, (_, i) => hit(proxyPath, `px#${i}`)),
  );
  const proxyWallMs = Math.round(performance.now() - proxyStart);
  console.log(`  wall time: ${proxyWallMs}ms`);

  // Photo proxy "success" = non-429. 400 (invalid URL), 502 (upstream miss)
  // both acceptable — we're testing that the rate limiter doesn't bite.
  const proxyRateLimited = proxyResults.filter((r) => r.status === 429).length;
  const proxyOther = proxyResults.length - proxyRateLimited;
  const proxyDurations = [...proxyResults.map((r) => r.ms)].sort(
    (a, b) => a - b,
  );
  console.log(`\n=== photo proxy ===`);
  console.log(`  requests:     ${proxyResults.length}`);
  console.log(`  rate-limited: ${proxyRateLimited} (should be 0)`);
  console.log(`  non-429:      ${proxyOther}`);
  console.log(
    `  p95:          ${Math.round(percentile(proxyDurations, 95))}ms`,
  );

  // Gate
  const failures: string[] = [];
  if (wb.nonOks > 0) failures.push(`${wb.nonOks} non-2xx on workbench`);
  if (wb.p95 > 1000) failures.push(`workbench p95 ${wb.p95}ms > 1000ms`);
  if (proxyRateLimited > 0)
    failures.push(`${proxyRateLimited} photo-proxy 429s (allowList broken)`);

  if (failures.length > 0) {
    console.log(`\n✗ FAIL: ${failures.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log(`\n✓ PASS — workbench p95 ${wb.p95}ms, proxy not rate-limited`);
  }
}

run().catch((err) => {
  console.error("stress test crashed:", err);
  process.exit(1);
});
