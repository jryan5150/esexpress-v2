import { Link } from "react-router-dom";
import type { SearchResult as SearchResultType } from "../types/api";

interface SearchResultProps {
  result: SearchResultType;
  era: "live" | "archive";
  onClick: () => void;
}

export function SearchResult({ result, era, onClick }: SearchResultProps) {
  const to =
    era === "live"
      ? `/dispatch-desk?loadId=${result.id}`
      : `/archive/load/${result.id}`;

  const dateStr = result.deliveredOn
    ? new Date(result.deliveredOn).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      })
    : "";

  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low/50 transition-colors cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-label text-sm text-on-surface font-medium">
            #{result.loadNo}
          </span>
          {result.driverName && (
            <span className="text-sm text-on-surface-variant truncate">
              {result.driverName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-on-surface-variant/70 mt-0.5">
          {result.wellName && <span>{result.wellName}</span>}
          {result.bolNo && <span>BOL {result.bolNo}</span>}
        </div>
      </div>
      {dateStr && (
        <span className="text-xs text-on-surface-variant/50 shrink-0">
          {dateStr}
        </span>
      )}
    </Link>
  );
}
