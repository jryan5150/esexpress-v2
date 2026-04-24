const BASE = (import.meta.env.VITE_API_URL || "") + "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = localStorage.getItem("esexpress-token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("esexpress-token");
    // Auth redirect handled by ProtectedRoute component
    throw new ApiError(401, "UNAUTHORIZED", "Session expired");
  }

  const json = await res.json().catch(() => ({}));

  // Single-operator soft-maintenance gate. The backend returns 403 with
  // code MAINTENANCE_MODE when the authenticated user's email isn't in
  // the MAINTENANCE_ALLOW_EMAILS allowlist. We surface this as a hard
  // app-level redirect to /maintenance so non-allowlisted users see a
  // friendly hold-page rather than scattered 403 errors per query.
  if (res.status === 403 && json.error?.code === "MAINTENANCE_MODE") {
    if (
      typeof window !== "undefined" &&
      window.location.pathname !== "/maintenance"
    ) {
      window.location.replace(
        `/maintenance?reason=${encodeURIComponent(
          json.error?.message ?? "Single-operator validation mode",
        )}`,
      );
    }
    throw new ApiError(
      403,
      "MAINTENANCE_MODE",
      json.error?.message ?? "Maintenance",
    );
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      json.error?.code || "UNKNOWN",
      json.error?.message || res.statusText,
    );
  }

  return json.data !== undefined && json.data !== null ? json.data : json;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
