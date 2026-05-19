# Architecture Decision Records

---

## 1. Coverage rules as typed JSON (`CoverageRuleConfig` discriminated union) vs hardcoded logic

**Decision:** Rules are stored as a typed JSON discriminated union in `coverage_rules.config` (jsonb column). Each row is `{ type: 'COINSURANCE', coveragePercent: 0.8 }` or `{ type: 'DEDUCTIBLE', deductibleAmount: 500000 }`, etc.

**Why not hardcoded logic per plan?**
Hardcoded plan logic (e.g. `if planName === 'Premier PPO' apply 80%`) couples business rules to application code — adding a new plan requires a code change and deploy. JSON rules let policy configuration live in the database, where it can be managed independently.

**Why not a generic key/value config table?**
A generic table (`rule_name, value`) loses type safety — the application has no way to know which fields are required for which rule type, and invalid configs fail at runtime rather than at the TypeScript compiler. The discriminated union gives exhaustive type checking: adding a new rule type forces handling it in the adjudicator.

**Tradeoff:** The jsonb column is less queryable than normalized columns. We accept this because rules are always fetched by policy and interpreted in application code — there is no need to query on rule internals.

---

## 2. Ordered adjudication pipeline vs rule graph

**Decision:** Rules are applied in a fixed, hardcoded order: NOT_COVERED → REVIEW_THRESHOLD → DEDUCTIBLE → COINSURANCE → PER_CLAIM_CAP → ANNUAL_LIMIT.

**Why not a configurable rule graph where order is data?**
A configurable execution order would be powerful but adds significant complexity — cycle detection, rule dependency validation, and harder-to-follow audit trails. In health insurance adjudication, the application order is governed by industry standards (deductibles apply before coinsurance; caps apply after coinsurance). The order is not a policy variable — it is a domain invariant.

**Tradeoff:** Adding a new rule type requires modifying the adjudicator function. This is acceptable because the adjudicator is a small, well-tested pure function and new rule types represent a meaningful domain change.

---

## 3. `deductibleAppliedAmount` stored as a column on `adjudication_results`

**Decision:** The amount applied to the member's deductible is stored on each adjudication result rather than derived by back-calculating from approved amounts.

**Why not derive it?**
`deductibleAppliedAmount` cannot be reliably derived from the approved amount. Consider a $300 claim against a $500 deductible with 80% coinsurance: the deductible absorbs the full $300 (leaving $0 for coinsurance), so approved = $0. But a $700 claim against the same deductible also results in $0 approved if the entire billed amount is absorbed. Knowing only the approved amount does not tell you how much of the deductible was consumed.

Storing it explicitly makes `computePriorUsage` a simple aggregation (`SUM(deductible_applied_amount)`) rather than a multi-step reconstruction.

**Tradeoff:** A slight denormalization — the deductible applied is technically derivable from the inputs if you re-run the adjudicator. But re-running the adjudicator to compute prior usage would require prior usage, creating a circular dependency. The column resolves this cleanly.

---

## 4. One active policy per member (no effective-date range querying)

**Decision:** `getActivePolicy` returns the most recently created policy with no `term_date`. There is no logic to select a policy based on the claim's service date.

**Why not effective-date-based policy selection?**
Selecting the correct policy as-of a service date requires knowing when prior policies were terminated and handling mid-year plan changes. This is a real requirement in production health insurance but adds substantial complexity (open-ended date ranges, gap detection, retroactive adjudication) that is out of scope for this system.

**Tradeoff:** A member can only have one policy at a time. Changing plans requires the old policy to be terminated before a new one is created. This is a deliberate simplification, not an oversight.

---

## 5. `is_active` flag on adjudication results vs deleting old results

**Decision:** When a line item is re-adjudicated (on dispute resolution or manual re-adjudication), the old result is set `is_active = false` and a new result is inserted. Results are never deleted.

**Why not delete and replace?**
Deleting results destroys the audit trail. In regulated industries, you need to know what was approved and why, including historical decisions that were subsequently changed. The `is_active` flag maintains full history while making it unambiguous which result is current.

**Why not a separate `adjudication_history` table?**
A separate history table would require duplicating the schema or using a polymorphic structure, and all reads would need to union the two tables or know which table to query. A single table with an `is_active` column is simpler and keeps all results in one place.

**Tradeoff:** Queries must always filter `WHERE is_active = true` or they will double-count. The `computePriorUsage` function, `getActiveResult`, and the UI detail endpoint all apply this filter — missing it would be a correctness bug.

---

## 6. Disputes at the line item level, not the claim level

**Decision:** A dispute is opened on a specific `claim_line_item`, not on the claim as a whole.

**Why?**
A claim can contain multiple services. A member may accept the adjudication of some services (e.g. an office visit covered at 80%) while disputing another (e.g. a procedure subject to a per-claim cap). Claim-level disputes would require re-adjudicating all line items when only one is in question.

Line item disputes also make the overturn logic precise: overturning a dispute approves the full billed amount for that specific service and deactivates only that line item's adjudication result. Other line items on the same claim are unaffected.

**Tradeoff:** A member with multiple disputed services on one claim must open separate disputes. This is consistent with how Explanations of Benefits (EOBs) work in practice.

---

## 7. Dispute overturn creates a new adjudication result vs re-running the pipeline

**Decision:** Overturning a dispute inserts a new adjudication result approving the full billed amount (`trigger = 'dispute_overturn'`) rather than re-running the adjudication pipeline with the original inputs.

**Why not re-run the pipeline?**
Re-running the pipeline on overturn would re-apply deductibles, caps, and annual limits — which would still reduce the approved amount, defeating the purpose of the overturn. An overturn is a clinical/administrative decision that the original rules should not have applied to this specific service; the approved amount is set by policy, not by re-calculation.

**Tradeoff:** The overturn result has empty `reductionReasons` and a single `DISPUTE_OVERTURN` explanation step. This is intentional — the standard pipeline explanation does not apply.

---

## 8. Dispute resolution UI is ops-facing, not member-facing

**Decision:** The "Resolve Dispute" button on the claim detail page is an internal ops/admin action. It is surfaced in the same UI as the member-facing views for demonstration purposes, but in production it would live behind a staff role check.

**Why not hide it entirely?**
The assignment required demonstrating the full dispute lifecycle including resolution. Showing it in the UI makes the capability visible and testable without requiring a separate admin interface to be built.

**How it works:** The detail page fetches the open dispute for each line item alongside the adjudication result. If a line item has an open dispute, the "Resolve Dispute" button appears. The member-facing "Open Dispute" button and the ops-facing "Resolve Dispute" button are shown in the same row but are logically separate actions.
