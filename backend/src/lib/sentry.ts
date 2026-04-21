import * as Sentry from "@sentry/node";

/**
 * Initialize Sentry if SENTRY_DSN_BACKEND env var is present. Silent no-op
 * if absent so local dev and CI don't need Sentry configured. Call this
 * BEFORE building the Fastify app so any init-time errors are captured.
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN_BACKEND;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0, // errors only; perf tracing not wired
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
  });
  return true;
}

/** Report a caught error with optional context. No-op if Sentry isn't initialized. */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!process.env.SENTRY_DSN_BACKEND) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export { Sentry };
