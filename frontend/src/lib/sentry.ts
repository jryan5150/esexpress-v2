import * as Sentry from "@sentry/react";

/**
 * Initialize Sentry if VITE_SENTRY_DSN_FRONTEND is present at build time.
 * Silent no-op if absent so local dev and preview builds don't need it.
 */
export function initSentry(): boolean {
  const dsn = import.meta.env.VITE_SENTRY_DSN_FRONTEND;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    release: import.meta.env.VITE_COMMIT_SHA,
  });
  return true;
}

export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!import.meta.env.VITE_SENTRY_DSN_FRONTEND) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export { Sentry };
