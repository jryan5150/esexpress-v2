/**
 * Trucking-domain field validators ported from
 * jryan5150/bol-ocr-pipeline/lib/validators.py (2026-04-14).
 *
 * Used to gate JotForm auto-matching: if an OCR'd BOL looks like a date,
 * a street address, or has fewer than 3 digits, we don't trust it for
 * Tier 1 match. Also feeds the discrepancy panel with an explicit
 * "OCR format check failed" signal when a photo's BOL/weight/date
 * doesn't pass.
 *
 * Source-of-truth is the Python version — any rule changes there should
 * be mirrored here until we have a shared schema.
 */

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  normalized?: string | number;
  unit?: string;
  value?: number;
}

/**
 * Validate a ticket or BOL number.
 *
 * Rejects:
 *  - tokens with spaces (addresses like "J50 Ballard Road")
 *  - date-like patterns (M/D/YYYY, etc.)
 *  - time-like patterns (HH:MM)
 *  - tokens outside 4-30 alnum chars with allowed punctuation
 *  - tokens with fewer than 3 digits (rules out most names/addresses)
 */
export function validateTicketNumber(value: string | null): ValidationResult {
  if (!value || !String(value).trim()) {
    return { valid: false, reason: "empty" };
  }
  const text = String(value).trim();
  if (/\s/.test(text)) return { valid: false, reason: "contains_space" };
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(text))
    return { valid: false, reason: "date_like" };
  if (/\d{1,2}:\d{2}/.test(text)) return { valid: false, reason: "time_like" };
  if (!/^[A-Za-z0-9\-#./]{4,30}$/.test(text))
    return { valid: false, reason: "invalid_format" };
  const digits = text.match(/\d/g) ?? [];
  if (digits.length < 3) return { valid: false, reason: "too_few_digits" };
  return { valid: true, normalized: text.toUpperCase() };
}

/**
 * Validate a weight value (lbs). Default range 1,000-120,000 drops
 * single-digit OCR noise. Callers should narrow to the relevant field
 * range (gross: 10k-120k, tare: 5k-60k, net: 5k-80k).
 */
export function validateWeight(
  value: string | number | null,
  opts: { minVal?: number; maxVal?: number } = {},
): ValidationResult {
  const { minVal = 1000, maxVal = 120000 } = opts;
  if (value === null || value === undefined)
    return { valid: false, reason: "empty" };
  const text = String(value).trim().toLowerCase();
  if (!text) return { valid: false, reason: "empty" };
  const match = text.match(/(\d[\d,]*\.?\d*)/);
  if (!match) return { valid: false, reason: "non_numeric" };
  const numeric = parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return { valid: false, reason: "non_numeric" };
  if (numeric < minVal || numeric > maxVal)
    return { valid: false, reason: "out_of_range", value: numeric };
  return { valid: true, normalized: numeric, unit: "lbs" };
}

/** Validate net tons: 0.01 - 60. */
export function validateNetTons(
  value: string | number | null,
): ValidationResult {
  if (value === null || value === undefined)
    return { valid: false, reason: "empty" };
  const text = String(value).trim();
  if (!text) return { valid: false, reason: "empty" };
  const match = text.match(/(\d[\d,]*\.?\d*)/);
  if (!match) return { valid: false, reason: "non_numeric" };
  const numeric = parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return { valid: false, reason: "non_numeric" };
  if (numeric < 0.01 || numeric > 60)
    return { valid: false, reason: "out_of_range", value: numeric };
  return { valid: true, normalized: numeric, unit: "tons" };
}

/** Validate and normalize a date-like string. Handles embedded dates. */
export function validateDate(value: string | null): ValidationResult {
  if (!value || !String(value).trim()) return { valid: false, reason: "empty" };
  const text = String(value).trim();

  const datePatterns = [
    /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/,
    /\d{4}[/-]\d{1,2}[/-]\d{1,2}/,
    /\d{8}/,
  ];
  const candidates: string[] = [text];
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) candidates.unshift(m[0]);
  }

  for (const candidate of candidates) {
    const parsed = tryParseDate(candidate.trim());
    if (parsed && parsed.year >= 2000 && parsed.year <= 2100) {
      const yyyy = String(parsed.year).padStart(4, "0");
      const mm = String(parsed.month).padStart(2, "0");
      const dd = String(parsed.day).padStart(2, "0");
      return { valid: true, normalized: `${yyyy}-${mm}-${dd}` };
    }
  }
  return { valid: false, reason: "unparseable" };
}

/** Narrow field validators, matching Python FIELD_VALIDATORS. */
export const FIELD_VALIDATORS = {
  gross_weight: (v: string | number | null) =>
    validateWeight(v, { minVal: 10000, maxVal: 120000 }),
  tare_weight: (v: string | number | null) =>
    validateWeight(v, { minVal: 5000, maxVal: 60000 }),
  net_weight: (v: string | number | null) =>
    validateWeight(v, { minVal: 5000, maxVal: 80000 }),
  net_tons: validateNetTons,
  ticket_date: validateDate,
  ticket_number: validateTicketNumber,
} as const;

// ─── helpers ──────────────────────────────────────────────────────────────

function tryParseDate(
  s: string,
): { year: number; month: number; day: number } | null {
  // YYYY-MM-DD / YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };

  // M/D/YYYY, M-D-YYYY, etc. — ambiguous (US vs EU). Default to US (M/D/Y).
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    return { year, month: +m[1], day: +m[2] };
  }

  // YYYYMMDD
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };

  // MMDDYYYY (heuristic — try if month > 12 on the other interpretation)
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) {
    const month = +m[1];
    const day = +m[2];
    if (month <= 12 && day <= 31) return { year: +m[3], month, day };
  }

  // Free-form via Date constructor (covers "March 28, 2026", "28 Mar 2026", etc.)
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
    };
  }
  return null;
}
