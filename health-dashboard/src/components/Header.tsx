import { StatusDot } from "./StatusDot";

interface HeaderProps {
  status: "green" | "yellow" | "red" | null;
  lastRefresh: string | null;
}

function formatRefresh(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Header({ status, lastRefresh }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-container-highest bg-surface-container-low px-4 md:px-6">
      <div className="flex items-center gap-3">
        <h1 className="font-headline text-base font-bold text-on-surface">
          EsExpress Health
        </h1>
        {status && <StatusDot status={status} size="md" />}
      </div>

      {lastRefresh && (
        <span className="font-label text-xs text-on-surface-variant">
          Updated {formatRefresh(lastRefresh)}
        </span>
      )}
    </header>
  );
}
