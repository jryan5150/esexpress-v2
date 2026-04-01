import { useNavigate } from "react-router-dom";
import { useFeed } from "@/hooks/use-feed";
import type { FeedData, WellSummary } from "@/types/feed";

export function ExceptionFeed() {
  const navigate = useNavigate();
  const { data, isLoading } = useFeed();
  const feed = data ?? MOCK_FEED;

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--es-text-secondary)" }}
      >
        Loading feed...
      </div>
    );
  }

  const totalExceptions = feed.wellSummaries.reduce(
    (s, w) => s + w.reviewCount + w.missingCount,
    0,
  );
  const rate =
    feed.systemHandled.loadsMatched > 0
      ? (
          (feed.systemHandled.loadsMatched /
            (feed.systemHandled.loadsMatched + totalExceptions)) *
          100
        ).toFixed(1)
      : "0.0";

  return (
    <div className="p-8 pb-16 max-w-7xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--es-text-primary)" }}
          >
            EXCEPTION FEED
          </h1>
          <span
            className="text-xs uppercase tracking-widest px-2.5 py-1 hidden lg:inline-block"
            style={{
              color: "var(--es-text-tertiary)",
              background: "var(--es-bg-elevated)",
              borderRadius: "var(--es-radius-sm)",
            }}
          >
            Operational Status: High Alert
          </span>
        </div>
        <div className="es-surface flex items-center gap-2 px-3 py-2">
          <span style={{ color: "var(--es-text-tertiary)" }}>🔍</span>
          <input
            className="bg-transparent border-none focus:ring-0 focus:outline-none text-sm w-48"
            style={{ color: "var(--es-text-primary)" }}
            placeholder="Search BOL or Well..."
          />
        </div>
      </div>

      {/* System Handled */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div
          className="lg:col-span-3 p-6 relative overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, rgba(6, 78, 59, 0.30) 0%, #0f172a 100%)",
            borderLeft: "4px solid var(--es-ready)",
            border: "1px solid rgba(52, 211, 153, 0.15)",
            borderLeftWidth: "4px",
            borderLeftColor: "var(--es-ready)",
            borderRadius: "var(--es-radius-lg)",
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <span style={{ color: "var(--es-ready)", fontSize: "1.25rem" }}>
                  ✓
                </span>
                <h2
                  className="uppercase tracking-widest text-sm font-semibold"
                  style={{ color: "var(--es-ready)" }}
                >
                  System Handled Summary
                </h2>
              </div>
              <div className="flex flex-wrap gap-8">
                <Stat
                  label="Loads Auto-Matched"
                  value={feed.systemHandled.loadsMatched}
                />
                <Stat
                  label="BOLs Attached"
                  value={feed.systemHandled.bolsAttached}
                />
                <Stat
                  label="Photos Linked"
                  value={feed.systemHandled.photosLinked}
                />
              </div>
            </div>
            <button
              className="es-btn-accent flex items-center gap-2"
              style={{ borderRadius: "2px" }}
              onClick={() =>
                navigate(`/wells/${feed.wellSummaries[0]?.wellId ?? ""}`)
              }
            >
              Review &amp; Approve →
            </button>
          </div>
        </div>

        <div className="es-surface p-6 flex flex-col justify-between">
          <div>
            <span
              className="text-xs uppercase tracking-wider"
              style={{ color: "var(--es-text-tertiary)" }}
            >
              Automation Rate
            </span>
            <h3
              className="text-3xl font-bold"
              style={{ color: "var(--es-ready)" }}
            >
              {rate}%
            </h3>
          </div>
          <div
            className="w-full h-1.5 rounded-full mt-4"
            style={{ background: "var(--es-bg-inset)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${rate}%`,
                background: "var(--es-ready)",
                transition: "width 500ms ease",
              }}
            />
          </div>
          <p
            className="text-xs mt-2"
            style={{ color: "var(--es-text-tertiary)" }}
          >
            +4.2% from last shift
          </p>
        </div>
      </section>

      {/* Needs You */}
      <section className="space-y-6">
        <div
          className="flex items-center justify-between pb-4"
          style={{ borderBottom: "1px solid rgba(89, 66, 57, 0.15)" }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: "var(--es-accent)" }}>▲</span>
            <h2
              className="uppercase tracking-widest text-sm font-semibold"
              style={{ color: "#cbd5e1" }}
            >
              Needs You: Priority Exceptions
            </h2>
          </div>
          <span
            className="text-xs uppercase"
            style={{ color: "var(--es-text-tertiary)" }}
          >
            Sorted by: Exception Count ▾
          </span>
        </div>
        <div className="space-y-3">
          {feed.wellSummaries.map((w) => (
            <WellRow
              key={w.wellId}
              well={w}
              onClick={() => navigate(`/wells/${w.wellId}`)}
            />
          ))}
        </div>
      </section>

      {/* Activity + Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 es-surface-inset p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4
              className="text-xs uppercase tracking-widest"
              style={{ color: "var(--es-text-tertiary)" }}
            >
              Recent Activity Log
            </h4>
            <span
              className="text-[10px] font-bold cursor-pointer"
              style={{ color: "var(--es-accent)" }}
            >
              View All Logs
            </span>
          </div>
          {MOCK_ACTIVITY.map((e, i) => (
            <div
              key={i}
              className="flex items-start gap-4 p-2 hover:bg-[rgba(30,41,59,0.3)] rounded-sm transition-colors"
            >
              <span
                className="text-[10px] pt-0.5 shrink-0 es-mono"
                style={{ color: "var(--es-text-tertiary)" }}
              >
                {e.time}
              </span>
              <p
                className="text-sm"
                style={{ color: "var(--es-text-secondary)" }}
                dangerouslySetInnerHTML={{ __html: e.html }}
              />
            </div>
          ))}
        </div>
        <div
          className="p-6 flex flex-col justify-between"
          style={{
            background: "var(--es-bg-elevated)",
            border: "1px solid rgba(89, 66, 57, 0.1)",
            borderRadius: "var(--es-radius-lg)",
          }}
        >
          <div className="space-y-5">
            <h4
              className="text-xs uppercase tracking-widest"
              style={{ color: "var(--es-text-tertiary)" }}
            >
              Dispatcher Stats
            </h4>
            <div className="flex justify-between items-end">
              <span
                className="text-xs"
                style={{ color: "var(--es-text-secondary)" }}
              >
                Total Exceptions
              </span>
              <span
                className="text-xl es-mono"
                style={{ color: "var(--es-text-primary)" }}
              >
                12
              </span>
            </div>
            <div className="flex justify-between items-end">
              <span
                className="text-xs"
                style={{ color: "var(--es-text-secondary)" }}
              >
                Avg Resolve Time
              </span>
              <span
                className="text-xl es-mono"
                style={{ color: "var(--es-text-primary)" }}
              >
                4m 12s
              </span>
            </div>
          </div>
          <div className="mt-8 h-16 flex items-end gap-1">
            {[50, 75, 66, 100, 80].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${h}%`,
                  background: "var(--es-accent)",
                  opacity: 0.2 + i * 0.2,
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* FAB */}
      <button
        className="fixed bottom-8 right-8 w-14 h-14 rounded-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 cursor-pointer"
        style={{
          background: "var(--es-accent)",
          color: "var(--es-text-inverse)",
          boxShadow: "var(--es-shadow-lg)",
        }}
        aria-label="New Load"
      >
        <span className="text-2xl font-light">+</span>
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--es-text-tertiary)" }}
      >
        {label}
      </p>
      <p
        className="text-4xl font-bold es-mono"
        style={{ color: "var(--es-text-primary)" }}
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
  const hasExceptions = well.reviewCount + well.missingCount > 0;
  return (
    <div
      className={`bg-[var(--es-bg-surface)] hover:bg-[var(--es-bg-elevated)] transition-all border-l-[3px] ${hasExceptions ? "border-[var(--es-error)]" : "border-[var(--es-ready)]"} flex flex-col lg:flex-row lg:items-center justify-between p-4 gap-4 cursor-pointer group`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="flex items-center gap-6 min-w-[240px]">
        <div className="space-y-1">
          <h3
            className="text-lg font-bold"
            style={{ color: "var(--es-text-primary)" }}
          >
            {well.wellName}
          </h3>
          <div
            className="flex items-center gap-2 text-xs es-mono"
            style={{ color: "var(--es-text-tertiary)" }}
          >
            <span style={{ fontSize: "10px" }}>&#x1F4CD;</span>
            Basin
          </div>
        </div>
        <div
          className="px-3 py-1 rounded-sm"
          style={{ background: "rgba(30, 41, 59, 0.5)" }}
        >
          <span
            className="text-xl font-semibold es-mono"
            style={{ color: "var(--es-text-primary)" }}
          >
            {well.totalLoads}
          </span>
          <span
            className="text-[10px] ml-1 uppercase"
            style={{ color: "var(--es-text-tertiary)" }}
          >
            Loads
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 flex-1 justify-center px-4">
        <StatusPill count={well.readyCount} label="Ready" color="ready" />
        <StatusPill count={well.reviewCount} label="Review" color="warning" />
        <StatusPill count={well.missingCount} label="Missing" color="error" />
      </div>
      <div className="flex items-center gap-6">
        {well.operators.length > 0 ? (
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full overflow-hidden border shrink-0"
              style={{
                background: "var(--es-bg-overlay)",
                borderColor: `${well.operators[0].color}80`,
              }}
            />
            <div className="flex flex-col">
              <span
                className="text-[10px] font-bold uppercase"
                style={{ color: "var(--es-text-secondary)" }}
              >
                {well.operators[0].name}
              </span>
              <span
                className="es-mono"
                style={{ color: "var(--es-text-tertiary)", fontSize: "9px" }}
              >
                Active {well.operators[0].lastActive}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{
                background: "var(--es-bg-elevated)",
                border: "1px dashed var(--es-border-default)",
              }}
            >
              <span
                style={{ color: "var(--es-text-tertiary)", fontSize: "10px" }}
              >
                +
              </span>
            </div>
            <div className="flex flex-col">
              <span
                className="text-[10px] font-bold uppercase"
                style={{ color: "var(--es-text-tertiary)" }}
              >
                Unassigned
              </span>
              <span
                className="es-mono"
                style={{ color: "var(--es-text-tertiary)", fontSize: "9px" }}
              >
                --
              </span>
            </div>
          </div>
        )}
        <button
          className="p-2 rounded-sm transition-colors"
          style={{
            background: "var(--es-bg-overlay)",
            color: "var(--es-text-secondary)",
          }}
        >
          &#x2197;
        </button>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  ready: {
    bg: "rgba(52, 211, 153, 0.08)",
    text: "var(--es-ready)",
    border: "rgba(52, 211, 153, 0.15)",
    dimText: "var(--es-text-tertiary)",
  },
  warning: {
    bg: "rgba(251, 191, 36, 0.08)",
    text: "var(--es-warning)",
    border: "rgba(251, 191, 36, 0.15)",
    dimText: "var(--es-text-tertiary)",
  },
  error: {
    bg: "rgba(248, 113, 113, 0.1)",
    text: "var(--es-error)",
    border: "rgba(248, 113, 113, 0.2)",
    dimText: "var(--es-text-tertiary)",
  },
} as const;

function StatusPill({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: keyof typeof STATUS_COLORS;
}) {
  const c = STATUS_COLORS[color];
  const isDimmed = count === 0;
  return (
    <div
      className="px-3 py-1 rounded-full flex items-center gap-2"
      style={{
        background: isDimmed ? "rgba(30, 41, 59, 0.3)" : c.bg,
        border: `1px solid ${isDimmed ? "rgba(71, 85, 105, 0.3)" : c.border}`,
        opacity: isDimmed ? 0.3 : 1,
      }}
    >
      <span
        className="es-mono font-bold text-sm"
        style={{ color: isDimmed ? c.dimText : c.text }}
      >
        {count}
      </span>
      <span
        className="text-[10px] uppercase font-semibold"
        style={{ color: isDimmed ? c.dimText : `${c.text}99` }}
      >
        {label}
      </span>
    </div>
  );
}

const MOCK_ACTIVITY = [
  {
    time: "14:22",
    html: `<span style="color:var(--es-accent);font-weight:700">Stephanie</span> auto-approved <span class="es-mono">#BOL-8821</span> for Pendleton 1H.`,
  },
  {
    time: "14:18",
    html: `System flagged: <span style="color:var(--es-error);font-weight:700">MISSING_TICKET</span> on Browning SilverHill.`,
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
          userId: "s1",
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
          userId: "s2",
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
