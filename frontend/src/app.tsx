import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { ToastProvider } from "./components/Toast";
import { Layout } from "./components/Layout";
import { ExceptionFeed } from "./pages/ExceptionFeed";
import { BolQueue } from "./pages/BolQueue";
import { Finance } from "./pages/Finance";
import { Login } from "./pages/Login";
import { WellsAdmin } from "./pages/admin/WellsAdmin";
import { CompaniesAdmin } from "./pages/admin/CompaniesAdmin";
import { UsersAdmin } from "./pages/admin/UsersAdmin";
import { Settings } from "./pages/Settings";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { WellWorkspace } from "./pages/WellWorkspace";
import { DispatchDesk } from "./pages/DispatchDesk";
import { Validation } from "./pages/Validation";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
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
              <FeedbackWidget />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
