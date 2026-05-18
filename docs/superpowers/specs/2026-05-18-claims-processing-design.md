# Claims Processing System — Design Spec

**Date**: 2026-05-18
**Assignment**: Forward Deployed Engineer Take-Home (Level 1)
**Stack**: TypeScript · Fastify · PostgreSQL · Drizzle ORM · Vitest · React · Tailwind · shadcn

---

## 1. Repository Structure

```
claims-processing-system/
  app/
    domain/
      claims/         # Claim + ClaimLineItem entities, state machine, status derivation
      policies/       # Policy + CoverageRule entities
      adjudication/   # Pipeline evaluator, explanation builder
      disputes/       # Dispute entity, resolution logic
    db/               # Drizzle schema, migrations, repositories
    api/              # Fastify routes (thin — no business logic)
    ui/               # React + Tailwind + shadcn
  docs/
    domain-model.md
    decisions.md
    self-review.md
    superpowers/specs/
  ai-artifacts/       # JSONL session logs + chat exports (populated at submission)
  README.md
  .git/
```

The `domain/` layer has zero imports from `db/` or `api/`. All adjudication logic is pure functions. Tests run against domain logic without a database.

---

## 2. Domain Model

### Entities and Relationships

```
Member (1) ──── (1) Policy ──── (many) CoverageRule
                  │
                  └─ (many) Claim ──── (many) ClaimLineItem
                                           │
                                           └─ (many) AdjudicationResult  [isActive flag]
                                           └─ (0..1) Dispute
```

### Member
- `id`, `externalMemberId`, `name`, `dateOfBirth`
- Minimal. No auth, no account management.

### Policy
- `id`, `memberId`, `planName`, `effectiveDate`, `termDate`
- One active policy per member at a time (see tradeoffs — Section 10).

### CoverageRule
- `id`, `policyId`, `serviceType`, `ruleType`, `config` (typed JSON)
- Discriminated union (see Section 3).

### Claim
- `id`, `memberId`, `policyId`, `providerName`, `providerNpi`, `diagnosisCode`, `status`, `submittedAt`
- Must have at least one line item — zero-line-item claims are rejected at submission.
- **Invariant**: `status` is never written directly by application code. Every status change except `paid` goes through `deriveClaimStatus`. This is enforced in the domain layer — route handlers have no direct write path to claim status.

### ClaimLineItem
- `id`, `claimId`, `serviceType`, `cptCode`, `description`, `serviceDate`, `billedAmountCents`, `status`

### AdjudicationResult
- `id`, `lineItemId`, `approvedAmountCents`, `reductionReasons` (array), `explanationSteps` (JSON), `isActive`, `trigger`, `adjudicatedAt`
- **Only created when adjudication math completes** (`outcome: 'complete'`). Line items in `needs_review` state have no `AdjudicationResult` row — math has not run yet. A result is created once review resolves and the pipeline executes.
- One line item can have multiple results (initial + re-adjudication after dispute overturn).
- **Invariant**: exactly one `isActive = true` per line item at any time.
- `trigger`: `'initial_submission' | 'dispute_overturn' | 'manual_review'`
- Current result: `WHERE lineItemId = X AND isActive = true`
- Full history: `WHERE lineItemId = X ORDER BY adjudicatedAt ASC`

### Dispute
- `id`, `lineItemId`, `memberReason`, `status` (`open | resolved`), `resolution` (`upheld | overturned`), `resolverNote`, `resolvedAt`

### LimitUsage
- **Not a stored entity.** Computed on demand by querying committed `AdjudicationResult` rows for `(memberId, serviceType, year)`.
- No dual-write risk. Always fresh at adjudication time.

### Service Types (enum)
`MEDICAL | DENTAL | VISION | MENTAL_HEALTH | PRESCRIPTION`

---

## 3. Coverage Rules — Discriminated Union

```typescript
type CoverageRuleConfig =
  | { type: 'NOT_COVERED' }
  | { type: 'COINSURANCE';       coveragePercent: number }   // 0.80 = insurer pays 80%
  | { type: 'DEDUCTIBLE';        deductibleCents: number }   // member pays first N cents/year
  | { type: 'ANNUAL_LIMIT';      limitCents: number }        // insurer max/year for service type
  | { type: 'PER_CLAIM_CAP';     capCents: number }          // insurer max per claim
  | { type: 'REVIEW_THRESHOLD';  thresholdCents: number }    // escalate to review if billed > threshold
```

Rules are stored as DB rows with `serviceType` + `ruleType` + `config` (JSON). The evaluator pattern-matches on `type`. New rule types require extending the union and adding an evaluator case — no schema migration.

`REVIEW_THRESHOLD` is a workflow rule, not an adjudication math rule. It triggers escalation before any monetary calculation runs (see Section 4).

---

## 4. Adjudication Pipeline

### Types

```typescript
// Monetary reduction reasons — why approved < billed after math
type ReductionReason =
  | 'NOT_COVERED'
  | 'DEDUCTIBLE_APPLIED'
  | 'PER_CLAIM_CAP'
  | 'ANNUAL_LIMIT_PARTIAL'
  | 'ANNUAL_LIMIT_EXHAUSTED'

// Workflow escalation reasons — why math did not run
type ReviewTrigger =
  | 'AMOUNT_THRESHOLD_EXCEEDED'
  | 'MANUAL_FLAG'

type ExplanationStep = {
  rule: CoverageRuleConfig['type'];
  description: string;     // human-readable sentence
  amountBefore: number;
  amountAfter: number;
}

// Discriminated union — math path vs escalation path
type AdjudicationOutput =
  | {
      outcome: 'complete';
      approvedAmountCents: number;
      lineItemStatus: 'covered' | 'partially_covered' | 'denied';
      reductionReasons: ReductionReason[];
      explanationSteps: ExplanationStep[];
    }
  | {
      outcome: 'needs_review';
      trigger: ReviewTrigger;
      explanationSteps: ExplanationStep[];   // escalation explanation only — no amounts
    }

type PriorUsage = {
  deductiblePaidCents: number;   // member's deductible already consumed this year
  annualUsageCents: number;      // insurer already paid this year for this service type
}
```

`approvedAmountCents` and `reductionReasons` are structurally inaccessible on the `needs_review` branch — TypeScript enforces the separation.

### Fixed Pipeline Order

```
billedAmountCents
      │
      ▼
[1] NOT_COVERED rule present?
      ├─ yes → outcome: complete, status: denied (short-circuit)
      ▼
[2] REVIEW_THRESHOLD exceeded?
      ├─ yes → outcome: needs_review, trigger: AMOUNT_THRESHOLD_EXCEEDED (short-circuit)
      │        no math runs, no amounts recorded
      ▼
      ── adjudication math begins ──
      ▼
[3] DEDUCTIBLE
      │  remaining = deductibleCents − priorUsage.deductiblePaidCents
      │  applied   = min(remaining, currentPayable)
      │  currentPayable -= applied
      │  if applied > 0 → reductionReason: DEDUCTIBLE_APPLIED
      ▼
[4] COINSURANCE
      │  currentPayable = currentPayable × coveragePercent
      │  contractual reduction — no reductionReason added
      ▼
[5] PER_CLAIM_CAP
      │  if currentPayable > capCents → currentPayable = capCents
      │  reductionReason: PER_CLAIM_CAP
      ▼
[6] ANNUAL_LIMIT
      │  remaining = limitCents − priorUsage.annualUsageCents
      │  if remaining ≤ 0 → currentPayable = 0, reason: ANNUAL_LIMIT_EXHAUSTED
      │  if remaining < currentPayable → currentPayable = remaining, reason: ANNUAL_LIMIT_PARTIAL
      ▼
outcome: complete, approvedAmountCents = currentPayable
```

Steps [3]–[6] each append an `ExplanationStep` with `amountBefore` and `amountAfter` only when they fire. Steps with no matching rule or no effect are omitted from the explanation.

### Line Item Status Determination (complete path only)

```
NOT_COVERED in reductionReasons              → denied
approvedAmountCents === 0                    → denied
any capacity constraint in reductionReasons  → partially_covered
else                                         → covered
```

**Capacity constraints**: `DEDUCTIBLE_APPLIED | PER_CLAIM_CAP | ANNUAL_LIMIT_PARTIAL | ANNUAL_LIMIT_EXHAUSTED`

Pure coinsurance reduction is contractually expected — it does not produce `partially_covered`.

### Concurrency

Adjudication and `AdjudicationResult` persistence execute within a single DB transaction. Prior usage is read and the new result written atomically — sequential requests are safe.

**Known gap**: truly concurrent requests arriving simultaneously could both read the same prior usage before either commits. Production would require `SELECT ... FOR UPDATE` on the usage query or serializable isolation. Documented in `decisions.md`.

### Explanation Example

> **CPT 90837 — Psychotherapy** · Billed: $200.00
>
> 1. MENTAL_HEALTH is covered under your plan.
> 2. Plan covers 80% after deductible. Payable: $160.00.
> 3. Annual Mental Health benefit: $500. Used: $460. Remaining: $40. Amount capped at $40.
> 4. **Approved: $40.00** — annual limit nearly exhausted.

---

## 5. State Machines

### LineItem States

```
pending ──adjudicate──► covered
                      ► partially_covered
                      ► denied
                      ► needs_review

needs_review ──resolve──► covered | partially_covered | denied

denied ──dispute overturn──► covered
partially_covered ──dispute overturn──► covered

covered | denied | partially_covered ──manual flag──► needs_review
  (guard: claim must NOT be in paid state)
```

### Claim States and Transitions

| From | To | Trigger |
|---|---|---|
| `submitted` | `under_review` | any line item → `needs_review` |
| `submitted` | `approved / partially_approved / denied` | adjudication complete, no review items |
| `under_review` | `approved / partially_approved / denied` | all `needs_review` items resolved |
| `approved / partially_approved` | `paid` | explicit "mark paid" action |
| `approved / partially_approved / denied` | `disputed` | member opens dispute |
| `disputed` | `approved / partially_approved / denied` | dispute resolved — re-derived from line items |

`paid` is **fully terminal**. No transitions out. No line item re-opening. No dispute filing.

```typescript
const DISPUTABLE_STATES = ['approved', 'partially_approved', 'denied'];
const PAYABLE_STATES    = ['approved', 'partially_approved'];
```

### Claim Status Derivation

**Invariant**: claim `status` is never written directly by application code. Every status change except `paid` goes through `deriveClaimStatus`. Route handlers have no direct write path to claim status.

```typescript
function deriveClaimStatus(statuses: LineItemStatus[]): ClaimStatus {
  if (statuses.length === 0) throw new DomainError('CLAIM_HAS_NO_LINE_ITEMS');
  if (statuses.some(s => s === 'needs_review'))  return 'under_review';
  if (statuses.every(s => s === 'denied'))        return 'denied';
  if (statuses.every(s => s === 'covered'))       return 'approved';
  return 'partially_approved';
}
```

`partially_covered` line items roll up to `partially_approved` at the claim level.
An empty `statuses` array is a domain error — a claim without line items is structurally invalid and must be rejected at submission before `deriveClaimStatus` is called.

### Dispute States

```
open ──► resolved (upheld | overturned)
```

**On overturn**: set current `AdjudicationResult.isActive = false`, create new result with `trigger: 'dispute_overturn'` and `isActive = true`, re-run `deriveClaimStatus`, update claim status.

**On uphold**: line item status unchanged, dispute marked `resolved`.

**Post-payment disputes**: not supported. `paid` is terminal. Post-payment corrections require an adjustment/clawback flow — out of scope, documented in `decisions.md`.

---

## 6. API Design

**Base prefix**: `/api/v1`

### Claims

| Method | Path | Description |
|---|---|---|
| `GET` | `/claims` | List all claims with status summary |
| `GET` | `/claims/:id` | Claim detail — line items, adjudication results, explanations |
| `POST` | `/claims` | Submit a new claim with line items |
| `POST` | `/claims/:id/adjudicate` | Trigger adjudication (demo affordance) |
| `POST` | `/claims/:id/pay` | Mark claim as paid (demo affordance) |

### Disputes

| Method | Path | Description |
|---|---|---|
| `POST` | `/claims/:id/line-items/:lineItemId/dispute` | Open dispute with member reason |
| `POST` | `/disputes/:id/resolve` | Resolve: `{ resolution: 'upheld' \| 'overturned', note: string }` |

### Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/members/:id` | Member + active policy summary |
| `GET` | `/members/:id/policy` | Policy with coverage rules |

**Note**: `/adjudicate` and `/pay` are demo affordances. In production, adjudication triggers automatically on submission and payment confirmation comes from a payment processor callback.

Route handlers are thin: validate input → call domain logic → return result. No business logic in routes.

---

## 7. UI Structure

**Two views. Read-focused. Seed-data driven. No forms.**

### Claims List (`/`)
- Card per claim: member name, status badge, submitted date, total billed vs approved
- Status filter chips

### Claim Detail (`/:claimId`)
- Claim header: member, policy, provider, diagnosis code, status badge
- Line items table: CPT code, service type, billed, approved, status
- Expandable per line item → adjudication explanation steps (pipeline order)
- Dispute panel: open disputes, resolution status
- Action buttons rendered conditionally on claim state:
  - `Adjudicate` — shown when `submitted`
  - `Mark Paid` — shown when `approved | partially_approved`
  - `Resolve Dispute` — shown when `disputed`

---

## 8. Seed Data Scenarios

Four scenarios covering the system's range:

| Scenario | Member | Key Feature Demonstrated |
|---|---|---|
| Full approval | Alice | All line items covered, clean pipeline explanation |
| Partial approval | Bob | Mix of covered / denied line items |
| Annual limit exhaustion | Carol | Third claim hits $0 remaining limit |
| Dispute and overturn | Dave | Denied line item disputed and overturned |

Carol's scenario requires two prior committed claims so the limit exhaustion integration test has real prior usage to query against.

---

## 9. Test Strategy

Unit tests live in `app/domain/` alongside the code they test. No DB or HTTP dependencies.

### `app/domain/adjudication/adjudicator.test.ts`

```
✓ returns outcome:needs_review when REVIEW_THRESHOLD exceeded — no amounts present
✓ returns outcome:complete with status:denied when service type is NOT_COVERED
✓ applies deductible before coinsurance
✓ returns outcome:complete with status:covered when only coinsurance reduces amount
✓ returns outcome:complete with status:partially_covered when annual limit reduces amount
✓ returns outcome:complete with status:denied when annual limit is fully exhausted
✓ caps approved amount at PER_CLAIM_CAP
✓ explanation steps appear in pipeline order: deductible before coinsurance before annual limit
✓ explanation step amounts are consistent: amountAfter of step N equals amountBefore of step N+1
```

### `app/domain/claims/stateMachine.test.ts`

```
✓ derives approved when all line items are covered
✓ derives partially_approved when line items are mixed covered/denied
✓ derives partially_approved when any line item is partially_covered
✓ derives under_review when any line item is needs_review
✓ throws CLAIM_HAS_NO_LINE_ITEMS when statuses array is empty
✓ rejects paid → disputed transition
✓ rejects manual line item re-flagging when claim is paid
```

### `app/domain/disputes/dispute.test.ts`

```
✓ cannot open dispute on paid claim
✓ overturn creates new active AdjudicationResult with trigger dispute_overturn
✓ overturn sets previous AdjudicationResult isActive to false
✓ overturn re-derives claim status from updated line item statuses
✓ uphold leaves line item status unchanged
```

### `app/api/claims.integration.test.ts`

```
✓ submit claim → adjudicate → verify explanation structure and step order
✓ annual limit exhaustion: second claim partially_covered after first depletes limit
✓ annual limit exhaustion: third claim fully denied when limit is zero
✓ dispute overturn re-adjudicates and re-derives claim status correctly
✓ adjudication runs inside transaction — prior usage reflects only committed results
✓ claim submission rejected when no line items provided
```

Test names describe domain behaviour. Tests named after HTTP status codes are a rejection criterion per assignment instructions.

---

## 10. Key Decisions and Tradeoffs

Full rationale in `docs/decisions.md`. Summary:

| Decision | Choice | Rationale |
|---|---|---|
| Rule representation | Typed JSON + discriminated union | Extensible without schema migration; type-safe in evaluator |
| Adjudication output | Discriminated union on `outcome` | Separates math path from workflow escalation at the type level — `approvedAmountCents` is inaccessible on `needs_review` branch |
| Adjudication pipeline | Ordered sequence, not parallel evaluators | Mirrors real insurance math; produces coherent ordered explanation |
| LimitUsage | Computed, not stored | Avoids dual-write inconsistency |
| AdjudicationResult | Multi-pass with `isActive` | Supports re-adjudication without schema change |
| Dispute flow | Minimal (Option A) | Satisfies scope; post-payment complexity documented as gap |
| Paid state | Fully terminal | No ambiguous accounting states |
| Claim status | Always derived via `deriveClaimStatus`, never set directly | Invariant enforced in domain layer |
| One active policy per member | Single policy assumption | Real systems support coordination of benefits across primary + supplemental policies with priority ordering and cross-policy limit aggregation — out of scope; simplification documented |
| Concurrency | DB transaction for adjudication + persist | Sequential requests are safe; simultaneous-request gap documented |
| UI | Read-focused, seed-driven, 2 views | Demo clarity over form complexity |
| Auth / notifications / admin | Not built | Explicitly out of scope per assignment |

---

## 11. Known Gaps

- Concurrent claim submissions against same annual limit not fully protected — transaction handles sequential; simultaneous requests need `SELECT FOR UPDATE`
- Post-payment disputes require an adjustment/clawback flow — not implemented
- No real CPT/ICD code validation — treated as opaque strings
- Annual deductible tracking assumes single policy year; cross-year rollover not modelled
- One active policy per member — coordination of benefits across multiple policies not supported
- `REVIEW_THRESHOLD` is a single dollar threshold per rule; real systems use multi-factor triggers
- No retry or idempotency on claim submission
