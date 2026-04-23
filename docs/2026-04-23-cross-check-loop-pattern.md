# The Cross-Check Loop Pattern + Sandbox UX-Iteration Architecture

**Date filed:** 2026-04-23 (evening, mid-sprint)
**Status:** concept doc — not for client distribution
**Origin:** observation while building v2's PCS-vs-v2 discrepancy detection — the same shape applies to design-vs-implementation iteration, which led to a sandbox UI/UX iteration architecture worth building post-continuation.

---

## Part 1 — The pattern, abstracted

Both v2's discrepancy detection and an agent-driven UX iteration loop reduce to the same architecture:

```
  Source A ───┐
              ├──▶  comparator(A, B)  ──▶  surface differences  ──▶  human resolves (or auto-resolves)
  Source B ───┘                                                         │
                                                                        ▼
                                                            (both sources update;
                                                             loop runs again)
```

Three instances:

| Domain                    | Source A          | Source B             | Comparator                                          | Surface                   |
| ------------------------- | ----------------- | -------------------- | --------------------------------------------------- | ------------------------- |
| **Operations (live)**     | v2 dispatch state | PCS billing state    | status / weight / well / rate / photo / orphan dest | drawer + admin index      |
| **Design (sandbox)**      | Approved mockup   | Implemented frontend | visual diff + interaction parity + a11y + perf      | review report per surface |
| **Spec ↔ Code (general)** | Written spec doc  | Production code      | semantic compliance + missing requirements          | gap list per spec section |

The pattern is generic: any two sources of truth that should agree, plus a comparator and a surfacing mechanism. Resolution happens automatically when sources realign, manually when they don't.

---

## Part 2 — Why instance #2 (sandbox UX iteration) is the high-value extension

We've shipped instance #1 (PCS-vs-v2 today). Instance #2 is the natural next product. The reasoning:

### Why the v2 project specifically is well-suited as the proving ground

Most agent-driven UI iteration fails because the agent doesn't know who the design is for. v2's project context is unusually rich and addresses exactly that gap:

- **24 memory files** documenting decisions + gotchas — agents inherit project-specific judgment
- **Two complete client transcripts** (Apr 6 walkthrough + Apr 9 follow-up) with verbatim Jessica/Scout/Steph language — agents learn the domain vocabulary
- **Two persona reports** from Round 2 UX testing — agents learn workflow assumptions
- **Jessica's hand-counted reconciliation emails** — agents see the actual operational ritual the system is augmenting
- **A reference mockup she approved** at `frontend/mockups-jess-meeting.html` — agents have visual ground truth
- **Stitch design system** at `frontend/stitch-reference/` — agents know the tokens
- **Existing screenshots** — agents can do visual-diff regression checks
- **Backend introspectable via diag endpoints** — agents probe live data shape, never guess

Plus the existing agent infrastructure already exists:

- `frontend-design`
- `compound-engineering:design:design-iterator`
- `compound-engineering:design:design-implementation-reviewer`
- `compound-engineering:design:figma-design-sync`
- `jace:design:iterate-safe`

These were built for this loop. They've never been pointed at a project with this much grounding context.

### Architecture for the sandbox

1. **Git worktree replica** — branch `sandbox/ux-iteration`, separate Vercel preview URL, points at the SAME prod backend (read-only sync data). No DB clone. Agents iterate frontend only.

2. **Surface ownership map** — explicit per-agent assignment, no two agents touch the same file:
   - `agent-workbench` → `Workbench.tsx` + `WorkbenchRow.tsx` + `WorkbenchDrawer.tsx`
   - `agent-admin` → `pages/admin/*` (Discrepancies, ScopeDiscovery, MissedLoadsReport, Wells, Companies, Users)
   - `agent-drawer` → `ExpandDrawer.tsx` + `DiscrepancyPanel.tsx` (cross-check refinement)
   - `agent-bol` → `BolQueue.tsx` + photo carousel
   - `agent-onboarding` → `Login`, `MagicLinkLanding`, sidebar collapse states

3. **Constraint contract** — the explicit `MUST NOT VIOLATE` list pulled from memory files:
   - **Semantic terms** that took conversation cost to settle:
     - `bolNo` = paper ticket number, NEVER the `AU…` Logistiq system code
     - `photo_status` enum: only `attached | pending | missing` (never `matched`)
     - Handler stages: `uncertain | ready_to_build | building | cleared` — never rename
     - "Completed" vs "Built" — terminal label per Jessica's preference
     - "PCS" not "PCS Software" or "PCS Express"
   - **Business-logic UI elements** that LOOK like noise but encode signal:
     - Cross-check banner on drawer (just shipped, do not "simplify away")
     - Photo gate badge (do not hide)
     - Matched_via badge on assignment (audit trail)
     - PcsPill on workbench rows
     - Audit log distinguishing system actions (gear icon) from human actions (person icon)
   - **Framing decisions** that are commercially load-bearing:
     - PCS toggle is "yours to flip" — never auto-flip text
     - Push framing is "in flight with PCS team" — never "broken" or "not working"

4. **Per-agent brief** — input + output + success criteria:
   - **Input**: current state of owned files, relevant transcript excerpts, Jessica's email patterns, mockup section for owned surface, list of related discrepancies (so agent sees real prod data)
   - **Output**: PR-ready commits to the sandbox branch, before/after screenshots
   - **Success criteria**:
     - Visual fidelity to mockup (>= 90% per `design-implementation-reviewer`)
     - All scenario-tests pass (test scripts pulled from transcripts: "Scout's morning workflow", "Jessica's validation pass", "Jenny's reconciliation review")
     - Constraint contract clean

5. **N-iteration loop** — `design-iterator` already does this. Each agent runs 5–10 cycles per assigned surface (screenshot → critique → fix → re-screenshot) until convergence or budget exhausted.

6. **Meta-reviewer** — `design-implementation-reviewer` validates each agent's output against the mockup before opening a PR back to main. Failed reviews don't block the agent; they get fed back as next-iteration input.

7. **Compounding memory** — each iteration's learnings (what worked, what felt off when re-screenshot was reviewed) feed back into the agent's context for next iteration.

### Risks + guardrails

- **Semantic drift** — UX agents will "improve" things that encode hard-won business semantics. The BOL-vocabulary fix took three weeks of conversation; an agent rewriting the drawer could undo it in 10 minutes. The constraint contract is non-negotiable; failures here are agent-stop conditions.
- **Workflow correctness** — cross-check banner, photo gate, matched_via badge encode signal that LOOKS like noise to a generic UX agent. Constraint contract needs explicit "these elements stay."
- **Coordination cost** — parallel agents on shared files = merge hell. Surface ownership is rigid.
- **State velocity** — the project pivots fast (Pillar 4 changed today). Iteration loop must be re-briefed against current state at start of each session.
- **Tone** — agents trained on generic SaaS aesthetics will produce generic SaaS aesthetics. Brief should explicitly call out "this is for oilfield trucking dispatchers, not B2B SaaS users — workmanlike beats sleek."

### When to actually deploy

**NOT this week** (sprint mode with noon-Friday deadline). Parallel iteration produces noise needing supervised filtering; bandwidth wrong.

**Tuesday–Thursday of Week 1 post-continuation** = right moment:

- Validation gate cleared
- Mike/Jeri have said yes
- Engagement has runway
- Spin sandbox, point 3–5 agents at distinct surfaces, produce v2.5 polish before the team uses it heavily for billing
- By next client touchpoint two weeks later, surface looks like a $50K product, not a $50K MVP

### Cost estimate

- Worktree + Vercel preview setup: ~30 min
- Constraint contract authoring (extract from memory files): ~1 hr
- Per-agent brief authoring: ~30 min × 5 agents = 2.5 hr
- Iteration runs: 5–10 cycles × 5 agents × 5 min compute = 2–4 hr wall clock
- Human review + merge: ~2 hr per surface = 10 hr (this is the bottleneck)

Total wall clock: ~16–20 hr over Tue–Thu. Fits one engineering week.

---

## Part 3 — The productization angle

The cross-check-loop pattern itself is sellable beyond v2. Generic shape:

```
crossCheck({
  sourceA: { fetch: () => ..., key: ... },
  sourceB: { fetch: () => ..., key: ... },
  comparators: [statusComparator, valueComparator, fuzzyMatchComparator, ...],
  surface: { type: "drawer-banner" | "admin-table" | "email-digest" },
  resolutionPolicies: [autoResolve, suggestResolve, requireResolve],
});
```

Real instances any MSP client could want:

- ConnectWise tickets vs. Datto RMM alerts (do they agree on which devices are problematic?)
- Salesforce opportunity stage vs. accounting actuals (when do CRM and books disagree?)
- Customer portal sees-X vs. internal dashboard sees-X (UI parity check)
- Spec doc says-X vs. code does-X (continuous spec-compliance check)
- Approved mockup says-X vs. shipped UI does-X (the sandbox use case)

This is a meta-product: "we'll find the divergences in your two systems of record and show you where to look." MSP value prop, not just oilfield trucking.

If the v2 sandbox iteration succeeds (Tue–Thu post-continuation), the cross-check-loop becomes a Lexcom internal pattern doc, then a public service offering. ES Express is the proof-of-concept.

---

## Open questions

- Should the constraint contract live in code (a JSON file in the repo) or in memory (markdown in `~/.claude/projects/`)? Code-resident is more durable; memory-resident is more discoverable for agents.
- How do we measure "success" for a sandbox iteration besides visual fidelity? Suggestion: scenario-test pass rate from transcript-derived test scripts.
- When does the sandbox get merged back to main? After all agents converge OR after Jessica reviews the preview URL OR both?
- Does the sandbox get its own separate Sentry / monitoring? (Probably yes, so production noise stays separate.)
- Could the iteration agents themselves emit `discrepancies`-style records (mockup vs implemented gap entries)? That would make the sandbox dogfood the production cross-check pattern.

---

## Filed for future reference. Not actionable until post-Monday.
