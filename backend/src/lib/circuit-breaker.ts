import {
  circuitBreaker,
  retry,
  wrap,
  handleWhen,
  ConsecutiveBreaker,
  SamplingBreaker,
  ExponentialBackoff,
  type CircuitBreakerPolicy,
} from "cockatiel";
import { HttpError, NetworkError } from "./errors.js";
import { reportError } from "./sentry.js";

function isHttpStatus(err: unknown, status: number): boolean {
  return err instanceof HttpError && err.status === status;
}

/**
 * Attach state-change listeners to a Cockatiel circuit breaker so we
 * actually find out when one trips. Without this, a 3 AM outage at PropX
 * silently degrades sync-runs and the only signal is aggregate failure
 * counts. With it, every state transition lands in stdout (Railway logs
 * are stream-searchable) and onBreak also pings Sentry as a warning so
 * the operator sees it without tailing.
 *
 * Reviewer call-out 2026-04-24: best-practices agent flagged the
 * absence of these listeners as a production-readiness gap.
 */
export function instrumentBreaker(name: string, breaker: CircuitBreakerPolicy) {
  breaker.onBreak((reason) => {
    const detail =
      reason && typeof reason === "object" && "value" in reason
        ? String((reason as { value: unknown }).value)
        : String(reason);
    console.error(`[breaker:${name}] OPEN — ${detail}`);
    reportError(new Error(`Circuit breaker opened: ${name}`), {
      tags: { breaker: name, event: "open" },
      extra: { detail },
    });
  });
  breaker.onReset(() => {
    console.log(`[breaker:${name}] CLOSED — service recovered`);
  });
  breaker.onHalfOpen(() => {
    console.log(`[breaker:${name}] HALF-OPEN — testing recovery`);
  });
  return breaker;
}

/** PropX: opens on 5 consecutive throttle signals, 5-minute cooldown.
 *
 *  PropX returns BOTH 429 AND 401 as throttle indicators when the API
 *  key has been hammered too quickly. Observed empirically 2026-04-24:
 *  ~80 rapid job-page requests triggered a wave of HTTP 401
 *  ("Unauthorization Request") instead of 429. The auth key itself is
 *  fine — verified by subsequent successful requests after a pause.
 *  Treat both as soft-throttle: retry with backoff.
 */
export function createPropxBreaker() {
  const isThrottle = (err: unknown) =>
    isHttpStatus(err, 429) || isHttpStatus(err, 401);

  const breaker = circuitBreaker(handleWhen(isThrottle), {
    halfOpenAfter: 5 * 60 * 1000,
    breaker: new ConsecutiveBreaker(5),
  });

  const retryPolicy = retry(handleWhen(isThrottle), {
    maxAttempts: 4,
    backoff: new ExponentialBackoff({ initialDelay: 3000, maxDelay: 60_000 }),
  });

  return {
    policy: wrap(retryPolicy, instrumentBreaker("propx", breaker)),
    breaker,
  };
}

/** PCS: opens on 50% failure rate in 30s window, 60s cooldown */
export function createPcsBreaker() {
  const isNetworkErr = (err: unknown): boolean => {
    if (err instanceof NetworkError) return true;
    if (err instanceof Error && err.name === "TimeoutError") return true;
    return false;
  };

  const breaker = circuitBreaker(handleWhen(isNetworkErr), {
    halfOpenAfter: 60_000,
    breaker: new SamplingBreaker({
      threshold: 0.5,
      duration: 30_000,
      minimumRps: 5 / 30,
    }),
  });

  const retryPolicy = retry(handleWhen(isNetworkErr), {
    maxAttempts: 2,
    backoff: new ExponentialBackoff({ initialDelay: 3000, maxDelay: 30_000 }),
  });

  return {
    policy: wrap(retryPolicy, instrumentBreaker("pcs", breaker)),
    breaker,
  };
}

/** JotForm: opens on 5 consecutive throttle/auth signals, 5-min cooldown.
 *
 *  JotForm Enterprise rate-limits at the form-API + uploads level. 429s
 *  are common during driver shift-change bursts (multiple photos in
 *  parallel). We treat 429 + 5xx as retryable. The existing manual
 *  retry loop in jotform.service.ts is replaced by this policy.
 */
export function createJotformBreaker() {
  const isTransient = (err: unknown) =>
    isHttpStatus(err, 429) || (err instanceof HttpError && err.status >= 500);

  const breaker = circuitBreaker(handleWhen(isTransient), {
    halfOpenAfter: 5 * 60 * 1000,
    breaker: new ConsecutiveBreaker(5),
  });

  const retryPolicy = retry(handleWhen(isTransient), {
    maxAttempts: 3,
    backoff: new ExponentialBackoff({ initialDelay: 2000, maxDelay: 30_000 }),
  });

  return {
    policy: wrap(retryPolicy, instrumentBreaker("jotform", breaker)),
    breaker,
  };
}

/** Logistiq: opens on 3 consecutive 5xx, 2-min cooldown.
 *
 *  Logistiq exports are batch-style (login → role → fetch). A single
 *  transient 5xx in the middle of the chain killed the whole sync
 *  pre-fix; with retry we get auto-recovery + the breaker prevents
 *  cascading failures if Logistiq is genuinely down.
 */
export function createLogistiqBreaker() {
  const isTransient = (err: unknown) => {
    if (err instanceof HttpError && err.status >= 500) return true;
    if (err instanceof NetworkError) return true;
    if (err instanceof Error && err.name === "TimeoutError") return true;
    return false;
  };

  const breaker = circuitBreaker(handleWhen(isTransient), {
    halfOpenAfter: 2 * 60 * 1000,
    breaker: new ConsecutiveBreaker(3),
  });

  const retryPolicy = retry(handleWhen(isTransient), {
    maxAttempts: 3,
    backoff: new ExponentialBackoff({ initialDelay: 2000, maxDelay: 20_000 }),
  });

  return {
    policy: wrap(retryPolicy, instrumentBreaker("logistiq", breaker)),
    breaker,
  };
}

/** Anthropic Vision (BOL OCR): opens on 5 consecutive 429/529, 2-min cooldown.
 *
 *  Anthropic returns 429 (rate limit) and 529 (overloaded) when their
 *  API is under stress. Vision specifically can be slow + spiky during
 *  daytime peaks. The bol_submissions.retry_count provides per-row
 *  backoff; this breaker provides cross-request circuit protection so a
 *  burst of failures doesn't cascade into hundreds of retries.
 *
 *  Already-running PQueue inside extractFromPhotos provides the
 *  concurrency cap; this layer adds retry+breaker on top.
 */
export function createAnthropicBreaker() {
  const isTransient = (err: unknown) => {
    if (err instanceof HttpError && (err.status === 429 || err.status === 529))
      return true;
    if (err instanceof HttpError && err.status >= 500) return true;
    // Anthropic SDK throws errors with .status property too
    if (err && typeof err === "object" && "status" in err) {
      const s = (err as { status: unknown }).status;
      if (typeof s === "number" && (s === 429 || s === 529 || s >= 500))
        return true;
    }
    return false;
  };

  const breaker = circuitBreaker(handleWhen(isTransient), {
    halfOpenAfter: 2 * 60 * 1000,
    breaker: new ConsecutiveBreaker(5),
  });

  const retryPolicy = retry(handleWhen(isTransient), {
    maxAttempts: 3,
    backoff: new ExponentialBackoff({ initialDelay: 2000, maxDelay: 30_000 }),
  });

  return {
    policy: wrap(retryPolicy, instrumentBreaker("anthropic", breaker)),
    breaker,
  };
}

/** Microsoft Graph (notification email): opens on 3 consecutive 5xx, 1-min cooldown.
 *
 *  Used for outbound notification emails (low-volume). Bad credentials
 *  return 401 → fatal; 5xx + network → transient + retry. Graph token
 *  endpoint already separates fatal vs retryable in graph-email.service.ts;
 *  this breaker adds cross-call circuit protection.
 */
export function createGraphBreaker() {
  const isTransient = (err: unknown) => {
    if (err instanceof HttpError && err.status >= 500) return true;
    if (err instanceof NetworkError) return true;
    if (err instanceof Error && err.name === "TimeoutError") return true;
    return false;
  };

  const breaker = circuitBreaker(handleWhen(isTransient), {
    halfOpenAfter: 60_000,
    breaker: new ConsecutiveBreaker(3),
  });

  const retryPolicy = retry(handleWhen(isTransient), {
    maxAttempts: 2,
    backoff: new ExponentialBackoff({ initialDelay: 1500, maxDelay: 15_000 }),
  });

  return {
    policy: wrap(retryPolicy, instrumentBreaker("graph", breaker)),
    breaker,
  };
}

/** Diagnostic helper for /diag/ endpoint */
export function getBreakerState(breaker: CircuitBreakerPolicy): {
  state: number;
} {
  return { state: breaker.state };
}
