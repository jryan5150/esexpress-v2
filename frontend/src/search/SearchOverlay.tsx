import { useState, useEffect, useRef } from "react";
import { useGlobalSearch } from "./useGlobalSearch";
import { SearchResult } from "./SearchResult";

export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQuery = useGlobalSearch(query);
  const results = searchQuery.data;

  // Cmd+K / Ctrl+K / '/' to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        )
      ) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const hasLive = (results?.live.length ?? 0) > 0;
  const hasArchive = (results?.archive.length ?? 0) > 0;
  const hasResults = hasLive || hasArchive;
  const noResults = query.length >= 2 && !searchQuery.isLoading && !hasResults;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 animate-slide-down">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-xl overflow-hidden">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/20">
            <span className="material-symbols-outlined text-on-surface-variant text-xl">
              search
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search loads, BOLs, drivers..."
              className="flex-1 bg-transparent text-on-surface placeholder:text-on-surface-variant/40 text-sm outline-none"
            />
            <kbd className="text-[10px] text-on-surface-variant/40 bg-surface-container-low px-1.5 py-0.5 rounded border border-outline-variant/20">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto">
            {searchQuery.isLoading && query.length >= 2 && (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}

            {noResults && (
              <div className="text-center py-6 text-sm text-on-surface-variant">
                No loads found for &ldquo;{query}&rdquo;
              </div>
            )}

            {hasLive && (
              <div>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant/50 bg-surface-container-low/30">
                  Current Loads
                </div>
                {results!.live.map((r) => (
                  <SearchResult
                    key={`live-${r.id}`}
                    result={r}
                    era="live"
                    onClick={() => setOpen(false)}
                  />
                ))}
              </div>
            )}

            {hasArchive && (
              <div>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant/50 bg-surface-container-low/30">
                  {!hasLive && query.length >= 2
                    ? "No current loads found · showing archive"
                    : "Archive"}
                </div>
                {results!.archive.map((r) => (
                  <SearchResult
                    key={`archive-${r.id}`}
                    result={r}
                    era="archive"
                    onClick={() => setOpen(false)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {query.length < 2 && (
            <div className="px-4 py-2.5 text-xs text-on-surface-variant/40 border-t border-outline-variant/10">
              Type at least 2 characters to search
            </div>
          )}
        </div>
      </div>
    </>
  );
}
