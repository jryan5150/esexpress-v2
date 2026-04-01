import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { initThemeListener } from "@/lib/theme";
import { Layout } from "@/components/Layout";
import { ExceptionFeed } from "@/pages/ExceptionFeed";
import { WellWorkspace } from "@/pages/WellWorkspace";
import { DispatchConfirmation } from "@/pages/DispatchConfirmation";
import { BolQueue } from "@/pages/BolQueue";
import { Login } from "@/pages/Login";
import { WellsAdmin } from "@/pages/admin/WellsAdmin";
import { CompaniesAdmin } from "@/pages/admin/CompaniesAdmin";
import { UsersAdmin } from "@/pages/admin/UsersAdmin";
import { Validation } from "@/pages/admin/Validation";
import { FinanceBatches } from "@/pages/FinanceBatches";
import { Settings } from "@/pages/Settings";

export function App() {
  useEffect(() => {
    const cleanup = initThemeListener();
    return cleanup;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route index element={<ExceptionFeed />} />
            <Route path="wells/:wellId" element={<WellWorkspace />} />
            <Route
              path="wells/:wellId/dispatched"
              element={<DispatchConfirmation />}
            />
            <Route path="bol" element={<BolQueue />} />
            <Route path="admin/wells" element={<WellsAdmin />} />
            <Route path="admin/companies" element={<CompaniesAdmin />} />
            <Route path="admin/users" element={<UsersAdmin />} />
            <Route path="admin/validation" element={<Validation />} />
            <Route path="finance" element={<FinanceBatches />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
