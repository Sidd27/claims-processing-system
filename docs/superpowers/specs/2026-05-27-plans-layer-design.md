# Plans Layer Design

**Date:** 2026-05-27  
**Status:** Approved

## Problem

`planName` on the `policies` table is a plain text label with no structure behind it. Every member policy carries its own independently-created `coverageRules` with no shared template. There is no authoritative definition of what a plan covers — making plan management manual and error-prone.

## Goal

Introduce a `plans` layer so that:
- Insurance plans are defined once as reusable templates with their own coverage rules
- Enrolling a member snapshots the plan's rules into the policy at that moment
- Existing policies are unaffected when a plan's rules change
- Per-member rule overrides remain possible (additional rows in `coverageRules`)
- The adjudicator is not changed

## Approach: Snapshot on Enrollment

When a policy is created referencing a plan, all `planCoverageRules` for that plan are copied into the policy's `coverageRules`. From that point the policy's rules are independent — plan mutations do not affect enrolled policies. Per-member overrides are simply additional or replacement rows in `coverageRules`. The adjudicator reads a flat list of `coverageRules` by `policyId` exactly as it does today.

---

## Data Model

### New table: `plans`

```sql
plans
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
  plan_code    text NOT NULL UNIQUE   -- e.g. "PREMIER_PPO", "STANDARD_HMO"
  name         text NOT NULL          -- human-readable display label
  description  text
  created_at   timestamp NOT NULL DEFAULT now()
```

`planCode` is the stable programmatic identifier. `name` is display-only and can change freely.

### New table: `plan_coverage_rules`

```sql
plan_coverage_rules
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  plan_id       uuid NOT NULL REFERENCES plans(id)
  service_type  text NOT NULL
  rule_type     text NOT NULL
  config        jsonb NOT NULL
```

Mirrors the structure of `coverage_rules`. These are the template rules that define what a plan covers before any member enrolls.

### Change to `policies`

```sql
ALTER TABLE policies
  ADD COLUMN plan_id uuid REFERENCES plans(id);  -- nullable for backward compat
```

`plan_name` (existing text column) is kept as a denormalized copy of the plan name at enrollment time, so historical records stay readable even if a plan is renamed.

### `coverage_rules` — unchanged

No schema changes. At enrollment, copied plan rules land here with the `policyId`. Per-member overrides also live here. The adjudicator sees a flat list and applies it as before.

---

## Enrollment Flow

When `POST /members/:memberId/policy` is called with a `planId`:

1. Insert a row into `policies` with `planId` and the plan's current `name` as `planName`.
2. Fetch all `planCoverageRules` for that `planId`.
3. Insert one `coverageRules` row per plan rule, with the new `policyId`.

After step 3 the policy has a complete, frozen copy of the plan's rules. Subsequent edits to `plan_coverage_rules` do not affect this policy.

---

## Per-Member Overrides

After enrollment, overrides can be applied directly to `coverageRules`:

- **Add a rider:** insert a new `coverageRules` row for the policy.
- **Replace a plan rule:** delete the copied row for that `serviceType + ruleType`, insert a replacement.

The adjudicator is unaffected — it always works from a flat `coverageRules` list for the policy.

---

## API Surface

### Plan management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/plans` | List all plans |
| `POST` | `/plans` | Create a new plan (with its coverage rules) |
| `GET` | `/plans/:id` | Get plan detail including its coverage rules |
| `PUT` | `/plans/:id/rules` | Replace a plan's coverage rules (does not affect enrolled policies) |

### Policy enrollment

`POST /members/:memberId/policy` accepts `planId`. The service layer performs the snapshot — fetching `planCoverageRules` and inserting them into `coverageRules` for the new policy.

All claims, adjudication, dispute, and state machine endpoints are unchanged.

---

## Backward Compatibility

- `policies.plan_id` is nullable — existing rows remain valid with `plan_id = NULL`.
- `coverageRules` schema is unchanged — existing rows are unaffected.
- `getActivePolicy` and `getCoverageRules` repository functions behave identically.
- Seed data is updated to define `plans` first, then enroll members by `planId`.

---

## What Does Not Change

- `adjudicator.ts` — no changes.
- Claim submission, dispute, and state machine flows — no changes.
- The `coverageRules` table schema.

---

## Out of Scope

- **Plan versioning:** The schema does not block it (`plan_id` on `policy` could point to a versioned entity), but it is not in this iteration.
- **Bulk re-enrollment:** Migrating existing policies to updated plan rules requires a separate script if ever needed.
- **Admin UI for plan management:** API-only in this iteration.
