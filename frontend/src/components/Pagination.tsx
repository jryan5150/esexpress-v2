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
    <div className="flex items-center justify-between px-2 py-3 text-xs text-on-surface/50">
      <span className="font-label">
        {total === 0 ? "No results" : `Showing ${start}-${end} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className="px-2 py-1 rounded hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-sm">
            chevron_left
          </span>
        </button>
        <span className="font-label font-bold text-on-surface/70 min-w-[80px] text-center">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          className="px-2 py-1 rounded hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-sm">
            chevron_right
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-label text-on-surface/30">Per page</span>
        <div className="flex rounded-lg overflow-hidden border border-on-surface/10">
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => onPageSizeChange(size)}
              disabled={loading}
              className={`px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                pageSize === size
                  ? "bg-primary-container/20 text-primary-container"
                  : "text-on-surface/40 hover:bg-surface-container-high"
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
