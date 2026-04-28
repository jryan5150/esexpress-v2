import { useCurrentUser } from "./use-auth";
import type { Role } from "../types/api";

/**
 * Role + permission helpers. Centralizes the "can this user do X?"
 * decisions so route guards on the backend and UI gating on the
 * frontend stay in lockstep.
 *
 * Taxonomy locked 2026-04-28:
 *   admin   — full read/write everywhere (Jess, Bryan, Mike, Jace)
 *   builder — unscoped R/W on dispatch surfaces; can push to PCS
 *   finance — owns rate + invoicing; read-only on dispatch surfaces
 *   viewer  — read-only across the app
 *
 * Backend mirror: backend/src/db/schema.ts (users.role enum) +
 * route-level fastify.requireRole guards.
 */

export interface RoleCapabilities {
  /** Pull the live role; returns null while user is loading. */
  role: Role | null;
  /** Anyone signed in. Use for hide-when-loading UI states. */
  isAuthenticated: boolean;
  /** Admin = Jess/Bryan/Mike/Jace. Full access. */
  isAdmin: boolean;
  /** Builder = Scout/Steph/Keli/Crystal/Katie/Jenny. */
  isBuilder: boolean;
  /** Finance = invoicing + rate ownership. */
  isFinance: boolean;
  /** Viewer = read-only auditor / observer. */
  isViewer: boolean;

  // Capability flags — prefer these over role checks in the JSX so the
  // policy stays in this file.
  /** Edit dispatch fields (driver, ticket #, weight, etc.). */
  canEditDispatch: boolean;
  /** Advance handler stage (Uncertain → Ready → … → Cleared). */
  canAdvanceStage: boolean;
  /** Push a load to PCS. */
  canPushPcs: boolean;
  /** Edit rate fields (per-ton rate, FSC, FFC, mileage). */
  canEditRate: boolean;
  /** Edit non-rate well fields (aliases, daily target, etc.). */
  canEditWell: boolean;
  /** Read/write the /finance page (payment batches, invoicing). */
  canEditFinance: boolean;
  /** Manage users + role assignments. */
  canManageUsers: boolean;
}

export function useRole(): RoleCapabilities {
  const userQuery = useCurrentUser();
  const role = (userQuery.data?.role ?? null) as Role | null;

  const isAdmin = role === "admin";
  const isBuilder = role === "builder";
  const isFinance = role === "finance";
  const isViewer = role === "viewer";

  return {
    role,
    isAuthenticated: !!userQuery.data,
    isAdmin,
    isBuilder,
    isFinance,
    isViewer,

    // Dispatch + PCS — admin and builder
    canEditDispatch: isAdmin || isBuilder,
    canAdvanceStage: isAdmin || isBuilder,
    canPushPcs: isAdmin || isBuilder,

    // Wells — finance owns rate, admin owns the rest, builder reads
    canEditRate: isAdmin || isFinance,
    canEditWell: isAdmin || isBuilder || isFinance,

    // Finance routes — finance + admin
    canEditFinance: isAdmin || isFinance,

    // Sensitive ops — admin only
    canManageUsers: isAdmin,
  };
}
