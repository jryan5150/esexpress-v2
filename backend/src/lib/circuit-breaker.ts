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

function isHttpStatus(err: unknown, status: number): boolean {
  return err instanceof HttpError && err.status === status;
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

  return { policy: wrap(retryPolicy, breaker), breaker };
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

  return { policy: wrap(retryPolicy, breaker), breaker };
}

/** Diagnostic helper for /diag/ endpoint */
export function getBreakerState(breaker: CircuitBreakerPolicy): {
  state: number;
} {
  return { state: breaker.state };
}
