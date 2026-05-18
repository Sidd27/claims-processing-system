# Claims Processing System — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Build a working insurance claims processing system with adjudication engine, lifecycle state management, and a read-focused demo UI.

**Architecture:** Domain-first layered monolith. Pure domain logic (adjudication, state machine) in `app/domain/` with zero DB/HTTP imports. DB repositories in `app/db/`. Thin Fastify routes in `app/api/`. React UI in `app/ui/`.

**Tech Stack:** TypeScript · Fastify · PostgreSQL · Drizzle ORM (pg driver) · Vitest · React · Tailwind · shadcn

---

## Phase 1 — Project Scaffolding

- [ ] Create `package.json` at root with deps: `fastify`, `drizzle-orm`, `pg`; devDeps: `typescript`, `tsx`, `vitest`, `drizzle-kit`, `@types/pg`, `@types/node`, `concurrently`
- [ ] Create `tsconfig.json`: target ES2022, module CommonJS, strict true, outDir `dist/`, rootDir `.`
- [ ] Create `docker-compose.yml`: single postgres service, port 5432, db `claims_dev`
- [ ] Create `.env.example`: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/claims_dev`
- [ ] Create `drizzle.config.ts`: schema `app/db/schema.ts`, out `app/db/migrations`, driver pg
- [ ] Create `vitest.config.ts`: include `app/**/*.test.ts`, exclude `app/ui/**`
- [ ] Commit: `chore: project scaffolding`

---

## Phase 2 — Domain Types + Errors

- [ ] Create `app/domain/errors.ts`: `DomainError extends Error` with `code: string`
- [ ] Create `app/domain/policies/types.ts`: `ServiceType` enum, `CoverageRuleConfig` discriminated union, `CoverageRule`, `Policy` interfaces
- [ ] Create `app/domain/claims/types.ts`: `ClaimStatus`, `LineItemStatus` enums, `Claim`, `ClaimLineItem` interfaces
- [ ] Create `app/domain/adjudication/types.ts`: `ReductionReason`, `ReviewTrigger`, `ExplanationStep` (rule: string, description, amountBefore, amountAfter), `AdjudicationOutput` discriminated union, `PriorUsage`
- [ ] Create `app/domain/disputes/types.ts`: `DisputeStatus`, `DisputeResolution`, `Dispute` interface
- [ ] Commit: `feat: domain types`

---

## Phase 3 — State Machine (TDD)

- [ ] Write `app/domain/claims/stateMachine.test.ts` — all tests RED
- [ ] Run `npx vitest run app/domain/claims/stateMachine.test.ts` — verify RED
- [ ] Create `app/domain/claims/stateMachine.ts`: `deriveClaimStatus`, `assertValidTransition`, `assertCanFlagForReview`, `DISPUTABLE_STATES`, `PAYABLE_STATES`
- [ ] Run tests — verify GREEN
- [ ] Commit: `feat: claim state machine (TDD)`

---

## Phase 4 — Adjudication Pipeline (TDD)

- [ ] Write `app/domain/adjudication/adjudicator.test.ts` — all tests RED
- [ ] Run tests — verify RED
- [ ] Create `app/domain/adjudication/adjudicator.ts`: `adjudicate(lineItem, rules, priorUsage): AdjudicationOutput` — full pipeline NOT_COVERED → REVIEW_THRESHOLD → DEDUCTIBLE → COINSURANCE → PER_CLAIM_CAP → ANNUAL_LIMIT
- [ ] Run tests — verify GREEN
- [ ] Commit: `feat: adjudication pipeline (TDD)`

---

## Phase 5 — Dispute Domain Logic (TDD)

- [ ] Write `app/domain/disputes/disputeLogic.test.ts` — tests for `assertCanOpenDispute`, `assertDisputeNotAlreadyResolved`
- [ ] Run tests — verify RED
- [ ] Create `app/domain/disputes/disputeLogic.ts`: `assertCanOpenDispute(claimStatus)`, `assertDisputeNotAlreadyResolved(disputeStatus)` — guards only, no DB
- [ ] Run tests — verify GREEN
- [ ] Commit: `feat: dispute domain logic (TDD)`

---

## Phase 6 — DB Schema + Migration

- [ ] Create `app/db/schema.ts`: tables for `members`, `policies`, `coverage_rules`, `claims`, `claim_line_items`, `adjudication_results`, `disputes`
- [ ] Create `app/db/client.ts`: Drizzle + pg Pool, export `db`
- [ ] Run `docker compose up -d` then `npx drizzle-kit generate` then `npx drizzle-kit migrate`
- [ ] Commit: `feat: db schema and migration`

---

## Phase 7 — Repositories

- [ ] Create `app/db/repositories/members.ts`: `getMember`, `getMemberWithPolicy`
- [ ] Create `app/db/repositories/policies.ts`: `getActivePolicy`, `getCoverageRules`
- [ ] Create `app/db/repositories/claims.ts`: `getClaim`, `listClaims`, `createClaim`, `updateClaimStatus`
- [ ] Create `app/db/repositories/lineItems.ts`: `getLineItem`, `getLineItemsByClaimId`, `createLineItems`, `updateLineItemStatus`
- [ ] Create `app/db/repositories/adjudicationResults.ts`: `createAdjudicationResult`, `deactivateResults`, `getActiveResult`, `getResultHistory`
- [ ] Create `app/db/repositories/limitUsage.ts`: `computePriorUsage` — queries committed results for (memberId, serviceType, year)
- [ ] Create `app/db/repositories/disputes.ts`: `createDispute`, `getDispute`, `markDisputeResolved`
- [ ] Commit: `feat: db repositories`

---

## Phase 8 — Application Services

- [ ] Create `app/services/adjudicationService.ts`: `adjudicateClaimLineItems(claimId)` — wraps pipeline + persistence in DB transaction
- [ ] Create `app/services/claimService.ts`: `submitClaim(data)`, `markClaimPaid(claimId)`
- [ ] Create `app/services/disputeService.ts`: `openDispute(lineItemId, claimId, reason)`, `resolveDispute(disputeId, resolution, note)` — re-derives claim status after overturn
- [ ] Commit: `feat: application services`

---

## Phase 9 — Seed Data

- [ ] Create `app/db/seed.ts`: 4 members (Alice full approval, Bob partial, Carol limit exhaustion, Dave dispute+overturn), policies with coverage rules, pre-committed claims for Carol's prior usage
- [ ] Add `"db:seed": "tsx app/db/seed.ts"` to package.json scripts
- [ ] Run `npm run db:seed` — verify no errors
- [ ] Commit: `feat: seed data`

---

## Phase 10 — API

- [ ] Create `app/api/server.ts`: Fastify instance, CORS, `DomainError` → 422 error handler
- [ ] Create `app/api/routes/claims.ts`: `GET /claims`, `GET /claims/:id`, `POST /claims`, `POST /claims/:id/adjudicate`, `POST /claims/:id/pay`
- [ ] Create `app/api/routes/disputes.ts`: `POST /claims/:id/line-items/:lineItemId/dispute`, `POST /disputes/:id/resolve`
- [ ] Create `app/api/routes/members.ts`: `GET /members/:id`, `GET /members/:id/policy`
- [ ] Create `app/api/index.ts`: start server on port 3000
- [ ] Add `"dev:api": "tsx watch app/api/index.ts"` to scripts
- [ ] Smoke test: `npm run dev:api`, hit `GET /api/v1/claims` — verify seed data returns
- [ ] Commit: `feat: api routes`

---

## Phase 11 — Integration Tests

- [ ] Create `app/api/claims.integration.test.ts`: annual limit exhaustion (3-claim sequence), dispute overturn re-derives claim status, adjudication transaction reflects only committed results, empty line items rejected
- [ ] Run `npx vitest run app/api/claims.integration.test.ts` — verify GREEN
- [ ] Commit: `test: integration tests`

---

## Phase 12 — UI

- [ ] `cd app/ui && npm create vite@latest . -- --template react-ts && npm install`
- [ ] Install Tailwind, init shadcn, add components: `badge`, `button`, `card`, `table`
- [ ] Create `app/ui/src/lib/api.ts`: typed fetch helpers for all endpoints
- [ ] Create `app/ui/src/components/StatusBadge.tsx`: coloured badge per claim/line item status
- [ ] Create `app/ui/src/pages/ClaimsList.tsx`: cards with status filter chips
- [ ] Create `app/ui/src/pages/ClaimDetail.tsx`: header, line items table, expandable explanation steps, dispute panel, conditional action buttons
- [ ] Add `"dev:ui": "cd app/ui && npm run dev"` and `"dev": "concurrently \"npm run dev:api\" \"npm run dev:ui\""` to root scripts
- [ ] Smoke test: `npm run dev`, open UI, verify all 4 seed scenarios visible and actionable
- [ ] Commit: `feat: demo UI`

---

## Phase 13 — Documentation

- [ ] Write `docs/domain-model.md`: entities, relationships, state machines (pull from spec)
- [ ] Write `docs/decisions.md`: all decisions from spec Section 10 + known gaps
- [ ] Write `README.md`: prerequisites, setup steps (`docker compose up -d`, `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`), demo walkthrough
- [ ] Commit: `docs: domain model, decisions, readme`

---

## Phase 14 — Self-Review

- [ ] Write `docs/self-review.md`: honest gaps (concurrent limit race, post-payment disputes, no CPT validation, deductible cross-year, idempotency)
- [ ] Commit: `docs: self-review`
