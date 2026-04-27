import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  Navigate,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { ToastProvider } from "./components/Toast";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BreadcrumbProvider } from "./breadcrumbs/BreadcrumbProvider";

const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login })),
);
const MagicLinkLanding = lazy(() =>
  import("./pages/MagicLinkLanding").then((m) => ({
    default: m.MagicLinkLanding,
  })),
);
const MaintenanceMode = lazy(() =>
  import("./pages/MaintenanceMode").then((m) => ({
    default: m.MaintenanceMode,
  })),
);
const Workbench = lazy(() =>
  import("./pages/Workbench").then((m) => ({ default: m.Workbench })),
);
const ExceptionFeed = lazy(() =>
  import("./pages/ExceptionFeed").then((m) => ({ default: m.ExceptionFeed })),
);
const DispatchDesk = lazy(() =>
  import("./pages/DispatchDesk").then((m) => ({ default: m.DispatchDesk })),
);
const BolQueue = lazy(() =>
  import("./pages/BolQueue").then((m) => ({ default: m.BolQueue })),
);
const Finance = lazy(() =>
  import("./pages/Finance").then((m) => ({ default: m.Finance })),
);
const WellWorkspace = lazy(() =>
  import("./pages/WellWorkspace").then((m) => ({ default: m.WellWorkspace })),
);
const WellsAdmin = lazy(() =>
  import("./pages/admin/WellsAdmin").then((m) => ({ default: m.WellsAdmin })),
);
const CompaniesAdmin = lazy(() =>
  import("./pages/admin/CompaniesAdmin").then((m) => ({
    default: m.CompaniesAdmin,
  })),
);
const UsersAdmin = lazy(() =>
  import("./pages/admin/UsersAdmin").then((m) => ({
    default: m.UsersAdmin,
  })),
);
const MissedLoadsReport = lazy(() =>
  import("./pages/admin/MissedLoadsReport").then((m) => ({
    default: m.MissedLoadsReport,
  })),
);
const ScopeDiscovery = lazy(() =>
  import("./pages/admin/ScopeDiscovery").then((m) => ({
    default: m.ScopeDiscovery,
  })),
);
const Discrepancies = lazy(() =>
  import("./pages/admin/Discrepancies").then((m) => ({
    default: m.Discrepancies,
  })),
);
const SheetTruth = lazy(() =>
  import("./pages/admin/SheetTruth").then((m) => ({
    default: m.SheetTruth,
  })),
);
const PcsTruth = lazy(() =>
  import("./pages/admin/PcsTruth").then((m) => ({
    default: m.PcsTruth,
  })),
);
const BuilderMatrix = lazy(() =>
  import("./pages/admin/BuilderMatrix").then((m) => ({
    default: m.BuilderMatrix,
  })),
);
const JennyQueue = lazy(() =>
  import("./pages/admin/JennyQueue").then((m) => ({
    default: m.JennyQueue,
  })),
);
const SheetStatus = lazy(() =>
  import("./pages/admin/SheetStatus").then((m) => ({
    default: m.SheetStatus,
  })),
);
const Aliases = lazy(() =>
  import("./pages/admin/Aliases").then((m) => ({
    default: m.Aliases,
  })),
);
const LoadCenter = lazy(() =>
  import("./pages/LoadCenter").then((m) => ({
    default: m.LoadCenter,
  })),
);
const LoadReport = lazy(() =>
  import("./pages/LoadReport").then((m) => ({ default: m.LoadReport })),
);
const Settings = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.Settings })),
);
const ArchiveSearch = lazy(() =>
  import("./archive/pages/ArchiveSearch").then((m) => ({
    default: m.ArchiveSearch,
  })),
);
const ArchiveLoadDetail = lazy(() =>
  import("./archive/pages/ArchiveLoadDetail").then((m) => ({
    default: m.ArchiveLoadDetail,
  })),
);
const WhatsNew = lazy(() =>
  import("./pages/WhatsNew").then((m) => ({ default: m.WhatsNew })),
);

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <BreadcrumbProvider />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/magic-link" element={<MagicLinkLanding />} />
              <Route path="/maintenance" element={<MaintenanceMode />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<ExceptionFeed />} />
                  <Route path="workbench" element={<Workbench />} />
                  <Route path="bol" element={<BolQueue />} />
                  <Route
                    path="dispatch-desk"
                    element={<Navigate to="/workbench" replace />}
                  />
                  {/* /validation now redirects to /workbench. Wave 1 of the
                      unified Worksurface (2026-04-26) absorbs the Validation
                      page into the Worksurface drawer + Inbox. The standalone
                      Validation page is deprecated; redirect preserves any
                      bookmarks. */}
                  <Route
                    path="validation"
                    element={<Navigate to="/workbench" replace />}
                  />
                  <Route path="finance" element={<Finance />} />
                  <Route path="wells/:wellId" element={<WellWorkspace />} />
                  <Route path="admin/wells" element={<WellsAdmin />} />
                  <Route path="admin/companies" element={<CompaniesAdmin />} />
                  <Route path="admin/users" element={<UsersAdmin />} />
                  <Route
                    path="admin/missed-loads"
                    element={<MissedLoadsReport />}
                  />
                  <Route
                    path="admin/scope-discovery"
                    element={<ScopeDiscovery />}
                  />
                  <Route
                    path="admin/discrepancies"
                    element={<Discrepancies />}
                  />
                  <Route path="admin/sheet-truth" element={<SheetTruth />} />
                  <Route path="admin/pcs-truth" element={<PcsTruth />} />
                  <Route
                    path="admin/builder-matrix"
                    element={<BuilderMatrix />}
                  />
                  <Route path="admin/jenny-queue" element={<JennyQueue />} />
                  <Route path="admin/sheet-status" element={<SheetStatus />} />
                  <Route path="admin/aliases" element={<Aliases />} />
                  <Route path="load-report" element={<LoadReport />} />
                  <Route path="load-center" element={<LoadCenter />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="whats-new" element={<WhatsNew />} />
                  <Route
                    path="archive"
                    element={
                      <ErrorBoundary
                        fallback={
                          <div className="flex-1 flex items-center justify-center p-8">
                            <div className="text-center space-y-2">
                              <p className="text-on-surface font-headline text-lg">
                                Archive temporarily unavailable
                              </p>
                              <p className="text-on-surface-variant text-sm">
                                Use Ctrl+K search to find specific loads
                              </p>
                            </div>
                          </div>
                        }
                      >
                        <Suspense fallback={<PageLoader />}>
                          <Outlet />
                        </Suspense>
                      </ErrorBoundary>
                    }
                  >
                    <Route index element={<ArchiveSearch />} />
                    <Route path="load/:id" element={<ArchiveLoadDetail />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
