import type { BreadcrumbEvent, BreadcrumbZone } from "../types/api";

const FLUSH_INTERVAL = 30_000; // 30 seconds
const BASE = (import.meta.env.VITE_API_URL || "") + "/api/v1";

let buffer: BreadcrumbEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function flush() {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];

  const token = localStorage.getItem("esexpress-token");
  if (!token) return;

  // Fire-and-forget — errors are silently ignored
  fetch(`${BASE}/dispatch/breadcrumbs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => {});
}

export function track(
  eventType: string,
  eventData: Record<string, unknown>,
  zone: BreadcrumbZone,
) {
  buffer.push({
    eventType,
    eventData,
    zone,
    timestamp: new Date().toISOString(),
  });
}

export function startCapture() {
  if (timer) return;
  timer = setInterval(flush, FLUSH_INTERVAL);
  window.addEventListener("beforeunload", flush);
}

export function stopCapture() {
  flush();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  window.removeEventListener("beforeunload", flush);
}
