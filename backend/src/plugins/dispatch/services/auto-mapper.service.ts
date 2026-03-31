import { eq } from 'drizzle-orm';
import { loads, wells } from '../../../db/schema.js';
import { scoreSuggestions, type SuggestionResult } from './suggestion.service.js';
import { createAssignment } from './assignments.service.js';
import { createLocationMapping } from './mappings.service.js';
import type { Database } from '../../../db/client.js';

export interface AutoMapResult {
  loadId: number;
  loadNo: string;
  destinationName: string | null;
  tier: 1 | 2 | 3;
  suggestion: SuggestionResult | null;
  assignmentId: number | null;
  error?: string;
}

export function classifyTier(suggestion: { score: number; matchType: string }): 1 | 2 | 3 {
  if (
    suggestion.matchType === 'propx_job_id' ||
    suggestion.matchType === 'exact_name' ||
    suggestion.matchType === 'exact_alias' ||
    suggestion.matchType === 'confirmed_mapping'
  ) {
    return 1;
  }
  if (suggestion.score > 0.5) {
    return 2;
  }
  return 3;
}

export async function processLoadBatch(
  db: Database,
  loadIds: number[],
  systemUserId: number,
): Promise<AutoMapResult[]> {
  // Fetch all active wells once — no N+1
  const allWells = await db
    .select({
      id: wells.id,
      name: wells.name,
      aliases: wells.aliases,
      propxJobId: wells.propxJobId,
    })
    .from(wells)
    .where(eq(wells.status, 'active'));

  const candidates = allWells.map((w) => ({
    ...w,
    aliases: (w.aliases ?? []) as string[],
    propxJobId: w.propxJobId,
  }));

  const results: AutoMapResult[] = [];

  for (const loadId of loadIds) {
    try {
      const [load] = await db.select().from(loads).where(eq(loads.id, loadId)).limit(1);
      if (!load) {
        results.push({
          loadId,
          loadNo: '',
          destinationName: null,
          tier: 3,
          suggestion: null,
          assignmentId: null,
          error: 'Load not found',
        });
        continue;
      }

      const suggestions = scoreSuggestions(load.destinationName ?? '', null, candidates);

      if (suggestions.length === 0) {
        results.push({
          loadId,
          loadNo: load.loadNo,
          destinationName: load.destinationName,
          tier: 3,
          suggestion: null,
          assignmentId: null,
        });
        continue;
      }

      const topSuggestion = suggestions[0];
      const tier = classifyTier(topSuggestion);

      if (tier <= 2) {
        try {
          const assignment = await createAssignment(db, {
            wellId: topSuggestion.wellId,
            loadId,
            assignedBy: systemUserId,
            assignedByName: 'Auto-Mapper',
            autoMapTier: tier,
            autoMapScore: topSuggestion.score.toString(),
          });

          if (load.destinationName) {
            await createLocationMapping(db, {
              sourceName: load.destinationName,
              wellId: topSuggestion.wellId,
              confidence: topSuggestion.score.toString(),
              confirmed: tier === 1,
            });
          }

          results.push({
            loadId,
            loadNo: load.loadNo,
            destinationName: load.destinationName,
            tier,
            suggestion: topSuggestion,
            assignmentId: assignment.id,
          });
        } catch (err: any) {
          results.push({
            loadId,
            loadNo: load.loadNo,
            destinationName: load.destinationName,
            tier,
            suggestion: topSuggestion,
            assignmentId: null,
            error: err.message,
          });
        }
      } else {
        results.push({
          loadId,
          loadNo: load.loadNo,
          destinationName: load.destinationName,
          tier: 3,
          suggestion: topSuggestion,
          assignmentId: null,
        });
      }
    } catch (err: any) {
      results.push({
        loadId,
        loadNo: '',
        destinationName: null,
        tier: 3,
        suggestion: null,
        assignmentId: null,
        error: err.message,
      });
    }
  }

  return results;
}
