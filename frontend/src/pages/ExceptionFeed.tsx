import { useNavigate } from "react-router-dom";
import { useFeed } from "@/hooks/use-feed";
import type { FeedData, WellSummary } from "@/types/feed";

export function ExceptionFeed() {
  const navigate = useNavigate();
  const { data, isLoading } = useFeed();
  const feed = data ?? MOCK_FEED;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: "var(--text-secondary)" }}>Loading feed...</p>
      </div>
    );
  }

  const totalExceptions = feed.wellSummaries.reduce(
    (s, w) => s + w.reviewCount + w.missingCount,
    0,
  );
  const automationRate =
    feed.systemHandled.loadsMatched > 0
      ? (
          (feed.systemHandled.loadsMatched /
            (feed.systemHandled.loadsMatched + totalExceptions)) *
          100
        ).toFixed(1)
      : "0.0";

  return (
    <div className="p-8 pb-16 max-w-7xl mx-auto space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            EXCEPTION FEED
          </h1>
          <span
            className="text-xs uppercase tracking-widest px-2.5 py-1 rounded hidden lg:inline-block"
            style={{
              color: "var(--text-tertiary)",
              background: "var(--bg-elevated)",
            }}
          >
            Operational Status: High Alert
          </span>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
          }}
        >
          <span style={{ color: "var(--text-tertiary)" }}>&#128269;</span>
          <input
            className="bg-transparent border-none focus:ring-0 focus:outline-none text-sm w-48"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-ui)",
            }}
            placeholder="Search BOL or Well..."
            type="text"
          />
        </div>
      </div>

      {/* Section 1: System Handled Summary */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main summary card */}
        <div
          className="lg:col-span-3 p-6 rounded-xl relative overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, var(--status-ready-dim) 0%, var(--bg-surface) 100%)",
            borderLeft: "4px solid var(--status-ready)",
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <span
                  style={{ color: "var(--status-ready)", fontSize: "1.25rem" }}
                >
                  &#10003;
                </span>
                <h2
                  className="uppercase tracking-widest text-sm font-semibold"
                  style={{ color: "var(--status-ready)" }}
                >
                  System Handled Summary
                </h2>
              </div>
              <div className="flex flex-wrap gap-10">
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
            <button
              className="px-6 py-3 rounded font-bold flex items-center gap-2 transition-transform hover:scale-[1.02] cursor-pointer"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
                boxShadow: "0 4px 12px rgba(240, 105, 44, 0.3)",
              }}
              onClick={() =>
                navigate(`/wells/${feed.wellSummaries[0]?.wellId ?? ""}`)
              }
            >
              Review &amp; Approve →
            </button>
          </div>
        </div>

        {/* Automation Rate card */}
        <div
          className="p-6 rounded-xl flex flex-col justify-between"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="space-y-1">
            <span
              className="text-xs uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)" }}
            >
              Automation Rate
            </span>
            <h3
              className="text-3xl font-bold"
              style={{
                color: "var(--status-ready)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {automationRate}%
            </h3>
          </div>
          <div
            className="w-full h-1.5 rounded-full mt-4"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${automationRate}%`,
                background: "var(--status-ready)",
              }}
            />
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
            +4.2% from last shift
          </p>
        </div>
      </section>

      {/* Section 2: Needs You */}
      <section className="space-y-5">
        <div
          className="flex items-center justify-between pb-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: "var(--accent)", fontSize: "1.1rem" }}>
              &#9650;
            </span>
            <h2
              className="uppercase tracking-widest text-sm font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Needs You: Priority Exceptions
            </h2>
          </div>
          <span
            className="text-xs uppercase"
            style={{ color: "var(--text-tertiary)" }}
          >
            Sorted by: Exception Count ▾
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

      {/* Section 3: Activity Log + Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Activity Log */}
        <div
          className="md:col-span-2 p-6 rounded-xl space-y-4"
          style={{ background: "var(--bg-inset)" }}
        >
          <div className="flex items-center justify-between">
            <h4
              className="text-xs uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)" }}
            >
              Recent Activity Log
            </h4>
            <span
              className="text-xs font-bold cursor-pointer"
              style={{ color: "var(--accent)" }}
            >
              View All Logs
            </span>
          </div>
          <div className="space-y-2">
            {MOCK_ACTIVITY.map((entry, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-2.5 rounded transition-colors"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-elevated)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <span
                  className="text-xs pt-0.5 shrink-0"
                  style={{
                    color: "var(--text-tertiary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {entry.time}
                </span>
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                  dangerouslySetInnerHTML={{ __html: entry.html }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Dispatcher Stats */}
        <div
          className="p-6 rounded-xl flex flex-col justify-between"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="space-y-5">
            <h4
              className="text-xs uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)" }}
            >
              Dispatcher Stats
            </h4>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Total Exceptions Found
                </span>
                <span
                  className="text-xl"
                  style={{
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  12
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Average Resolve Time
                </span>
                <span
                  className="text-xl"
                  style={{
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  4m 12s
                </span>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <div className="h-16 w-full flex items-end gap-1">
              {[50, 75, 66, 100, 80].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${h}%`,
                    background: "var(--accent)",
                    opacity: 0.2 + i * 0.2,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAB */}
      <button
        className="fixed bottom-8 right-8 w-14 h-14 rounded-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group cursor-pointer"
        style={{
          background: "var(--accent)",
          color: "var(--text-inverse)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
        aria-label="New Load"
      >
        <span className="text-2xl font-light">+</span>
        <span
          className="absolute right-16 px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
          style={{
            background: "var(--bg-overlay)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          New Load
        </span>
      </button>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <p
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </p>
      <p
        className="text-4xl font-bold"
        style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
      >
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
  const hasExceptions = well.reviewCount > 0 || well.missingCount > 0;
  const borderColor = hasExceptions
    ? "var(--status-error)"
    : "var(--status-ready)";

  return (
    <div
      className="flex flex-col lg:flex-row lg:items-center justify-between p-5 gap-4 rounded-lg cursor-pointer transition-all duration-150"
      style={{
        background: "var(--bg-surface)",
        borderLeft: `3px solid ${borderColor}`,
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-elevated)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "var(--bg-surface)")
      }
    >
      {/* Well info */}
      <div className="flex items-center gap-5 min-w-[220px]">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {well.wellName}
          </h3>
          <span
            className="text-xs"
            style={{
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            📍 Basin
          </span>
        </div>
        <div
          className="px-3 py-1.5 rounded"
          style={{ background: "var(--bg-elevated)" }}
        >
          <span
            className="text-xl font-semibold"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {well.totalLoads}
          </span>
          <span
            className="text-xs ml-1.5 uppercase"
            style={{ color: "var(--text-tertiary)" }}
          >
            Loads
          </span>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2 flex-1 justify-center px-4">
        <StatusPill
          count={well.readyCount}
          label="Ready"
          color="var(--status-ready)"
          dimBg="var(--status-ready-dim)"
        />
        <StatusPill
          count={well.reviewCount}
          label="Review"
          color="var(--status-warning)"
          dimBg="var(--status-warning-dim)"
        />
        <StatusPill
          count={well.missingCount}
          label="Missing"
          color="var(--status-error)"
          dimBg="var(--status-error-dim)"
        />
      </div>

      {/* Operator + open */}
      <div className="flex items-center gap-5">
        {well.operators.length > 0 ? (
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: well.operators[0].color }}
            />
            <div className="flex flex-col">
              <span
                className="text-xs font-bold uppercase"
                style={{ color: "var(--text-secondary)" }}
              >
                {well.operators[0].name}
              </span>
              <span
                className="text-xs"
                style={{
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                }}
              >
                Active {well.operators[0].lastActive}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
              style={{
                background: "var(--bg-elevated)",
                border: "1px dashed var(--border-default)",
                color: "var(--text-tertiary)",
              }}
            >
              +
            </span>
            <span
              className="text-xs font-bold uppercase"
              style={{ color: "var(--text-tertiary)" }}
            >
              Unassigned
            </span>
          </div>
        )}
        <span
          className="p-2 rounded transition-colors text-sm"
          style={{
            background: "var(--bg-overlay)",
            color: "var(--text-secondary)",
          }}
        >
          ↗
        </span>
      </div>
    </div>
  );
}

function StatusPill({
  count,
  label,
  color,
  dimBg,
}: {
  count: number;
  label: string;
  color: string;
  dimBg: string;
}) {
  const dimmed = count === 0;
  return (
    <div
      className={`px-3 py-1 rounded-full flex items-center gap-2 ${dimmed ? "opacity-25" : ""}`}
      style={{ background: dimBg, border: `1px solid ${dimBg}` }}
    >
      <span
        className="font-bold text-sm"
        style={{ color, fontFamily: "var(--font-mono)" }}
      >
        {count}
      </span>
      <span
        className="text-xs uppercase font-semibold"
        style={{ color, opacity: 0.7, fontSize: "0.625rem" }}
      >
        {label}
      </span>
    </div>
  );
}

/* ---------- Mock data ---------- */

const MOCK_ACTIVITY = [
  {
    time: "14:22",
    html: `<span style="color: var(--accent); font-weight: 700">Stephanie</span> auto-approved <span style="font-family: var(--font-mono)">#BOL-8821</span> for Pendleton 1H.`,
  },
  {
    time: "14:18",
    html: `System flagged exception: <span style="color: var(--status-error); font-weight: 700">MISSING_TICKET</span> on Browning SilverHill.`,
  },
];

const MOCK_FEED: FeedData = {
  date: new Date().toISOString().split("T")[0],
  systemHandled: { loadsMatched: 47, bolsAttached: 38, photosLinked: 23 },
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
