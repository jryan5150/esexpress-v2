import { useBolQueue, useBolStats } from "../hooks/use-bol";
import { useDispatchReadiness } from "../hooks/use-wells";

interface QueueItem {
  id: string;
  carrier: string;
  location: string;
  time: string;
  status: string;
  loadId?: string;
  type?: string;
  label?: string;
  dispatchValue?: string;
  driverValue?: string;
  difference?: string;
}

export function BolQueue() {
  const statsQuery = useBolStats();
  const queueQuery = useBolQueue();
  const readinessQuery = useDispatchReadiness();

  const isError = statsQuery.isError || queueQuery.isError;
  const isLoading = statsQuery.isLoading || queueQuery.isLoading;

  const stats = statsQuery.data
    ? {
        pending: Number(
          (statsQuery.data as Record<string, unknown>).pending ?? 0,
        ),
        matched: Number(
          (statsQuery.data as Record<string, unknown>).matched ?? 0,
        ),
      }
    : { pending: 0, matched: 0 };

  // Dispatch readiness data for photo status summary
  const readiness = readinessQuery.data;
  const totalAssignments = readiness?.totalAssignments ?? 0;
  const readyCount = readiness?.readyCount ?? 0;
  const missingFields = Array.isArray(readiness?.missingFields)
    ? readiness.missingFields
    : [];
  const photoMissing =
    missingFields.find((f) => f.field === "photo" || f.field === "photoStatus")
      ?.count ?? 0;
  const photosAttached =
    totalAssignments > 0 ? totalAssignments - photoMissing : 0;

  // Group queue items by status — no mock fallback
  const rawItems: QueueItem[] = Array.isArray(queueQuery.data)
    ? (queueQuery.data as Array<Record<string, unknown>>).map(
        (item: Record<string, unknown>) => {
          const sub = item.submission as Record<string, unknown> | undefined;
          const load = item.matchedLoad as Record<string, unknown> | undefined;
          return {
            id: String(
              sub?.id || sub?.bolNumber || item.id || item.ticketId || "",
            ),
            carrier: String(
              load?.carrierName || item.carrier || item.carrierName || "",
            ),
            location: String(
              load?.destinationName || item.location || item.wellName || "",
            ),
            time: String(
              sub?.createdAt ||
                item.timeSubmitted ||
                item.createdAt ||
                item.time ||
                "",
            ),
            status: String(sub?.status || item.status || "unmatched"),
            loadId: item.loadId ? String(item.loadId) : undefined,
            type: item.type ? String(item.type) : undefined,
            label: item.label ? String(item.label) : undefined,
            dispatchValue: item.dispatchValue
              ? String(item.dispatchValue)
              : undefined,
            driverValue: item.driverValue
              ? String(item.driverValue)
              : undefined,
            difference: item.difference ? String(item.difference) : undefined,
          };
        },
      )
    : [];

  const unmatched = rawItems.filter((i) => i.status === "unmatched");
  const discrepancies = rawItems.filter((i) => i.status === "discrepancy");

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      {/* API Error Banner */}
      {isError && (
        <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined text-error text-lg">
            cloud_off
          </span>
          <p className="text-sm text-error font-medium">
            Unable to connect to the server. Showing cached data.
          </p>
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface">
            BOL Queue
          </h1>
          <p className="text-on-surface-variant font-label text-sm mt-1">
            RECONCILIATION WORKSPACE // OPERATOR: 882-J
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-surface-container-highest px-4 py-2 rounded flex items-center gap-4">
            <span className="font-label text-xs uppercase text-on-surface-variant">
              Queue Status
            </span>
            <div className="flex gap-2">
              <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 font-mono text-[10px] rounded">
                {isLoading ? "..." : stats.pending} PENDING
              </span>
              <span className="bg-tertiary/10 text-tertiary border border-tertiary/20 px-2 py-0.5 font-mono text-[10px] rounded">
                {isLoading ? "..." : stats.matched} MATCHED
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Status Summary */}
      <section className="bg-surface-container-lowest border-l-4 border-tertiary overflow-hidden rounded-sm shadow-lg">
        <div className="flex items-center justify-between p-4 bg-surface-container-high/50">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-tertiary">
              photo_library
            </span>
            <h2 className="font-headline font-bold text-on-surface">
              Photo Status
            </h2>
          </div>
          {readinessQuery.isLoading && (
            <span className="font-mono text-xs text-on-surface/40">
              Loading...
            </span>
          )}
        </div>
        <div className="p-6">
          {readinessQuery.isLoading ? (
            <div className="animate-pulse flex gap-6">
              <div className="h-20 flex-1 bg-on-surface/5 rounded" />
              <div className="h-20 flex-1 bg-on-surface/5 rounded" />
              <div className="h-20 flex-1 bg-on-surface/5 rounded" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-6">
              <div className="p-4 bg-surface-container rounded border-l-2 border-tertiary">
                <span className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                  Photos Attached
                </span>
                <span className="font-mono text-2xl font-bold text-tertiary">
                  {photosAttached}
                </span>
              </div>
              <div className="p-4 bg-surface-container rounded border-l-2 border-error">
                <span className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                  Photos Missing
                </span>
                <span className="font-mono text-2xl font-bold text-error">
                  {photoMissing}
                </span>
              </div>
              <div className="p-4 bg-surface-container rounded border-l-2 border-primary">
                <span className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                  Dispatch Ready
                </span>
                <span className="font-mono text-2xl font-bold text-primary">
                  {readyCount}
                </span>
                <span className="font-label text-xs text-on-surface/40 ml-1">
                  / {totalAssignments}
                </span>
              </div>
            </div>
          )}
          {!readinessQuery.isLoading && totalAssignments > 0 && (
            <div className="mt-4 h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-tertiary rounded-full transition-all"
                style={{
                  width: `${totalAssignments > 0 ? (photosAttached / totalAssignments) * 100 : 0}%`,
                }}
              />
            </div>
          )}
          {!readinessQuery.isLoading && totalAssignments === 0 && (
            <p className="text-on-surface/30 font-label text-sm text-center py-2">
              No assignments found
            </p>
          )}
        </div>
      </section>

      {/* Unmatched Tickets */}
      <section className="bg-surface-container-lowest border-l-4 border-error overflow-hidden rounded-sm shadow-lg">
        <div className="flex items-center justify-between p-4 bg-surface-container-high/50 cursor-pointer">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-error">error</span>
            <h2 className="font-headline font-bold text-on-surface">
              Unmatched Tickets
            </h2>
            <span className="font-mono text-xs bg-error-container text-on-error-container px-2 py-0.5 rounded">
              {isLoading ? "..." : `${unmatched.length} ITEMS`}
            </span>
          </div>
          <span className="material-symbols-outlined">expand_more</span>
        </div>
        <div className="p-0">
          <div className="grid grid-cols-12 gap-1 px-4 py-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60 border-b border-surface-variant/20">
            <div className="col-span-2">Ticket ID</div>
            <div className="col-span-2">Carrier</div>
            <div className="col-span-2">Location</div>
            <div className="col-span-2">Time Submitted</div>
            <div className="col-span-4 text-right">Quick Actions</div>
          </div>
          <div className="divide-y divide-surface-container">
            {isLoading ? (
              <>
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-1 items-center px-4 py-3 animate-pulse"
                  >
                    <div className="col-span-2">
                      <div className="h-4 w-24 bg-on-surface/10 rounded" />
                    </div>
                    <div className="col-span-2">
                      <div className="h-4 w-28 bg-on-surface/5 rounded" />
                    </div>
                    <div className="col-span-2">
                      <div className="h-4 w-24 bg-on-surface/5 rounded" />
                    </div>
                    <div className="col-span-2">
                      <div className="h-4 w-32 bg-on-surface/5 rounded" />
                    </div>
                    <div className="col-span-4 flex justify-end gap-2">
                      <div className="h-7 w-24 bg-on-surface/5 rounded" />
                      <div className="h-7 w-16 bg-on-surface/5 rounded" />
                    </div>
                  </div>
                ))}
              </>
            ) : unmatched.length === 0 ? (
              <div className="px-4 py-8 text-center space-y-2">
                <span className="material-symbols-outlined text-3xl text-on-surface/10">
                  inbox
                </span>
                <p className="text-on-surface/40 font-label text-sm">
                  No unmatched tickets
                </p>
                <p className="text-on-surface/20 font-label text-xs">
                  JotForm weight ticket sync not yet configured
                </p>
              </div>
            ) : (
              unmatched.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-12 gap-1 items-center px-4 py-3 hover:bg-surface-container-high transition-all group"
                >
                  <div className="col-span-2 font-mono text-sm text-primary">
                    {row.id}
                  </div>
                  <div className="col-span-2 font-headline text-sm">
                    {row.carrier}
                  </div>
                  <div className="col-span-2 font-headline text-sm">
                    {row.location}
                  </div>
                  <div className="col-span-2 font-mono text-xs">{row.time}</div>
                  <div className="col-span-4 flex justify-end gap-2">
                    <button className="bg-surface-container-high px-3 py-1.5 text-xs font-bold border border-outline-variant/30 hover:bg-surface-container-highest flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">
                        search
                      </span>
                      Manual Match
                    </button>
                    <button className="bg-surface-container-high px-3 py-1.5 text-xs font-bold border border-outline-variant/30 hover:bg-surface-container-highest flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">
                        delete
                      </span>
                      Void
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Data Discrepancies */}
      <section className="bg-surface-container-lowest border-l-4 border-primary overflow-hidden rounded-sm shadow-lg">
        <div className="flex items-center justify-between p-4 bg-surface-container-high/50">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">
              warning
            </span>
            <h2 className="font-headline font-bold text-on-surface">
              Data Discrepancies
            </h2>
            <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
              {isLoading
                ? "..."
                : `${discrepancies.length} ITEM${discrepancies.length !== 1 ? "S" : ""}`}
            </span>
          </div>
          <span className="material-symbols-outlined">expand_more</span>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="animate-pulse space-y-4 bg-surface-container p-4 rounded-sm">
              <div className="h-5 w-64 bg-on-surface/10 rounded" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-16 bg-on-surface/5 rounded" />
                <div className="h-16 bg-on-surface/5 rounded" />
              </div>
            </div>
          ) : discrepancies.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <span className="material-symbols-outlined text-3xl text-on-surface/10">
                verified
              </span>
              <p className="text-on-surface/40 font-label text-sm">
                No discrepancies found
              </p>
              <p className="text-on-surface/20 font-label text-xs">
                Discrepancies will appear when JotForm submissions are matched
                to loads
              </p>
            </div>
          ) : (
            discrepancies.map((disc) => (
              <div
                key={disc.id}
                className="flex items-start gap-6 bg-surface-container p-4 rounded-sm mb-4 last:mb-0"
              >
                <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary">
                    balance
                  </span>
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                        {disc.label || "Data Mismatch detected"}
                      </p>
                      <p className="font-headline text-lg font-bold">
                        Load #{disc.loadId || "N/A"} // Ticket {disc.id}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-label text-xs uppercase text-on-surface-variant">
                        Difference
                      </p>
                      <p className="font-mono text-xl text-error font-bold">
                        {disc.difference || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-surface-container-high rounded border-l-2 border-surface-variant">
                      <span className="block text-[10px] font-label uppercase text-on-surface-variant mb-1">
                        Dispatch Data
                      </span>
                      <span className="font-mono text-lg font-bold">
                        {disc.dispatchValue || "N/A"}
                      </span>
                    </div>
                    <div className="p-3 bg-surface-container-high rounded border-l-2 border-primary">
                      <span className="block text-[10px] font-label uppercase text-on-surface-variant mb-1">
                        Driver Submission
                      </span>
                      <span className="font-mono text-lg font-bold text-primary">
                        {disc.driverValue || "N/A"}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button className="px-4 py-2 text-xs font-bold border border-outline-variant/30 hover:bg-surface-container-highest transition-colors">
                      Request Recalibration
                    </button>
                    <button className="px-4 py-2 text-xs font-bold border border-outline-variant/30 hover:bg-surface-container-highest transition-colors">
                      Flag for Supervisor
                    </button>
                    <button className="px-6 py-2 text-xs font-bold bg-primary text-on-primary-container hover:brightness-110">
                      Override &amp; Approve
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
