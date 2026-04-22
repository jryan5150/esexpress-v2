/**
 * PCS status mapping tables.
 * Ported from pcs-soap.service.ts to be shared across SOAP + REST paths.
 * Pure data + pure functions; no I/O.
 */

/** PCS status string -> internal assignment status */
export const PCS_TO_INTERNAL: Record<string, string> = {
  DISPATCHED: "dispatched",
  "IN TRANSIT": "in_transit",
  "AT ORIGIN": "at_origin",
  LOADING: "loading",
  LOADED: "loaded",
  "EN ROUTE": "en_route",
  "AT DESTINATION": "at_destination",
  UNLOADING: "unloading",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  "ON HOLD": "on_hold",
  REJECTED: "rejected",
};

/** Internal assignment status -> PCS status string */
export const INTERNAL_TO_PCS: Record<string, string> = {
  dispatched: "DISPATCHED",
  in_transit: "IN TRANSIT",
  at_origin: "AT ORIGIN",
  loading: "LOADING",
  loaded: "LOADED",
  en_route: "EN ROUTE",
  at_destination: "AT DESTINATION",
  unloading: "UNLOADING",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
  completed: "COMPLETED",
  on_hold: "ON HOLD",
  rejected: "REJECTED",
};

export function mapPcsToInternal(pcsStatus: string): string | null {
  return PCS_TO_INTERNAL[pcsStatus] ?? null;
}

export function mapInternalToPcs(internalStatus: string): string | null {
  return INTERNAL_TO_PCS[internalStatus] ?? null;
}
