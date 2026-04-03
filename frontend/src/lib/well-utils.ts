import type { WellWithStats } from "../types/api";

export function normalizeWellStats(raw: unknown[]): WellWithStats[] {
  return (raw as Array<Record<string, unknown>>)
    .map((w) => ({
      id: Number(w.id ?? 0),
      name: String(w.name ?? ""),
      aliases: (w.aliases as string[]) ?? [],
      propxDestinationId: (w.propxDestinationId as string) ?? null,
      propxJobId: (w.propxJobId as string) ?? null,
      latitude: null,
      longitude: null,
      dailyTargetLoads: 0,
      dailyTargetTons: null,
      status: "active" as const,
      createdAt: "",
      updatedAt: "",
      totalLoads: Number(w.totalLoads ?? (w as any).total_loads ?? 0),
      ready: Number(w.ready ?? 0),
      review: Number(w.review ?? 0),
      assigned: Number(w.assigned ?? 0),
      missing: Number(w.missing ?? 0),
      validated: Number(w.validated ?? 0),
    }))
    .filter((w) => w.totalLoads > 0);
}

export function resolvePhotoUrl(url: string): string {
  return url.startsWith("/")
    ? `${import.meta.env.VITE_API_URL || ""}${url}`
    : url;
}
