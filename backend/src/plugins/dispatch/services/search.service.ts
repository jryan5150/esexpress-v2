import { sql, desc, and, or, type SQL } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { loads, assignments, wells } from "../../../db/schema.js";
import { eraFilter } from "../lib/era-filter.js";

export interface SearchResult {
  id: number;
  loadNo: string;
  driverName: string | null;
  carrierName: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  deliveredOn: Date | null;
  wellName: string | null;
}

export interface SearchResponse {
  live: SearchResult[];
  archive: SearchResult[];
}

function buildSearchCondition(term: string): SQL {
  const prefix = `${term}%`;
  const contains = `%${term}%`;
  return or(
    sql`${loads.loadNo} ILIKE ${prefix}`,
    sql`${loads.bolNo} ILIKE ${prefix}`,
    sql`${loads.ticketNo} ILIKE ${prefix}`,
    sql`${loads.driverName} ILIKE ${contains}`,
    sql`${loads.carrierName} ILIKE ${contains}`,
    sql`${wells.name} ILIKE ${contains}`,
  )!;
}

async function searchEra(
  db: Database,
  term: string,
  era: "live" | "archive",
  limit: number,
): Promise<SearchResult[]> {
  const rows = await db
    .select({
      id: loads.id,
      loadNo: loads.loadNo,
      driverName: loads.driverName,
      carrierName: loads.carrierName,
      bolNo: loads.bolNo,
      ticketNo: loads.ticketNo,
      deliveredOn: loads.deliveredOn,
      wellName: wells.name,
    })
    .from(loads)
    .leftJoin(assignments, sql`${assignments.loadId} = ${loads.id}`)
    .leftJoin(wells, sql`${wells.id} = ${assignments.wellId}`)
    .where(and(eraFilter(era), buildSearchCondition(term)))
    .orderBy(desc(loads.deliveredOn))
    .limit(limit);

  return rows;
}

export async function searchLoads(
  db: Database,
  term: string,
  limit = 10,
): Promise<SearchResponse> {
  const [live, archive] = await Promise.all([
    searchEra(db, term, "live", limit),
    searchEra(db, term, "archive", limit),
  ]);

  return { live, archive };
}
