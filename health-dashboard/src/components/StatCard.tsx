interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: "up" | "down";
}

export function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <div className="rounded-xl bg-surface-container p-5 transition-colors hover:bg-surface-container-high">
      <div className="mb-3 flex items-center justify-between">
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
          {icon}
        </span>
        {trend && (
          <span
            className={`material-symbols-outlined text-[18px] ${
              trend === "up" ? "text-tertiary" : "text-error"
            }`}
          >
            {trend === "up" ? "trending_up" : "trending_down"}
          </span>
        )}
      </div>
      <p className="font-label text-xs tracking-wide text-on-surface-variant uppercase">
        {label}
      </p>
      <p className="mt-1 font-headline text-2xl font-bold text-on-surface">
        {value}
      </p>
    </div>
  );
}
