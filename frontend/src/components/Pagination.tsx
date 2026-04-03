const PAGE_SIZES = [25, 50, 100] as const;

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  loading = false,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-2 py-4 text-xs text-on-surface/40">
      <span className="font-label text-on-surface/30">
        {total === 0 ? "No results" : `${start}--${end} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          aria-label="Previous page"
          className="p-1.5 rounded-lg hover:bg-surface-container-high disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-base">
            chevron_left
          </span>
        </button>
        <span className="font-label font-bold text-on-surface/50 min-w-[80px] text-center text-xs">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          aria-label="Next page"
          className="p-1.5 rounded-lg hover:bg-surface-container-high disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-base">
            chevron_right
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-label text-on-surface/20 text-[10px] uppercase tracking-wider">
          Rows
        </span>
        <div className="flex gap-0.5 rounded-lg bg-surface-container-high/50 p-0.5">
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => onPageSizeChange(size)}
              disabled={loading}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                pageSize === size
                  ? "bg-primary-container/15 text-primary-container shadow-sm"
                  : "text-on-surface/30 hover:text-on-surface/50"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
