export interface PerfEntry {
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  timestamp: number;
}

export interface PerfStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  errorsByStatus: Record<number, number>;
  topSlow: Array<{ path: string; avgMs: number; count: number }>;
}

export class PerfBuffer {
  private entries: PerfEntry[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  record(entry: PerfEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  getEntries(since?: number): PerfEntry[] {
    if (!since) return [...this.entries];
    return this.entries.filter((e) => e.timestamp >= since);
  }

  computeStats(since?: number): PerfStats {
    const entries = this.getEntries(since);
    if (entries.length === 0) {
      return {
        count: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        errorsByStatus: {},
        topSlow: [],
      };
    }

    const sorted = entries.map((e) => e.responseTimeMs).sort((a, b) => a - b);
    const percentile = (p: number) =>
      sorted[Math.min(Math.ceil(sorted.length * p) - 1, sorted.length - 1)];

    const errorsByStatus: Record<number, number> = {};
    for (const e of entries) {
      if (e.statusCode >= 400) {
        errorsByStatus[e.statusCode] = (errorsByStatus[e.statusCode] || 0) + 1;
      }
    }

    const byPath = new Map<string, { total: number; count: number }>();
    for (const e of entries) {
      const key = `${e.method} ${e.path}`;
      const cur = byPath.get(key) || { total: 0, count: 0 };
      cur.total += e.responseTimeMs;
      cur.count++;
      byPath.set(key, cur);
    }
    const topSlow = [...byPath.entries()]
      .map(([path, { total, count }]) => ({
        path,
        avgMs: Math.round(total / count),
        count,
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 5);

    return {
      count: entries.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      errorsByStatus,
      topSlow,
    };
  }
}

export const perfBuffer = new PerfBuffer(1000);
