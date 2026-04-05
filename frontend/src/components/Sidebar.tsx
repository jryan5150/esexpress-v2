import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCurrentUser, useLogoutFn } from "../hooks/use-auth";
import { usePresence } from "../hooks/use-presence";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps = {}) {
  const location = useLocation();
  const userQuery = useCurrentUser();
  const logout = useLogoutFn();
  const presenceQuery = usePresence();
  const onlineUsers = Array.isArray(presenceQuery.data)
    ? presenceQuery.data
    : [];
  const isActive = (path: string) => location.pathname === path;

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobileOpen, onMobileClose]);

  const navClass = (path: string) =>
    isActive(path)
      ? "bg-[#ede9f8] text-primary font-semibold flex items-center gap-2.5 px-3.5 py-2 mx-1.5 rounded-md transition-all duration-150 text-[13px] nav-smooth press-scale border-l-2 border-l-primary"
      : "text-on-surface-variant flex items-center gap-2.5 px-3.5 py-2 mx-1.5 rounded-md hover:bg-surface-container-high hover:text-on-surface transition-all duration-150 text-[13px] font-medium nav-smooth press-scale border-l-2 border-l-transparent";

  const iconClass = (path: string) =>
    isActive(path)
      ? "material-symbols-outlined icon-filled text-lg shrink-0"
      : "material-symbols-outlined text-lg shrink-0";

  const handleNavClick = () => {
    onMobileClose?.();
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] md:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={`
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0 fixed md:relative
        flex flex-col h-screen w-[228px] min-w-[228px]
        bg-surface-container-lowest border-r border-outline-variant/40
        z-[70] md:z-50 shrink-0 overflow-y-auto overflow-x-hidden header-gradient
        transition-transform duration-200 ease-out
      `}
      >
        {/* Logo */}
        <div className="px-4 pt-[18px] pb-3.5 border-b border-outline-variant/30 shadow-[0_1px_3px_rgba(30,27,24,0.04)] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 p-1">
            <img
              src="/dispatch-icon.svg"
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
        <nav className="flex-1 py-2.5" onClick={handleNavClick}>
          <div className="space-y-px">
            <Link to="/" className={navClass("/")}>
              <span className={iconClass("/")}>home</span>
              Today's Objectives
            </Link>
            <Link to="/dispatch-desk" className={navClass("/dispatch-desk")}>
              <span className={iconClass("/dispatch-desk")}>dashboard</span>
              Dispatch Desk
            </Link>
            <Link to="/bol" className={navClass("/bol")}>
              <span className={iconClass("/bol")}>receipt_long</span>
              BOL Queue
            </Link>
            <Link to="/validation" className={navClass("/validation")}>
              <span className={iconClass("/validation")}>rule</span>
              Validation
            </Link>
          </div>

          <div className="mt-3 pt-2 border-t border-outline-variant/25 mx-3">
            <div className="px-2 py-1.5">
              <span className="text-[9px] font-label font-bold text-outline/60 tracking-[0.15em] uppercase">
                Admin
              </span>
            </div>
            <div className="space-y-px">
              <Link to="/admin/wells" className={navClass("/admin/wells")}>
                <span className={iconClass("/admin/wells")}>oil_barrel</span>
                Wells
              </Link>
              <Link
                to="/admin/companies"
                className={navClass("/admin/companies")}
              >
                <span className={iconClass("/admin/companies")}>business</span>
                Companies
              </Link>
              <Link to="/admin/users" className={navClass("/admin/users")}>
                <span className={iconClass("/admin/users")}>group</span>
                Users
              </Link>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-outline-variant/25 mx-3">
            <div className="px-2 py-1.5">
              <span className="text-[9px] font-label font-bold text-outline/60 tracking-[0.15em] uppercase">
                Operations
              </span>
            </div>
            <div className="space-y-px">
              <Link to="/finance" className={navClass("/finance")}>
                <span className={iconClass("/finance")}>payments</span>
                Finance
              </Link>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-outline-variant/25 mx-3">
            <div className="px-2 py-1.5">
              <span className="text-[9px] font-label font-bold text-outline/60 tracking-[0.15em] uppercase">
                Reference
              </span>
            </div>
            <div className="space-y-px">
              <Link to="/archive" className={navClass("/archive")}>
                <span className={iconClass("/archive")}>inventory_2</span>
                Archive
              </Link>
            </div>
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
            <span className={iconClass("/settings")}>settings</span>
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
    </>
  );
}
