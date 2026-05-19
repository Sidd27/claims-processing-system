# Claims Processing System

A backend system for adjudicating health insurance claims, with a React UI for review and dispute management.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Tech Stack](#tech-stack)
3. [Directory Structure](#directory-structure)
4. [Data Model](#data-model)
5. [Coverage Rules](#coverage-rules)
6. [Adjudication Pipeline](#adjudication-pipeline)
7. [Claim Status State Machine](#claim-status-state-machine)
8. [Dispute Lifecycle](#dispute-lifecycle)
9. [API Reference](#api-reference)
10. [Getting Started](#getting-started)
11. [Running Tests](#running-tests)
12. [Design Decisions](#design-decisions)

---

## Architecture

Layered monolith with strict one-way dependencies:

```
app/domain/     ← pure TypeScript, no I/O (adjudication logic, state machine, domain errors)
app/db/         ← Drizzle schema, migrations, repositories (one file per table)
app/services/   ← orchestrates domain + repositories inside DB transactions
app/api/        ← Fastify HTTP layer, thin — validates input and delegates to services
app/ui/         ← React/Vite SPA, proxied to the API server in dev
```

The domain layer has zero imports from any layer above it. All business rules live there and are tested in pure unit tests with no database.

---

## Tech Stack

| Layer      | Technology                                    |
| ---------- | --------------------------------------------- |
| Runtime    | Node.js + TypeScript (`tsx` for dev)          |
| API server | Fastify 4                                     |
| ORM / DB   | Drizzle ORM + PostgreSQL                      |
| UI         | React 18 + Vite + Tailwind CSS v4 + shadcn    |
| Testing    | Vitest (unit) + Vitest (integration, real DB) |

---

## Directory Structure

```
app/
├── domain/
│   ├── errors.ts                   # DomainError class (code + message)
│   ├── constants.ts                # DISPUTABLE_STATES, PAYABLE_STATES (shared across claims + disputes)
│   ├── policies/types.ts           # ServiceType, CoverageRuleConfig, CoverageRule
│   ├── claims/
│   │   ├── types.ts                # Claim, ClaimLineItem, ClaimStatus, LineItemStatus
│   │   └── stateMachine.ts        # deriveClaimStatus, assertValidTransition, DISPUTABLE_STATES
│   ├── disputes/
│   │   ├── types.ts                # Dispute, DisputeStatus, DisputeResolution
│   │   └── disputeLogic.ts        # assertCanOpenDispute, assertDisputeNotAlreadyResolved
│   └── adjudication/
│       ├── types.ts                # AdjudicationOutput, AdjudicationTrigger, PriorUsage
│       └── adjudicator.ts         # adjudicate() — pure function, no I/O
├── db/
│   ├── client.ts                  # Drizzle client + pg Pool
│   ├── schema.ts                  # All Drizzle table definitions
│   ├── seed.ts                    # Seed script (5 members covering all paths)
│   └── repositories/
│       ├── members.ts
│       ├── policies.ts
│       ├── claims.ts
│       ├── lineItems.ts
│       ├── adjudicationResults.ts
│       ├── disputes.ts
│       └── limitUsage.ts          # computePriorUsage — aggregates active results
├── services/
│   ├── claimService.ts            # submitClaim, getClaimDetail, markClaimPaid, reAdjudicateClaim
│   ├── adjudicationService.ts     # adjudicateClaim — runs pipeline inside a transaction
│   └── disputeService.ts         # openDispute, resolveDispute
└── api/
    ├── server.ts                  # Fastify app factory, error handler, route registration
    ├── index.ts                   # Entry point (starts server)
    └── routes/
        ├── claims.ts
        ├── disputes.ts
        └── members.ts
```

---

## Data Model

```
members
  id, external_member_id, name, date_of_birth

policies
  id, member_id → members, plan_name, effective_date, term_date

coverage_rules
  id, policy_id → policies, service_type, rule_type, config (jsonb)

claims
  id, member_id, policy_id, provider_name, provider_npi, diagnosis_code, status, submitted_at

claim_line_items
  id, claim_id → claims, service_type, cpt_code, description, service_date,
  billed_amount, status

adjudication_results
  id, line_item_id → claim_line_items, approved_amount, deductible_applied_amount,
  reduction_reasons (jsonb), explanation_steps (jsonb), is_active, trigger, adjudicated_at

disputes
  id, line_item_id → claim_line_items, member_reason, status, resolution,
  resolver_note, resolved_at, created_at
```

**`adjudication_results.is_active`** — only one result per line item is active at a time. When a dispute is overturned or a claim is re-adjudicated, the old result is set `is_active = false` and a new one is inserted. Prior usage calculations (`computePriorUsage`) query only active results, so deactivated results are automatically excluded.

---

## Coverage Rules

Coverage rules are stored as a typed JSON discriminated union in `coverage_rules.config`. Each rule applies to a specific `service_type`.

| Rule type          | Effect                                                             |
| ------------------ | ------------------------------------------------------------------ |
| `NOT_COVERED`      | Immediately denies the line item; no further rules applied         |
| `REVIEW_THRESHOLD` | If billed > threshold, sends line item to manual review; no math   |
| `DEDUCTIBLE`       | Member pays this amount annually before insurance pays anything    |
| `COINSURANCE`      | Insurance pays this % of the remaining amount after the deductible |
| `PER_CLAIM_CAP`    | Caps the approved amount per claim for this service type           |
| `ANNUAL_LIMIT`     | Caps total approved for this service type per calendar year        |

Multiple rules can apply to the same service type on one policy (e.g. DEDUCTIBLE + COINSURANCE).

---

## Adjudication Pipeline

The adjudicator (`app/domain/adjudication/adjudicator.ts`) is a pure function — no database, no side effects. It takes a line item, the applicable coverage rules, and pre-computed prior usage, and returns an `AdjudicationOutput`.

Rules are applied in a fixed order:

```
1. NOT_COVERED         → short-circuit: approved = $0, status = denied
2. REVIEW_THRESHOLD    → short-circuit: outcome = needs_review (no approved amount set)
3. DEDUCTIBLE          → reduce billed by remaining deductible (tracked via deductibleAppliedAmount)
4. COINSURANCE         → multiply remainder by coverage percent
5. PER_CLAIM_CAP       → cap approved at policy maximum for this service type
6. ANNUAL_LIMIT        → cap at remaining annual benefit; $0 if exhausted
```

After steps 3–6, `lineItemStatus` is derived:

- `denied` — approved = $0
- `partially_covered` — approved > $0 but a capacity constraint (DEDUCTIBLE, CAP, ANNUAL_LIMIT) reduced it
- `covered` — approved > $0 with no capacity reduction (only coinsurance applied)

The `adjudicateClaim` service function runs the pipeline for each pending/needs_review line item inside a DB transaction, then derives and stores the claim-level status via `deriveClaimStatus`.

**`trigger`** records why adjudication ran: `initial_submission`, `manual_review`, or `dispute_overturn`.

---

## Claim Status State Machine

```
submitted          → under_review
submitted          → approved | partially_approved | denied
approved           → paid
partially_approved → disputed | paid
denied             → disputed
disputed           → approved | partially_approved | denied   (after dispute resolves)
paid               ← terminal, no further transitions
```

`deriveClaimStatus` drives all transitions except `paid`. It looks at the current line item statuses:

- Any `needs_review` → `under_review`
- All `covered` → `approved`
- All `denied` → `denied`
- Mix of covered/denied or any `partially_covered` → `partially_approved`

---

## Dispute Lifecycle

Disputes are opened at the **line item** level (a member disputes one service, not the entire claim).

```
open → resolved (upheld | overturned)
```

**Upheld** — original adjudication stands; claim status is re-derived from line item statuses (no change to the adjudication result).

**Overturned** — the existing adjudication result is deactivated and a new result is created approving the full billed amount (`trigger = 'dispute_overturn'`). The line item status becomes `covered` and the claim status is re-derived.

Guards:

- A dispute can only be opened when the claim is in `approved`, `partially_approved`, or `denied` — not while it is `submitted`, `under_review`, `disputed`, or `paid`.
- A line item can only have one open dispute at a time.
- A resolved dispute cannot be resolved again.

---

## API Reference

All routes are prefixed `/api/v1`. Errors are returned as `{ error: "ERROR_CODE", message: "..." }` with HTTP 422.

### Members

| Method | Path       | Description                        |
| ------ | ---------- | ---------------------------------- |
| GET    | `/members` | List all members (for UI dropdown) |

### Claims

| Method | Path                     | Description                                                  |
| ------ | ------------------------ | ------------------------------------------------------------ |
| GET    | `/claims`                | List all claims, newest first                                |
| GET    | `/claims/:id`            | Claim detail with line items and active adjudication results |
| POST   | `/claims`                | Submit a new claim (triggers adjudication immediately)       |
| POST   | `/claims/:id/pay`        | Mark an approved or partially_approved claim as paid         |
| POST   | `/claims/:id/adjudicate` | Re-adjudicate a claim (manual review trigger)                |

**POST `/claims` request body:**

```json
{
  "memberId": "uuid",
  "providerName": "string",
  "providerNpi": "string",
  "diagnosisCode": "string",
  "lineItems": [
    {
      "serviceType": "MEDICAL | DENTAL | VISION | MENTAL_HEALTH | PRESCRIPTION",
      "cptCode": "string",
      "description": "string",
      "serviceDate": "YYYY-MM-DD",
      "billedAmount": 25000
    }
  ]
}
```

**POST `/claims` response (201):**

```json
{
  "claim": { "id": "...", "status": "approved", ... },
  "lineItems": [{ "id": "...", "status": "covered", ... }]
}
```

Note: the POST response contains raw line items without adjudication results. Use `GET /claims/:id` to retrieve the full detail with `adjudicationResult` attached to each line item.

### Disputes

| Method | Path                                              | Description                   |
| ------ | ------------------------------------------------- | ----------------------------- |
| POST   | `/claims/:claimId/line-items/:lineItemId/dispute` | Open a dispute on a line item |
| POST   | `/disputes/:id/resolve`                           | Resolve a dispute             |

**POST `/disputes/:id/resolve` request body:**

```json
{
  "resolution": "upheld | overturned",
  "resolverNote": "string"
}
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL — a `docker-compose.yml` is included)

### Setup

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install API dependencies
npm install

# 3. Install UI dependencies
cd app/ui && npm install && cd ../..
```

### Environment

Create a `.env` file at the project root:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/claims_dev
PORT=3000
```

`DATABASE_URL` matches the credentials in `docker-compose.yml`. If you're using your own PostgreSQL instance, update accordingly.

### Database

```bash
# Run migrations (creates all tables)
npm run db:migrate

# Seed with sample data (5 members covering all adjudication paths)
npm run db:seed
```

The seed creates:

- **Alice** — MEDICAL 80% coinsurance, single claim → `approved`
- **Bob** — MEDICAL $5,000 deductible + 80% coinsurance, $12,000 claim → `approved` (partial deductible applied)
- **Carol** — MENTAL_HEALTH $5,000 annual limit; two claims, second hits the limit → `partially_approved`
- **Dave** — DENTAL $300 per-claim cap + 80% coinsurance; dispute opened and overturned → `approved` at full billed amount
- **Emma** — VISION NOT_COVERED, eye exam claim → `denied`
- **Frank** — MEDICAL $500 review threshold; $700 claim exceeds it → `under_review` (awaiting ops approve/deny)

### Run

```bash
# API server only (port 3000)
npm run dev:api

# UI only (port 5173, proxied to API)
npm run dev:ui

# Both concurrently
npm run dev
```

---

## Running Tests

```bash
# Unit tests (pure domain logic, no DB)
npm test

# Integration tests (requires a running PostgreSQL instance and DATABASE_URL set)
npm run test:integration
```

Unit tests cover `adjudicator.ts`, `stateMachine.ts`, and `disputeLogic.ts` — the entire domain layer — without any database.

Integration tests (`app/api/claims.integration.test.ts`) exercise the full HTTP → service → DB → domain round-trip. Each test runs in an isolated DB state via `beforeEach(clearDb)`. The tests cover:

1. Annual limit exhaustion across sequential claims
2. Dispute overturn re-derives claim status to `approved`
3. Dispute upheld leaves claim status unchanged
4. Only active adjudication results count toward prior usage
5. Multi-line-item claim with mixed outcomes (`partially_approved`)
6. Deductible carries across claims via `deductibleAppliedAmount`
7. Pay guard rejects `denied` and `under_review` claims with `CLAIM_NOT_PAYABLE`
8. Dispute can be opened on a covered line item in an approved claim

---

## Design Decisions

**Pure domain layer.** The adjudicator is a pure function. It takes in a line item, rules, and prior usage, and returns an output. This makes the entire adjudication pipeline unit-testable without a database and keeps business rules isolated from infrastructure concerns.

**`deductibleAppliedAmount` stored per result.** The deductible paid toward a member's annual deductible is stored on each adjudication result rather than computed from approved amounts. This allows accurate carry-forward calculation even when partial deductibles are applied (e.g. a $300 claim against a $500 deductible). `computePriorUsage` sums `deductible_applied_amount` across active results for the member/year.

**`is_active` flag instead of deleting results.** When a dispute is overturned or a claim is re-adjudicated, old results are deactivated rather than deleted. This preserves a complete audit trail and ensures the prior usage query remains correct by filtering `is_active = true`.

**`deriveClaimStatus` as the single source of truth.** Claim status is always re-derived from current line item statuses after any adjudication or dispute resolution. There is no separate "set claim status" step — the claim status is a computed aggregate of its line items (except for the terminal `paid` transition, which is an explicit action).

**Dispute overturn creates a new adjudication result.** Rather than re-running the adjudication pipeline on overturn (which would re-apply deductibles and caps, changing the semantics), overturning a dispute inserts a new result that approves the full billed amount with `trigger = 'dispute_overturn'`. This clearly separates the two code paths and makes the overturn auditable.

**Integration tests use a real database.** Mocking the database would obscure the SQL queries, ORM behavior, and transaction semantics that are the primary things worth testing at the integration layer. Tests run against a real PostgreSQL instance with each test suite starting from a clean state.
