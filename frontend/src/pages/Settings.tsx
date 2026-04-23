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
        <PcsSection />
      </div>
    </div>
  );
}

/** PCS push integration — two independent toggles, one per company.
 *  Hairpin (A) is the test division — safe to flip for smoke testing.
 *  ES Express (B) is production — flip only when ready for live pushes. */
function PcsSection() {
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

  return (
    <div className="space-y-4">
      <div className="px-2">
        <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-[0.08em]">
          PCS Push — Per-Division Toggles
        </h2>
        <p className="text-xs text-on-surface-variant/80 mt-1 max-w-3xl">
          Independent switches for the two PCS divisions. Turning one on does
          not affect the other. Default: both off. Anything pushed to Hairpin
          lands in a test division and can be voided from here — safe to
          experiment. ES Express is your production division; flip only when
          validated.
        </p>
      </div>

      <PcsCompanyToggle
        settings={settings}
        settingKey="pcs_dispatch_enabled_hairpin"
        division="Hairpin"
        companyLetter="A"
        tone="test"
        title="Hairpin Test Division (A)"
        description="Safe to enable for smoke testing. Pushes create loads in the Hairpin test division only — no production billing impact. Void any test load directly from the v2 drawer."
      />

      <PcsCompanyToggle
        settings={settings}
        settingKey="pcs_dispatch_enabled_esexpress"
        division="ES Express"
        companyLetter="B"
        tone="production"
        title="ES Express Production (B)"
        description="Not yet enabled on the integration side. Waiting on Kyle (PCS) to confirm OAuth scope + routing parameter for ES Express writes. Once confirmed, this toggle unlocks production pushes."
        disabled
        disabledReason="Awaiting PCS-side confirmation — see description"
      />
    </div>
  );
}

interface ToggleProps {
  settings: ReturnType<typeof useQuery<AppSetting[]>>;
  settingKey: string;
  division: string;
  companyLetter: "A" | "B";
  tone: "test" | "production";
  title: string;
  description: string;
  /** When true, the card renders greyed-out with no interactable controls.
   *  Use for divisions we haven't wired end-to-end yet (e.g. ES Express
   *  pending Kyle's OAuth-scope confirmation as of 2026-04-23). */
  disabled?: boolean;
  disabledReason?: string;
}

function PcsCompanyToggle({
  settings,
  settingKey,
  division,
  companyLetter,
  tone,
  title,
  description,
  disabled = false,
  disabledReason,
}: ToggleProps) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<null | boolean>(null);

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
      }>(`/dispatch/admin/settings/${settingKey}`, {
        value: next ? "true" : "false",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["pcs", "health"] });
      setConfirm(null);
    },
  });

  const current = settings.data?.find((s) => s.key === settingKey);
  const enabled = current?.value === "true";

  // Palette — test (yellow/amber) vs production (rose/red). Distinct colors
  // on the card border + the enabled pill help dispatchers tell at a glance
  // which division they're operating on, even on a crowded screen.
  const cardBorder =
    tone === "test" ? "border-amber-300/50" : "border-rose-400/50";
  const cardAccent = tone === "test" ? "bg-amber-50/40" : "bg-rose-50/30";
  const labelBadge =
    tone === "test"
      ? "bg-amber-100 text-amber-900 border-amber-300"
      : "bg-rose-100 text-rose-900 border-rose-300";
  const labelText = tone === "test" ? "TEST" : "PRODUCTION";

  return (
    <div
      className={`border-2 rounded-[12px] p-6 ${cardBorder} ${cardAccent} card-rest ${disabled ? "opacity-50 pointer-events-none select-none" : ""}`}
      aria-disabled={disabled}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-bold font-headline text-on-surface">
              {title}
            </h2>
            <span
              className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${labelBadge}`}
            >
              {labelText}
            </span>
            {disabled && (
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border bg-gray-200 text-gray-700 border-gray-400">
                Not yet available
              </span>
            )}
          </div>
          <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
            {description}
          </p>
          {disabled && disabledReason && (
            <p className="text-xs text-gray-600 italic mt-2">
              {disabledReason}
            </p>
          )}
          {!disabled && current?.updatedAt && (
            <p className="text-xs text-on-surface-variant/70 mt-2">
              Last changed {new Date(current.updatedAt).toLocaleString()}
              {current.updatedBy ? ` by user #${current.updatedBy}` : ""}
            </p>
          )}
          <p className="text-[11px] text-on-surface-variant/60 mt-1 font-mono">
            X-Company-Letter: {companyLetter} · division: {division}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full border ${
              disabled
                ? "bg-gray-200 text-gray-600 border-gray-300"
                : enabled
                  ? "bg-emerald-100 text-emerald-900 border-emerald-400"
                  : "bg-gray-100 text-gray-700 border-gray-300"
            }`}
          >
            {disabled
              ? "Pending"
              : settings.isLoading
                ? "Loading…"
                : enabled
                  ? "ON"
                  : "OFF"}
          </span>
          {confirm === null ? (
            <button
              type="button"
              onClick={() => setConfirm(!enabled)}
              disabled={disabled || settings.isLoading || flip.isPending}
              className={`px-3 py-1.5 text-sm font-medium rounded-md border disabled:opacity-50 disabled:cursor-not-allowed ${
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
                {confirm
                  ? `Enable PCS push for ${division}?`
                  : `Disable PCS push for ${division}?`}
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
