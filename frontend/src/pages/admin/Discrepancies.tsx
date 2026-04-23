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
  status_drift: "Status drift",
  weight_drift: "Weight drift",
  well_mismatch: "Well mismatch",
  photo_gap: "Photo gap",
  rate_drift: "Rate drift",
  orphan_destination: "Orphan destination",
};

const TYPE_DESC: Record<string, string> = {
  status_drift: "v2 stage doesn't match what PCS reports for this load",
  weight_drift: "v2 weight differs from PCS billed weight by >5%",
  well_mismatch: "v2 well name doesn't match PCS consignee company",
  photo_gap: "BOL photo expected on one side, missing on the other",
  rate_drift: "v2 expected rate differs from PCS billed rate by >5%",
  orphan_destination: "Destination has 3+ loads but no well mapping in v2",
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
              Discrepancies
            </h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Cross-check between v2 and PCS — every 15 min, the system surfaces
              where the two sources disagree.{" "}
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
              No open discrepancies
            </div>
            <div className="mt-1 text-xs text-outline">
              v2 and PCS agree on every matched load.
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
              to="/admin/wells"
              className="text-[11px] text-primary underline whitespace-nowrap"
            >
              add to wells
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
