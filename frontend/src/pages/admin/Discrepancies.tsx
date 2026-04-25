import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useHeartbeat } from "../../hooks/use-presence";

/**
 * Discrepancies admin index — single-pane list of all current open
 * cross-check signal across the system. Each row click-throughs to its
 * load drawer (or to the Wells admin for orphan_destination types).
 *
 * Data source: GET /api/v1/diag/discrepancies (all open by default).
 * Filter by type chip + by severity. 5-minute auto-refresh.
 */

interface SuggestedWell {
  wellId: number;
  wellName: string;
  score: number;
}

interface Discrepancy {
  id: number;
  subjectKey: string;
  assignmentId: number | null;
  loadId: number | null;
  discrepancyType: string;
  severity: "info" | "warning" | "critical";
  v2Value: string | null;
  pcsValue: string | null;
  message: string;
  metadata: {
    orphanCount?: number;
    suggestedWell?: SuggestedWell;
    [k: string]: unknown;
  } | null;
  detectedAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  ticketNo: string | null;
  loadNo: string | null;
  wellName: string | null;
}

interface DiscrepancyResponse {
  generatedAt: string;
  summary: { openTotal: number; byType: Record<string, number> };
  discrepancies: Discrepancy[];
}

const TYPE_LABEL: Record<string, string> = {
  status_drift: "Stage differs from PCS",
  weight_drift: "Weight differs from PCS",
  well_mismatch: "Different well in PCS",
  photo_gap: "Photo missing",
  rate_drift: "Rate differs from PCS",
  orphan_destination: "Destination not mapped",
  sheet_vs_v2_week_count: "Weekly count differs from your sheet",
  sheet_vs_v2_well_count: "Well count differs from your sheet",
};

const TYPE_DESC: Record<string, string> = {
  status_drift: "v2 has this load at one stage; PCS has it at another",
  weight_drift: "v2 weight and PCS billed weight differ by more than 5%",
  well_mismatch:
    "v2 mapped this load to one well; PCS billed it to a different consignee",
  photo_gap: "BOL photo expected on one side, missing on the other",
  rate_drift: "v2 expected rate and PCS billed rate differ by more than 5%",
  orphan_destination:
    "3 or more loads point at this destination but it isn't in your wells master",
  sheet_vs_v2_week_count:
    "Your Load Count Sheet's Total Built for the week differs from v2's unique load count for the same week",
  sheet_vs_v2_well_count:
    "Per-well count for the week differs between your sheet and v2",
};

const SEVERITY_DOT: Record<Discrepancy["severity"], string> = {
  info: "bg-blue-400",
  warning: "bg-amber-400",
  critical: "bg-red-500",
};

const SEVERITY_LABEL: Record<Discrepancy["severity"], string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

export function Discrepancies() {
  useHeartbeat({ currentPage: "admin-discrepancies" });
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "discrepancies", typeFilter, severityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      if (severityFilter) params.set("severity", severityFilter);
      params.set("limit", "500");
      return api
        .get<{
          success: boolean;
          data: DiscrepancyResponse;
        }>(`/diag/discrepancies?${params.toString()}`)
        .then((r) => r.data);
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) =>
      api.post(`/diag/discrepancies/${id}/resolve`, {
        notes: "manually resolved from admin",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "discrepancies"] });
    },
  });

  const summary = query.data?.summary;
  const items = query.data?.discrepancies ?? [];

  const typeCounts = summary?.byType ?? {};
  const totalOpen = summary?.openTotal ?? 0;

  const generatedAt = useMemo(() => {
    if (!query.data?.generatedAt) return null;
    return new Date(query.data.generatedAt).toLocaleString();
  }, [query.data?.generatedAt]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              What PCS sees
            </h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Every 15 minutes, the system pulls PCS state and surfaces where
              its truth doesn't match yours — automating the reconciliation
              Jenny does by hand. Each row is something your team can decide on.{" "}
              {generatedAt && (
                <span className="text-outline">
                  Last refreshed {generatedAt}.
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="px-7 py-4 border-b border-outline-variant/30 bg-surface-container-lowest shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase text-outline tracking-[0.08em] mr-2">
            Type
          </span>
          <FilterChip
            active={typeFilter === null}
            onClick={() => setTypeFilter(null)}
            label="All"
            count={totalOpen}
          />
          {Object.entries(TYPE_LABEL).map(([k, label]) => (
            <FilterChip
              key={k}
              active={typeFilter === k}
              onClick={() => setTypeFilter(typeFilter === k ? null : k)}
              label={label}
              count={typeCounts[k] ?? 0}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[10px] font-semibold uppercase text-outline tracking-[0.08em] mr-2">
            Severity
          </span>
          {(["info", "warning", "critical"] as const).map((s) => (
            <FilterChip
              key={s}
              active={severityFilter === s}
              onClick={() => setSeverityFilter(severityFilter === s ? null : s)}
              label={SEVERITY_LABEL[s]}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-4">
        {query.isLoading && (
          <div className="text-sm text-outline italic">loading…</div>
        )}
        {query.isError && (
          <div className="text-sm text-red-600">
            failed to load discrepancies
          </div>
        )}
        {!query.isLoading && items.length === 0 && (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-4xl text-emerald-500">
              check_circle
            </span>
            <div className="mt-2 text-on-surface font-semibold">
              v2 and PCS agree
            </div>
            <div className="mt-1 text-xs text-outline">
              Nothing flagged across every load currently in both systems.
            </div>
          </div>
        )}
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((d) => (
              <DiscrepancyRow
                key={d.id}
                d={d}
                onResolve={() => resolveMutation.mutate(d.id)}
                resolving={resolveMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition ${
        active
          ? "bg-primary text-on-primary border-primary"
          : "bg-surface-container text-on-surface-variant border-outline-variant/60 hover:border-primary/50"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span className="ml-1.5 opacity-70 tabular-nums">{count}</span>
      )}
    </button>
  );
}

function DiscrepancyRow({
  d,
  onResolve,
  resolving,
}: {
  d: Discrepancy;
  onResolve: () => void;
  resolving: boolean;
}) {
  const isOrphan = d.discrepancyType === "orphan_destination";
  const detectedAt = new Date(d.detectedAt).toLocaleString();

  return (
    <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/30 hover:border-outline-variant/60 transition">
      <div className="flex items-start gap-3">
        <span
          className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[d.severity]}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-on-surface">
              {TYPE_LABEL[d.discrepancyType] ?? d.discrepancyType}
            </span>
            <span className="text-[10px] text-outline">{detectedAt}</span>
            {d.ticketNo && (
              <span className="text-[10px] text-outline tabular-nums">
                ticket {d.ticketNo}
              </span>
            )}
            {d.wellName && (
              <span className="text-[10px] text-outline">· {d.wellName}</span>
            )}
          </div>
          <div className="text-xs text-on-surface-variant mt-1">
            {d.message}
          </div>
          {(d.v2Value || d.pcsValue) && (
            <div className="flex gap-4 mt-1.5 text-[11px] tabular-nums">
              {d.v2Value && (
                <span>
                  <span className="text-outline">v2:</span>{" "}
                  <span className="text-on-surface">{d.v2Value}</span>
                </span>
              )}
              {d.pcsValue && (
                <span>
                  <span className="text-outline">PCS:</span>{" "}
                  <span className="text-on-surface">{d.pcsValue}</span>
                </span>
              )}
            </div>
          )}
          {/* Suggested-well callout for orphan_destination rows. The
              fuzzy-match runs in the sweep; we just display its result
              here so Jessica can decide quickly: alias to the
              suggested well, or add as new. */}
          {isOrphan && d.metadata?.suggestedWell && (
            <div className="mt-2 px-2 py-1.5 rounded bg-primary/5 border border-primary/20 text-[11px]">
              <span className="text-outline">Closest existing well:</span>{" "}
              <Link
                to={`/admin/wells?well=${d.metadata.suggestedWell.wellId}`}
                className="font-semibold text-primary hover:underline"
              >
                {d.metadata.suggestedWell.wellName}
              </Link>{" "}
              <span className="text-outline tabular-nums">
                ({Math.round(d.metadata.suggestedWell.score * 100)}% match)
              </span>{" "}
              <span className="text-outline">
                — alias it there if same well, otherwise add as new.
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {d.assignmentId && !isOrphan && (
            <Link
              to={`/dispatching/workbench?expand=${d.assignmentId}`}
              className="text-[11px] text-primary underline whitespace-nowrap"
            >
              open load
            </Link>
          )}
          {isOrphan && (
            <Link
              to={
                d.metadata?.suggestedWell
                  ? `/admin/wells?well=${d.metadata.suggestedWell.wellId}`
                  : "/admin/wells"
              }
              className="text-[11px] text-primary underline whitespace-nowrap"
            >
              {d.metadata?.suggestedWell
                ? "open suggested well"
                : "add to wells"}
            </Link>
          )}
          <button
            type="button"
            onClick={onResolve}
            disabled={resolving}
            className="text-[11px] text-outline hover:text-primary underline disabled:opacity-50"
          >
            resolve
          </button>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-outline italic">
        {TYPE_DESC[d.discrepancyType] ?? ""}
      </div>
    </div>
  );
}
