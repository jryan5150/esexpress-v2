import { describe, it, expect } from "vitest";
import {
  createPropxBreaker,
  createPcsBreaker,
  getBreakerState,
} from "../../src/lib/circuit-breaker.js";

describe("Circuit Breaker Factories", () => {
  it("createPropxBreaker returns policy and breaker", () => {
    const { policy, breaker } = createPropxBreaker();
    expect(policy).toBeDefined();
    expect(breaker).toBeDefined();
  });

  it("createPcsBreaker returns policy and breaker", () => {
    const { policy, breaker } = createPcsBreaker();
    expect(policy).toBeDefined();
    expect(breaker).toBeDefined();
  });

  it("getBreakerState returns numeric state for diagnostics", () => {
    const { breaker } = createPropxBreaker();
    const state = getBreakerState(breaker);
    expect(state).toHaveProperty("state");
    // 0 = Closed (healthy initial state)
    expect(state.state).toBe(0);
  });

  it("propx breaker executes successful operations through the policy", async () => {
    const { policy } = createPropxBreaker();
    const result = await policy.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("pcs breaker executes successful operations through the policy", async () => {
    const { policy } = createPcsBreaker();
    const result = await policy.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });
});
