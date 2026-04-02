import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
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
    <div className="flex min-h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen relative overflow-y-auto">
        <header className="flex justify-between items-center px-8 h-16 w-full sticky top-0 z-40 bg-background/80 backdrop-blur-md shadow-xl shadow-primary-container/5">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-extrabold tracking-tight text-on-surface uppercase">
              ES Express
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-primary-container/10">
              <span className="material-symbols-outlined text-on-surface/40 text-sm">
                cloud_done
              </span>
              <span className="font-label text-xs text-on-surface/40 tracking-wider">
                Connected
              </span>
            </div>
            <span className="material-symbols-outlined text-on-surface/60 hover:text-primary-container cursor-pointer transition-colors">
              notifications
            </span>
            <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center border border-on-surface/10 text-xs font-bold text-primary-container">
              {initials}
            </div>
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
