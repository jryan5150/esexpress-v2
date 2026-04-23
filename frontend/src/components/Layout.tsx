import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { FeedbackWidget } from "./FeedbackWidget";
import { SystemStatusCluster } from "./SystemStatusCluster";
import { useCurrentUser } from "../hooks/use-auth";
import { SearchOverlay } from "../search/SearchOverlay";

export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userQuery = useCurrentUser();
  const userName = userQuery.data?.name ?? "";
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
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <div className="flex-1 flex flex-col h-screen min-w-0">
        <header className="flex justify-between items-center px-4 md:px-8 h-14 w-full shrink-0 z-40 bg-background/80 backdrop-blur-md border-b border-outline-variant/30 shadow-[0_1px_2px_rgba(30,27,24,0.03)]">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-1.5 rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer text-on-surface/60"
            aria-label="Open menu"
          >
            <span className="material-symbols-outlined text-xl">menu</span>
          </button>
          <div className="flex items-center gap-4 ml-auto">
            <SystemStatusCluster />
            <button
              aria-label="Notifications"
              className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer text-on-surface-variant hover:text-on-surface icon-hover"
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
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Outlet />
        </main>
      </div>
      {/* FeedbackWidget hidden for Jessica demo 2026-04-15 — re-enable after call.
          Breadcrumb collector still runs in the background (breadcrumb-client.ts). */}
      {false && <FeedbackWidget />}
      <SearchOverlay />
    </div>
  );
}
