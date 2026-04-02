import { useState } from "react";
import { useBolQueue, useBolStats } from "../hooks/use-bol";
import { Pagination } from "../components/Pagination";

const API_BASE = import.meta.env.VITE_API_URL || "";
const resolveUrl = (url: string) =>
  url.startsWith("/") ? `${API_BASE}${url}` : url;

interface JotFormItem {
  submission: {
    id: number;
    bolNumber: string | null;
    driverName: string | null;
    truckNo: string | null;
    weight: string | null;
    photoUrls: string[];
    status: string;
    submittedAt: string | null;
    createdAt: string | null;
  };
  matchedLoad: {
    id: number;
    loadNo: string;
    driverName: string | null;
    destinationName: string | null;
    ticketNo: string | null;
  } | null;
  discrepancies: unknown[];
}

function formatDate(d: string | null): string {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

export function BolQueue() {
  const statsQuery = useBolStats();
  const [filter, setFilter] = useState<"all" | "matched" | "pending">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const queueQuery = useBolQueue({ page, limit: pageSize });

  const stats = statsQuery.data as Record<string, unknown> | undefined;
  const total = Number(stats?.total ?? 0);
  const matchRate = String(stats?.matchRate ?? "0%");
  const byStatus = (stats?.byStatus ?? {}) as Record<string, number>;

  const response = queueQuery.data as any;
  const rawItems: JotFormItem[] =
    response?.data ?? (Array.isArray(response) ? response : []);
  const queueTotal = response?.meta?.total ?? rawItems.length;

  const filtered =
    filter === "all"
      ? rawItems
      : rawItems.filter((i) =>
          filter === "matched"
            ? i.submission.status === "matched"
            : i.submission.status === "pending",
        );

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface uppercase">
          BOL Queue
        </h1>
        <p className="text-on-surface/40 font-label text-xs uppercase tracking-widest mt-1">
          Weight Ticket Reconciliation // JotForm Pipeline
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Submissions",
            value: total,
            icon: "receipt_long",
            color: "primary-container",
          },
          {
            label: "Matched",
            value: byStatus.matched ?? 0,
            icon: "link",
            color: "tertiary",
          },
          {
            label: "Unmatched",
            value: byStatus.pending ?? 0,
            icon: "link_off",
            color: "error",
          },
          {
            label: "Match Rate",
            value: matchRate,
            icon: "percent",
            color: "primary-container",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`bg-surface-container-low rounded-xl p-5 border-l-4 border-${s.color}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`material-symbols-outlined text-${s.color} text-lg`}
              >
                {s.icon}
              </span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface/40">
                {s.label}
              </span>
            </div>
            <div className={`font-label text-2xl font-bold text-${s.color}`}>
              {statsQuery.isLoading ? "..." : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["all", "matched", "pending"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              filter === f
                ? "bg-primary-container text-on-primary-container"
                : "bg-surface-container-high text-on-surface/50 hover:text-on-surface"
            }`}
          >
            {f === "all"
              ? `All (${rawItems.length})`
              : f === "matched"
                ? `Matched (${rawItems.filter((i) => i.submission.status === "matched").length})`
                : `Unmatched (${rawItems.filter((i) => i.submission.status === "pending").length})`}
          </button>
        ))}
      </div>

      {/* Queue List */}
      {queueQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-surface-container-low rounded-xl p-5 animate-pulse flex gap-6"
            >
              <div className="w-16 h-16 bg-on-surface/10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-on-surface/10 rounded" />
                <div className="h-3 w-60 bg-on-surface/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface/15 mb-2">
            inbox
          </span>
          <p className="text-on-surface/30 font-label text-sm">
            {filter === "all"
              ? "No JotForm submissions yet"
              : `No ${filter} submissions`}
          </p>
        </div>
      ) : (
        <div className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
          {filtered.map((item) => {
            const sub = item.submission;
            const load = item.matchedLoad;
            const isExpanded = expandedId === sub.id;
            const hasPhoto = sub.photoUrls && sub.photoUrls.length > 0;

            return (
              <div key={sub.id}>
                {/* Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                  className="bg-surface-container-low hover:bg-surface-container-high transition-all px-5 py-4 flex items-center gap-5 cursor-pointer"
                >
                  {/* Photo thumbnail */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-high flex-shrink-0 border border-on-surface/10">
                    {hasPhoto ? (
                      <img
                        src={resolveUrl(sub.photoUrls[0])}
                        alt="Weight ticket"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-on-surface/20 text-lg">
                          no_photography
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-label text-sm font-bold text-on-surface">
                        BOL {sub.bolNumber || "--"}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          sub.status === "matched"
                            ? "bg-tertiary/10 text-tertiary"
                            : "bg-error/10 text-error"
                        }`}
                      >
                        {sub.status}
                      </span>
                    </div>
                    <div className="text-xs text-on-surface/50 mt-0.5 flex gap-4">
                      <span>{sub.driverName || "Unknown driver"}</span>
                      <span>Truck {sub.truckNo || "--"}</span>
                      <span>{formatDate(sub.submittedAt)}</span>
                    </div>
                  </div>

                  {/* Matched load info */}
                  {load && (
                    <div className="text-right">
                      <span className="font-label text-xs text-on-surface/40">
                        Matched to
                      </span>
                      <p className="font-label text-sm font-bold text-on-surface">
                        Load {load.loadNo || `#${load.id}`}
                      </p>
                    </div>
                  )}

                  {/* Expand indicator */}
                  <span
                    className={`material-symbols-outlined text-sm text-on-surface/30 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  >
                    chevron_right
                  </span>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="bg-surface-container-lowest px-5 py-5 border-t border-on-surface/5 space-y-4">
                    {/* Photo viewer */}
                    {hasPhoto && (
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {sub.photoUrls.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => setPhotoModal(resolveUrl(url))}
                            className="w-32 h-40 rounded-lg overflow-hidden bg-surface-container-high border border-on-surface/10 flex-shrink-0 hover:ring-2 hover:ring-primary-container transition-all cursor-pointer"
                          >
                            <img
                              src={resolveUrl(url)}
                              alt={`Ticket photo ${i + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "";
                                (e.target as HTMLImageElement).alt =
                                  "Failed to load";
                              }}
                            />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Fields grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "BOL / Ticket #", value: sub.bolNumber },
                        { label: "Driver", value: sub.driverName },
                        { label: "Truck #", value: sub.truckNo },
                        { label: "Weight", value: sub.weight },
                        {
                          label: "Submitted",
                          value: formatDate(sub.submittedAt),
                        },
                        { label: "Status", value: sub.status },
                        ...(load
                          ? [
                              {
                                label: "Matched Load",
                                value: load.loadNo || `#${load.id}`,
                              },
                              {
                                label: "Load Driver",
                                value: load.driverName,
                              },
                              {
                                label: "Well / Destination",
                                value: load.destinationName,
                              },
                              {
                                label: "Load Ticket #",
                                value: load.ticketNo,
                              },
                            ]
                          : [
                              {
                                label: "Matched Load",
                                value: "-- UNMATCHED --",
                              },
                            ]),
                      ].map((f) => (
                        <div key={f.label} className="space-y-1">
                          <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface/30">
                            {f.label}
                          </span>
                          <p className="text-sm text-on-surface font-label">
                            {f.value || (
                              <span className="text-on-surface/20">--</span>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {queueTotal > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={queueTotal}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          loading={queueQuery.isLoading}
        />
      )}

      {/* Photo Modal */}
      {photoModal && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8"
          onClick={() => setPhotoModal(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setPhotoModal(null)}
              className="absolute -top-10 right-0 text-white/60 hover:text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>
            <img
              src={photoModal}
              alt="Weight ticket"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
