import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useWells,
  useDispatchReadiness,
  useValidationSummary,
} from "../hooks/use-wells";
import { useHeartbeat } from "../hooks/use-presence";

export function ExceptionFeed() {
  useHeartbeat({ currentPage: "feed" });
  const navigate = useNavigate();
  const wellsQuery = useWells();
  const readinessQuery = useDispatchReadiness();
  const validationQuery = useValidationSummary();

  const isLoading = wellsQuery.isLoading || readinessQuery.isLoading;

  const wells = useMemo(() => {
    const raw = Array.isArray(wellsQuery.data) ? wellsQuery.data : [];
    return (raw as unknown as Array<Record<string, unknown>>)
      .map((w) => ({
        id: String(w.id ?? ""),
        name: String(w.name ?? ""),
        totalLoads: Number(w.totalLoads ?? w.total_loads ?? 0),
        ready: Number(w.ready ?? 0),
        review: Number(w.review ?? 0),
        assigned: Number(w.assigned ?? 0),
        missing: Number(w.missing ?? 0),
        validated: Number((w as any).validated ?? 0),
      }))
      .sort(
        (a, b) =>
          b.review - a.review ||
          b.totalLoads - a.totalLoads ||
          a.name.localeCompare(b.name),
      );
  }, [wellsQuery.data]);

  const readiness = readinessQuery.data as Record<string, unknown> | undefined;
  const readyCount = Number(
    readiness?.dispatchReady ?? readiness?.readyCount ?? 0,
  );
  const photosAttached = Number(readiness?.photosAttached ?? 0);
  const totalAssignments = Number(readiness?.total ?? 0);

  const validation = validationQuery.data as
    | Record<string, unknown>
    | undefined;
  const pendingReview = Number(validation?.total ?? 0);

  const activeWells = wells.filter(
    (w) => w.ready > 0 || w.review > 0 || w.missing > 0,
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              Today's Objectives
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex-1" />
          {wellsQuery.dataUpdatedAt > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-container-highest text-[10px] font-semibold uppercase tracking-wide text-outline tabular-nums"
              title={new Date(wellsQuery.dataUpdatedAt).toLocaleString()}
            >
              <span className="material-symbols-outlined text-xs">refresh</span>
              Updated{" "}
              {new Date(wellsQuery.dataUpdatedAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6">
        {/* Objectives Cards — 3-column grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Needs Attention */}
          <button
            onClick={() => navigate("/validation")}
            className="bg-surface-container-lowest border border-outline-variant/40 rounded-[12px] p-5 border-l-4 border-l-primary shadow-sm text-left cursor-pointer hover:shadow-md transition-shadow group hover-lift press-scale stat-glow accent-glow accent-line"
          >
            <div className="font-data text-5xl font-extrabold num-transition text-primary leading-none mb-1 tabular-nums">
              {validationQuery.isLoading ? "..." : pendingReview}
            </div>
            <div className="text-[13px] font-medium text-on-surface-variant mb-3.5">
              assignments awaiting validation
            </div>
            <div className="text-[11px] font-bold text-primary tracking-[0.06em] uppercase group-hover:tracking-[0.1em] transition-all">
              Review Now &rarr;
            </div>
          </button>

          {/* Confirmed & Ready — clickable, drops into the dispatch desk */}
          <button
            onClick={() => navigate("/dispatch-desk")}
            className="bg-surface-container-lowest border border-outline-variant/40 rounded-[12px] p-5 border-l-4 border-l-tertiary shadow-sm text-left cursor-pointer hover:shadow-md transition-shadow group hover-lift press-scale stat-glow accent-glow accent-line"
          >
            <div className="font-data text-5xl font-extrabold num-transition text-tertiary leading-none mb-1 tabular-nums">
              {readinessQuery.isLoading ? "..." : readyCount}
            </div>
            <div className="text-[13px] font-medium text-on-surface-variant mb-3.5">
              loads confirmed and ready to build
            </div>
            <div className="text-[11px] font-bold text-tertiary tracking-[0.06em] uppercase group-hover:tracking-[0.1em] transition-all">
              Build Now &rarr;
            </div>
          </button>

          {/* System Metrics */}
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[12px] p-5 border-l-4 border-l-surface-container-highest shadow-sm card-rest stat-glow">
            <div className="text-[10px] font-bold text-outline tracking-[0.06em] uppercase mb-3.5 font-label">
              System
            </div>
            <div className="flex flex-col gap-2.5">
              {[
                {
                  icon: "summarize",
                  value: totalAssignments,
                  label: "Loads Mapped",
                },
                {
                  icon: "photo_camera",
                  value: photosAttached,
                  label: "Photos Attached",
                },
                {
                  icon: "schedule",
                  value: activeWells,
                  label: "Wells Active Today",
                },
              ].map((m) => (
                <div key={m.label} className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined icon-filled text-base text-tertiary">
                    {m.icon}
                  </span>
                  <span className="font-label text-sm font-medium text-on-surface tabular-nums">
                    {readinessQuery.isLoading ? "..." : m.value}
                  </span>
                  <span className="text-xs text-outline">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Wells Table */}
        <div>
          <h3 className="font-headline text-[13px] font-bold text-outline uppercase tracking-[0.08em] mb-2.5">
            Wells — Today's Progress
          </h3>

          {/* Column Headers */}
          <div
            className="grid items-center gap-2 px-4 pb-1.5"
            style={{
              gridTemplateColumns: "1fr 90px 90px 90px 90px",
            }}
          >
            <div />
            <span className="text-[10px] font-semibold text-outline tracking-[0.06em] uppercase text-center">
              Ready
            </span>
            <span className="text-[10px] font-semibold text-tertiary tracking-[0.06em] uppercase text-center">
              Validated
            </span>
            <span className="text-[10px] font-semibold text-outline tracking-[0.06em] uppercase text-center">
              Review
            </span>
            <span className="text-[10px] font-semibold text-outline tracking-[0.06em] uppercase text-center">
              Missing Photos
            </span>
          </div>

          {/* Well Rows */}
          <div className="space-y-1.5">
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] h-12 animate-pulse"
                />
              ))
            ) : wells.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] p-8 text-center">
                <span className="material-symbols-outlined text-on-surface/20 text-4xl mb-2">
                  inbox
                </span>
                <p className="text-on-surface/40 font-label text-sm">
                  No wells with assignments yet.
                </p>
              </div>
            ) : (
              wells.map((well) => (
                <button
                  key={well.id}
                  onClick={() => navigate(`/dispatch-desk?wellId=${well.id}`)}
                  className="w-full grid items-center gap-2 bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] px-4 py-3 shadow-sm hover:border-primary/20 hover:shadow-md transition-all cursor-pointer text-left hover-lift press-scale"
                  style={{
                    gridTemplateColumns: "1fr 90px 90px 90px 90px",
                  }}
                >
                  <span className="font-label text-[13px] font-medium text-on-surface">
                    {well.name}
                  </span>
                  <span className="font-label text-[13px] font-medium text-primary text-center tabular-nums">
                    {well.ready}
                  </span>
                  <span className="font-label text-[13px] font-medium text-tertiary text-center tabular-nums">
                    {well.validated}/{well.totalLoads}
                  </span>
                  <span
                    className={`font-label text-[13px] font-medium text-center tabular-nums ${well.review > 0 ? "text-outline" : "text-outline/40"}`}
                  >
                    {well.review}
                  </span>
                  <span
                    className={`font-label text-[13px] font-medium text-center tabular-nums ${well.missing > 0 ? "text-error" : "text-outline/40"}`}
                  >
                    {well.missing}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
