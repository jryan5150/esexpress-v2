import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCurrentUser, useLogoutFn } from "../hooks/use-auth";
import { usePresence } from "../hooks/use-presence";
import { useBolStats } from "../hooks/use-bol";
import { useWeightUnit } from "../hooks/use-weight-unit";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const COLLAPSE_STORAGE_KEY = "sidebar:collapsed";

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps = {}) {
  const location = useLocation();
  const userQuery = useCurrentUser();
  const logout = useLogoutFn();
  const presenceQuery = usePresence();
  const onlineUsers = Array.isArray(presenceQuery.data)
    ? presenceQuery.data
    : [];
  // BOL queue pending count — surfaces "X photos need matching" so users
  // know to open the queue without burying it in the main app body.
  const bolStatsQuery = useBolStats();
  const bolPending = (() => {
    const stats = bolStatsQuery.data as
      | { byStatus?: Record<string, number> }
      | undefined;
    return Number(stats?.byStatus?.pending ?? 0);
  })();
  const isActive = (path: string) => location.pathname === path;
  const isAdminRoute =
    location.pathname.startsWith("/admin") || location.pathname === "/finance";
  // Reference group: legacy workspace pages + archive surfaces. Top-level
  // nav surfaces Workbench, BOL Center, and Load Report — everything else
  // lives behind this collapsible group so dispatchers see one front door.
  // Missed-Loads-Report moved into Admin group (it's a diagnostic, not a
  // dispatcher workflow) per 2026-04-21 call prep.
  const isReferenceRoute =
    location.pathname === "/" || location.pathname === "/archive";

  // Collapse state — persisted
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  });
  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const [adminOpen, setAdminOpen] = useState(isAdminRoute);
  const [referenceOpen, setReferenceOpen] = useState(isReferenceRoute);

  // Auto-open admin group when navigating into an admin/finance route
  useEffect(() => {
    if (isAdminRoute && !collapsed) setAdminOpen(true);
  }, [isAdminRoute, collapsed]);

  // Auto-open reference group when navigating into one of those pages
  useEffect(() => {
    if (isReferenceRoute && !collapsed) setReferenceOpen(true);
  }, [isReferenceRoute, collapsed]);

  // Close submenus whenever sidebar collapses
  useEffect(() => {
    if (collapsed) {
      setAdminOpen(false);
      setReferenceOpen(false);
    }
  }, [collapsed]);

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobileOpen, onMobileClose]);

  // Nav item classes — adapt for collapsed state
  const navClass = (path: string) => {
    const active = isActive(path);
    const base =
      "flex items-center rounded-md transition-all duration-150 text-[13px] nav-smooth press-scale border-l-2";
    const layout = collapsed
      ? "justify-center px-0 py-2 mx-2"
      : "gap-2.5 px-3.5 py-2 mx-1.5";
    const state = active
      ? "bg-[#ede9f8] text-primary font-semibold border-l-primary"
      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-medium border-l-transparent";
    return `${base} ${layout} ${state}`;
  };

  const iconClass = (path: string) =>
    isActive(path)
      ? "material-symbols-outlined icon-filled text-lg shrink-0"
      : "material-symbols-outlined text-lg shrink-0";

  const handleNavClick = () => {
    onMobileClose?.();
  };

  // When Admin is clicked while collapsed: expand the sidebar AND open submenu.
  const handleAdminClick = () => {
    if (collapsed) {
      setCollapsed(false);
      setAdminOpen(true);
      return;
    }
    setAdminOpen((v) => !v);
  };

  // Same pattern for the Reference group toggle.
  const handleReferenceClick = () => {
    if (collapsed) {
      setCollapsed(false);
      setReferenceOpen(true);
      return;
    }
    setReferenceOpen((v) => !v);
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
        flex flex-col h-screen
        ${collapsed ? "w-[68px] min-w-[68px]" : "w-[228px] min-w-[228px]"}
        bg-surface-container-lowest border-r border-outline-variant/40
        z-[70] md:z-50 shrink-0 overflow-y-auto overflow-x-hidden header-gradient
        transition-[width,min-width,transform] duration-250 ease-out
      `}
      >
        {/* Brand / collapse toggle — full logo expanded, cropped truck collapsed */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`group relative border-b border-outline-variant/30 shadow-[0_1px_3px_rgba(30,27,24,0.04)] flex items-center justify-center cursor-pointer press-scale transition-all duration-200 hover:bg-surface-container-high/40 ${
            collapsed ? "px-2 pt-3 pb-3" : "px-4 pt-3 pb-3"
          }`}
        >
          {collapsed ? (
            // Cropped truck — overflow-hidden wrapper with oversized img
            <span className="relative block w-[52px] h-[30px] rounded-md overflow-hidden ring-1 ring-outline-variant/30 group-hover:ring-primary-container/40 group-hover:shadow-[0_2px_8px_rgba(26,26,174,0.12)] transition-all duration-200">
              <img
                src="/es-express-logo.png"
                alt="ES Express LLC"
                className="absolute max-w-none pointer-events-none select-none transition-transform duration-200 group-hover:scale-[1.06]"
                style={{
                  width: 77,
                  height: 56,
                  left: -13,
                  top: -1,
                }}
              />
            </span>
          ) : (
            <img
              src="/es-express-logo.png"
              alt="ES Express LLC"
              className="h-12 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
            />
          )}
          {/* Direction chevron — corner indicator, appears on hover */}
          <span
            className={`absolute bg-primary-container text-white rounded-full flex items-center justify-center shadow-sm transition-all duration-200 opacity-0 group-hover:opacity-100 ${
              collapsed ? "bottom-1.5 right-1.5" : "bottom-2 right-2"
            }`}
            style={{ width: 16, height: 16 }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 12,
                transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
                transition: "transform 0.2s ease",
              }}
            >
              chevron_right
            </span>
          </span>
        </button>

        {/* Main Nav — Workbench (load-centric) + BOL Queue (photo-centric) */}
        <nav className="flex-1 py-1.5" onClick={handleNavClick}>
          <div className="space-y-px">
            <Link
              to="/workbench"
              className={navClass("/workbench")}
              title="Load Center"
            >
              <span className={iconClass("/workbench")}>build</span>
              {!collapsed && "Load Center"}
            </Link>
            <Link
              to="/bol"
              className={navClass("/bol")}
              title={
                bolPending > 0
                  ? `BOL Center — ${bolPending} photo${bolPending === 1 ? "" : "s"} need matching`
                  : "BOL Center — photo verification, OCR corrections, and PropX ticket audit"
              }
            >
              <span className={iconClass("/bol")}>receipt_long</span>
              {!collapsed && (
                <>
                  <span className="flex-1">BOL Center</span>
                  {bolPending > 0 && (
                    <span className="font-label text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-error/15 text-error">
                      {bolPending.toLocaleString()}
                    </span>
                  )}
                </>
              )}
            </Link>
            <Link
              to="/load-report"
              data-sidebar-load-report
              className={navClass("/load-report")}
              title="Load Report — payroll-friendly truck/date export"
            >
              <span className={iconClass("/load-report")}>summarize</span>
              {!collapsed && "Load Report"}
            </Link>
          </div>

          {/* Reference — collapsible group containing all legacy workspace pages */}
          <div className={`mt-3 ${collapsed ? "mx-0" : ""}`}>
            <button
              type="button"
              onClick={handleReferenceClick}
              aria-expanded={referenceOpen}
              aria-controls="sidebar-reference-submenu"
              title="Reference"
              className={`w-full ${
                isReferenceRoute
                  ? "bg-[#ede9f8] text-primary font-semibold border-l-primary"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-medium border-l-transparent"
              } flex items-center ${
                collapsed
                  ? "justify-center px-0 py-2 mx-2"
                  : "gap-2.5 px-3.5 py-2 mx-1.5"
              } rounded-md transition-all duration-150 text-[13px] nav-smooth press-scale cursor-pointer border-l-2`}
            >
              <span
                className={
                  isReferenceRoute
                    ? "material-symbols-outlined icon-filled text-lg shrink-0"
                    : "material-symbols-outlined text-lg shrink-0"
                }
              >
                folder_open
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Reference</span>
                  <span
                    className="material-symbols-outlined text-base shrink-0 transition-transform duration-200"
                    style={{
                      transform: referenceOpen
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                    }}
                  >
                    chevron_right
                  </span>
                </>
              )}
            </button>
            {referenceOpen && !collapsed && (
              <div
                id="sidebar-reference-submenu"
                className="overflow-hidden animate-slide-down space-y-px"
              >
                <Link
                  to="/"
                  className={`${navClass("/")} !pl-9`}
                  title="Today's Objectives"
                >
                  <span className={iconClass("/")}>home</span>
                  Today's Objectives
                </Link>
                <Link
                  to="/archive"
                  className={`${navClass("/archive")} !pl-9`}
                  title="Archive"
                >
                  <span className={iconClass("/archive")}>inventory_2</span>
                  Archive
                </Link>
              </div>
            )}
          </div>
        </nav>

        {/* Bottom: Presence + Admin + Settings + Logout */}
        <div
          className={`border-t border-outline-variant/40 ${collapsed ? "px-2" : "px-3"} py-2`}
        >
          {/* Presence indicator */}
          {collapsed ? (
            <div
              className="flex items-center justify-center py-1.5"
              title={`Online (${Math.max(onlineUsers.length, 1)})`}
            >
              <span className="w-[9px] h-[9px] rounded-full bg-tertiary shrink-0 shadow-[0_0_8px_rgba(13,150,104,0.5)]" />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-outline">
              <span className="w-[7px] h-[7px] rounded-full bg-tertiary shrink-0 shadow-[0_0_6px_rgba(13,150,104,0.4)]" />
              <span>Online ({Math.max(onlineUsers.length, 1)}) &mdash;</span>
              <span className="font-medium text-on-surface-variant truncate">
                {onlineUsers.length === 0
                  ? (
                      (userQuery.data as Record<string, unknown>)
                        ?.name as string
                    )?.split(" ")[0] || "You"
                  : onlineUsers
                      .map((u: any) => u.userName?.split(" ")[0] || "User")
                      .join(", ")}
              </span>
            </div>
          )}

          {/* Admin — collapsible group (Wells / Companies / Users / Finance) */}
          <button
            type="button"
            onClick={handleAdminClick}
            aria-expanded={adminOpen}
            aria-controls="sidebar-admin-submenu"
            title="Admin"
            className={`w-full ${
              isAdminRoute
                ? "bg-[#ede9f8] text-primary font-semibold border-l-primary"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-medium border-l-transparent"
            } flex items-center ${
              collapsed
                ? "justify-center px-0 py-2 mx-0"
                : "gap-2.5 px-3.5 py-2 mx-1.5"
            } rounded-md transition-all duration-150 text-[13px] nav-smooth press-scale cursor-pointer border-l-2`}
          >
            <span
              className={
                isAdminRoute
                  ? "material-symbols-outlined icon-filled text-lg shrink-0"
                  : "material-symbols-outlined text-lg shrink-0"
              }
            >
              admin_panel_settings
            </span>
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Admin</span>
                <span
                  className="material-symbols-outlined text-base shrink-0 transition-transform duration-200"
                  style={{
                    transform: adminOpen ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                >
                  chevron_right
                </span>
              </>
            )}
          </button>
          {adminOpen && !collapsed && (
            <div
              id="sidebar-admin-submenu"
              className="overflow-hidden animate-slide-down"
            >
              <Link
                to="/admin/wells"
                className={`${navClass("/admin/wells")} !pl-9`}
              >
                <span className={iconClass("/admin/wells")}>oil_barrel</span>
                Wells
              </Link>
              <Link
                to="/admin/users"
                className={`${navClass("/admin/users")} !pl-9`}
              >
                <span className={iconClass("/admin/users")}>group</span>
                Users
              </Link>
              <Link to="/finance" className={`${navClass("/finance")} !pl-9`}>
                <span className={iconClass("/finance")}>payments</span>
                Finance
              </Link>
              <Link
                to="/admin/missed-loads"
                className={`${navClass("/admin/missed-loads")} !pl-9`}
                title="Diagnostic load report — loads that may have been missed by the pipeline."
              >
                <span className={iconClass("/admin/missed-loads")}>
                  fact_check
                </span>
                Load Diagnostics
              </Link>
            </div>
          )}

          <WeightUnitToggle collapsed={collapsed} />

          <Link
            to="/settings"
            className={navClass("/settings")}
            title="Settings"
          >
            <span className={iconClass("/settings")}>settings</span>
            {!collapsed && "Settings"}
          </Link>
          <button
            onClick={logout}
            title="Log Out"
            className={`w-full text-on-surface-variant flex items-center ${
              collapsed
                ? "justify-center px-0 py-2 mx-0"
                : "gap-2.5 px-3.5 py-2 mx-1.5"
            } rounded-md hover:bg-error/5 hover:text-error transition-all duration-150 text-[13px] font-medium cursor-pointer press-scale border-l-2 border-l-transparent`}
          >
            <span className="material-symbols-outlined text-lg shrink-0">
              logout
            </span>
            {!collapsed && "Log Out"}
          </button>
        </div>
      </aside>
    </>
  );
}

/**
 * Compact lbs ↔ tons segmented toggle in the sidebar footer. Writes to
 * localStorage via the shared useWeightUnit hook so every weight display
 * sitewide flips in sync (workbench rows, drawer, BOL Center, LoadReport,
 * CSV export).
 */
function WeightUnitToggle({ collapsed }: { collapsed: boolean }) {
  const { unit, setUnit } = useWeightUnit();
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setUnit(unit === "tons" ? "lbs" : "tons")}
        title={`Units: ${unit} — click to toggle`}
        className="w-full text-on-surface-variant flex items-center justify-center px-0 py-2 rounded-md hover:bg-surface-container-high/60 transition-all text-[11px] font-bold tabular-nums"
      >
        {unit === "tons" ? "t" : "lb"}
      </button>
    );
  }
  return (
    <div className="px-3.5 py-1.5">
      <div
        className="flex items-center gap-1 bg-surface-container-high rounded-md p-0.5 border border-outline-variant/30"
        role="group"
        aria-label="Weight unit"
      >
        <span className="text-[9px] font-semibold uppercase tracking-wider text-outline px-1.5">
          Units
        </span>
        {(["tons", "lbs"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            className={`flex-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded transition-all ${
              unit === u
                ? "bg-primary-container text-on-primary-container shadow-sm"
                : "text-outline hover:text-on-surface"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}
