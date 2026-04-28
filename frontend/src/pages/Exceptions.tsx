import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useRole } from "../hooks/use-role";
import { useCurrentUser } from "../hooks/use-auth";
import { useHeartbeat } from "../hooks/use-presence";
import { api } from "../lib/api";
import { ExceptionFeed } from "./ExceptionFeed";

/**
 * Role-aware /exceptions surface.
 *
 *   admin    — manager blockers + system pulse (legacy ExceptionFeed)
 *   builder  — "My queue" — actionable list scoped to my customer
 *   finance  — AR aging placeholder until v1 of the finance lens
 *   viewer   — redirect to /workbench (no actionable content for them)
 *
 * Each lens is its own component so they can grow independently
 * without entangling. Routed in app.tsx as <Route path="exceptions">.
 */
export function Exceptions() {
  useHeartbeat({ currentPage: "exceptions" });
  const role = useRole();

  if (!role.isAuthenticated) return null;
  if (role.isViewer) return <Navigate to="/workbench" replace />;
  if (role.isFinance) return <FinanceLens />;
  if (role.isBuilder) return <BuilderQueueLens />;
  // admin (default) — full legacy dashboard
  return <ExceptionFeed />;
}

// ─────────────────────────────────────────────────────────────────
// Builder lens — "My Queue"
// ─────────────────────────────────────────────────────────────────

interface InboxItem {
  type: string;
  load_id: number | null;
  well_id: number | null;
  well_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  day: string | null;
  detail: string | null;
}

function BuilderQueueLens() {
  const userQuery = useCurrentUser();
  const me = userQuery.data;
  const myBuilder = (me?.email ?? "").split("@")[0].toLowerCase();

  // Find this user's primary customer via builder_routing.
  const routingQuery = useQuery({
    queryKey: ["exceptions", "builder", "routing"],
    queryFn: () =>
      api
        .get<{
          matrix: Array<{
            builder: string;
            customerId: number | null;
            isPrimary: boolean;
          }>;
        }>("/diag/builder-matrix")
        .then((r) => r.matrix),
    staleTime: 5 * 60_000,
  });
  const myCustomerId =
    routingQuery.data?.find(
      (b) => b.isPrimary && b.builder.toLowerCase() === myBuilder,
    )?.customerId ?? null;

  // Pull the inbox (last 14d) and filter client-side to my customer
  // when we have one. Falls back to all when unmapped.
  const inboxQuery = useQuery({
    queryKey: ["exceptions", "builder", "inbox", myCustomerId],
    queryFn: () => api.get<{ items: InboxItem[] }>("/diag/inbox?days=14"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const items = inboxQuery.data?.items ?? [];
  const mine = myCustomerId
    ? items.filter((i) => i.customer_id === myCustomerId)
    : items;

  // Group by type so the builder sees a clean punch-list rather than
  // 40 mixed rows.
  const byType = mine.reduce<Record<string, InboxItem[]>>((acc, i) => {
    (acc[i.type] = acc[i.type] ?? []).push(i);
    return acc;
  }, {});
  const groupOrder = [
    "missing_photo",
    "stage_uncertain",
    "discrepancy",
    "sheet_drift",
    "missing_ticket",
  ];
  const orderedGroups = [
    ...groupOrder.filter((g) => byType[g]?.length),
    ...Object.keys(byType).filter((g) => !groupOrder.includes(g)),
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-5xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-headline">My Queue</h1>
        <p className="text-sm text-text-secondary">
          {me?.name?.split(" ")[0] ?? "You"} — actionable items for your
          customer
          {routingQuery.data && !myCustomerId && (
            <>
              {" "}
              <span className="text-amber-600">
                (no customer mapping; showing all)
              </span>
            </>
          )}
          .
        </p>
      </header>

      {inboxQuery.isLoading && (
        <div className="rounded-lg border border-border bg-bg-secondary p-6 text-sm text-text-secondary text-center">
          Loading…
        </div>
      )}

      {!inboxQuery.isLoading && mine.length === 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-6 text-sm text-text-secondary text-center">
          ✨ Inbox zero. Nothing on your queue right now.
        </div>
      )}

      {orderedGroups.map((g) => (
        <QueueGroup key={g} type={g} items={byType[g]} />
      ))}
    </div>
  );
}

function QueueGroup({ type, items }: { type: string; items: InboxItem[] }) {
  const label = LABEL_BY_TYPE[type] ?? type.replace(/_/g, " ");
  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <header className="px-4 py-2 border-b border-border flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          {label}
        </h2>
        <span className="text-xs text-text-secondary tabular-nums">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </header>
      <ul className="divide-y divide-border/40">
        {items.slice(0, 25).map((i, idx) => (
          <li
            key={`${i.type}-${i.load_id ?? "x"}-${i.well_id ?? "x"}-${idx}`}
            className="px-4 py-2 text-sm flex items-center justify-between gap-3 hover:bg-bg-tertiary/40"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate">
                {i.well_name ?? i.customer_name ?? "—"}
                {i.day && (
                  <span className="text-text-secondary ml-2">
                    · {new Date(i.day).toLocaleDateString()}
                  </span>
                )}
              </div>
              {i.detail && (
                <div className="text-xs text-text-secondary truncate">
                  {i.detail}
                </div>
              )}
            </div>
            {i.load_id && (
              <Link
                to={`/load-center?load=${i.load_id}`}
                className="text-xs text-accent hover:underline shrink-0"
              >
                Open →
              </Link>
            )}
          </li>
        ))}
        {items.length > 25 && (
          <li className="px-4 py-2 text-xs text-text-secondary text-center">
            +{items.length - 25} more — narrow with filters on the source page.
          </li>
        )}
      </ul>
    </section>
  );
}

const LABEL_BY_TYPE: Record<string, string> = {
  missing_photo: "Photos to match",
  stage_uncertain: "Loads stuck in Uncertain",
  discrepancy: "Discrepancies to resolve",
  sheet_drift: "Sheet drift",
  missing_ticket: "Missing ticket #",
};

// ─────────────────────────────────────────────────────────────────
// Finance lens — placeholder
// ─────────────────────────────────────────────────────────────────

function FinanceLens() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-4xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-headline">Finance Queue</h1>
        <p className="text-sm text-text-secondary">
          AR aging + invoicing punch-list — coming soon.
        </p>
      </header>
      <div className="rounded-lg border border-border bg-bg-secondary p-6 space-y-3">
        <p className="text-sm">
          The role-aware finance lens is on the roadmap. For now, head straight
          to:
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/finance"
            className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90"
          >
            Finance →
          </Link>
          <Link
            to="/admin/discrepancies"
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg-primary hover:bg-bg-tertiary"
          >
            Discrepancies
          </Link>
          <Link
            to="/admin/sheet-truth"
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg-primary hover:bg-bg-tertiary"
          >
            Sheet Truth
          </Link>
          <Link
            to="/admin/wells"
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg-primary hover:bg-bg-tertiary"
          >
            Wells (rate edit)
          </Link>
        </div>
        <p className="text-xs text-text-secondary pt-2">
          Tell us what you'd want at the top of this page when you open
          /exceptions in the morning — that shapes v1.
        </p>
      </div>
    </div>
  );
}
