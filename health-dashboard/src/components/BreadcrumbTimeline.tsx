import type { FeedbackBreadcrumb } from "../lib/api";

interface BreadcrumbTimelineProps {
  breadcrumbs: FeedbackBreadcrumb[];
}

const iconMap: Record<string, string> = {
  navigation: "arrow_forward",
  click: "touch_app",
  scroll: "swap_vert",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function BreadcrumbTimeline({ breadcrumbs }: BreadcrumbTimelineProps) {
  if (!breadcrumbs.length) {
    return (
      <p className="text-sm text-on-surface-variant">
        No breadcrumbs recorded.
      </p>
    );
  }

  return (
    <div className="relative pl-6">
      {/* vertical line */}
      <div className="absolute left-[11px] top-1 bottom-1 w-px bg-surface-container-highest" />

      <ul className="space-y-3">
        {breadcrumbs.map((b, i) => (
          <li key={i} className="relative flex items-start gap-3">
            {/* dot on line */}
            <span className="absolute -left-6 top-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-surface-container-high">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                {iconMap[b.type] ?? "circle"}
              </span>
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-on-surface">{b.label}</p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant">
                <span className="font-label">{formatTime(b.timestamp)}</span>
                {b.url && (
                  <span className="truncate font-label opacity-60">
                    {b.url}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
