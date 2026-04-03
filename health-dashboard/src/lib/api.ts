const API_URL = import.meta.env.VITE_API_URL ?? "";

const COOKIE_NAME = "dashboard-pin";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/* ------------------------------------------------------------------ */
/*  PIN helpers                                                       */
/* ------------------------------------------------------------------ */

export function setPin(pin: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(pin)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Strict`;
}

export function clearPin(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict`;
}

export function getPin(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function hasPin(): boolean {
  return getPin() !== null;
}

/* ------------------------------------------------------------------ */
/*  Generic fetcher                                                   */
/* ------------------------------------------------------------------ */

async function apiFetch<T>(path: string, auth = false): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (auth) {
    const pin = getPin();
    if (pin) headers["X-Dashboard-Pin"] = pin;
  }

  const res = await fetch(`${API_URL}${path}`, { headers });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  // Support both envelope ({ data }) and raw responses
  return (json.data ?? json) as T;
}

/* ------------------------------------------------------------------ */
/*  Diagnostic endpoints (public, no auth)                            */
/* ------------------------------------------------------------------ */

export interface HealthData {
  status: "green" | "yellow" | "red";
  uptime: number;
  timestamp: string;
}

export interface PipelineSourceRun {
  startedAt: string;
  durationMs: number;
  recordsProcessed: number;
  status: "success" | "error" | "skipped";
}

export interface PipelineSource {
  lastRun: string;
  recentRuns: PipelineSourceRun[];
}

export interface PipelineData {
  propx: PipelineSource;
  logistiq: PipelineSource;
  automap: PipelineSource;
  jotform: PipelineSource;
}

export interface PerformanceData {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  errorsByStatus: Record<string, number>;
  topSlow: { path: string; avgMs: number; count: number }[];
  hourlyAvg: number[];
}

export interface VolumeData {
  loads: { today: number; week: number; month: number };
  assignments: { total: number };
  dispatched: { total: number };
}

export interface PresenceData {
  activeUsers: string[];
}

export function fetchHealth(): Promise<HealthData> {
  return apiFetch<HealthData>("/api/v1/diag/health");
}

export function fetchPipeline(): Promise<PipelineData> {
  return apiFetch<PipelineData>("/api/v1/diag/pipeline");
}

export function fetchPerformance(): Promise<PerformanceData> {
  return apiFetch<PerformanceData>("/api/v1/diag/performance");
}

export function fetchVolume(): Promise<VolumeData> {
  return apiFetch<VolumeData>("/api/v1/diag/volume");
}

export function fetchPresence(): Promise<PresenceData> {
  return apiFetch<PresenceData>("/api/v1/diag/presence");
}

/* ------------------------------------------------------------------ */
/*  Feedback endpoints (require PIN)                                  */
/* ------------------------------------------------------------------ */

export interface FeedbackBreadcrumb {
  type: "navigation" | "click" | "scroll";
  label: string;
  timestamp: string;
  url?: string;
}

export interface FeedbackItem {
  id: string;
  category: "issue" | "question" | "suggestion";
  description: string;
  pageUrl: string;
  routeName: string;
  screenshotUrl?: string;
  createdAt: string;
  userName: string;
}

export interface FeedbackDetail extends FeedbackItem {
  breadcrumbs: FeedbackBreadcrumb[];
  sessionSummary: string;
  browser: string;
}

export interface FeedbackStats {
  byCategory: Record<string, number>;
  daily: { day: string; count: number }[];
}

export function fetchFeedbackList(): Promise<FeedbackItem[]> {
  return apiFetch<FeedbackItem[]>("/api/v1/feedback", true);
}

export function fetchFeedbackDetail(id: string): Promise<FeedbackDetail> {
  return apiFetch<FeedbackDetail>(`/api/v1/feedback/${id}`, true);
}

export function fetchFeedbackStats(): Promise<FeedbackStats> {
  return apiFetch<FeedbackStats>("/api/v1/feedback/stats", true);
}
