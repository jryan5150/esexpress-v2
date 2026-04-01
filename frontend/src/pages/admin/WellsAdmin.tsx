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
    dot: "bg-[var(--es-ready)]",
    glow: "shadow-[0_0_8px_#34d399]",
    label: "text-[var(--es-text-secondary)]",
  },
  drilling: {
    dot: "bg-[var(--es-accent)]",
    glow: "shadow-[0_0_8px_#f0692c]",
    label: "text-[var(--es-text-secondary)]",
  },
  maintenance: {
    dot: "bg-[var(--es-error)]",
    glow: "shadow-[0_0_8px_#ffb4ab]",
    label: "text-[var(--es-error)]/80",
  },
  "shut-in": {
    dot: "bg-[var(--es-text-tertiary)]",
    glow: "",
    label: "text-[var(--es-text-tertiary)]",
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
    <div className="px-8 pt-8 pb-10 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--es-text-primary)]">
            Wells Management
          </h1>
          <p className="text-[var(--es-text-secondary)] mt-1">
            Configure and monitor assets across 12 active basins.
          </p>
        </div>
        <Button
          variant="primary"
          className="px-6 py-2.5 font-bold shadow-lg shadow-[var(--es-accent)]/20"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "20px" }}
          >
            add_location_alt
          </span>
          Add Well
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#161b28] p-3 rounded-[var(--es-radius-lg)] flex flex-wrap items-center gap-4 border border-[var(--es-border-subtle)]">
        <div className="flex-1 min-w-[300px] relative">
          <input
            className="w-full bg-[var(--es-bg-elevated)] border-none rounded-[var(--es-radius-md)] pl-10 py-2 text-sm text-[var(--es-text-primary)] placeholder:text-[var(--es-text-tertiary)] focus:ring-1 focus:ring-[var(--es-accent)]"
            placeholder="Filter by Well Name, API, or Job ID..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--es-text-tertiary)]"
            style={{ fontSize: "20px" }}
          >
            search
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs uppercase font-bold tracking-widest text-[var(--es-text-tertiary)]">
            Status:
          </label>
          <select
            className="bg-[var(--es-bg-elevated)] border-none rounded-[var(--es-radius-md)] text-sm py-2 px-4 text-[var(--es-text-primary)] focus:ring-1 focus:ring-[var(--es-accent)]"
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
        <button className="p-2 bg-[var(--es-bg-elevated)] hover:bg-[var(--es-bg-overlay)] rounded-[var(--es-radius-md)] text-[var(--es-text-tertiary)] transition-colors">
          <span className="material-symbols-outlined">filter_list</span>
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-[var(--es-bg-inset)] rounded-[var(--es-radius-lg)] border border-[var(--es-border-subtle)] overflow-hidden">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="bg-[#161b28] sticky top-0 z-10">
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
                  className={`px-6 py-4 text-xs font-bold uppercase tracking-widest text-[var(--es-text-tertiary)] border-b border-[var(--es-border-subtle)] ${
                    h === "Daily Target" ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--es-border-subtle)]/50">
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
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-xs text-[var(--es-text-tertiary)]">
        <span>
          Showing 1-{filtered.length} of {MOCK_WELLS.length} wells
        </span>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-[var(--es-bg-elevated)] transition-colors disabled:opacity-20"
            disabled
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span className="font-bold text-[var(--es-accent)]">1</span>
          <button className="px-2 py-1 rounded hover:bg-[var(--es-bg-elevated)] transition-colors">
            2
          </button>
          <button className="px-2 py-1 rounded hover:bg-[var(--es-bg-elevated)] transition-colors">
            3
          </button>
          <span>...</span>
          <button className="px-2 py-1 rounded hover:bg-[var(--es-bg-elevated)] transition-colors">
            9
          </button>
          <button className="p-1 rounded hover:bg-[var(--es-bg-elevated)] transition-colors">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
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
    ? "bg-[var(--es-bg-elevated)]/20 border-l-4 border-[var(--es-accent)]"
    : "group hover:bg-[var(--es-bg-elevated)]/40 transition-colors";

  return (
    <>
      <tr className={borderClass}>
        <td className="px-6 py-4">
          <div className="font-bold text-[var(--es-text-primary)]">
            {well.name}
          </div>
          <div className="text-[10px] font-[var(--es-font-mono)] text-[var(--es-text-tertiary)]">
            API: {well.api}
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex flex-wrap gap-1.5 max-w-xs">
            {well.aliases.map((alias) => (
              <span
                key={alias}
                className="bg-[var(--es-bg-elevated)] text-[var(--es-text-secondary)] text-[10px] px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer hover:bg-[var(--es-error-dim)] hover:text-[var(--es-error)] transition-colors"
              >
                {alias}{" "}
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "12px" }}
                >
                  close
                </span>
              </span>
            ))}
            {isExpanded ? (
              <input
                className="bg-transparent border-none p-0 text-[10px] font-[var(--es-font-mono)] w-16 focus:ring-0 text-[var(--es-text-secondary)] placeholder:text-[var(--es-text-tertiary)]"
                placeholder="Type name..."
                type="text"
              />
            ) : (
              <span className="border border-dashed border-[var(--es-border-default)] text-[var(--es-text-tertiary)] text-[10px] px-2 py-0.5 rounded cursor-pointer hover:border-[var(--es-accent)] transition-colors">
                + Add
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-4">
          <span className="font-[var(--es-font-mono)] text-sm text-[var(--es-accent)]">
            {well.propxJobId}
          </span>
        </td>
        <td className="px-6 py-4">
          <div className="inline-flex items-center gap-2 bg-[var(--es-bg-overlay)] px-3 py-1 rounded-full border border-[var(--es-border-default)]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${style.dot} ${style.glow}`}
            />
            <span
              className={`font-[var(--es-font-mono)] text-[11px] font-bold uppercase ${style.label}`}
            >
              {well.status}
            </span>
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          <div className="font-[var(--es-font-mono)] text-sm font-medium text-[var(--es-text-primary)]">
            {well.dailyTarget.toLocaleString()}{" "}
            <span className="text-[10px] text-[var(--es-text-tertiary)]">
              BBL
            </span>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="font-[var(--es-font-mono)] text-xs text-[var(--es-text-tertiary)]">
            {well.coordinates}
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          <button
            className={`${isExpanded ? "text-[var(--es-accent)]" : "text-[var(--es-text-tertiary)]"} hover:text-[var(--es-accent)] transition-colors`}
            onClick={onToggle}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <span className="material-symbols-outlined">
              {isExpanded ? "expand_less" : "more_vert"}
            </span>
          </button>
        </td>
      </tr>

      {isExpanded && well.aliasHistory.length > 0 && (
        <tr className="bg-[var(--es-bg-inset)]/50">
          <td colSpan={7} className="px-6 py-6">
            <div className="bg-[var(--es-bg-inset)] border border-[var(--es-border-subtle)] rounded-[var(--es-radius-md)] p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--es-accent)] flex items-center gap-2">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "16px" }}
                  >
                    history
                  </span>
                  Alias Match History
                </h4>
                <span className="text-[10px] font-medium text-[var(--es-text-tertiary)]">
                  Last {well.aliasHistory.length} automated resolutions
                </span>
              </div>
              <div className="space-y-2">
                {well.aliasHistory.map((h, idx) => {
                  const highConf = h.confidence >= 85;
                  const confColor = highConf
                    ? "bg-[var(--es-ready-dim)] text-[var(--es-ready)]"
                    : "bg-[var(--es-accent-dim)] text-[var(--es-accent)]";
                  const borderColor = highConf
                    ? "border-[var(--es-ready)]"
                    : "border-[var(--es-accent)]";

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between py-2 px-3 bg-[var(--es-bg-surface)]/30 rounded border-l-2 ${borderColor}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-[var(--es-font-mono)] text-xs text-[var(--es-text-secondary)]">
                          {h.original}
                        </span>
                        <span className="material-symbols-outlined text-sm text-[var(--es-text-tertiary)]">
                          arrow_forward
                        </span>
                        <span className="font-[var(--es-font-mono)] text-xs font-bold text-[var(--es-text-primary)]">
                          {h.resolved}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div
                          className={`text-[10px] ${confColor} px-2 py-0.5 rounded font-bold`}
                        >
                          {h.confidence}% CONFIDENCE
                        </div>
                        <div className="text-[10px] font-[var(--es-font-mono)] text-[var(--es-text-tertiary)]">
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
