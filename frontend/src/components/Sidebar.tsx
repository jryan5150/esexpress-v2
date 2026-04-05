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
      ? "bg-[#ede9f8] text-primary font-semibold flex items-center gap-2.5 px-3.5 py-2 mx-1.5 rounded-md transition-all duration-150 text-[13px] nav-smooth press-scale"
      : "text-on-surface-variant flex items-center gap-2.5 px-3.5 py-2 mx-1.5 rounded-md hover:bg-surface-container-high hover:text-on-surface transition-all duration-150 text-[13px] font-medium nav-smooth press-scale";

  return (
    <aside className="hidden md:flex flex-col h-screen w-[228px] min-w-[228px] bg-surface-container-lowest border-r border-outline-variant/40 z-50 shrink-0 overflow-y-auto overflow-x-hidden header-gradient">
      {/* Logo */}
      <div className="px-4 pt-[18px] pb-3.5 border-b border-outline-variant/30 shadow-[0_1px_3px_rgba(30,27,24,0.04)] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 p-1">
          <img
            src="/trailer-icon.svg"
            alt=""
            className="w-full h-full"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </div>
        <div>
          <h2 className="font-headline font-extrabold text-sm text-on-surface leading-tight">
            ES Express
          </h2>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 py-2.5">
        <div className="space-y-px">
          <Link to="/" className={navClass("/")}>
            <span className="material-symbols-outlined text-lg shrink-0">
              home
            </span>
            Today's Objectives
          </Link>
          <Link to="/dispatch-desk" className={navClass("/dispatch-desk")}>
            <span className="material-symbols-outlined text-lg shrink-0">
              dashboard
            </span>
            Dispatch Desk
          </Link>
          <Link to="/bol" className={navClass("/bol")}>
            <span className="material-symbols-outlined text-lg shrink-0">
              receipt_long
            </span>
            BOL Queue
          </Link>
        </div>

        <div className="mt-3">
          <div className="px-3.5 mx-1.5 py-1.5">
            <span className="text-[10px] font-semibold text-outline tracking-[0.1em] uppercase">
              Admin
            </span>
          </div>
          <div className="space-y-px">
            <Link to="/validation" className={navClass("/validation")}>
              <span className="material-symbols-outlined text-lg shrink-0">
                rule
              </span>
              Validation
            </Link>
            <Link to="/admin/wells" className={navClass("/admin/wells")}>
              <span className="material-symbols-outlined text-lg shrink-0">
                oil_barrel
              </span>
              Wells
            </Link>
            <Link
              to="/admin/companies"
              className={navClass("/admin/companies")}
            >
              <span className="material-symbols-outlined text-lg shrink-0">
                business
              </span>
              Companies
            </Link>
            <Link to="/admin/users" className={navClass("/admin/users")}>
              <span className="material-symbols-outlined text-lg shrink-0">
                group
              </span>
              Users
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <div className="px-3.5 mx-1.5 py-1.5">
            <span className="text-[10px] font-semibold text-outline tracking-[0.1em] uppercase">
              Operations
            </span>
          </div>
          <div className="space-y-px">
            <Link to="/finance" className={navClass("/finance")}>
              <span className="material-symbols-outlined text-lg shrink-0">
                payments
              </span>
              Finance
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-outline/60">
            Reference
          </div>
          <Link
            to="/archive"
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
              isActive("/archive")
                ? "bg-[#ede9f8] text-primary font-semibold"
                : "text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface-variant"
            }`}
          >
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
            >
              inventory_2
            </span>
            Archive
          </Link>
        </div>
      </nav>
      {/* Bottom: Presence + Settings + Logout */}
      <div className="border-t border-outline-variant/40 px-3 py-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-outline">
          <span className="w-[7px] h-[7px] rounded-full bg-tertiary shrink-0 shadow-[0_0_6px_rgba(13,150,104,0.4)]" />
          <span>Online ({Math.max(onlineUsers.length, 1)}) &mdash;</span>
          <span className="font-medium text-on-surface-variant">
            {onlineUsers.length === 0
              ? (
                  (userQuery.data as Record<string, unknown>)?.name as string
                )?.split(" ")[0] || "You"
              : onlineUsers
                  .map((u: any) => u.userName?.split(" ")[0] || "User")
                  .join(", ")}
          </span>
        </div>
        <Link to="/settings" className={navClass("/settings")}>
          <span className="material-symbols-outlined text-lg shrink-0">
            settings
          </span>
          Settings
        </Link>
        <button
          onClick={logout}
          className="w-full text-on-surface-variant flex items-center gap-2.5 px-3.5 py-2 mx-1.5 rounded-md hover:bg-error/5 hover:text-error transition-all duration-150 text-[13px] font-medium cursor-pointer press-scale"
        >
          <span className="material-symbols-outlined text-lg shrink-0">
            logout
          </span>
          Log Out
        </button>
      </div>
    </aside>
  );
}
