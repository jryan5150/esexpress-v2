import { useNavigate } from "react-router-dom";
import {
  useWells,
  useDispatchReadiness,
  useValidationSummary,
} from "../hooks/use-wells";
import { useHeartbeat } from "../hooks/use-presence";

function getBorderColor(ready: number, total: number): string {
  if (total === 0) return "border-on-surface/20";
  const pct = ready / total;
  if (pct >= 0.9) return "border-tertiary";
  if (pct >= 0.5) return "border-primary-container";
  return "border-on-surface/20";
}

function pct(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function ExceptionFeed() {
  useHeartbeat({ currentPage: "feed" });
  const navigate = useNavigate();
  const wellsQuery = useWells();
  const readinessQuery = useDispatchReadiness();
  const validationQuery = useValidationSummary();

  const isError = wellsQuery.isError || readinessQuery.isError;
  const isLoading = wellsQuery.isLoading || readinessQuery.isLoading;

  // Wells now return per-well assignment stats from backend
  const rawWells = Array.isArray(wellsQuery.data) ? wellsQuery.data : [];
  const wells = (rawWells as Array<Record<string, unknown>>)
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
    .filter((w) => w.totalLoads > 0)
    .sort((a, b) => b.review - a.review || b.totalLoads - a.totalLoads);

  const readiness = readinessQuery.data as Record<string, unknown> | undefined;
  const readyCount = Number(
    readiness?.dispatchReady ?? readiness?.readyCount ?? 0,
  );
  const photosAttached = Number(readiness?.photosAttached ?? 0);
  const totalAssignments = Number(readiness?.total ?? 0);

  // Validation summary for the "pending review" count
  const validation = validationQuery.data as
    | Record<string, unknown>
    | undefined;
  const pendingReview = Number(validation?.total ?? 0);

  return (
    <>
      <div className="p-8 space-y-8 max-w-7xl">
        {/* API Error Banner */}
        {isError && (
          <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-error text-lg">
              cloud_off
            </span>
            <p className="text-sm text-error font-medium">
              Unable to connect to the server.
            </p>
          </div>
        )}

        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-headline font-black tracking-tight text-on-surface uppercase">
            Today's Objectives
          </h1>
          <p className="text-on-surface/30 font-label text-xs uppercase tracking-widest mt-1">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Action Required + System Handled */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Needs Your Attention — dominant */}
          {pendingReview > 0 && (
            <button
              onClick={() => navigate("/validation")}
              className="md:col-span-1 bg-surface-container-low rounded-xl p-8 border-l-4 border-primary-container relative overflow-hidden group text-left transition-all hover:bg-surface-container-high cursor-pointer"
            >
              <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-primary-container/5 rounded-full blur-3xl group-hover:bg-primary-container/10 transition-all duration-700" />
              <div className="relative z-10 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-container text-lg">
                    pending_actions
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-primary-container">
                    Needs Attention
                  </span>
                </div>
                <div className="font-label text-5xl font-bold text-on-surface">
                  {validationQuery.isLoading ? "..." : pendingReview}
                </div>
                <p className="text-xs text-on-surface/40 font-medium">
                  assignments awaiting confirmation
                </p>
                <div className="flex items-center gap-2 text-primary-container text-sm font-bold uppercase tracking-wider pt-2 group-hover:gap-3 transition-all">
                  Review Now
                  <span className="material-symbols-outlined text-sm">
                    arrow_forward
                  </span>
                </div>
              </div>
            </button>
          )}

          {/* System Handled — secondary */}
          <div
            className={`${pendingReview > 0 ? "md:col-span-2" : "md:col-span-3"} bg-surface-container-low rounded-xl p-8 border-l-4 border-tertiary relative overflow-hidden group`}
          >
            <div className="absolute -right-12 -top-12 w-64 h-64 bg-tertiary/5 rounded-full blur-3xl group-hover:bg-tertiary/10 transition-all duration-700" />
            <div className="relative z-10 space-y-4">
              <h3 className="text-[10px] uppercase tracking-[0.2em] font-black text-on-surface/40">
                System Handled
              </h3>
              <div className="flex flex-wrap gap-8">
                {[
                  {
                    icon: "check_circle",
                    value: readinessQuery.isLoading
                      ? "..."
                      : String(totalAssignments),
                    label: "Loads Mapped",
                  },
                  {
                    icon: "task_alt",
                    value: readinessQuery.isLoading
                      ? "..."
                      : String(readyCount),
                    label: "Dispatch Ready",
                  },
                  {
                    icon: "image",
                    value: readinessQuery.isLoading
                      ? "..."
                      : String(photosAttached),
                    label: "Photos Attached",
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="bg-tertiary/10 p-2 rounded-lg">
                      <span className="material-symbols-outlined text-tertiary">
                        {item.icon}
                      </span>
                    </div>
                    <div>
                      <div className="font-label text-2xl font-bold text-on-surface">
                        {item.value}
                      </div>
                      <div className="text-[10px] uppercase font-bold text-on-surface/40">
                        {item.label}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Well List */}
        <section className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-xs uppercase tracking-[0.2em] font-black text-on-surface/40">
              Wells{" "}
              <span className="text-primary-container">
                {wells.length} with loads
              </span>
            </h3>
          </div>

          <div className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
            {isLoading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-surface-container-low flex flex-col md:flex-row md:items-center p-6 gap-6 animate-pulse"
                  >
                    <div className="md:w-64 border-l-4 border-on-surface/10 pl-4">
                      <div className="h-5 w-40 bg-on-surface/10 rounded mb-2" />
                      <div className="h-4 w-24 bg-on-surface/5 rounded" />
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-8">
                      {[1, 2, 3].map((j) => (
                        <div key={j} className="space-y-2">
                          <div className="h-3 w-12 bg-on-surface/5 rounded" />
                          <div className="h-4 w-full bg-on-surface/5 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : wells.length === 0 ? (
              <div className="bg-surface-container-low p-8 text-center">
                <span className="material-symbols-outlined text-on-surface/20 text-4xl mb-2">
                  inbox
                </span>
                <p className="text-on-surface/40 font-label text-sm">
                  No wells with assignments yet. Run the auto-mapper to create
                  assignments from synced loads.
                </p>
              </div>
            ) : (
              wells.map((well) => (
                <div
                  key={well.id}
                  onClick={() => navigate(`/dispatch-desk?wellId=${well.id}`)}
                  className="bg-surface-container-low hover:bg-surface-container-high transition-all group cursor-pointer flex flex-col md:flex-row md:items-center p-6 gap-6"
                >
                  <div
                    className={`md:w-64 border-l-4 pl-4 ${getBorderColor(well.ready, well.totalLoads)}`}
                  >
                    <h4 className="font-bold text-lg text-on-surface">
                      {well.name}
                    </h4>
                    <span className="font-label text-sm text-on-surface/60">
                      {well.totalLoads} Loads
                    </span>
                  </div>
                  <div className="flex-1 grid grid-cols-4 gap-6">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-on-surface/40 tracking-widest">
                        Ready
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 bg-surface-container-lowest rounded-full overflow-hidden">
                          <div
                            className="h-full bg-tertiary"
                            style={{
                              width: pct(well.ready, well.totalLoads),
                            }}
                          />
                        </div>
                        <span className="font-label text-sm font-bold">
                          {well.ready}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-tertiary/70 tracking-widest">
                        Validated
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 bg-surface-container-lowest rounded-full overflow-hidden">
                          <div
                            className="h-full bg-tertiary/60"
                            style={{
                              width: pct(well.validated, well.totalLoads),
                            }}
                          />
                        </div>
                        <span className="font-label text-sm font-bold text-tertiary">
                          {well.validated}/{well.totalLoads}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`space-y-1 ${well.review === 0 ? "opacity-20" : ""}`}
                    >
                      <span
                        className={`text-[10px] uppercase font-bold tracking-widest ${well.review > 0 ? "text-on-surface/40" : ""}`}
                      >
                        Review
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 bg-surface-container-lowest rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-container"
                            style={{
                              width: pct(well.review, well.totalLoads),
                            }}
                          />
                        </div>
                        <span
                          className={`font-label text-sm font-bold ${well.review > 0 ? "text-primary-container" : ""}`}
                        >
                          {well.review}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`space-y-1 ${well.missing === 0 ? "opacity-20" : ""}`}
                    >
                      <span
                        className={`text-[10px] uppercase font-bold tracking-widest ${well.missing > 0 ? "text-error" : ""}`}
                      >
                        Missing Photos
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 bg-surface-container-lowest rounded-full overflow-hidden">
                          <div
                            className="h-full bg-error"
                            style={{
                              width: pct(well.missing, well.totalLoads),
                            }}
                          />
                        </div>
                        <span
                          className={`font-label text-sm font-bold ${well.missing > 0 ? "text-error" : ""}`}
                        >
                          {well.missing}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Bottom Insights */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 md:col-span-2 bg-surface-container-low/40 p-6 rounded-xl border border-on-surface/5">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-xs uppercase font-black text-on-surface/40 tracking-widest">
                Dispatch Pipeline
              </h4>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[
                {
                  label: "Pending Review",
                  count: pendingReview,
                  color: "bg-primary-container",
                },
                {
                  label: "Assigned",
                  count: wells.reduce((s, w) => s + w.assigned, 0),
                  color: "bg-primary-container/60",
                },
                {
                  label: "Dispatch Ready",
                  count: readyCount,
                  color: "bg-tertiary",
                },
                {
                  label: "Photos Attached",
                  count: photosAttached,
                  color: "bg-tertiary/60",
                },
              ].map((item) => (
                <div key={item.label} className="text-center space-y-2">
                  <div className="font-label text-2xl font-bold text-on-surface">
                    {isLoading ? "..." : item.count}
                  </div>
                  <div className={`h-2 rounded-full ${item.color}`} />
                  <div className="text-[10px] uppercase font-bold text-on-surface/40 tracking-wider">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-primary-container rounded-xl p-6 flex flex-col justify-between overflow-hidden relative group">
            <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-8xl text-on-primary-container/10 group-hover:rotate-12 transition-transform duration-500">
              rocket_launch
            </span>
            <div>
              <h4 className="text-[10px] font-black text-on-primary-container uppercase tracking-[0.2em] mb-4">
                Dispatcher Tip
              </h4>
              <p className="text-sm font-medium leading-relaxed text-on-primary-container">
                Use <span className="font-label font-bold">[Shift + A]</span> to
                quickly approve matched loads in the Validation page.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
