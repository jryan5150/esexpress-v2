import { Link, useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/use-auth";

export function Sidebar() {
  const location = useLocation();
  const userQuery = useCurrentUser();
  const isActive = (path: string) => location.pathname === path;

  const navClass = (path: string) =>
    isActive(path)
      ? "bg-surface-container-high text-primary-container border-l-4 border-primary-container flex items-center gap-3 px-4 py-3 transition-all duration-200"
      : "text-on-surface/70 flex items-center gap-3 px-4 py-3 hover:bg-surface-container hover:text-on-surface transition-all duration-200";

  return (
    <aside className="hidden md:flex flex-col h-screen w-64 bg-surface-container-low border-r border-transparent z-50 shrink-0">
      <div className="px-6 py-8 flex flex-col gap-1">
        <h2 className="text-primary-container font-black text-xl tracking-tighter uppercase">
          Dispatch Command
        </h2>
        <p className="text-xs text-on-surface/50 font-medium">
          Terminal 04 - Active
        </p>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        <Link to="/" className={navClass("/")}>
          <span className="material-symbols-outlined">priority_high</span>
          <span className="text-sm font-medium">Exception Feed</span>
        </Link>
        <Link to="/bol" className={navClass("/bol")}>
          <span className="material-symbols-outlined">description</span>
          <span className="text-sm font-medium">BOL Queue</span>
        </Link>
        <Link to="/dispatch-desk" className={navClass("/dispatch-desk")}>
          <span className="material-symbols-outlined">local_shipping</span>
          <span className="text-sm font-medium">Dispatch Desk</span>
        </Link>
        <Link to="/validation" className={navClass("/validation")}>
          <span className="material-symbols-outlined">fact_check</span>
          <span className="text-sm font-medium">Validation</span>
        </Link>
        <div className="pt-6 pb-2 px-4">
          <span className="text-[10px] uppercase tracking-widest text-on-surface/40 font-bold">
            Administration
          </span>
        </div>
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
        <div className="pt-6 pb-2 px-4">
          <span className="text-[10px] uppercase tracking-widest text-on-surface/40 font-bold">
            Operations
          </span>
        </div>
        <Link to="/finance" className={navClass("/finance")}>
          <span className="material-symbols-outlined">payments</span>
          <span className="text-sm font-medium">Finance</span>
        </Link>
      </nav>
      {/* Current User */}
      <div className="px-6 py-6 border-t border-surface-container space-y-4">
        <h4 className="text-[10px] uppercase tracking-widest text-on-surface/40 font-bold">
          Online
        </h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_6px_rgba(69,223,164,0.5)]" />
              <span className="text-xs text-on-surface/80">
                {(userQuery.data as Record<string, unknown>)?.name || "You"}
              </span>
            </div>
            <span className="font-label text-[10px] text-tertiary">now</span>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className="px-3 pb-6 flex flex-col gap-1">
        <Link
          to="/settings"
          className="text-on-surface/50 flex items-center gap-3 px-4 py-2 hover:text-primary-container transition-colors"
        >
          <span className="material-symbols-outlined text-lg">settings</span>
          <span className="text-xs font-medium">Settings</span>
        </Link>
        <a
          className="text-on-surface/50 flex items-center gap-3 px-4 py-2 hover:text-primary-container transition-colors"
          href="#"
        >
          <span className="material-symbols-outlined text-lg">help</span>
          <span className="text-xs font-medium">Support</span>
        </a>
      </div>
    </aside>
  );
}
