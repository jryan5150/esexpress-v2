/**
 * Jaro-Winkler string similarity.
 *
 * Used by Phase 5c of matching-v2 for driver-name fuzzy matching. Chosen over
 * Levenshtein because it handles common-prefix cases well (e.g., "Michael J"
 * vs "Michael James"), weights early-character agreement more heavily, and
 * is well-behaved on short strings like personal names.
 *
 * Returns a value in [0, 1]. 1.0 = exact match; 0.0 = no characters in
 * common within the matching window.
 *
 * Pure function. Inputs are not mutated.
 */

/**
 * Normalize for comparison: lowercase, strip accents, collapse whitespace,
 * remove common noise (dots, commas, "Jr", "Sr" suffixes).
 * Keeps the actual comparison charset small and predictable.
 */
export function normalizeName(s: string): string {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .replace(/[.,]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classic Jaro similarity.
 *
 * Match window = floor(max(len1, len2) / 2) - 1 characters either direction.
 * Counts matching characters within that window, then counts transpositions
 * (matched pairs in different order).
 */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const matched1 = new Array<boolean>(len1).fill(false);
  const matched2 = new Array<boolean>(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const lo = Math.max(0, i - matchWindow);
    const hi = Math.min(len2 - 1, i + matchWindow);
    for (let j = lo; j <= hi; j++) {
      if (matched2[j]) continue;
      if (s1[i] !== s2[j]) continue;
      matched1[i] = true;
      matched2[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Transpositions: walk both strings in order, count pairs out of sync
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!matched1[i]) continue;
    while (!matched2[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  return (
    matches / len1 / 3 +
    matches / len2 / 3 +
    (matches - transpositions) / matches / 3
  );
}

/**
 * Jaro-Winkler = Jaro + prefix bonus for up to 4 matching leading chars.
 * Standard scaling factor p = 0.1 (capped so J-W stays ≤ 1.0).
 */
export function jaroWinkler(a: string, b: string): number {
  const s1 = normalizeName(a);
  const s2 = normalizeName(b);
  const j = jaro(s1, s2);
  // Only apply prefix bonus when Jaro exceeds 0.7 (convention — avoids
  // over-rewarding strings that merely share first letters)
  if (j < 0.7) return j;
  let prefix = 0;
  const maxPrefix = Math.min(4, s1.length, s2.length);
  while (prefix < maxPrefix && s1[prefix] === s2[prefix]) prefix++;
  return j + prefix * 0.1 * (1 - j);
}

/**
 * Find the best fuzzy match in a roster. Returns the similarity score to
 * the closest match, or 0 when the roster is empty / input is empty.
 */
export function bestRosterMatch(
  needle: string | null,
  roster: readonly string[],
): number {
  if (!needle || roster.length === 0) return 0;
  let best = 0;
  for (const candidate of roster) {
    const s = jaroWinkler(needle, candidate);
    if (s > best) best = s;
    if (best === 1) return 1; // can't beat exact
  }
  return best;
}
