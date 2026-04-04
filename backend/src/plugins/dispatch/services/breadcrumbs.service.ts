import type { Database } from "../../../db/client.js";
import { breadcrumbs } from "../../../db/schema.js";

export interface BreadcrumbEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  zone: "live" | "archive" | "search";
  timestamp: string;
}

export async function insertBreadcrumbs(
  db: Database,
  userId: number,
  events: BreadcrumbEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const rows = events.map((e) => ({
    userId,
    eventType: e.eventType,
    eventData: e.eventData,
    zone: e.zone,
    createdAt: new Date(e.timestamp),
  }));

  await db.insert(breadcrumbs).values(rows);
}
