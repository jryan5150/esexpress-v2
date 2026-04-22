import { memo } from "react";
import type { LoadSource } from "../types/api";

/**
 * BOLDisplay — single source of truth for rendering a load's BOL identifier
 * across the dispatch surfaces (Load Center rows, Drawer, Load Report, BOL
 * Center cards, Validation rows).
 *
 * Vocabulary (decided with Jessica, 2026-04-21):
 *  - The paper ticket number IS THE BOL. This is what drivers, dispatchers,
 *    and Jessica mean when they say "BOL" in everyday speech.
 *  - Logistiq's AU… code (or any other system identifier carried in
 *    `loads.bol_no`) is a SYSTEM ID. It is never labeled "BOL" in the UI; it
 *    appears only as a muted suffix or tooltip context.
 *  - PropX, Logistiq, JotForm and Manual sources each get a small prefix
 *    label ("PropX BOL" / "Logistiq BOL" / …) so the user can tell at a
 *    glance where this row came from.
 *
 * Rendering rules:
 *  1. Primary display: `ticketNo` if present, else fall back to `bolNo`, else
 *     a dash ("--").
 *  2. When BOTH `ticketNo` and `bolNo` are present AND differ, render the
 *     ticket # as primary and the system ID as a muted suffix `· #<bolNo>`
 *     in smaller text.
 *  3. When only `bolNo` is present (no ticket number), render it alone with
 *     a tooltip explaining it's the system ID.
 *  4. The identifier itself always uses `font-mono` so numeric BOLs align
 *     visually across rows.
 *  5. A `title` attribute carries the full context for hover/a11y.
 */

const SOURCE_LABEL: Record<LoadSource, string> = {
  propx: "PropX",
  logistiq: "Logistiq",
  jotform: "JotForm",
  manual: "Manual",
};

export interface BOLDisplayProps {
  /** User-facing BOL (paper ticket number) — the primary identifier. */
  ticketNo: string | null | undefined;
  /** System identifier (Logistiq AU…, PropX BOL field, etc.). Muted suffix. */
  bolNo?: string | null;
  /** Ingest source — drives the uppercase prefix label. */
  loadSource?: LoadSource;
  /** Sizing preset — `sm` for row cells, `md` for drawer fields. */
  size?: "sm" | "md";
  /** Show the "<SOURCE> BOL" uppercase prefix. Default true. */
  showSourcePrefix?: boolean;
  /** Optional click handler (Load Report cells use this to navigate). */
  onClick?: () => void;
  /** Extra class hook for the outer wrapper. */
  className?: string;
}

function normalize(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

function buildTitle({
  ticket,
  bol,
  source,
}: {
  ticket: string | null;
  bol: string | null;
  source: LoadSource | undefined;
}): string {
  const srcPrefix = source ? SOURCE_LABEL[source] : null;
  if (ticket && bol && ticket !== bol) {
    return srcPrefix
      ? `${srcPrefix} BOL #${ticket} (system ID: ${bol})`
      : `BOL #${ticket} (system ID: ${bol})`;
  }
  if (ticket) {
    return srcPrefix ? `${srcPrefix} BOL #${ticket}` : `BOL #${ticket}`;
  }
  if (bol) {
    return srcPrefix
      ? `${srcPrefix} system ID: ${bol} (no ticket # on this load)`
      : `System ID: ${bol} (no ticket # on this load)`;
  }
  return "No BOL or ticket # on this load";
}

export const BOLDisplay = memo(function BOLDisplay({
  ticketNo,
  bolNo,
  loadSource,
  size = "sm",
  showSourcePrefix = true,
  onClick,
  className,
}: BOLDisplayProps) {
  const ticket = normalize(ticketNo);
  const bol = normalize(bolNo);
  const primary = ticket ?? bol;
  const showSystemSuffix = !!(ticket && bol && ticket !== bol);
  const onlySystemId = !ticket && !!bol;

  const monoSize = size === "md" ? "text-sm" : "text-xs";
  const suffixSize = size === "md" ? "text-xs" : "text-[10px]";
  const prefixCls =
    "text-[9px] uppercase tracking-wider text-on-surface-variant";

  const title = buildTitle({ ticket, bol, source: loadSource });

  const content = (
    <>
      {showSourcePrefix && loadSource ? (
        <span className={prefixCls} aria-hidden="true">
          {SOURCE_LABEL[loadSource]} BOL
        </span>
      ) : null}
      <span
        className={`font-mono ${monoSize} ${onlySystemId ? "text-on-surface-variant" : ""}`}
      >
        {primary ?? "--"}
      </span>
      {showSystemSuffix ? (
        <span
          className={`${suffixSize} text-on-surface-variant tabular-nums`}
          title={`System ID (Logistiq internal code / source-provided identifier) differs from the paper ticket number — both identify the same load.`}
        >
          · #{bol}
        </span>
      ) : null}
    </>
  );

  const wrapperCls = [
    "inline-flex items-baseline gap-1.5",
    onClick ? "cursor-pointer hover:underline" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={wrapperCls + " text-left"}
      >
        {content}
      </button>
    );
  }

  return (
    <span title={title} className={wrapperCls}>
      {content}
    </span>
  );
});
