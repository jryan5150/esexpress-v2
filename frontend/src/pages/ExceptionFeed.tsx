import { useNavigate } from "react-router-dom";
import { useFeed } from "@/hooks/use-feed";
import { Button } from "@/components/Button";
import type { FeedData, WellSummary } from "@/types/feed";

/* -------------------------------------------------------------------------- */
/*  ExceptionFeed — landing page showing system-handled summary + well list   */
/* -------------------------------------------------------------------------- */

export function ExceptionFeed() {
  const navigate = useNavigate();
  const { data, isLoading } = useFeed();
  const feed = data ?? MOCK_FEED;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--text-secondary)]">Loading feed...</p>
      </div>
    );
  }

  const automationRate =
    feed.systemHandled.loadsMatched > 0
      ? (
          (feed.systemHandled.loadsMatched /
            (feed.systemHandled.loadsMatched +
              feed.wellSummaries.reduce(
                (s, w) => s + w.reviewCount + w.missingCount,
                0,
              ))) *
          100
        ).toFixed(1)
      : "0.0";

  return (
    <div className="p-6 pb-12 max-w-7xl mx-auto space-y-10">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-[var(--text-2xl)] font-bold tracking-tight text-[var(--text-primary)]">
            EXCEPTION FEED
          </h1>
          <span className="text-[var(--text-xs)] uppercase tracking-widest text-[var(--text-tertiary)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded-[var(--radius-sm)] hidden lg:inline-block">
            Operational Status: High Alert
          </span>
        </div>
        <div className="flex items-center gap-2 bg-[var(--bg-surface)] px-3 py-1.5 rounded-[var(--radius-sm)] focus-within:ring-1 ring-[var(--accent)]">
          <span className="text-[var(--text-tertiary)] text-sm">&#x1F50D;</span>
          <input
            className="bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] w-48"
            placeholder="Search BOL or Well..."
            type="text"
          />
        </div>
      </div>

      {/* Section 1: System Handled Summary */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-gradient-to-br from-[var(--status-ready-dim)] to-[var(--bg-surface)] p-6 rounded-[var(--radius-lg)] border-l-4 border-[var(--status-ready)] relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[var(--status-ready)]">&#x2713;</span>
                <h2 className="text-[var(--status-ready)] uppercase tracking-widest text-sm font-semibold">
                  System Handled Summary
                </h2>
              </div>
              <div className="flex flex-wrap gap-8">
                <StatBlock
                  label="Loads Auto-Matched"
                  value={feed.systemHandled.loadsMatched}
                />
                <StatBlock
                  label="BOLs Attached"
                  value={feed.systemHandled.bolsAttached}
                />
                <StatBlock
                  label="Photos Linked"
                  value={feed.systemHandled.photosLinked}
                />
              </div>
            </div>
            <Button
              variant="primary"
              className="px-6 py-3 font-bold"
              onClick={() =>
                navigate(`/wells/${feed.wellSummaries[0]?.wellId ?? ""}`)
              }
            >
              Review &amp; Approve &#x2192;
            </Button>
          </div>
        </div>

        {/* Automation Rate gauge */}
        <div className="bg-[var(--bg-surface)] p-6 rounded-[var(--radius-lg)] flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase">
              Automation Rate
            </span>
            <h3 className="text-[var(--text-2xl)] font-bold text-[var(--status-ready)]">
              {automationRate}%
            </h3>
          </div>
          <div className="w-full bg-[var(--bg-elevated)] h-1.5 rounded-full mt-4">
            <div
              className="bg-[var(--status-ready)] h-full rounded-full transition-all duration-500"
              style={{ width: `${automationRate}%` }}
            />
          </div>
          <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] mt-2">
            +4.2% from last shift
          </p>
        </div>
      </section>

      {/* Section 2: Needs You — well rows */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <span className="text-[var(--accent)]">&#x25B2;</span>
            <h2 className="text-[var(--text-secondary)] uppercase tracking-widest text-sm font-semibold">
              Needs You: Priority Exceptions
            </h2>
          </div>
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase">
            Sorted by: Exception Count &#x25BE;
          </span>
        </div>

        <div className="space-y-3">
          {feed.wellSummaries.map((well) => (
            <WellRow
              key={well.wellId}
              well={well}
              onClick={() => navigate(`/wells/${well.wellId}`)}
            />
          ))}
        </div>
      </section>

      {/* Section 3: Activity Log + Dispatcher Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-[var(--bg-base)] p-6 rounded-[var(--radius-lg)] space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-widest">
              Recent Activity Log
            </h4>
            <span className="text-[var(--text-xs)] text-[var(--accent)] font-bold cursor-pointer">
              View All Logs
            </span>
          </div>
          <div className="space-y-3">
            {MOCK_ACTIVITY.map((entry, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-2 hover:bg-[var(--bg-elevated)] rounded-[var(--radius-sm)] transition-colors"
              >
                <span className="text-[var(--text-xs)] font-[var(--font-mono)] text-[var(--text-tertiary)] pt-0.5">
                  {entry.time}
                </span>
                <p
                  className="text-sm text-[var(--text-secondary)]"
                  dangerouslySetInnerHTML={{ __html: entry.html }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-elevated)] p-6 rounded-[var(--radius-lg)] flex flex-col justify-between border border-[var(--border-subtle)]">
          <div className="space-y-4">
            <h4 className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-widest">
              Dispatcher Stats
            </h4>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-[var(--text-xs)] text-[var(--text-secondary)]">
                  Total Exceptions Found
                </span>
                <span className="font-[var(--font-mono)] text-xl text-[var(--text-primary)]">
                  12
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[var(--text-xs)] text-[var(--text-secondary)]">
                  Average Resolve Time
                </span>
                <span className="font-[var(--font-mono)] text-xl text-[var(--text-primary)]">
                  4m 12s
                </span>
              </div>
            </div>
          </div>
          {/* Mini bar chart */}
          <div className="mt-8">
            <div className="h-16 w-full flex items-end gap-1">
              {[50, 75, 66, 100, 80].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-[var(--accent)] rounded-t-[var(--radius-sm)]"
                  style={{ height: `${h}%`, opacity: 0.2 + i * 0.2 }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAB: New Load */}
      <button
        className="fixed bottom-8 right-8 w-14 h-14 bg-[var(--accent)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
        aria-label="New Load"
      >
        <span className="text-2xl">+</span>
        <span className="absolute right-16 bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-1 rounded-[var(--radius-sm)] text-[var(--text-xs)] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-[var(--border-subtle)]">
          New Load
        </span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline sub-components                                                     */
/* -------------------------------------------------------------------------- */

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-wider">
        {label}
      </p>
      <p className="text-4xl font-bold text-[var(--text-primary)] font-[var(--font-mono)]">
        {value}
      </p>
    </div>
  );
}

function WellRow({
  well,
  onClick,
}: {
  well: WellSummary;
  onClick: () => void;
}) {
  const hasErrors = well.missingCount > 0;
  const borderColor = hasErrors
    ? "border-[var(--status-error)]"
    : "border-[var(--status-ready)]";

  return (
    <div
      className={`group bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all border-l-[3px] ${borderColor} flex flex-col lg:flex-row lg:items-center justify-between p-4 gap-4 cursor-pointer`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Well info */}
      <div className="flex items-center gap-6 min-w-[240px]">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {well.wellName}
          </h3>
          <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-[var(--text-xs)] font-[var(--font-mono)]">
            &#x1F4CD; Basin
          </div>
        </div>
        <div className="bg-[var(--bg-elevated)] px-3 py-1 rounded-[var(--radius-sm)]">
          <span className="font-[var(--font-mono)] text-xl font-semibold text-[var(--text-primary)]">
            {well.totalLoads}
          </span>
          <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] ml-1 uppercase">
            Loads
          </span>
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 flex-1 justify-center px-4">
        <StatusPill count={well.readyCount} label="Ready" status="ready" />
        <StatusPill count={well.reviewCount} label="Review" status="warning" />
        <StatusPill count={well.missingCount} label="Missing" status="error" />
      </div>

      {/* Operators + open button */}
      <div className="flex items-center gap-6">
        {well.operators.length > 0 ? (
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: well.operators[0].color }}
            />
            <div className="flex flex-col">
              <span className="text-[var(--text-xs)] text-[var(--text-secondary)] uppercase font-bold">
                {well.operators[0].name}
              </span>
              <span className="text-[9px] text-[var(--text-tertiary)] font-[var(--font-mono)]">
                Active {well.operators[0].lastActive}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--bg-elevated)] border border-dashed border-[var(--border-default)] flex items-center justify-center text-[var(--text-xs)] text-[var(--text-tertiary)]">
              +
            </span>
            <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase font-bold">
              Unassigned
            </span>
          </div>
        )}
        <button
          className="bg-[var(--bg-overlay)] p-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          aria-label={`Open ${well.wellName}`}
        >
          &#x2197;
        </button>
      </div>
    </div>
  );
}

function StatusPill({
  count,
  label,
  status,
}: {
  count: number;
  label: string;
  status: "ready" | "warning" | "error";
}) {
  const colorMap = {
    ready: {
      bg: "bg-[var(--status-ready-dim)]",
      border: "border-[var(--status-ready-dim)]",
      text: "text-[var(--status-ready)]",
      labelOpacity: "opacity-60",
    },
    warning: {
      bg: "bg-[var(--status-warning-dim)]",
      border: "border-[var(--status-warning-dim)]",
      text: "text-[var(--status-warning)]",
      labelOpacity: "opacity-60",
    },
    error: {
      bg: "bg-[var(--status-error-dim)]",
      border: "border-[var(--status-error-dim)]",
      text: "text-[var(--status-error)]",
      labelOpacity: "opacity-60",
    },
  };

  const c = colorMap[status];
  const dimmed = count === 0;

  return (
    <div
      className={`${c.bg} px-3 py-1 rounded-full border ${c.border} flex items-center gap-2 ${dimmed ? "opacity-30" : ""}`}
    >
      <span className={`${c.text} font-[var(--font-mono)] font-bold text-sm`}>
        {count}
      </span>
      <span
        className={`text-[var(--text-xs)] ${c.text} ${c.labelOpacity} uppercase font-semibold`}
      >
        {label}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_ACTIVITY = [
  {
    time: "14:22",
    html: '<span class="font-bold" style="color: var(--accent)">Stephanie</span> auto-approved <span class="font-[var(--font-mono)]">#BOL-8821</span> for Pendleton 1H.',
  },
  {
    time: "14:18",
    html: 'System flagged exception: <span class="font-bold" style="color: var(--status-error)">MISSING_TICKET</span> on Browning SilverHill.',
  },
];

const MOCK_FEED: FeedData = {
  date: new Date().toISOString().split("T")[0],
  systemHandled: {
    loadsMatched: 47,
    bolsAttached: 38,
    photosLinked: 23,
  },
  wellSummaries: [
    {
      wellId: "pendleton-1h",
      wellName: "Pendleton 1H",
      totalLoads: 51,
      readyCount: 47,
      reviewCount: 3,
      missingCount: 1,
      operators: [
        {
          userId: "steph-01",
          name: "Stephanie",
          color: "#34d399",
          location: "Pendleton 1H",
          lastActive: "12m",
        },
      ],
    },
    {
      wellId: "browning-silverhill",
      wellName: "Browning SilverHill",
      totalLoads: 28,
      readyCount: 22,
      reviewCount: 4,
      missingCount: 2,
      operators: [
        {
          userId: "scout-01",
          name: "Scout",
          color: "#fbbf24",
          location: "Browning SilverHill",
          lastActive: "3m",
        },
      ],
    },
    {
      wellId: "apache-warwick",
      wellName: "Apache Warwick",
      totalLoads: 12,
      readyCount: 12,
      reviewCount: 0,
      missingCount: 0,
      operators: [],
    },
  ],
};
