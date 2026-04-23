import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";

interface AppSetting {
  key: string;
  value: string | null;
  description: string | null;
  updatedBy: number | null;
  updatedAt: string;
}

export function Settings() {
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              Settings
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              System Configuration // Integrations
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6 space-y-4">
        <PcsToggleCard />
      </div>
    </div>
  );
}

function PcsToggleCard() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<null | boolean>(null); // target state awaiting confirm

  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () =>
      api
        .get<{
          success: boolean;
          data: AppSetting[];
        }>("/dispatch/admin/settings")
        .then((r) => r.data),
    refetchInterval: 30_000,
  });

  const flip = useMutation({
    mutationFn: async (next: boolean) =>
      api.put<{
        success: boolean;
        data: {
          key: string;
          value: string;
          updatedBy: string;
          updatedAt: string;
        };
      }>(`/dispatch/admin/settings/pcs_dispatch_enabled`, {
        value: next ? "true" : "false",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["pcs", "health"] });
      setConfirm(null);
    },
  });

  const current = settings.data?.find((s) => s.key === "pcs_dispatch_enabled");
  const enabled = current?.value === "true";

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[12px] p-6 card-rest">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <h2 className="text-base font-bold font-headline text-on-surface">
            PCS Push Integration
          </h2>
          <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
            Master toggle for pushing validated loads to PCS. When ON, the
            Validate action automatically creates a matching PCS load with the
            BOL photo attached. When OFF, dispatches remain local to v2 —
            nothing is sent to PCS.
          </p>
          {current?.updatedAt && (
            <p className="text-xs text-on-surface-variant mt-2">
              Last changed {new Date(current.updatedAt).toLocaleString()}
              {current.updatedBy ? ` by user #${current.updatedBy}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full border ${
              enabled
                ? "bg-emerald-100 text-emerald-900 border-emerald-400"
                : "bg-gray-100 text-gray-700 border-gray-300"
            }`}
          >
            {settings.isLoading ? "Loading…" : enabled ? "ON" : "OFF"}
          </span>
          {confirm === null ? (
            <button
              type="button"
              onClick={() => setConfirm(!enabled)}
              disabled={settings.isLoading || flip.isPending}
              className={`px-3 py-1.5 text-sm font-medium rounded-md border disabled:opacity-50 ${
                enabled
                  ? "bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100"
                  : "bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100"
              }`}
            >
              {enabled ? "Turn OFF" : "Turn ON"}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant">
                {confirm ? "Enable PCS push?" : "Disable PCS push?"}
              </span>
              <button
                type="button"
                onClick={() => flip.mutate(confirm)}
                disabled={flip.isPending}
                className="px-2 py-1 text-xs font-semibold rounded bg-primary text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {flip.isPending ? "…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={flip.isPending}
                className="px-2 py-1 text-xs font-semibold rounded border border-outline-variant"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
      {flip.isError && (
        <div className="mt-3 px-3 py-2 text-xs text-rose-900 bg-rose-50 border border-rose-300 rounded">
          Flip failed: {(flip.error as Error).message}
        </div>
      )}
    </div>
  );
}
