import { useState, type ReactNode } from "react";
import { Button } from "./Button";

type GroupStatus = "ready" | "review" | "missing";

interface ExceptionGroupProps {
  status: GroupStatus;
  count: number;
  label: string;
  detail?: string;
  defaultExpanded?: boolean;
  bulkAction?: { label: string; icon?: string; onClick: () => void };
  children: ReactNode;
}

const groupConfig: Record<
  GroupStatus,
  { border: string; icon: string; iconCls: string; badgeCls: string }
> = {
  ready: {
    border: "border-tertiary",
    icon: "check_circle",
    iconCls: "text-tertiary",
    badgeCls: "bg-tertiary/10 text-tertiary",
  },
  review: {
    border: "border-primary-container",
    icon: "warning",
    iconCls: "text-primary-container",
    badgeCls: "bg-primary-container/10 text-primary-container",
  },
  missing: {
    border: "border-error",
    icon: "cancel",
    iconCls: "text-error",
    badgeCls: "bg-error/10 text-error",
  },
};

export function ExceptionGroup({
  status,
  count,
  label,
  detail,
  defaultExpanded,
  bulkAction,
  children,
}: ExceptionGroupProps) {
  const [expanded, setExpanded] = useState(
    defaultExpanded ?? status !== "ready",
  );
  const cfg = groupConfig[status];

  return (
    <section
      className={`bg-surface-container-low border-l-4 ${cfg.border} rounded-xl shadow-lg overflow-hidden transition-all duration-300 mb-4`}
    >
      <div
        className="p-5 flex items-center justify-between cursor-pointer hover:bg-surface-container-high/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span
            className="material-symbols-outlined text-sm text-on-surface-variant"
            style={{
              transform: expanded ? "rotate(0)" : "rotate(-90deg)",
              transition: "transform 200ms",
            }}
          >
            expand_more
          </span>
          <span
            className={`material-symbols-outlined ${cfg.iconCls}`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {cfg.icon}
          </span>
          <h3 className="font-headline font-bold text-on-surface">
            {count} {label}
          </h3>
          {detail && (
            <span
              className={`font-label text-[10px] ${cfg.badgeCls} px-2.5 py-0.5 rounded-full uppercase font-bold tracking-wider`}
            >
              {detail}
            </span>
          )}
        </div>
        {bulkAction && (
          <Button
            variant="secondary"
            icon={bulkAction.icon}
            onClick={(e) => {
              e.stopPropagation();
              bulkAction.onClick();
            }}
          >
            {bulkAction.label}
          </Button>
        )}
      </div>
      {expanded && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}
