const STATUS_HEX: Record<string, string> = {
  loads_being_built: "#00ff00",
  loads_completed: "#ff00ff",
  loads_being_cleared: "#f46fa2",
  loads_cleared: "#da3876",
  export_transfers_completed: "#ffff00",
  invoiced: "#4a86e8",
  missing_tickets: "#9900ff",
  missing_driver: "#00ffff",
  need_rate_info: "#e69138",
  unknown: "#cccccc",
};

const STATUS_ORDER: Record<string, number> = {
  missing_tickets: 0,
  missing_driver: 1,
  loads_being_built: 2,
  loads_completed: 3,
  loads_being_cleared: 4,
  loads_cleared: 5,
  export_transfers_completed: 5, // side branch — same as cleared for distance
  invoiced: 6,
  need_rate_info: -1, // exception, never adjacent
  unknown: -2,
};

function stageDistance(a: string, b: string): number {
  const ai = STATUS_ORDER[a] ?? -2;
  const bi = STATUS_ORDER[b] ?? -2;
  if (ai < 0 || bi < 0) return 99;
  return Math.abs(ai - bi);
}

interface Props {
  loadCount: number;
  derivedStatus: string;
  paintedStatus?: string | null; // sheet's painted color status (if available)
  onClick: () => void;
  onBadgeClick?: () => void;
}

export function WellGridCell({
  loadCount,
  derivedStatus,
  paintedStatus,
  onClick,
  onBadgeClick,
}: Props) {
  const derivedHex = STATUS_HEX[derivedStatus] ?? STATUS_HEX.unknown;
  const paintedHex = paintedStatus ? (STATUS_HEX[paintedStatus] ?? null) : null;
  const showBadge =
    paintedStatus && stageDistance(derivedStatus, paintedStatus) > 1;

  if (loadCount === 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-12 h-9 rounded border border-dashed border-border/40 bg-bg-primary/20 hover:border-border hover:bg-bg-primary/40 transition-colors"
        aria-label="Empty cell"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-12 h-9 rounded border border-border overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-offset-2 hover:ring-offset-bg-secondary hover:ring-accent transition-all"
      aria-label={`Cell with ${loadCount} loads, status ${derivedStatus}`}
      title={`${loadCount} loads · v2: ${derivedStatus}${paintedStatus ? ` · sheet: ${paintedStatus}` : ""}`}
    >
      {/* Top half: sheet-painted color (if available) */}
      {paintedHex && (
        <div
          className="absolute inset-x-0 top-0 h-1/2"
          style={{ backgroundColor: paintedHex }}
        />
      )}
      {/* Bottom half: v2-derived color */}
      <div
        className={`absolute inset-x-0 ${paintedHex ? "bottom-0 h-1/2" : "inset-y-0"}`}
        style={{ backgroundColor: derivedHex }}
      />
      <span className="relative z-10 px-1.5 py-0.5 rounded-sm bg-white/90 text-black tabular-nums font-bold text-xs">
        {loadCount}
      </span>
      {showBadge && (
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onBadgeClick?.();
          }}
          className="absolute -top-1.5 -right-1.5 z-20 w-4 h-4 rounded-full bg-amber-500 border border-amber-700 text-[10px] font-bold text-white flex items-center justify-center"
          title={`Mismatch: sheet says ${paintedStatus}, v2 says ${derivedStatus}`}
        >
          !
        </span>
      )}
    </button>
  );
}
