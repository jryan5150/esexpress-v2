import { Link, useLocation } from "react-router-dom";
import { useCurrentUser, useLogoutFn } from "../hooks/use-auth";
import { usePresence } from "../hooks/use-presence";

export function Sidebar() {
  const location = useLocation();
  const userQuery = useCurrentUser();
  const logout = useLogoutFn();
  const presenceQuery = usePresence();
  const onlineUsers = Array.isArray(presenceQuery.data)
    ? presenceQuery.data
    : [];
  const isActive = (path: string) => location.pathname === path;

  const navClass = (path: string) =>
    isActive(path)
      ? "bg-primary-container/10 text-primary-container border-l-[3px] border-primary-container flex items-center gap-3 px-4 py-2.5 rounded-r-lg transition-all duration-200 font-semibold"
      : "text-on-surface/50 flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-high/50 hover:text-on-surface/80 rounded-r-lg transition-all duration-200";

  return (
    <aside className="hidden md:flex flex-col h-screen w-64 bg-surface-container-low border-r border-on-surface/5 z-50 shrink-0">
      <div className="px-5 pt-7 pb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
            <span
              className="material-symbols-outlined text-on-primary-container text-lg"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              local_shipping
            </span>
          </div>
          <div>
            <h2 className="text-on-surface font-headline font-black text-sm tracking-tight uppercase leading-tight">
              ES Express
            </h2>
            <p className="text-[10px] text-on-surface/30 font-label tracking-widest uppercase">
              Dispatch Command
            </p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        <Link to="/" className={navClass("/")}>
          <span className="material-symbols-outlined">home</span>
          <span className="text-sm font-medium">Today's Objectives</span>
        </Link>
        <Link to="/dispatch-desk" className={navClass("/dispatch-desk")}>
          <span className="material-symbols-outlined">local_shipping</span>
          <span className="text-sm font-medium">Dispatch Desk</span>
        </Link>
        <Link to="/bol" className={navClass("/bol")}>
          <span className="material-symbols-outlined">description</span>
          <span className="text-sm font-medium">BOL Queue</span>
        </Link>
        <div className="pt-5 pb-1.5 px-4">
          <span className="text-[10px] uppercase tracking-[0.15em] text-on-surface/25 font-bold font-label">
            Admin
          </span>
        </div>
        <Link to="/validation" className={navClass("/validation")}>
          <span className="material-symbols-outlined">fact_check</span>
          <span className="text-sm font-medium">Validation</span>
        </Link>
        <Link to="/admin/wells" className={navClass("/admin/wells")}>
          <span className="material-symbols-outlined">oil_barrel</span>
          <span className="text-sm font-medium">Wells</span>
        </Link>
        <Link to="/admin/companies" className={navClass("/admin/companies")}>
          <span className="material-symbols-outlined">business</span>
          <span className="text-sm font-medium">Companies</span>
        </Link>
        <Link to="/admin/users" className={navClass("/admin/users")}>
          <span className="material-symbols-outlined">group</span>
          <span className="text-sm font-medium">Users</span>
        </Link>
        <div className="pt-5 pb-1.5 px-4">
          <span className="text-[10px] uppercase tracking-[0.15em] text-on-surface/25 font-bold font-label">
            Operations
          </span>
        </div>
        <Link to="/finance" className={navClass("/finance")}>
          <span className="material-symbols-outlined">payments</span>
          <span className="text-sm font-medium">Finance</span>
        </Link>
      </nav>
      {/* Live Presence */}
      <div className="px-5 py-5 border-t border-on-surface/5 space-y-3">
        <h4 className="text-[10px] uppercase tracking-[0.15em] text-on-surface/25 font-bold font-label">
          Online ({onlineUsers.length})
        </h4>
        <div className="space-y-2">
          {onlineUsers.length === 0 ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_6px_rgba(13,150,104,0.5)]" />
              <span className="text-xs text-on-surface/80">
                {(userQuery.data as Record<string, unknown>)?.name || "You"}
              </span>
            </div>
          ) : (
            onlineUsers.map((u: any) => (
              <div key={u.userId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_6px_rgba(13,150,104,0.5)]" />
                  <span className="text-xs text-on-surface/80">
                    {u.userName?.split(" ")[0] || "User"}
                  </span>
                </div>
                <span className="font-label text-[10px] text-on-surface/30 truncate max-w-[80px]">
                  {u.wellName ? u.wellName.slice(0, 15) : u.currentPage}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      {/* Footer */}
      <div className="px-3 pb-5 flex flex-col gap-0.5">
        <Link
          to="/settings"
          className="text-on-surface/40 flex items-center gap-3 px-4 py-2 hover:text-on-surface/70 hover:bg-surface-container-high/50 rounded-lg transition-all"
        >
          <span className="material-symbols-outlined text-lg">settings</span>
          <span className="text-xs font-medium">Settings</span>
        </Link>
        <button
          onClick={logout}
          className="text-on-surface/40 flex items-center gap-3 px-4 py-2 hover:text-error/80 hover:bg-error/5 rounded-lg transition-all w-full cursor-pointer"
        >
          <span className="material-symbols-outlined text-lg">logout</span>
          <span className="text-xs font-medium">Log Out</span>
        </button>
      </div>
    </aside>
  );
}
