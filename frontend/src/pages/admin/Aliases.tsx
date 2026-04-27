import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useHeartbeat } from "../../hooks/use-presence";

interface CustomerAlias {
  id: number;
  source_name: string;
  canonical_name: string;
  canonical_customer_id: number | null;
  canonical_customer_name: string | null;
  confirmed: boolean;
}
interface WellWithAliases {
  id: number;
  name: string;
  aliases: string[];
}
interface AliasesPayload {
  customers: CustomerAlias[];
  wells: WellWithAliases[];
}
interface CustomerOpt {
  id: number;
  name: string;
}

export function Aliases() {
  useHeartbeat({ currentPage: "admin-aliases" });
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "aliases"],
    queryFn: () => api.get<AliasesPayload>("/diag/aliases"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const customersQuery = useQuery({
    queryKey: ["admin", "aliases", "customers-list"],
    queryFn: () => api.get<{ customers: CustomerOpt[] }>("/diag/customers"),
    staleTime: 5 * 60_000,
  });

  // Customer alias add form
  const [custSource, setCustSource] = useState("");
  const [custCanonId, setCustCanonId] = useState<number | null>(null);
  const addCustomer = useMutation({
    mutationFn: async () => {
      const opt = customersQuery.data?.customers.find(
        (c) => c.id === custCanonId,
      );
      if (!opt) throw new Error("pick a canonical customer");
      return api.post("/diag/aliases/customer", {
        sourceName: custSource.trim(),
        canonicalName: opt.name,
        canonicalCustomerId: opt.id,
        confirmed: true,
      });
    },
    onSuccess: () => {
      setCustSource("");
      setCustCanonId(null);
      qc.invalidateQueries({ queryKey: ["admin", "aliases"] });
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: (id: number) => api.del(`/diag/aliases/customer/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "aliases"] }),
  });

  // Well alias add form
  const [wellId, setWellId] = useState<number | null>(null);
  const [wellAlias, setWellAlias] = useState("");
  const addWellAlias = useMutation({
    mutationFn: async () => {
      if (!wellId || !wellAlias.trim()) throw new Error("pick a well + alias");
      return api.post("/diag/aliases/well", {
        wellId,
        alias: wellAlias.trim(),
      });
    },
    onSuccess: () => {
      setWellAlias("");
      qc.invalidateQueries({ queryKey: ["admin", "aliases"] });
    },
  });

  const removeWellAlias = useMutation({
    mutationFn: ({ wellId, alias }: { wellId: number; alias: string }) =>
      api.del(`/diag/aliases/well/${wellId}/${encodeURIComponent(alias)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "aliases"] }),
  });

  if (isLoading || !data) {
    return <div className="p-6 text-text-secondary">Loading aliases…</div>;
  }

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <header>
        <h1 className="text-2xl font-headline mb-1">Aliases</h1>
        <p className="text-sm text-text-secondary">
          The sheet uses freeform spellings of customers ("Liberty",
          "Liberty(FSC)", "LIberty") and wells ("Logistix IQ Exco DF DGB Little"
          → canonical "…Little 6-7-8"). Aliases let v2 reconcile sheet text
          against canonical entities. Edit here and the next sheet sync picks
          them up automatically.
        </p>
      </header>

      {/* ── Customer aliases ─────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">
          Customer aliases ({data.customers.length})
        </h2>

        {/* Add form */}
        <div className="flex gap-2 mb-4 items-end flex-wrap">
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Sheet spelling
            </label>
            <input
              type="text"
              value={custSource}
              onChange={(e) => setCustSource(e.target.value)}
              placeholder="e.g. Liberty(FSC)"
              className="px-2 py-1 text-sm rounded border border-border bg-bg-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Canonical customer
            </label>
            <select
              value={custCanonId ?? ""}
              onChange={(e) =>
                setCustCanonId(e.target.value ? Number(e.target.value) : null)
              }
              className="px-2 py-1 text-sm rounded border border-border bg-bg-primary"
            >
              <option value="">Pick…</option>
              {customersQuery.data?.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => addCustomer.mutate()}
            disabled={
              !custSource.trim() || !custCanonId || addCustomer.isPending
            }
            className="px-3 py-1 text-sm rounded bg-accent text-white disabled:opacity-50"
          >
            {addCustomer.isPending ? "Adding…" : "Add"}
          </button>
          {addCustomer.isError && (
            <span className="text-xs text-red-500">
              {(addCustomer.error as Error).message}
            </span>
          )}
        </div>

        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-secondary uppercase tracking-wide">
            <tr>
              <th className="py-1 pr-3">Sheet spelling</th>
              <th className="py-1 pr-3">Canonical name</th>
              <th className="py-1 pr-3">Customer ID</th>
              <th className="py-1 pr-3">Confirmed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map((c) => (
              <tr
                key={c.id}
                className="border-t border-border hover:bg-bg-tertiary/40"
              >
                <td className="py-1 pr-3 font-mono">{c.source_name}</td>
                <td className="py-1 pr-3">{c.canonical_name}</td>
                <td className="py-1 pr-3 text-text-secondary">
                  {c.canonical_customer_id ?? "—"}
                </td>
                <td className="py-1 pr-3">
                  {c.confirmed ? (
                    <span className="text-emerald-600">✓</span>
                  ) : (
                    <span className="text-amber-500">draft</span>
                  )}
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          `Remove alias "${c.source_name}" → "${c.canonical_name}"?`,
                        )
                      )
                        deleteCustomer.mutate(c.id);
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── Well aliases ─────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">
          Well aliases ({data.wells.length} wells with aliases)
        </h2>

        <div className="flex gap-2 mb-4 items-end flex-wrap">
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Canonical well
            </label>
            <select
              value={wellId ?? ""}
              onChange={(e) =>
                setWellId(e.target.value ? Number(e.target.value) : null)
              }
              className="px-2 py-1 text-sm rounded border border-border bg-bg-primary min-w-[300px]"
            >
              <option value="">Pick…</option>
              {data.wells.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              New alias (sheet spelling)
            </label>
            <input
              type="text"
              value={wellAlias}
              onChange={(e) => setWellAlias(e.target.value)}
              placeholder="e.g. DGB Little 6-7-8"
              className="px-2 py-1 text-sm rounded border border-border bg-bg-primary min-w-[260px]"
            />
          </div>
          <button
            type="button"
            onClick={() => addWellAlias.mutate()}
            disabled={!wellId || !wellAlias.trim() || addWellAlias.isPending}
            className="px-3 py-1 text-sm rounded bg-accent text-white disabled:opacity-50"
          >
            {addWellAlias.isPending ? "Adding…" : "Add"}
          </button>
        </div>

        <div className="space-y-3">
          {data.wells.map((w) => (
            <div
              key={w.id}
              className="rounded border border-border bg-bg-primary/40 p-3"
            >
              <div className="font-medium text-sm mb-1">{w.name}</div>
              <div className="flex flex-wrap gap-2">
                {w.aliases.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-bg-tertiary border border-border"
                  >
                    <code className="font-mono">{a}</code>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove alias "${a}"?`))
                          removeWellAlias.mutate({
                            wellId: w.id,
                            alias: a,
                          });
                      }}
                      className="text-text-secondary hover:text-red-500"
                      aria-label={`Remove ${a}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
