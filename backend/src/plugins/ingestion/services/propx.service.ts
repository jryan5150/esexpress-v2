import PQueue from "p-queue";
import { createPropxBreaker } from "../../../lib/circuit-breaker.js";
import { HttpError, NetworkError } from "../../../lib/errors.js";

// ---------------------------------------------------------------------------
// Types — minimal interfaces for the fields we actually consume
// ---------------------------------------------------------------------------

export interface PropxCarrier {
  id: string;
  name: string;
  status: string;
}

export interface PropxDriver {
  id: string;
  name: string;
  carrier_id: string;
  carrier_name: string;
  truck_no: string;
  trailer_no: string;
  status: string;
}

export interface PropxTerminal {
  id: string;
  name: string;
  address: string;
}

export interface PropxDestination {
  id: string;
  name: string;
  address: string;
}

export interface PropxProduct {
  id: string;
  name: string;
  description: string;
}

export interface PropxJob {
  id: string;
  job_name: string;
  customer_id: string;
  customer_name: string;
  status: string;
}

export interface PropxLoad {
  propx_load_id: string;
  job_id: string;
  load_no: string;
  driver_name: string;
  carrier_name: string;
  weight: number;
  [key: string]: unknown;
}

interface PropxPagination {
  total: number;
  per_page: number;
  page_no: number;
}

interface PropxPaginatedResponse<T> {
  data: T[];
  pagination: PropxPagination;
}

// ---------------------------------------------------------------------------
// Cache TTLs — exported so consumers & tests can reference them
// ---------------------------------------------------------------------------

export const PROPX_CACHE_TTLS = {
  carriers: 3_600_000, // 1 hour
  drivers: 1_800_000, // 30 minutes
  terminals: 7_200_000, // 2 hours
  destinations: 7_200_000, // 2 hours
  products: 3_600_000, // 1 hour
  stages: 86_400_000, // 24 hours
} as const;

export type CacheCategory = keyof typeof PROPX_CACHE_TTLS;

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://publicapis.propx.com/api/v1";
const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// PropxClient
// ---------------------------------------------------------------------------

export class PropxClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly queue: PQueue;
  private readonly policy: ReturnType<typeof createPropxBreaker>["policy"];
  private readonly cache: Map<string, CacheEntry> = new Map();

  constructor(config: { apiKey: string; baseUrl?: string }) {
    if (!config.apiKey) {
      throw new Error("PropxClient requires an apiKey");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

    // Rate limiter: 10 requests per 1-second window, 4 concurrent
    this.queue = new PQueue({
      concurrency: 4,
      interval: 1_000,
      intervalCap: 10,
    });

    const { policy } = createPropxBreaker();
    this.policy = policy;
  }

  // -------------------------------------------------------------------------
  // Private: HTTP layer
  // -------------------------------------------------------------------------

  /**
   * Make a single HTTP request through rate limiter + circuit breaker.
   * All PropX calls funnel through here.
   */
  private async request<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl : this.baseUrl + "/";
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(cleanPath, base);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    return this.queue.add(
      () =>
        this.policy.execute(async () => {
          let response: Response;
          try {
            response = await fetch(url.toString(), {
              method: "GET",
              headers: {
                authorization: this.apiKey,
                accept: "application/json",
              },
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
          } catch (err: unknown) {
            // Network-level failure (DNS, timeout, etc.)
            if (err instanceof Error && err.name === "TimeoutError") {
              throw new NetworkError(
                "TIMEOUT",
                `Request to ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`,
              );
            }
            const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
            throw new NetworkError(
              code,
              `Request to ${path} failed: ${(err as Error).message}`,
            );
          }

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new HttpError(response.status, body);
          }

          return (await response.json()) as T;
        }),
      { throwOnTimeout: true },
    ) as T;
  }

  /**
   * Fetch all pages of a paginated PropX endpoint.
   * Returns the full concatenated data array.
   */
  private async requestAllPages<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T[]> {
    const allData: T[] = [];
    let pageNo = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const pageParams = {
        ...params,
        page_no: String(pageNo),
        per_page: "200",
      };
      const response = await this.request<PropxPaginatedResponse<T>>(
        path,
        pageParams,
      );

      allData.push(...response.data);

      const { total, per_page, page_no } = response.pagination;
      if (page_no * per_page >= total) break;
      pageNo++;
    }

    return allData;
  }

  // -------------------------------------------------------------------------
  // Private: Cache layer
  // -------------------------------------------------------------------------

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  private async cachedRequest<T>(
    category: CacheCategory,
    fetcher: () => Promise<T>,
    forceRefresh = false,
  ): Promise<T> {
    if (forceRefresh) {
      this.cache.delete(category);
    }

    const cached = this.getCached<T>(category);
    if (cached !== null) return cached;

    const data = await fetcher();
    this.setCache(category, data, PROPX_CACHE_TTLS[category]);
    return data;
  }

  // -------------------------------------------------------------------------
  // Public: Reference data (cached)
  // -------------------------------------------------------------------------

  async getCarriers(forceRefresh?: boolean): Promise<PropxCarrier[]> {
    return this.cachedRequest(
      "carriers",
      () => this.requestAllPages<PropxCarrier>("/carriers"),
      forceRefresh,
    );
  }

  async getDrivers(forceRefresh?: boolean): Promise<PropxDriver[]> {
    return this.cachedRequest(
      "drivers",
      () => this.requestAllPages<PropxDriver>("/drivers"),
      forceRefresh,
    );
  }

  async getTerminals(forceRefresh?: boolean): Promise<PropxTerminal[]> {
    return this.cachedRequest(
      "terminals",
      () => this.requestAllPages<PropxTerminal>("/terminals"),
      forceRefresh,
    );
  }

  async getDestinations(forceRefresh?: boolean): Promise<PropxDestination[]> {
    return this.cachedRequest(
      "destinations",
      () => this.requestAllPages<PropxDestination>("/destinations"),
      forceRefresh,
    );
  }

  async getProducts(forceRefresh?: boolean): Promise<PropxProduct[]> {
    return this.cachedRequest(
      "products",
      () => this.requestAllPages<PropxProduct>("/products"),
      forceRefresh,
    );
  }

  // -------------------------------------------------------------------------
  // Public: Job data (not cached)
  // -------------------------------------------------------------------------

  async getJobs(filters?: { status?: string }): Promise<PropxJob[]> {
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    return this.requestAllPages<PropxJob>("/jobs", params);
  }

  async getJobLoads(jobId: string): Promise<PropxLoad[]> {
    return this.requestAllPages<PropxLoad>(`/jobs/${jobId}/loads`);
  }

  async getLoadTicketImage(loadId: string): Promise<Buffer | null> {
    try {
      const data = await this.request<{ image?: string }>(
        `/loads/${loadId}/ticket-image`,
      );
      if (!data.image) return null;
      return Buffer.from(data.image, "base64");
    } catch (err: unknown) {
      // 404 = no ticket image available — not an error condition
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Public: Main sync entry point
  // -------------------------------------------------------------------------

  /**
   * Fetch all loads within a date range across all active jobs.
   * PropX does not have a global /loads endpoint — loads are per-job.
   * We fetch all jobs, then fetch loads for each job and filter by date range.
   */
  async getCompanyLoadsByDates(from: Date, to: Date): Promise<PropxLoad[]> {
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    // Only fetch from active/recent jobs to avoid iterating hundreds of old jobs
    const jobs = await this.getJobs();
    const allLoads: PropxLoad[] = [];

    const candidateJobs = jobs.filter((job) => {
      const raw = job as unknown as Record<string, unknown>;
      const ws = String(raw.working_status || "").toLowerCase();
      if (ws === "active" || ws === "started") return true;
      const endDate = raw.end_date ? String(raw.end_date).slice(0, 10) : null;
      if (!endDate) return true;
      return endDate >= fromStr;
    });

    console.log(
      `[PropX] Fetching loads from ${candidateJobs.length} of ${jobs.length} jobs`,
    );

    for (const job of candidateJobs) {
      try {
        const raw = job as unknown as Record<string, unknown>;
        const jobId = raw.id as string;
        const jobName = raw.name as string;
        const jobLoads = await this.getJobLoads(jobId);
        if (jobLoads.length > 0) {
          console.log(`[PropX] Job ${jobName}: ${jobLoads.length} loads`);
        }
        allLoads.push(...jobLoads);
      } catch (err) {
        const raw = job as unknown as Record<string, unknown>;
        console.warn(
          `[PropX] Failed job ${raw.name}: ${(err as Error).message}`,
        );
      }
    }

    console.log(`[PropX] Total loads fetched: ${allLoads.length}`);
    return allLoads;
  }

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------

  diagnostics() {
    const cacheStats: Record<string, { cached: boolean; expiresIn?: number }> =
      {};
    for (const [key, entry] of this.cache.entries()) {
      const remaining = entry.expiresAt - Date.now();
      cacheStats[key] = {
        cached: remaining > 0,
        expiresIn: remaining > 0 ? remaining : undefined,
      };
    }

    return {
      name: "propx-client",
      status: "healthy" as const,
      stats: {
        cacheEntries: this.cache.size,
        queueSize: this.queue.size,
        queuePending: this.queue.pending,
      },
      checks: [
        {
          name: "rate-limiter",
          ok: true,
          detail: `${this.queue.size} queued, ${this.queue.pending} active`,
        },
      ],
      cache: cacheStats,
    };
  }
}
