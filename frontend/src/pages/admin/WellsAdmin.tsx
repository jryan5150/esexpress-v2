import { useState } from "react";
import { Button } from "@/components/Button";

/* -------------------------------------------------------------------------- */
/*  WellsAdmin — CRUD management for well assets                              */
/* -------------------------------------------------------------------------- */

type WellStatus = "active" | "drilling" | "maintenance" | "shut-in";

interface AliasHistory {
  original: string;
  resolved: string;
  confidence: number;
  date: string;
}

interface MockWell {
  id: string;
  name: string;
  api: string;
  aliases: string[];
  propxJobId: string;
  status: WellStatus;
  dailyTarget: number;
  coordinates: string;
  aliasHistory: AliasHistory[];
}

const STATUS_STYLE: Record<
  WellStatus,
  { dot: string; glow: string; label: string }
> = {
  active: {
    dot: "bg-[var(--status-ready)]",
    glow: "shadow-[0_0_8px_var(--status-ready)]",
    label: "text-[var(--status-ready)]",
  },
  drilling: {
    dot: "bg-[var(--accent)]",
    glow: "shadow-[0_0_8px_var(--accent)]",
    label: "text-[var(--accent)]",
  },
  maintenance: {
    dot: "bg-[var(--status-error)]",
    glow: "shadow-[0_0_8px_var(--status-error)]",
    label: "text-[var(--status-error)]",
  },
  "shut-in": {
    dot: "bg-[var(--text-tertiary)]",
    glow: "",
    label: "text-[var(--text-tertiary)]",
  },
};

export function WellsAdmin() {
  const [expandedId, setExpandedId] = useState<string | null>("pendleton-1h");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = MOCK_WELLS.filter((w) => {
    const matchesStatus = statusFilter === "all" || w.status === statusFilter;
    const matchesSearch =
      search === "" ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.api.includes(search) ||
      w.propxJobId.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="p-6 pb-12 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-[var(--text-2xl)] font-extrabold tracking-tight text-[var(--text-primary)]">
            Wells Management
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Configure and monitor assets across 12 active basins.
          </p>
        </div>
        <Button variant="primary" className="px-6 py-2.5 font-bold">
          + Add Well
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="bg-[var(--bg-surface)] p-3 rounded-[var(--radius-lg)] flex flex-wrap items-center gap-4 border border-[var(--border-subtle)]">
        <div className="flex-1 min-w-[300px] relative">
          <input
            className="w-full bg-[var(--bg-elevated)] border-none rounded-[var(--radius-md)] pl-10 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-1 focus:ring-[var(--accent)]"
            placeholder="Filter by Well Name, API, or Job ID..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm">
            &#x1F50D;
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[var(--text-xs)] uppercase font-bold tracking-widest text-[var(--text-tertiary)]">
            Status:
          </label>
          <select
            className="bg-[var(--bg-elevated)] border-none rounded-[var(--radius-md)] text-sm py-2 px-4 text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent)]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="drilling">Drilling</option>
            <option value="maintenance">Maintenance</option>
            <option value="shut-in">Shut-in</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-[var(--bg-base)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] overflow-hidden">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="bg-[var(--bg-surface)] sticky top-0 z-10">
            <tr>
              {[
                "Well Name",
                "Aliases",
                "PropX Job ID",
                "Status",
                "Daily Target",
                "Coordinates",
                "",
              ].map((h, i) => (
                <th
                  key={i}
                  className={`px-6 py-4 text-[var(--text-xs)] font-bold uppercase tracking-widest text-[var(--text-tertiary)] border-b border-[var(--border-subtle)] ${
                    h === "Daily Target" ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.map((well) => {
              const isExpanded = expandedId === well.id;
              const style = STATUS_STYLE[well.status];

              return (
                <TableRows
                  key={well.id}
                  well={well}
                  style={style}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : well.id)}
                />
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="px-6 py-3 flex items-center justify-between text-[var(--text-xs)] text-[var(--text-tertiary)]">
          <span>
            Showing 1-{filtered.length} of {MOCK_WELLS.length} wells
          </span>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded hover:bg-[var(--bg-elevated)] transition-colors opacity-30"
              disabled
            >
              &larr;
            </button>
            <span className="font-bold text-[var(--accent)]">1</span>
            <button className="px-2 py-1 rounded hover:bg-[var(--bg-elevated)] transition-colors">
              2
            </button>
            <button className="px-2 py-1 rounded hover:bg-[var(--bg-elevated)] transition-colors">
              &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Table row (+ expanded detail)                                             */
/* -------------------------------------------------------------------------- */

function TableRows({
  well,
  style,
  isExpanded,
  onToggle,
}: {
  well: MockWell;
  style: { dot: string; glow: string; label: string };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const borderClass = isExpanded
    ? "bg-[var(--bg-elevated)] border-l-4 border-[var(--accent)]"
    : "group hover:bg-[var(--bg-elevated)] transition-colors";

  return (
    <>
      <tr className={borderClass}>
        <td className="px-6 py-4">
          <div className="font-bold text-[var(--text-primary)]">
            {well.name}
          </div>
          <div className="text-[10px] font-[var(--font-mono)] text-[var(--text-tertiary)]">
            API: {well.api}
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex flex-wrap gap-1.5 max-w-xs">
            {well.aliases.map((alias) => (
              <span
                key={alias}
                className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-[10px] px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer hover:bg-[var(--status-error-dim)] hover:text-[var(--status-error)] transition-colors"
              >
                {alias} &times;
              </span>
            ))}
            <span className="border border-dashed border-[var(--border-default)] text-[var(--text-tertiary)] text-[10px] px-2 py-0.5 rounded cursor-pointer hover:border-[var(--accent)] transition-colors">
              + Add
            </span>
          </div>
        </td>
        <td className="px-6 py-4">
          <span className="font-[var(--font-mono)] text-sm text-[var(--accent)]">
            {well.propxJobId}
          </span>
        </td>
        <td className="px-6 py-4">
          <div className="inline-flex items-center gap-2 bg-[var(--bg-overlay)] px-3 py-1 rounded-full border border-[var(--border-default)]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${style.dot} ${style.glow}`}
            />
            <span
              className={`font-[var(--font-mono)] text-[11px] font-bold uppercase ${style.label}`}
            >
              {well.status}
            </span>
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          <div className="font-[var(--font-mono)] text-sm font-medium text-[var(--text-primary)]">
            {well.dailyTarget.toLocaleString()}{" "}
            <span className="text-[10px] text-[var(--text-tertiary)]">BBL</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="font-[var(--font-mono)] text-xs text-[var(--text-tertiary)]">
            {well.coordinates}
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          <button
            className="text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
            onClick={onToggle}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? "\u25B2" : "\u25BC"}
          </button>
        </td>
      </tr>

      {isExpanded && well.aliasHistory.length > 0 && (
        <tr className="bg-[var(--bg-base)]">
          <td colSpan={7} className="px-6 py-6">
            <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-[var(--accent)] flex items-center gap-2">
                  Alias Match History
                </h4>
                <span className="text-[10px] font-medium text-[var(--text-tertiary)]">
                  Last {well.aliasHistory.length} automated resolutions
                </span>
              </div>
              <div className="space-y-2">
                {well.aliasHistory.map((h, idx) => {
                  const highConf = h.confidence >= 85;
                  const confColor = highConf
                    ? "bg-[var(--status-ready-dim)] text-[var(--status-ready)]"
                    : "bg-[var(--accent-dim)] text-[var(--accent)]";
                  const borderColor = highConf
                    ? "border-[var(--status-ready)]"
                    : "border-[var(--accent)]";

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between py-2 px-3 bg-[var(--bg-surface)] rounded border-l-2 ${borderColor}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-[var(--font-mono)] text-xs text-[var(--text-secondary)]">
                          {h.original}
                        </span>
                        <span className="text-sm text-[var(--text-tertiary)]">
                          &rarr;
                        </span>
                        <span className="font-[var(--font-mono)] text-xs font-bold text-[var(--text-primary)]">
                          {h.resolved}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div
                          className={`text-[10px] ${confColor} px-2 py-0.5 rounded font-bold`}
                        >
                          {h.confidence}% CONFIDENCE
                        </div>
                        <div className="text-[10px] font-[var(--font-mono)] text-[var(--text-tertiary)]">
                          {h.date}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_WELLS: MockWell[] = [
  {
    id: "blackwood-4h",
    name: "Blackwood 4H",
    api: "42-329-39401",
    aliases: ["BW-4-Horiz", "B-Wood-4H"],
    propxJobId: "PX-9928-102",
    status: "active",
    dailyTarget: 4250,
    coordinates: "31.968, -102.103",
    aliasHistory: [],
  },
  {
    id: "pendleton-1h",
    name: "Pendleton 1H",
    api: "42-329-41120",
    aliases: ["Pendlton 1-H"],
    propxJobId: "PX-5501-A90",
    status: "drilling",
    dailyTarget: 0,
    coordinates: "32.041, -101.988",
    aliasHistory: [
      {
        original: "Pendlton 1-H",
        resolved: "Pendleton 1H",
        confidence: 98,
        date: "2023-11-20 14:22",
      },
      {
        original: "PENDLETON #1",
        resolved: "Pendleton 1H",
        confidence: 92,
        date: "2023-11-18 09:10",
      },
      {
        original: "Pndltn Unit 1",
        resolved: "Pendleton 1H",
        confidence: 74,
        date: "2023-11-17 16:45",
      },
      {
        original: "PEN-1H",
        resolved: "Pendleton 1H",
        confidence: 99,
        date: "2023-11-15 11:12",
      },
      {
        original: "Pendleton 1H Rig 4",
        resolved: "Pendleton 1H",
        confidence: 88,
        date: "2023-11-14 18:30",
      },
    ],
  },
  {
    id: "sawyer-12h",
    name: "Sawyer 12H",
    api: "42-123-55610",
    aliases: ["SY-12H"],
    propxJobId: "PX-1200-S12",
    status: "maintenance",
    dailyTarget: 1800,
    coordinates: "32.112, -102.450",
    aliasHistory: [],
  },
  {
    id: "apache-ridge-7v",
    name: "Apache Ridge 7V",
    api: "42-461-22035",
    aliases: ["AR-7V", "Apache-R-7"],
    propxJobId: "PX-7744-AR7",
    status: "active",
    dailyTarget: 3100,
    coordinates: "31.845, -103.221",
    aliasHistory: [],
  },
  {
    id: "howard-draw-2h",
    name: "Howard Draw 2H",
    api: "42-227-18892",
    aliases: [],
    propxJobId: "PX-3301-HD2",
    status: "shut-in",
    dailyTarget: 0,
    coordinates: "32.305, -101.476",
    aliasHistory: [],
  },
];
