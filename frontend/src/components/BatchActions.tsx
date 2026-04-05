interface BatchActionsProps {
  selectedCount: number;
  batchDate: string;
  onBatchDateChange: (date: string) => void;
  onValidateSelected: () => void;
  onApplyDate: () => void;
  onClearSelection: () => void;
  isValidating: boolean;
  isUpdating: boolean;
}

export function BatchActions({
  selectedCount,
  batchDate,
  onBatchDateChange,
  onValidateSelected,
  onApplyDate,
  onClearSelection,
  isValidating,
  isUpdating,
}: BatchActionsProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2.5 bg-[#ecfdf5] border border-tertiary/20 rounded-md px-3.5 py-2">
      <span className="material-symbols-outlined text-[15px] text-tertiary">
        checklist
      </span>
      <span className="text-xs font-medium text-[#065f46]">
        {selectedCount} loads selected
      </span>
      <button
        onClick={onValidateSelected}
        disabled={isValidating}
        className="inline-flex items-center gap-1.5 ml-1 px-3 py-[5px] rounded-md bg-tertiary text-on-tertiary text-xs font-semibold hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-sm">verified</span>
        Validate Selected ({selectedCount})
      </button>
      {/* Smart Date Batch */}
      <div className="flex items-center gap-1.5 ml-2 border-l border-tertiary/20 pl-2.5">
        <span className="material-symbols-outlined text-[13px] text-[#065f46]">
          calendar_month
        </span>
        <input
          type="date"
          value={batchDate}
          onChange={(e) => onBatchDateChange(e.target.value)}
          className="bg-white border border-outline-variant/40 rounded px-2 py-[3px] text-xs font-label text-on-surface focus:outline-none focus:ring-1 focus:ring-tertiary/30"
        />
        <button
          onClick={onApplyDate}
          disabled={!batchDate || isUpdating}
          className="inline-flex items-center gap-1 px-2.5 py-[4px] rounded-md bg-primary text-on-primary text-[10px] font-bold uppercase tracking-wide hover:brightness-110 transition-all cursor-pointer disabled:opacity-40"
        >
          Apply Date
        </button>
      </div>
      <button
        onClick={onClearSelection}
        className="inline-flex items-center gap-1.5 ml-1 px-3 py-[5px] rounded-md border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
      >
        Clear selection
      </button>
    </div>
  );
}
