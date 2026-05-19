# Domain Model

## Entity Relationships

```
members
  └── policies (one active policy per member)
        └── coverage_rules (one or more per policy, keyed by service_type)

claims (belongs to member + policy)
  └── claim_line_items (one per billed service)
        ├── adjudication_results (one active result per line item; history kept with is_active=false)
        └── disputes (at most one open dispute per line item)
```

A **member** has a **policy**. The policy carries **coverage rules** — one or more rules per service type (e.g. DEDUCTIBLE + COINSURANCE for MEDICAL). When a claim is submitted, each line item is adjudicated against the rules that match its `service_type`.

An **adjudication result** belongs to a line item. Only one result is active at a time (`is_active = true`). On re-adjudication or dispute overturn, the old result is deactivated and a new one is inserted, preserving the full audit trail.

A **dispute** belongs to a line item (not the claim). This allows disputing a single service without reopening the entire claim. At most one dispute can be open per line item at any time.

---

## Claim Status State Machine

Claim status is derived from line item statuses — it is never set directly except for the terminal `paid` transition.

```
                  ┌────────────────────────────────────────────┐
                  │                                            │
              submitted                                        │
                  │                                            │
       ┌──────────┼──────────────┐                            │
       ▼          ▼              ▼                            │
  under_review  approved   partially_approved   denied         │
       │          │              │                │           │
       │          └──────────────┼────────────────┘           │
       │                         │                            │
       │                    [disputable]                      │
       │                         │                            │
       │                         ▼                            │
       │                     disputed                         │
       │                         │                            │
       │           ┌─────────────┼─────────────┐             │
       │           ▼             ▼              ▼             │
       │       approved  partially_approved  denied           │
       │           │             │                            │
       │           └─────────────┘                            │
       │                  │                                   │
       │                  ▼                                   │
       └──────────────► paid ◄──────────────────────────────┘
                       (terminal)
```

**Transitions:**

- `submitted → under_review` — any line item exceeded the review threshold
- `submitted → approved | partially_approved | denied` — adjudication completes without review
- `approved | partially_approved | denied → disputed` — member opens a dispute on a line item
- `disputed → approved | partially_approved | denied` — dispute resolved (status re-derived)
- `approved | partially_approved → paid` — explicit pay action

**`paid` is terminal.** No adjudication, dispute, or re-adjudication is permitted once a claim is paid.

### `deriveClaimStatus` rules

Given the set of line item statuses:

| Line item statuses                                    | Derived claim status                    |
| ----------------------------------------------------- | --------------------------------------- |
| Any `needs_review`                                    | `under_review`                          |
| All `covered`                                         | `approved`                              |
| All `denied`                                          | `denied`                                |
| Mix of `covered`/`denied`, or any `partially_covered` | `partially_approved`                    |
| Empty array                                           | throws `CLAIM_HAS_NO_LINE_ITEMS`        |
| Any `pending`                                         | throws `LINE_ITEMS_NOT_YET_ADJUDICATED` |

---

## Line Item Status

Each line item moves from `pending` through adjudication:

```
pending → needs_review      (REVIEW_THRESHOLD exceeded)
pending → covered           (approved in full after coinsurance; no capacity constraint applied)
pending → partially_covered (approved but reduced by deductible, cap, or annual limit)
pending → denied            (NOT_COVERED, or approved amount = $0)

needs_review → covered | partially_covered | denied   (after manual re-adjudication)
covered      → covered                                (after dispute overturn: full billed amount)
```

---

## Adjudication Pipeline

`adjudicate(lineItem, rules, priorUsage)` is a pure function. Rules are applied in a fixed order, and the pipeline short-circuits at steps 1 and 2.

```
Step 1: NOT_COVERED
  → If any rule for this service type is NOT_COVERED:
    approved = $0, status = denied. STOP.

Step 2: REVIEW_THRESHOLD
  → If billed > threshold:
    outcome = needs_review (no approved amount). STOP.

Step 3: DEDUCTIBLE
  → remaining = deductibleAmount - priorUsage.deductiblePaidAmount
  → applied   = min(remaining, billed)
  → current  -= applied
  → deductibleAppliedAmount = applied  (stored on the result for future carry-forward)

Step 4: COINSURANCE
  → current = round(current × coveragePercent)

Step 5: PER_CLAIM_CAP
  → if current > capAmount: current = capAmount

Step 6: ANNUAL_LIMIT
  → remaining = limitAmount - priorUsage.annualUsageAmount
  → if remaining ≤ 0:  current = 0            (ANNUAL_LIMIT_EXHAUSTED)
  → if remaining < current: current = remaining (ANNUAL_LIMIT_PARTIAL)
```

After steps 3–6, `lineItemStatus` is derived:

- `denied` if approved = $0
- `partially_covered` if a capacity constraint (DEDUCTIBLE, CAP, ANNUAL_LIMIT) reduced the amount
- `covered` otherwise (only coinsurance applied — contractual, not a constraint)

The `explanationSteps` array records each rule applied with the before/after amount, used by the UI to display an itemized explanation of benefits.

---

## Prior Usage

`computePriorUsage(memberId, serviceType, year)` queries all **active** adjudication results for claims belonging to the member, filtered by service type and calendar year. It returns:

```typescript
{
  deductiblePaidAmount: number; // sum of deductible_applied_amount across active results
  annualUsageAmount: number; // sum of approved_amount across active results
}
```

Deactivated results (from re-adjudication or overturned disputes) are excluded. This is what makes the `is_active` flag load-bearing: removing an old result from the active set automatically reduces the member's prior usage, so the next adjudication sees the correct carry-forward amounts.
