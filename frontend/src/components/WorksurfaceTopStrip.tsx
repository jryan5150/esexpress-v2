import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface MatrixRow {
  builder: string;
  customer: string | null;
  customerId: number | null;
  isPrimary: boolean;
  notes: string | null;
  counts: {
    sun: number;
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    sat: number;
  };
  total: number;
}

interface MatrixPayload {
  weekStart: string;
  weekEnd: string;
  matrix: MatrixRow[];
  grandTotal: number;
}

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  weekStart?: string;
  currentHighlight?: number | "all" | "mine_only" | null;
  onBuilderClick?: (customerId: number | null) => void;
}

export function WorksurfaceTopStrip({
  weekStart,
  currentHighlight,
  onBuilderClick,
}: Props) {
  const matrixQuery = useQuery({
    queryKey: ["worksurface", "top-strip", weekStart],
    queryFn: () =>
      api.get<MatrixPayload>(
        weekStart
          ? `/diag/builder-matrix?weekStart=${weekStart}`
          : `/diag/builder-matrix`,
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const data = matrixQuery.data;
  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-3 text-xs text-text-secondary">
        Loading top strip...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-text-secondary border-b border-border">
            <th className="py-2 pl-3 pr-2">Bill To</th>
            <th className="py-2 pr-2">Builder</th>
            {DOW_LABELS.map((d) => (
              <th key={d} className="py-2 pr-2 text-right tabular-nums w-12">
                {d}
              </th>
            ))}
            <th className="py-2 pr-3 text-right tabular-nums font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.matrix.map((r) => {
            const isActive =
              currentHighlight != null &&
              currentHighlight !== "all" &&
              currentHighlight !== "mine_only" &&
              r.customerId === currentHighlight;
            return (
              <tr
                key={`${r.builder}-${r.customerId ?? "none"}`}
                className={`border-b border-border/40 cursor-pointer hover:bg-bg-tertiary ${
                  r.isPrimary ? "" : "opacity-70"
                } ${isActive ? "bg-accent/10 border-l-2 border-l-accent" : ""}`}
                onClick={() => onBuilderClick?.(r.customerId)}
              >
                <td className="py-1.5 pl-3 pr-2">
                  {r.customer ?? (
                    <span className="italic text-text-secondary">
                      (floater)
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2 font-medium">
                  {r.builder}
                  {!r.isPrimary && (
                    <span className="ml-1 text-[10px] px-1 rounded bg-bg-primary text-text-secondary border border-border">
                      backup
                    </span>
                  )}
                </td>
                {DOW.map((dk) => (
                  <td
                    key={dk}
                    className="py-1.5 pr-2 text-right tabular-nums text-text-secondary"
                  >
                    {r.counts[dk] || ""}
                  </td>
                ))}
                <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">
                  {r.total.toLocaleString()}
                </td>
              </tr>
            );
          })}
          <tr className="bg-bg-primary/40">
            <td
              colSpan={2}
              className="py-2 pl-3 pr-2 font-semibold uppercase tracking-wide"
            >
              Grand
            </td>
            {DOW.map((dk) => {
              const total = data.matrix.reduce(
                (a, r) => a + (r.counts[dk] || 0),
                0,
              );
              return (
                <td
                  key={dk}
                  className="py-2 pr-2 text-right tabular-nums font-medium"
                >
                  {total || ""}
                </td>
              );
            })}
            <td className="py-2 pr-3 text-right tabular-nums font-bold text-base">
              {data.grandTotal.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
