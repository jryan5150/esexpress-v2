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
  // Reference group: legacy workspace pages + archive surfaces + wells
  // registry + Load Center. Top-level nav surfaces BOL Center and Load
  // Report — everything else lives behind this collapsible group so
  // dispatchers see one front door. Wells lives here (not Admin) because
  // the team needs frequent access for alias/rate maintenance. Load
  // Center listed here so navigating to /load-center keeps the group
  // open instead of collapsing it underneath the user.
  const isReferenceRoute =
    location.pathname === "/exceptions" ||
    location.pathname === "/archive" ||
    location.pathname === "/load-center" ||
    location.pathname === "/admin/wells";

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

        {/* Main Nav — Load Center is the unified Worksurface (Wave 1,
            2026-04-26). The previous "Validate → Load Center → BOL Center"
            sequence collapsed when the Validation surface was absorbed into
            the Worksurface drawer + Inbox. /validation now redirects to
            /workbench. */}
        <nav className="flex-1 py-1.5" onClick={handleNavClick}>
          <div className="space-y-px">
            <Link
              to="/workbench"
              className={navClass("/workbench")}
              title="Today — builder matrix + well grid (painted colors). Click any cell to open the load drawer."
            >
              <span className={iconClass("/workbench")}>today</span>
              {!collapsed && "Today"}
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
            <Link
              to="/whats-new"
              className={navClass("/whats-new")}
              title="What's New — guided tour of this week's changes"
            >
              <span className={iconClass("/whats-new")}>auto_awesome</span>
              {!collapsed && "What's New"}
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
                  to="/exceptions"
                  className={`${navClass("/exceptions")} !pl-9`}
                  title="Exception feed (legacy Today's Objectives) — gap-list view across all loads"
                >
                  <span className={iconClass("/exceptions")}>home</span>
                  Exception Feed
                </Link>
                <Link
                  to="/load-center"
                  className={`${navClass("/load-center")} !pl-9`}
                  title="Load Center — searchable load list + single-load editable workspace"
                >
                  <span className={iconClass("/load-center")}>
                    local_shipping
                  </span>
                  Load Center
                </Link>
                <Link
                  to="/admin/wells"
                  className={`${navClass("/admin/wells")} !pl-9`}
                  title="Wells registry — manage well names, aliases, and daily targets."
                >
                  <span className={iconClass("/admin/wells")}>oil_barrel</span>
                  Wells
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
                  ? (userQuery.data?.name?.split(" ")[0] ?? "You")
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
                to="/admin/overview"
                className={`${navClass("/admin/overview")} !pl-9`}
                title="Admin Overview — all five reconciliation surfaces (Sheet Truth, PCS Truth, Discrepancies, Order of Invoicing, Sheet Status) in one consolidated view."
              >
                <span className={iconClass("/admin/overview")}>dashboard</span>
                Overview
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
              <Link
                to="/admin/scope-discovery"
                className={`${navClass("/admin/scope-discovery")} !pl-9`}
                title="Review queue — wells v2 doesn't know about yet (historical flywheel + PCS reconciliation)."
              >
                <span className={iconClass("/admin/scope-discovery")}>
                  travel_explore
                </span>
                Scope Discovery
              </Link>
              <Link
                to="/admin/discrepancies"
                className={`${navClass("/admin/discrepancies")} !pl-9`}
                title="What PCS sees vs what v2 sees — every 15 min the system surfaces where the two disagree."
              >
                <span className={iconClass("/admin/discrepancies")}>
                  compare_arrows
                </span>
                What PCS Sees
              </Link>
              <Link
                to="/admin/sheet-truth"
                className={`${navClass("/admin/sheet-truth")} !pl-9`}
                title="Your Load Count Sheet, side-by-side with v2's count for the same week — the parity check Jenny does on Fridays, automated."
              >
                <span className={iconClass("/admin/sheet-truth")}>
                  fact_check
                </span>
                Sheet Truth
              </Link>
              <Link
                to="/admin/pcs-truth"
                className={`${navClass("/admin/pcs-truth")} !pl-9`}
                title="v2's Q1 2026 capture rate against PCS — the system that pays everyone. 97.8%."
              >
                <span className={iconClass("/admin/pcs-truth")}>verified</span>
                PCS Truth
              </Link>
              <Link
                to="/admin/builder-matrix"
                className={`${navClass("/admin/builder-matrix")} !pl-9`}
                title="Order of Invoicing — Bill To x Builder daily counts. The matrix Jess builds by hand on Friday, automated."
              >
                <span className={iconClass("/admin/builder-matrix")}>
                  groups
                </span>
                Order of Invoicing
              </Link>
              <Link
                to="/admin/jenny-queue"
                className={`${navClass("/admin/jenny-queue")} !pl-9`}
                title="Jenny's Queue — non-standard work (Truck Pushers, Equipment Moves, Frac Chem, Finoric, etc.) that doesn't fit the well-day grid."
              >
                <span className={iconClass("/admin/jenny-queue")}>
                  inventory_2
                </span>
                Jenny's Queue
              </Link>
              <Link
                to="/admin/sheet-status"
                className={`${navClass("/admin/sheet-status")} !pl-9`}
                title="Sheet Status — v2 reads the workflow status the team paints into cell colors on the Load Count Sheet. Same hex, same labels."
              >
                <span className={iconClass("/admin/sheet-status")}>
                  palette
                </span>
                Sheet Status
              </Link>
              <Link
                to="/admin/aliases"
                className={`${navClass("/admin/aliases")} !pl-9`}
                title="Aliases — sheet uses freeform spellings (Liberty/Liberty(FSC)/LIberty). Map them to canonical customers and wells so reconciliation lines up."
              >
                <span className={iconClass("/admin/aliases")}>label</span>
                Aliases
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
