import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { ToastProvider } from "./components/Toast";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";

const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login })),
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
const Validation = lazy(() =>
  import("./pages/Validation").then((m) => ({ default: m.Validation })),
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
const Settings = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.Settings })),
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
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<ExceptionFeed />} />
                  <Route path="bol" element={<BolQueue />} />
                  <Route path="dispatch-desk" element={<DispatchDesk />} />
                  <Route path="validation" element={<Validation />} />
                  <Route path="finance" element={<Finance />} />
                  <Route path="wells/:wellId" element={<WellWorkspace />} />
                  <Route path="admin/wells" element={<WellsAdmin />} />
                  <Route path="admin/companies" element={<CompaniesAdmin />} />
                  <Route path="admin/users" element={<UsersAdmin />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
