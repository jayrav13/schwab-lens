# Phase 2: Per-Account User Models & Projections

**Status:** Spec — pending implementation
**Tracking issue:** [#16](https://github.com/jayrav13/schwab-lens/issues/16)
**Roadmap context:** Phase 1 = [#15 — landed in PR #21](https://github.com/jayrav13/schwab-lens/pull/21). Phase 3 = [#17](https://github.com/jayrav13/schwab-lens/issues/17) (multi-account grouping UI + freedom-date view across a selection).

## Goal

Add user-editable per-account metadata (`expected_real_return`, `target_value`, `account_group`) and a per-account compound-growth "years to target" projection on the existing dashboard. Editing happens via a small extension to the existing `npm run account:configure` CLI plus a thin conversational `/account-set` skill that wraps it.

## Non-goals (Phase 2)

- Multi-account grouping UI / multi-select picker — Phase 3.
- Blended NAV + blended expected return across a group — Phase 3.
- "Freedom date" headline view across a selection — Phase 3.
- Planned-contribution modeling (e.g., $X/year added to a 401k). Out of scope; revisit only if projection feels too pessimistic for actively-contributed accounts.
- Edit UI on the dashboard. Phase 2's projection card is read-only; Phase 3 will introduce an edit affordance alongside the grouping picker.
- Web form for account configuration. CLI + skill is the only mutation surface in Phase 2.

## Architecture

```
                        editing path                                        rendering path
            ┌──────────────────────────────┐                  ┌──────────────────────────────┐
 user "set  │  /account-set skill          │                  │  loadDashboard()             │
 Demo's   │   ↓ (translates intent)      │                  │   ↓                          │
 rate to 7%"│  npm run account:configure   │                  │  loadDashboardSource(db)     │
            │   ↓                          │                  │   ↓ (gives Account row)      │
            │  configureAccount(db, ...)   │  ──── writes ──→ │  computeProjection({         │
            │   ↓                          │     accounts     │    currentNav,                │
            │  updateAccountReturn /       │       row        │    expected_real_return,      │
            │  updateAccountTarget /       │                  │    target_value })            │
            │  updateAccountGroup          │                  │   ↓                          │
            │  (accounts repo)             │                  │  ProjectionCard component    │
            └──────────────────────────────┘                  └──────────────────────────────┘
```

Three orthogonal concerns:
1. **Schema:** three nullable columns added via migration `002`.
2. **Editing:** CLI flags on existing `account:configure`; thin `/account-set` skill wrapping it; a tiny `account:show` admin command for verification.
3. **Rendering:** pure projection function + new `ProjectionCard` component on the existing main dashboard.

## Schema additions

Migration `db/migrations/002-account-projections.sql`:

```sql
ALTER TABLE accounts ADD COLUMN expected_real_return REAL;
ALTER TABLE accounts ADD COLUMN target_value REAL;
ALTER TABLE accounts ADD COLUMN account_group TEXT;
```

Notes:
- `expected_real_return` is stored as a **decimal** (`0.07` for 7%). Inflation is baked into the user's input — no separate inflation column. UI displays as `%`.
- `target_value` is a dollar amount.
- `account_group` is a free-text tag (e.g., `"Managed"`, `"Cash"`). No rendering in Phase 2; stored for Phase 3 to consume. Named `account_group` to avoid the SQL reserved word `GROUP`.
- All nullable. Accounts without these set render the projection card's "unconfigured" state.

The `Account` TypeScript type in `lib/db/repos/accounts.ts` gains:

```ts
expectedRealReturn: number | null;
targetValue: number | null;
accountGroup: string | null;
```

## Editing surface

### CLI extension

`npm run account:configure` gains three flags:

```bash
npm run account:configure -- \
  --account=schwab:520 \
  --expected-real-return=0.07 \
  --target=1000000 \
  --group=Managed
```

Parsing rules:
- `--expected-real-return=<n>` accepts decimal (`0.07`) or percent suffix (`7%`); both parse to `0.07`. Stored as decimal.
  - Reject `< -1` (impossible economics).
  - Warn when `>= 1` and the user did NOT use a `%` suffix — likely `7` was meant as `7%`. Print a stderr warning ("interpreting as 700% per year — did you mean 7%? pass `7%` if so") but proceed with the literal value. The warning is loud enough that the user will catch and re-run.
- `--target=<n>` accepts a number; reject `<= 0`. CLI itself does not parse `$` or commas (user can quote if needed); leave that to a future enhancement if needed.
- `--group=<text>` accepts any string; the empty string `""` clears the column to `NULL`.

Three new repo functions in `lib/db/repos/accounts.ts`:

```ts
export function updateAccountReturn(db: Db, accountId: number, rate: number | null): void;
export function updateAccountTarget(db: Db, accountId: number, target: number | null): void;
export function updateAccountGroup(db: Db, accountId: number, group: string | null): void;
```

`configureAccount()` in `lib/scripts/accountConfigure.ts` gains the three optional inputs and dispatches.

### Admin read command: `npm run account:show`

New script `scripts/account-show.ts`. Prints a single account's full configuration (label, group, seed_date, seed_value, benchmark, expected_real_return, target_value, first_seen_at, last_seen_at) as a small two-column table. Used by `/account-set` to confirm changes and by the user for ad-hoc verification.

```bash
npm run account:show -- --account=schwab:520
```

~30 lines of code; just a SELECT and console formatting.

### `/account-set` skill

New skill at `.claude/skills/account-set/SKILL.md`. Conversational entry point.

- User says: "set Demo's growth rate to 7%" / "give Demo a target of $1M and tag it Managed" / "what are Demo's projection settings"
- Skill interprets intent, identifies the target account (by label or `<brokerage>:<id>`), and:
  - For mutations: runs the equivalent `npm run account:configure -- ...` invocation, then runs `npm run account:show` to confirm.
  - For reads: runs `npm run account:show` directly.
- Skill is thin — it's an interpreter, not a duplicate of the mutation logic. The CLI is the source of truth.

If the skill cannot uniquely identify the account (e.g., user says "Demo" but two accounts have similar labels), it reports the ambiguity and asks for clarification rather than guessing.

## Projection math

New pure module `lib/model/metrics/projection.ts`:

```ts
export type ProjectionInput = {
  currentNav: number;
  targetValue: number;
  expectedRealReturn: number;  // decimal, e.g. 0.07
  asOfDate: string;            // YYYY-MM-DD reference for "today"
};

export type ProjectionResult =
  | { kind: "achieved"; targetValue: number; currentNav: number }
  | {
      kind: "computed";
      years: number;
      targetDate: string;       // YYYY-MM-DD
      currentNav: number;
      targetValue: number;
      rate: number;
    }
  | { kind: "unreachable"; reason: "non-positive-rate" | "non-positive-target" };

export function computeProjection(input: ProjectionInput): ProjectionResult;
```

Math: `t = ln(target / currentNav) / ln(1 + r)` years. `targetDate = asOfDate + t * 365.25 days`, rounded to nearest day.

Edge case dispatch:
| Condition | Result |
| --- | --- |
| `currentNav >= targetValue` | `{ kind: "achieved" }` |
| `targetValue <= 0` | `{ kind: "unreachable", reason: "non-positive-target" }` |
| `currentNav <= 0` | `{ kind: "unreachable", reason: "non-positive-target" }` |
| `expectedRealReturn <= 0` | `{ kind: "unreachable", reason: "non-positive-rate" }` |
| otherwise | `{ kind: "computed", ... }` |

Pure function. No DB, no I/O. Tested in isolation.

### "Current NAV" definition

`currentNav` for the projection input is `SUM(market_value)` from the most recent `position_snapshots` for the account (i.e., `latestSnapshot.totalValue` from the existing `DashboardSource`). This is what the brokerage said the account was worth at last export — closest to "what is it actually worth right now."

Fall back to `state.navSeries.at(-1)?.nav` (cash-basis NAV from `buildPortfolio`) only when **no snapshot has been ingested yet** (cold-start state). Cash-basis NAV undervalues a portfolio with unrealized appreciation, which would inflate years-to-target meaningfully for non-Demo accounts (401k, IRA) — using the snapshot total avoids that.

`asOfDate` is the latest snapshot's `as_of` date when available, otherwise `yesterdayInET()`.

## Rendering

### `ProjectionCard` component

New file: `app/components/ProjectionCard.tsx`. Rendered below existing NAV / returns / capital cards on the main dashboard (mid-page, not headline). Read-only in Phase 2.

#### Render states

The card switches on `Account` row + `ProjectionResult`:

| State | Trigger | Render |
| --- | --- | --- |
| **Unconfigured** | `expected_real_return` or `target_value` is `null` | One-line CTA: "Set a growth rate and target to project years to freedom." Plus a small inline command hint pointing at `/account-set` and the equivalent `npm run account:configure -- ...` invocation. |
| **Achieved** | `currentNav >= targetValue` | "Target reached. Current NAV $X is past target $Y." |
| **Unreachable** | `kind: "unreachable"` | Variant text per `reason`: "Cannot project: rate must be positive" or "Cannot project: target must be positive". |
| **Computed** | normal happy path | Two-column layout: headline "N.N years at R.R% real" on the left, "Reach $X by YYYY-MM-DD" on the right. Caption below: "Current NAV $XXX,XXX as of YYYY-MM-DD." |

#### Layout

The "Computed" state mirrors the existing card aesthetic — a headline number on the left, a contextual statistic on the right, fine-print metadata in a caption. The caption explicitly names the snapshot's as-of date so the user knows the freshness of `currentNav`.

### Wiring

`lib/server/dashboard.ts` already exposes `state` and `latestSnapshot` in its `DashboardData`. The dashboard layer computes `ProjectionResult` from `account` + `latestSnapshot.totalValue` + `expected_real_return` + `target_value` and threads it through to `app/page.tsx`, which passes it to `ProjectionCard`.

Adding to `DashboardData` (the "ready" variant):

```ts
projection: ProjectionResult | { kind: "unconfigured"; reason: "missing-rate" | "missing-target" };
```

The "unconfigured" variant is computed in the dashboard layer when the account row is missing inputs — clearer than passing nulls down to the component.

### What the card does NOT do in Phase 2

- No editing UI in the card itself (deferred to Phase 3 alongside grouping).
- No growth-curve chart, no scenarios at multiple rates (could be a future enhancement).
- No multi-account blending (Phase 3).
- No contribution modeling.

## Files affected

### New files

```
db/migrations/002-account-projections.sql

lib/model/metrics/projection.ts
app/components/ProjectionCard.tsx

scripts/account-show.ts
.claude/skills/account-set/SKILL.md

tests/model/metrics/projection.test.ts
tests/scripts/account-show.test.ts
```

### Modified files

```
package.json                              # add account:show script
lib/db/repos/accounts.ts                  # +Account fields, +update functions
lib/scripts/accountConfigure.ts           # accept 3 new optional inputs
scripts/account-configure.ts              # parse 3 new flags
lib/server/dashboard.ts                   # compute + expose ProjectionResult
lib/server/dashboardSource.ts             # propagate new account fields
app/page.tsx                              # render ProjectionCard

tests/db/repos/accounts.test.ts           # round-trip new fields
tests/scripts/account-configure.test.ts   # cover new flags + parsing
tests/db/migrate.test.ts                  # assert new columns exist
tests/integration.test.ts                 # assert dashboard returns a "computed" projection after configure
```

## Testing strategy

- **`computeProjection`**: pure unit tests covering all four return shapes — `achieved`, each `unreachable` reason, `computed`. Spot-check known math (`$10k → $20k at 7% real ≈ 10.24 years`).
- **Repo updates**: extend `tests/db/repos/accounts.test.ts` with round-trip tests for `updateAccountReturn`, `updateAccountTarget`, `updateAccountGroup`.
- **CLI parsing**: extend `tests/scripts/account-configure.test.ts` for the three new flags. Cover: decimal input (`0.07`), percent input (`7%`), the warning case (`7` with no suffix), rejection of negative rate / non-positive target.
- **Admin read command**: new `tests/scripts/account-show.test.ts` — given a fully-configured account row, asserts the printer's output contains each expected field value. Tiny.
- **Migration**: existing `runMigrations against db/migrations/` test in `tests/db/migrate.test.ts` automatically asserts the new schema. Add an explicit assertion that the three new columns exist on `accounts`.
- **Integration**: extend `tests/integration.test.ts` with one new test — ingest fixture, run `configureAccount` with rate + target, assert `loadDashboard` returns `projection: { kind: "computed", years: <expected> }`.
- **Component**: skip a snapshot test for `ProjectionCard`; the integration test verifies the data flow and the component is small enough that visual review during `npm run dev` is sufficient.

## Implementation phasing within Phase 2

A possible sequence (the writing-plans skill will produce the actual plan):

1. Migration `002` + schema assertion in migrate test.
2. Extend `Account` type + add three update functions in accounts repo, with tests.
3. Extend `configureAccount` to accept the three new optional inputs, with tests.
4. Extend `account-configure.ts` CLI parsing, with tests.
5. New `account-show.ts` admin command, with tests.
6. `computeProjection` pure function, with tests.
7. Wire projection into `loadDashboard` (compute + expose).
8. New `ProjectionCard` component.
9. Render `ProjectionCard` in `app/page.tsx`.
10. Update integration test.
11. Add `/account-set` skill (`.claude/skills/account-set/SKILL.md`).
12. Manual verification: `npm run dev`, check the card renders correctly across all 4 states.

## Open questions / decisions deferred to implementation

- Exact CSS / Tailwind classes for `ProjectionCard` — match existing card aesthetics during implementation; not worth pre-specifying.
- The behavior of `/account-set` when the user uses a label that matches multiple accounts — should the skill ask clarifying questions in conversation, or fall back to listing matches and aborting? Lean toward "list matches and ask which one" but defer to the skill author's judgment when implementing.
- Where exactly the projection card slots into the existing card grid order — easier to decide in code by trial than by spec.
