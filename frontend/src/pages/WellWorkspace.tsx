import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useWellWorkspace,
  useResolveLoad,
  useBulkApprove,
} from "@/hooks/use-well-workspace";
import { useDispatchToPcs } from "@/hooks/use-dispatch";
import { Button } from "@/components/Button";
import type { Load } from "@/types/load";

/* -------------------------------------------------------------------------- */
/*  WellWorkspace — drill-down view for a single well's loads & exceptions    */
/* -------------------------------------------------------------------------- */

export function WellWorkspace() {
  const { wellId } = useParams<{ wellId: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useWellWorkspace(wellId);
  const resolveLoad = useResolveLoad();
  const bulkApprove = useBulkApprove();
  const dispatchToPcs = useDispatchToPcs();
  const [readyExpanded, setReadyExpanded] = useState(false);

  const workspace = data ?? MOCK_WORKSPACE;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--text-secondary)]">Loading workspace...</p>
      </div>
    );
  }

  const readyLoads = MOCK_READY_LOADS;
  const reviewLoads = MOCK_REVIEW_LOADS;
  const missingLoads = MOCK_MISSING_LOADS;
  const progressPct =
    workspace.targetLoads > 0
      ? Math.round((workspace.currentLoads / workspace.targetLoads) * 100)
      : 0;

  return (
    <div className="flex flex-col h-full relative">
      {/* Top bar: back + well name */}
      <header className="h-14 flex items-center justify-between px-6 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-2 hover:bg-[var(--bg-elevated)] rounded-[var(--radius-sm)] transition-all text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Back to feed"
          >
            &#x2190;
          </button>
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight">
              {workspace.wellName}
            </h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--status-ready)] animate-pulse" />
              <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-widest">
                Operator Dot (Stephanie)
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-[var(--bg-surface)] px-3 py-1.5 rounded-[var(--radius-sm)]">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)]">
            &#x1F50D;
          </span>
          <input
            className="bg-transparent border-none focus:ring-0 focus:outline-none text-sm p-0 w-32 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            placeholder="Search load ID..."
            type="text"
          />
        </div>
      </header>

      {/* Scrollable content */}
      <section className="flex-1 overflow-y-auto p-6 pb-28 space-y-6">
        {/* Target Progress Bar */}
        <div className="bg-[var(--bg-surface)] rounded-[var(--radius-sm)] p-4 relative overflow-hidden">
          <div className="flex justify-between items-end mb-2">
            <div className="space-y-0.5">
              <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-widest">
                Well Fulfillment
              </span>
              <p className="text-sm font-[var(--font-mono)] font-medium text-[var(--text-primary)]">
                Target: {workspace.targetLoads} loads
                <span className="text-[var(--text-tertiary)] mx-2">|</span>
                Progress: {workspace.currentLoads}/{workspace.targetLoads}
              </p>
            </div>
            <span className="text-2xl font-bold text-[var(--accent)]">
              {progressPct}%
            </span>
          </div>
          <div className="h-2 w-full bg-[var(--bg-overlay)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Ready group (collapsed by default) */}
        <div className="group">
          <div
            className="flex items-center justify-between p-3 bg-[var(--bg-base)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer border-l-4 border-[var(--status-ready)]"
            onClick={() => setReadyExpanded((prev) => !prev)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) =>
              e.key === "Enter" && setReadyExpanded((prev) => !prev)
            }
          >
            <div className="flex items-center gap-3">
              <span className="text-[var(--status-ready)]">&#x2713;</span>
              <span className="font-[var(--font-mono)] text-sm font-medium text-[var(--text-primary)]">
                &#x2713; {readyLoads.length} ready — all verified
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="secondary"
                className="px-3 py-1 text-[var(--text-xs)] font-bold uppercase tracking-wider text-[var(--status-ready)] border-[var(--status-ready)]"
                onClick={(e) => {
                  e.stopPropagation();
                  bulkApprove.mutate({
                    wellId: wellId ?? "",
                    loadIds: readyLoads.map((l) => l.id),
                  });
                }}
              >
                Bulk Approve
              </Button>
              <span className="text-[var(--text-tertiary)] transition-transform">
                {readyExpanded ? "&#x25B2;" : "&#x25BC;"}
              </span>
            </div>
          </div>
          {readyExpanded && (
            <div className="space-y-1 mt-1">
              {readyLoads.map((load) => (
                <ReadyLoadRow key={load.id} load={load} />
              ))}
            </div>
          )}
        </div>

        {/* Need Review group */}
        <div className="space-y-2">
          <h3 className="text-[var(--text-xs)] font-bold text-[var(--status-warning)] uppercase tracking-widest flex items-center gap-2 px-1">
            &#x26A0; Need Review ({reviewLoads.length} Items)
          </h3>
          {reviewLoads.map((load) => (
            <ReviewLoadRow
              key={load.id}
              load={load}
              onResolve={(resolution, value) =>
                resolveLoad.mutate({ loadId: load.id, resolution, value })
              }
            />
          ))}
        </div>

        {/* Missing Data group */}
        <div className="space-y-2">
          <h3 className="text-[var(--text-xs)] font-bold text-[var(--accent)] uppercase tracking-widest flex items-center gap-2 px-1">
            &#x2716; Missing Data ({missingLoads.length} Item)
          </h3>
          {missingLoads.map((load) => (
            <MissingLoadRow key={load.id} load={load} />
          ))}
        </div>
      </section>

      {/* Sticky Action Bar */}
      <footer className="absolute bottom-0 left-0 w-full h-20 bg-[var(--bg-surface)] backdrop-blur-xl border-t border-[var(--border-subtle)] px-8 flex items-center justify-between z-20">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-widest">
              Selected loads
            </span>
            <span className="text-sm font-[var(--font-mono)] font-bold text-[var(--text-primary)]">
              {readyLoads.length} ready for dispatch
            </span>
          </div>
          <div className="h-8 w-px bg-[var(--border-subtle)]" />
          <p className="text-[var(--text-xs)] text-[var(--text-secondary)] max-w-xs leading-tight">
            Proceeding will finalize all verified BOLs and sync data to the
            central ledger.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="secondary" className="px-6 py-2.5">
            Export
          </Button>
          <Button
            variant="primary"
            className="px-8 py-2.5 font-bold shadow-lg"
            onClick={() =>
              dispatchToPcs.mutate({
                wellId: wellId ?? "",
                loadIds: readyLoads.map((l) => l.id),
              })
            }
          >
            Dispatch All Ready ({readyLoads.length})
          </Button>
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline sub-components                                                     */
/* -------------------------------------------------------------------------- */

function ReadyLoadRow({ load }: { load: Load }) {
  return (
    <div className="bg-[var(--bg-surface)] border-l-4 border-[var(--status-ready)] p-4 flex items-center justify-between gap-6 hover:bg-[var(--bg-elevated)] transition-all">
      <div className="flex items-center gap-6 flex-1">
        <div className="w-16">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] block">
            LOAD ID
          </span>
          <span className="text-sm font-[var(--font-mono)] font-bold">
            {load.loadNumber}
          </span>
        </div>
        <div className="w-32">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] block">
            DRIVER
          </span>
          <span className="text-sm font-medium">{load.driverName ?? "—"}</span>
        </div>
        <div className="flex-1">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] block">
            STATUS
          </span>
          <span className="text-sm text-[var(--status-ready)]">Verified</span>
        </div>
      </div>
    </div>
  );
}

function ReviewLoadRow({
  load,
  onResolve,
}: {
  load: Load & { exceptionDetail: string };
  onResolve: (resolution: string, value?: string) => void;
}) {
  return (
    <div className="bg-[var(--bg-surface)] border-l-4 border-[var(--status-warning)] p-4 flex items-center justify-between gap-6 hover:bg-[var(--bg-elevated)] transition-all">
      <div className="flex items-center gap-6 flex-1">
        <div className="w-16">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] block">
            LOAD ID
          </span>
          <span className="text-sm font-[var(--font-mono)] font-bold">
            {load.loadNumber}
          </span>
        </div>
        <div className="w-32">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] block">
            DRIVER
          </span>
          <span className="text-sm font-medium">
            {load.driverName ?? (
              <span className="italic text-[var(--text-tertiary)]">
                No driver data
              </span>
            )}
          </span>
        </div>
        <div className="flex-1">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] block">
            EXCEPTION DETAILS
          </span>
          <p className="text-sm text-[var(--text-secondary)]">
            {load.exceptionDetail}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {load.verification.weight === "mismatch" ? (
          <>
            <Button
              variant="secondary"
              className="text-[var(--text-xs)]"
              onClick={() => onResolve("accept_propx")}
            >
              Accept PropX
            </Button>
            <Button
              variant="secondary"
              className="text-[var(--text-xs)]"
              onClick={() => onResolve("use_ticket")}
            >
              Use Ticket
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              className="text-[var(--text-xs)]"
              onClick={() => onResolve("search_jotform")}
            >
              Search JotForm
            </Button>
            <Button
              variant="secondary"
              className="text-[var(--text-xs)]"
              onClick={() => onResolve("enter_manually")}
            >
              Enter Manually
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function MissingLoadRow({ load }: { load: Load }) {
  return (
    <div className="bg-[var(--bg-surface)] border-l-4 border-[var(--accent)] p-4 flex items-center justify-between gap-6 hover:bg-[var(--bg-elevated)] transition-all">
      <div className="flex items-center gap-6 flex-1">
        <div className="w-16">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] block">
            LOAD ID
          </span>
          <span className="text-sm font-[var(--font-mono)] font-bold">
            {load.loadNumber}
          </span>
        </div>
        <div className="w-32">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] block">
            DRIVER
          </span>
          <span className="text-sm italic text-[var(--text-tertiary)]">
            Unassigned
          </span>
        </div>
        <div className="flex-1">
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] block">
            EXCEPTION DETAILS
          </span>
          <p className="text-sm text-[var(--status-error)]">
            No driver, BOL, or photo uploaded
          </p>
        </div>
      </div>
      <Button
        variant="secondary"
        className="text-[var(--text-xs)] text-[var(--status-error)] border-[var(--status-error)]"
      >
        Assign Manually
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_WORKSPACE = {
  wellName: "PENDLETON 1H",
  basin: "Basin 04-A",
  targetLoads: 30,
  currentLoads: 27,
  groups: [],
};

const MOCK_READY_LOADS: Load[] = Array.from({ length: 47 }, (_, i) => ({
  id: `ready-${4800 + i}`,
  loadNumber: `${4800 + i}`,
  driverName: ["Davis, K.", "Smith, A.", "Martinez, J.", "Chen, R."][i % 4],
  truckNumber: `T-${100 + i}`,
  weight: 38000 + Math.floor(Math.random() * 4000),
  bolNumber: `BOL-${8800 + i}`,
  sandPlant: "Kermit Sand",
  product: "40/70 Frac Sand",
  loadInDate: "2026-03-31",
  unloadDate: "2026-03-31",
  status: "dispatch_ready" as const,
  confidenceTier: "tier1" as const,
  confidenceScore: 0.97,
  verification: {
    bol: "verified" as const,
    weight: "verified" as const,
    photo: "verified" as const,
  },
  wellId: "pendleton-1h",
  wellName: "Pendleton 1H",
}));

const MOCK_REVIEW_LOADS: (Load & { exceptionDetail: string })[] = [
  {
    id: "review-4823",
    loadNumber: "4823",
    driverName: "Davis, K.",
    truckNumber: "T-101",
    weight: 38100,
    bolNumber: "BOL-4823",
    sandPlant: "Kermit Sand",
    product: "40/70 Frac Sand",
    loadInDate: "2026-03-31",
    unloadDate: "2026-03-31",
    status: "pending",
    confidenceTier: "tier2",
    confidenceScore: 0.72,
    verification: {
      bol: "verified",
      weight: "mismatch",
      weightDetail: "PropX 38,100 vs ticket 38,400",
      photo: "verified",
    },
    wellId: "pendleton-1h",
    wellName: "Pendleton 1H",
    exceptionDetail: "Weight mismatch: PropX 38,100 vs ticket 38,400",
  },
  {
    id: "review-4829",
    loadNumber: "4829",
    driverName: "Smith, A.",
    truckNumber: "T-105",
    weight: 40200,
    bolNumber: null,
    sandPlant: "Kermit Sand",
    product: "40/70 Frac Sand",
    loadInDate: "2026-03-31",
    unloadDate: "2026-03-31",
    status: "pending",
    confidenceTier: "tier2",
    confidenceScore: 0.55,
    verification: { bol: "missing", weight: "verified", photo: "verified" },
    wellId: "pendleton-1h",
    wellName: "Pendleton 1H",
    exceptionDetail: "BOL not found in JotForm submissions",
  },
  {
    id: "review-4831",
    loadNumber: "4831",
    driverName: null,
    truckNumber: null,
    weight: 41100,
    bolNumber: "BOL-4831",
    sandPlant: "Kermit Sand",
    product: "40/70 Frac Sand",
    loadInDate: "2026-03-31",
    unloadDate: "2026-03-31",
    status: "pending",
    confidenceTier: "tier2",
    confidenceScore: 0.6,
    verification: {
      bol: "verified",
      weight: "mismatch",
      weightDetail: "PropX 41,100 vs ticket 40,800",
      photo: "verified",
    },
    wellId: "pendleton-1h",
    wellName: "Pendleton 1H",
    exceptionDetail: "Weight: PropX 41,100 vs ticket 40,800",
  },
];

const MOCK_MISSING_LOADS: Load[] = [
  {
    id: "missing-4824",
    loadNumber: "4824",
    driverName: null,
    truckNumber: null,
    weight: null,
    bolNumber: null,
    sandPlant: null,
    product: null,
    loadInDate: "2026-03-31",
    unloadDate: null,
    status: "pending",
    confidenceTier: "tier3",
    confidenceScore: 0.1,
    verification: { bol: "missing", weight: "missing", photo: "missing" },
    wellId: "pendleton-1h",
    wellName: "Pendleton 1H",
  },
];
