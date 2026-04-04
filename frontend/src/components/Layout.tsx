import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { FeedbackWidget } from "./FeedbackWidget";
import { useCurrentUser } from "../hooks/use-auth";

export function Layout() {
  const userQuery = useCurrentUser();
  const userName =
    ((userQuery.data as Record<string, unknown>)?.name as string) || "";
  const initials = userName
    ? userName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen min-w-0">
        <header className="flex justify-end items-center px-8 h-14 w-full shrink-0 z-40 bg-background/80 backdrop-blur-md border-b border-outline-variant/30 shadow-[0_1px_2px_rgba(30,27,24,0.03)]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-container-low/50 shadow-[0_0_0_1px_rgba(13,150,104,0.1)]">
              <span className="material-symbols-outlined text-tertiary text-sm">
                cloud_done
              </span>
              <span className="font-label text-[10px] text-on-surface/30 tracking-wider uppercase">
                Live
              </span>
            </div>
            <button
              aria-label="Notifications"
              className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer text-on-surface/40 hover:text-on-surface/70 icon-hover"
            >
              <span className="material-symbols-outlined text-xl">
                notifications
              </span>
            </button>
            <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center border border-on-surface/10 text-[11px] font-bold font-headline text-primary-container shadow-sm">
              {initials}
            </div>
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <FeedbackWidget />
    </div>
  );
}
