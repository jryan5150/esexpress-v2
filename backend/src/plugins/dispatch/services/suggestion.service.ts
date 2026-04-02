import { normalizeName, similarityScore } from "../lib/fuzzy.js";

export interface WellCandidate {
  id: number;
  name: string;
  aliases: string[];
  propxJobId: string | null;
}

export interface SuggestionResult {
  wellId: number;
  wellName: string;
  score: number;
  tier: 1 | 2 | 3;
  matchType:
    | "propx_job_id"
    | "exact_name"
    | "exact_alias"
    | "fuzzy_name"
    | "fuzzy_alias"
    | "confirmed_mapping"
    | "unresolved";
}

const FUZZY_THRESHOLD = 0.5;

export function scoreSuggestions(
  destinationName: string,
  propxJobId: string | null,
  wells: WellCandidate[],
): SuggestionResult[] {
  const normalizedDest = normalizeName(destinationName);
  const results: SuggestionResult[] = [];

  for (const well of wells) {
    let bestScore = 0;
    let bestMatchType: SuggestionResult["matchType"] = "unresolved";

    if (propxJobId && well.propxJobId && propxJobId === well.propxJobId) {
      results.push({
        wellId: well.id,
        wellName: well.name,
        score: 1.0,
        tier: 1,
        matchType: "propx_job_id",
      });
      continue;
    }

    const normalizedWell = normalizeName(well.name);
    if (normalizedDest === normalizedWell) {
      results.push({
        wellId: well.id,
        wellName: well.name,
        score: 1.0,
        tier: 1,
        matchType: "exact_name",
      });
      continue;
    }

    const aliasExact = well.aliases.find(
      (alias) => normalizeName(alias) === normalizedDest,
    );
    if (aliasExact) {
      results.push({
        wellId: well.id,
        wellName: well.name,
        score: 1.0,
        tier: 1,
        matchType: "exact_alias",
      });
      continue;
    }

    const nameScore = similarityScore(normalizedDest, normalizedWell);
    if (nameScore > bestScore) {
      bestScore = nameScore;
      bestMatchType = "fuzzy_name";
    }

    for (const alias of well.aliases) {
      const aliasScore = similarityScore(normalizedDest, normalizeName(alias));
      if (aliasScore > bestScore) {
        bestScore = aliasScore;
        bestMatchType = "fuzzy_alias";
      }
    }

    if (bestScore > FUZZY_THRESHOLD) {
      results.push({
        wellId: well.id,
        wellName: well.name,
        score: bestScore,
        tier: 2,
        matchType: bestMatchType,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}
