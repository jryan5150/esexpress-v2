/**
 * PCS status badge — renders reconciled PCS state on a workbench row.
 *
 * PCS is the source of truth for what's been billed through. This pill
 * surfaces, at a glance, whether v2 has matched the load to its PCS
 * counterpart and what PCS thinks its status is. Replaces the "go look at
 * the PCS list" tab-switch Jessica / Scout / Steph do today.
 *
 * States:
 *   - pcsStatus present → green/yellow/pink by phase (Active, Dispatched,
 *     Arrived, Delivered, etc.) with "PCS: <status>" text
 *   - pcsStatus null → no pill renders (load is "Not in PCS yet")
 *
 * Source: /api/v1/pcs/sync-loads populates assignments.pcsDispatch.pcs_status
 * via PCS GetLoads reconciliation.
 */

interface PcsPillProps {
  pcsStatus: string | null;
  pcsLoadId?: number | null;
}

// Status-to-palette mapping mirrors the traffic-light semantics used
// elsewhere: amber = pre-dispatch, yellow = in motion, pink = terminal.
function paletteFor(status: string): string {
  const s = status.toLowerCase();
  if (s === "active" || s === "pending" || s === "booked" || s === "ready") {
    return "bg-amber-50 text-amber-900 border-amber-300";
  }
  if (
    s === "dispatched" ||
    s === "assigned" ||
    s === "enroute" ||
    s === "moving" ||
    s === "arrived" ||
    s === "dropped"
  ) {
    return "bg-yellow-50 text-yellow-900 border-yellow-400";
  }
  if (s === "delivered" || s === "completed") {
    return "bg-pink-50 text-pink-900 border-pink-300";
  }
  if (s === "cancelled") {
    return "bg-gray-50 text-gray-700 border-gray-300";
  }
  return "bg-sky-50 text-sky-900 border-sky-300";
}

export function PcsPill({ pcsStatus, pcsLoadId }: PcsPillProps) {
  if (!pcsStatus) return null;
  const cls = paletteFor(pcsStatus);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${cls}`}
      title={pcsLoadId ? `PCS Load ID: ${pcsLoadId}` : undefined}
    >
      PCS: {pcsStatus}
    </span>
  );
}
