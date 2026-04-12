# CLAUDE.md — ES Express v2

> **Generated:** 2026-04-12
> **Upstream:** `GLOBAL_PROTOCOL.md` (architectural identity), `SKILL_CHEST.md` (analytical lenses), `AGENT_HARNESS_PROTOCOL.md` (harness engineering)
> **Status:** Active development — Round 4 MVD in progress, maintenance page live, dual-run target ~2026-04-14

---

## Architecture Overview

ES Express v2 is a dispatch operations platform for oilfield services trucking (ES Express LLC). It ingests load data from three sources (PropX API, Logistiq carrier export, JotForm driver submissions), matches loads against BOL photo extractions using a tiered confidence engine, and surfaces a validation + build workflow for the dispatch team to copy verified loads into PCS (the shipper's system of record).

The system is a pnpm monorepo: `backend/` (Fastify + Drizzle ORM + PostgreSQL on Railway) and `frontend/` (React 19 + Vite 6 + Tailwind v4 on Vercel). The backend runs a scheduled sync pipeline (4 AM full + every 4 hours refresh), an auto-mapper that assigns loads to wells, and a reconciliation service that detects field-level discrepancies between BOL extractions and load records. The frontend provides four workflow surfaces: Build Workbench (dispatch desk), Exception Loop (validation page), Oversight View (manager dashboard — planned), and Configuration (admin).

The matching engine uses a three-strategy cascade: ticket_no exact → load_no exact → driver+date+weight fuzzy. Photo gate rule: `isTier1 = hasAllFieldMatches && hasPhoto`. Clearing happens externally in PropX and PCS — v2 observes clearing status via API, it does not drive clearing.

### AI-Native Validation

- **Intelligence placement:** The matching engine IS the intelligence layer — tiered confidence scoring with photo verification gate. Not a bolt-on analytics dashboard; the matcher determines what the dispatch team sees and in what order.
- **Adaptation speed:** Re-score pipeline can re-evaluate the entire validation queue on rule changes (feature-flagged). Schema drift detection on PropX API changes triggers alerts before data quality degrades.
- **Failure mode:** Graceful — loads that can't be matched stay in the validation queue for human review. The system never auto-advances loads without human confirmation. Clearing race condition (loads built before cleared) is a known unresolved edge case surfaced to the team.

---

## Active Lenses

- **Operations Research** — Dispatch is a scheduling + routing optimization domain. Load-to-well assignment, builder-company coordination (Liberty→Scout, Logistiq→Steph, JRT→Keli), and clearing sequencing are all operations problems.
- **Data Quality** — PropX occasionally writes PO numbers in the BOL field. Three competing load identifiers exist. The matching engine's confidence is only as good as the upstream data. Every ingest path needs validation.
- **Workflow Automation** — The system replaces a manual spreadsheet-based dispatch workflow. "The system gives to the user" is the design principle — optimize for the dispatch team's actual mental model (validated via two user calls), not an idealized abstraction.

---

## Harness Configuration

> **Reference:** `AGENT_HARNESS_PROTOCOL.md` for full context on each decision.

### Runtime Strategy

**Claude Code CLI (Managed Runtime).** Anthropic hosts the orchestration loop, tool execution, session persistence, compaction/caching. We own the agent definition (this CLAUDE.md, global rules, skills, MCP servers) and environment config. This is a thin-harness bet — intelligence lives in the model, the harness is the operating system.

### Seven Design Decisions

**1. Agent Count:** Multi-agent (with single-agent primary)
Rationale: Primary execution is single-agent with user steering. Subagents dispatched for parallel research (Explore agents), code review (kieran-typescript-reviewer, data-integrity-guardian), and isolated work (worktree agents). Split threshold: ~10 overlapping tools or clearly separate task domains.

**2. Reasoning Strategy:** Hybrid
Rationale: ReAct for interactive investigation (user asks, agent explores and acts). Plan-and-Execute for multi-step features (write plan doc in docs/, then execute via executing-plans skill). Plans are written to files, not held in context.

**3. Context Strategy:** Rich context with just-in-time retrieval
Approach: Project memory (24 topic files at `~/.claude/projects/-home-jryan-projects-work-esexpress-v2/memory/`) acts as lightweight index. Full source files read on demand via Grep/Glob/Read. Subagent delegation for broad codebase exploration returns condensed summaries. CRITICAL: always read project memory BEFORE investigating operational issues — answers are often already documented.

**4. Verification Design:** Both (layered)

- Computational: `cd backend && npm test` (vitest, 61+ reconciliation tests), `cd frontend && npm test`, `npm run db:generate` (schema drift check), `tsc` (type checking — 28 latent errors, not blocking)
- Inferential: kieran-typescript-reviewer for code quality, data-integrity-guardian for migrations, verification-before-completion skill before claiming done

**5. Permission Architecture:** Graduated
Rationale: Start restrictive (user approves each action). Evolve to delegated execution ("drive" mode) based on demonstrated correct predictions and clean execution. Side-effect boundary ALWAYS maintained for: `git push`, production deploys, migration runs, feature flag flips, external communications. Authorization chain: user approves direction → agent drives keyboard → user authorizes side effects one at a time.

**6. Tool Scoping Strategy:** Minimal per step (lazy loading)
Active tool set: Claude Code's deferred tools + ToolSearch pattern. MCP tools (Vercel, Serena, chrome-devtools, claude-mem) loaded on demand. ~150 deferred tools available, typically <10 active per step.

**7. Harness Thickness:** Thin
Rationale: Claude Code runtime is a "dumb loop" — all intelligence in the model. Harness thickness lives in system prompt complexity (this CLAUDE.md + 15 global rules + 24 memory files + skills). No custom orchestration code. Future-proofing: performance scales with model upgrades without adding harness complexity.

### Harness Component Audit

| #   | Component              | Owner | Status     | Notes                                                                                            |
| --- | ---------------------- | ----- | ---------- | ------------------------------------------------------------------------------------------------ |
| 1   | Orchestration Loop     | M     | Production | Claude Code runtime                                                                              |
| 2   | Tools                  | C     | Production | Built-in + Vercel MCP + Serena MCP + chrome-devtools MCP + claude-mem MCP                        |
| 3   | Memory                 | C     | Production | 3-tier: MEMORY.md index → 24 topic files → raw transcripts via MCP search                        |
| 4   | Context Management     | M     | Production | Built-in compaction + caching. 1M context Opus 4.6                                               |
| 5   | Prompt Construction    | C     | Production | This CLAUDE.md + 16 global rules + project memory + skills                                       |
| 6   | Output Parsing         | M     | Production | Native tool calling                                                                              |
| 7   | State Management       | X     | Basic      | Git commits as checkpoints. TaskCreate/TaskUpdate for in-session. Memory files for cross-session |
| 8   | Error Handling         | M     | Production | Runtime retries + error results. Project memory error protocols                                  |
| 9   | Guardrails & Safety    | C     | Production | Graduated permissions. Side-effect boundary. Pre-commit hooks (lint/format)                      |
| 10  | Verification Loops     | X     | Basic      | vitest + tsc + drizzle-kit. Review subagents. verification-before-completion skill               |
| 11  | Subagent Orchestration | C     | Production | Agent tool with typed subagents. Worktree isolation available                                    |
| 12  | Tool Scoping           | C     | Production | Deferred tools via ToolSearch. MCP servers lazy-loaded                                           |

### Scaffolding Retirement

**Next review date:** 2026-05-01

- The 28 latent backend TS errors are scaffolding debt — `--noCheck` masks them but they should be fixed
- The manual `vercel deploy --prod` CLI step is scaffolding around broken git integration — investigate fixing the Vercel GitHub App connection
- Sheets-based parallel workflow is scaffolding the team uses until v2 proves itself in dual-run

---

## Current State

### What's Built

- **Ingestion pipeline** — PropX + Logistiq + JotForm sync, scheduled (4 AM + every 4 hours). Currently PAUSED since 2026-04-02 (env vars removed to prevent stale-schema writes).
- **Matching engine** — 3-strategy cascade, tiered confidence, photo gate (feature-flagged, not yet active)
- **Reconciliation service** — BOL-to-load matching with field-level discrepancy detection. Discrepancy types fixed 2026-04-12 (reconciliation.service.ts cluster).
- **Dispatch desk** — Wells/Loads toggle, pagination, inline editing, filter tabs, expand drawer with timeline
- **Validation page** — Tier-based queue, inline editing (ported from dispatch desk)
- **Auth** — JWT + refresh tokens, all users admin during rollout (intentional — skip RBAC until Phase 2)
- **Finance module** — Payment batches, rate management (has TS errors, functional via --noCheck)
- **Maintenance page** — LIVE at app.esexpressllc.com as of 2026-04-12

### What's Next (Round 4 MVD — see `docs/2026-04-11-round-4-p0-workplan.md`)

- **M2** — Expand migration: add `weight_lbs` column (schema committed locally on `feature/round-4-mvd`, drizzle migration generated)
- **M3-M5** — Bounce Fastify, update normalize to populate weight_lbs, investigate sync pause + re-enable
- **M6-M7** — Photo gate rule + staged re-score
- **M8** — Visible BOL search affordance on dispatch desk
- **M9-M10** — End-to-end smoke test + go/no-go review
- **Phase 1 Fast Follow** — Audit log MVP (2 events), missed-load Friday diff, status colors (4 of 7), comments tab
- **Phase 2 (post-OAuth)** — Completion tracking badge, builder-company filter, per-builder validation, PCS REST push

### Known Issues

- **28 latent TS errors** in backend across 10 files — NOT deploy-blocking (Railway `--noCheck`). Reconciliation cluster (5) fixed. Remaining: finance (8), app.ts (6), dispatch (3), auth (5), verification/bol (1), sheets (1), propx (1). Tracked as Task #12.
- **Vercel git auto-build broken** — every git-triggered deploy fails instantly (buildingAt === ready, 0ms). Use CLI: `vercel deploy --prod --yes` from repo root. Documented in project memory `feedback_vercel_github_broken.md`.
- **Sync paused since 2026-04-02** — PROPX_API_KEY and LOGISTIQ credentials removed from Railway env vars. No code-level pause flag; scheduler at `backend/src/scheduler.ts` skips if env vars missing.
- **PropX PO-in-BOL field** — PropX occasionally writes PO number in the BOL field (Kati, follow-up call 33:38). Matcher can't trust PropX BOL blindly.

---

## Bounded Contexts & File Ownership

| Context             | Root                                 | Owner        | Notes                                                                                                                      |
| ------------------- | ------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Ingestion           | `backend/src/plugins/ingestion/`     | Agent        | PropX + Logistiq sync services. `propx-sync.service.ts` (721 lines), `logistiq-sync.service.ts` (1050 lines)               |
| Verification        | `backend/src/plugins/verification/`  | Agent        | BOL extraction, reconciliation (792 lines), photo pipeline                                                                 |
| Dispatch            | `backend/src/plugins/dispatch/`      | Agent        | Loads, assignments, wells, auto-mapper, dispatch-desk service                                                              |
| Finance             | `backend/src/plugins/finance/`       | Agent        | Payment batches, invoicing. Has 8 TS errors — approach with caution                                                        |
| Auth                | `backend/src/plugins/auth/`          | Agent        | JWT, guards, SSO config                                                                                                    |
| Sheets              | `backend/src/plugins/sheets/`        | Agent        | Google Sheets sync (legacy bridge). `photoStatus` gotcha: never write `"matched"`                                          |
| Schema              | `backend/src/db/`                    | Human review | Migrations at `src/db/migrations/`. `npm run db:generate` then review before apply. Drizzle-kit managed, journal format v7 |
| Frontend pages      | `frontend/src/pages/`                | Agent        | DispatchDesk, Validation, BolQueue, Home, Admin                                                                            |
| Frontend components | `frontend/src/components/`           | Agent        | LoadRow, ExpandDrawer, Pagination, FilterTabs                                                                              |
| Strategic docs      | `docs/`                              | Human review | Reconciliation, work plans, call findings. Layered annotation convention: `[YYYY-MM-DD reconciled]`                        |
| Config              | `package.json` (root), `.env` (root) | Human review | Root build script runs frontend only. `.env` has DB + API credentials — never read/print full contents                     |

---

## Commands

### Verification

```bash
# Backend tests (vitest — 61+ reconciliation tests)
cd backend && npm test

# Frontend tests (vitest)
cd frontend && npm test

# TypeScript type check (28 latent errors — use for hygiene, not as gate)
cd backend && npm run build

# Schema drift check (should say "nothing to migrate" if schema.ts matches last snapshot)
cd backend && npm run db:generate

# Drizzle migration apply (to connected DATABASE_URL)
cd backend && npm run db:migrate
```

### Build

```bash
# Frontend only (Vite)
cd frontend && npm run build

# Root (frontend only — backend decoupled from root build)
npm run build

# Backend (TypeScript compile — has 28 errors, use --noCheck for deploy)
cd backend && npm run build
```

### Deploy

```bash
# Backend: Railway auto-deploys from lexcom/main
git push lexcom main

# Frontend: Vercel CLI ONLY (git auto-build is broken)
cd /home/jryan/projects/work/esexpress-v2
vercel deploy --prod --yes
# MUST run from repo root (not frontend/) — rootDirectory doubles path otherwise

# Restore from maintenance mode
git checkout main && vercel deploy --prod --yes
```

### Git

```bash
# Canonical remote (production)
git push lexcom <branch>

# NEVER use origin for deploys (stale personal fork at jryan5150/esexpress-v2)
```

---

## Gotchas

- `photoStatus` enum: ONLY `"attached" | "pending" | "missing"`. Never write `"matched"` — it bypasses validation.
- postgres.js + `prepare:false`: never pass Date objects in `sql``` templates. Use ISO strings.
- Fastify strips undeclared query params silently — declare all params in route schema or they vanish.
- `bolNo` is canonical BOL column (decided 2026-04-06). `ticketNo` drops in contract migration. Both exist, both indexed.
- `originName` = loader/sandplant (origin). `destinationName` = well (destination). Already correct — don't add loader/sandplant columns.
- `weightTons` stores tons (converted from lbs at ingest). Raw lbs preserved in `rawData` jsonb. `weightLbs` column added in Round 4 M2.
- Status enums: `ASSIGNMENT_STATUSES`, `BOL_SUBMISSION_STATUSES`, `PHOTO_STATUSES` — exported const tuples in schema.ts. Use `[...CONST]` in column definitions.
- `.$type<>()` on jsonb columns is TypeScript-only — doesn't affect SQL or generate migrations.
- Backend Dockerfile uses `npx tsc --noCheck` — TS errors don't block Railway deploys.
- Root `npm run build` runs frontend only (backend decoupled 2026-04-12 via `fix/decouple-frontend-build`).
- **Read project memory BEFORE investigating operational issues** — `~/.claude/projects/-home-jryan-projects-work-esexpress-v2/memory/MEMORY.md` has 24 topic files. Answers are often already documented.

---

## Project Memory Index

Full memory at `~/.claude/projects/-home-jryan-projects-work-esexpress-v2/memory/MEMORY.md`. Key entries:

| Memory                                    | What it tells you                             |
| ----------------------------------------- | --------------------------------------------- |
| `feedback_vercel_github_broken.md`        | Vercel git deploys fail — CLI only            |
| `reference_deployment_source_of_truth.md` | Exact project IDs, remotes, deploy commands   |
| `reference_v2_field_corrections.md`       | Schema renames, BOL audit, collision decision |
| `feedback_photostatus_enum_gotcha.md`     | Never write "matched" to photoStatus          |
| `feedback_postgres_date_gotcha.md`        | Date object crash in sql templates            |
| `project_round_4_holding_for_followup.md` | Round 4 strategic context                     |

---

_CLAUDE.md ES Express v2 — Living document. Inherits from GLOBAL_PROTOCOL.md, SKILL_CHEST.md, and AGENT_HARNESS_PROTOCOL.md. Updates every dispatch-review cycle. Harness configuration reviewed at each major milestone._
