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

/** PropX: opens on 3 consecutive 429s, 5-minute cooldown */
export function createPropxBreaker() {
  const is429 = (err: unknown) => isHttpStatus(err, 429);

  const breaker = circuitBreaker(handleWhen(is429), {
    halfOpenAfter: 5 * 60 * 1000,
    breaker: new ConsecutiveBreaker(3),
  });

  const retryPolicy = retry(handleWhen(is429), {
    maxAttempts: 3,
    backoff: new ExponentialBackoff({ initialDelay: 2000, maxDelay: 60_000 }),
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
