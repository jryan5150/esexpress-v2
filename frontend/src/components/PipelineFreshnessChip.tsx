/**
 * PipelineFreshnessChip — surfaces how fresh our photo ingest is.
 *
 * Shows "JotForm synced Xm ago" with traffic-light color based on age
 * against the 30-min cron cadence. Solves the Jessica's implicit
 * "why don't I see my photo yet?" question by making the expected
 * window visible instead of mysterious.
 *
 * Green : sync ran within last 30 min (next cycle normal)
 * Amber : 30-60 min (next sync imminent but anomalous if no photo)
 * Rose  : >60 min (pipeline may be stuck — escalate)
 *
 * Polls /diag/pipeline every 60s (cheap read, aggregate data).
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface PipelineDiag {
  jotform?: {
    lastRun?: {
      startedAt?: string;
      finishedAt?: string | null;
      status?: string;
      recordsProcessed?: number | null;
    } | null;
  };
}

export function PipelineFreshnessChip() {
  const q = useQuery({
    queryKey: ["diag", "pipeline"],
    queryFn: () =>
      api.get<{ success: boolean; data: PipelineDiag }>("/diag/pipeline"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const lastRun = q.data?.data?.jotform?.lastRun;
  const at = lastRun?.startedAt ?? null;
  if (!at) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 border border-gray-300">
        JotForm: no data
      </span>
    );
  }

  const ageMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(at).getTime()) / 60_000),
  );
  const status = lastRun?.status ?? "unknown";
  const records = lastRun?.recordsProcessed ?? 0;

  let cls = "bg-emerald-50 text-emerald-900 border-emerald-300";
  if (ageMinutes >= 60) cls = "bg-rose-50 text-rose-900 border-rose-400";
  else if (ageMinutes >= 30)
    cls = "bg-amber-50 text-amber-900 border-amber-400";

  const label =
    ageMinutes < 1
      ? "just now"
      : ageMinutes < 60
        ? `${ageMinutes}m ago`
        : `${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m ago`;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${cls}`}
      title={`JotForm sync — last ${status} run ${label} · ${records} records`}
    >
      <span className="opacity-60">JotForm:</span> {label}
    </span>
  );
}
