import { useState } from "react";
import { useManualMatchJotform, useJotformLoadSearch } from "../hooks/use-bol";
import { useToast } from "./Toast";
import { BOLDisplay } from "./BOLDisplay";

/**
 * Inline manual-match control. Lets a dispatcher search loads (by load #,
 * BOL, ticket, or driver) and link an unmatched JotForm submission to the
 * right load when auto-match couldn't figure it out.
 *
 * Extracted from BolQueue 2026-04-24 PM so it can also render inline on
 * the Validate page (Phase 2 meld) without forcing a page-switch to BOL
 * Center for every photo-match.
 */
export function ManualMatchPanel({
  importId,
  onLinked,
}: {
  importId: number;
  onLinked?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pickedLoadId, setPickedLoadId] = useState<number | null>(null);
  const search = useJotformLoadSearch(query, query.trim().length >= 2);
  const match = useManualMatchJotform();
  const { toast } = useToast();
  const hits =
    (search.data as Array<Record<string, unknown>> | undefined) ?? [];

  const submit = () => {
    if (!pickedLoadId) return;
    match.mutate(
      { importId, loadId: pickedLoadId },
      {
        onSuccess: (res: unknown) => {
          const photoNote = (res as { data?: { photoAttached?: boolean } })
            ?.data?.photoAttached
            ? " — photo attached"
            : "";
          toast(`Linked to load ${pickedLoadId}${photoNote}`, "success");
          setQuery("");
          setPickedLoadId(null);
          onLinked?.();
        },
        onError: (err) =>
          toast(`Match failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  return (
    <div className="bg-surface-container-lowest border border-primary/30 rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-primary">
          Match this photo to a load
        </span>
        <span className="text-[10px] text-outline">
          Search by load #, BOL, ticket, or driver
        </span>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPickedLoadId(null);
        }}
        placeholder="e.g. 12345, AU2604142548, Roy Arambula"
        className="w-full bg-background border border-outline-variant/40 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary/60 mb-2"
        autoFocus
      />
      {query.trim().length >= 2 && (
        <div className="space-y-1 max-h-56 overflow-y-auto mb-2">
          {search.isFetching && (
            <div className="text-[11px] text-outline px-2 py-1">Searching…</div>
          )}
          {!search.isFetching && hits.length === 0 && (
            <div className="text-[11px] text-outline px-2 py-1">
              No loads matched "{query}"
            </div>
          )}
          {hits.map((h) => {
            const isPicked = pickedLoadId === (h.id as number);
            return (
              <button
                key={h.id as number}
                type="button"
                onClick={() => setPickedLoadId(h.id as number)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                  isPicked
                    ? "bg-primary/15 border border-primary/40"
                    : "hover:bg-surface-container-high border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-on-surface tabular-nums">
                    #{h.loadNo as string}
                  </span>
                  <span className="text-[10px] uppercase text-outline">
                    {h.source as string}
                  </span>
                  {isPicked && (
                    <span className="text-[10px] uppercase font-bold text-primary ml-auto">
                      selected
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-outline mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span>{(h.driverName as string) ?? "no driver"}</span>
                  <BOLDisplay
                    ticketNo={h.ticketNo as string | null}
                    bolNo={h.bolNo as string | null}
                    size="sm"
                    showSourcePrefix={false}
                  />
                  <span>
                    {h.deliveredOn
                      ? new Date(h.deliveredOn as string).toLocaleDateString()
                      : "no date"}
                  </span>
                  {h.destinationName ? (
                    <span>→ {h.destinationName as string}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!pickedLoadId || match.isPending}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-on-primary text-xs font-bold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:brightness-110 transition-all"
      >
        <span className="material-symbols-outlined text-sm">link</span>
        {match.isPending
          ? "Linking…"
          : pickedLoadId
            ? `Link to Load #${pickedLoadId}`
            : "Pick a load above"}
      </button>
    </div>
  );
}
