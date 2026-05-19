# Self-Review

## What's Good

- Folder structure is clean and follows domain-driven design — each layer has a clear responsibility and dependencies flow in one direction.
- Claim status is derived from line-item statuses rather than stored independently, keeping the model consistent by design.
- The adjudication engine uses pure functions, which makes it easy to test in isolation and reason about without side effects.
- Dispute flow is implemented end-to-end; audit history is maintained on disputes so resolution decisions are traceable.
- The `is_active` flag on adjudication results handles re-adjudication and dispute overturn cleanly — old results are deactivated rather than deleted, which preserves audit history and keeps prior usage calculations correct.
- Test coverage is solid for domain logic; tests focus on business rules rather than HTTP plumbing.
- Docs cover project setup, domain model, and architectural decisions — enough context for someone picking this up cold.
- Migrations and seeds are included so the project runs end-to-end without manual setup.
- Transactions are used where writes span multiple tables, preventing partial state.
- The UI is clean, minimal, and extensible — no business logic leaked into components.

## What's Rough

- Biggest correctness gap is around prior usage and time boundaries — "year" is ambiguous: does it mean the service date's calendar year or a rolling 12-month window? This is unresolved and affects deductible and out-of-pocket accumulation correctness.
- Concurrent requests are not safe at scale — prior usage lookups and deductible accumulation are not protected against race conditions under simultaneous submissions.
- Runtime validations are light — input checking on the API side can be significantly improved.
- Error handling on the API has rough edges — not all failure paths return consistent, meaningful error responses.
- Some invariants that belong at the database level are only enforced in application code — for example, one active adjudication result per line item has no DB constraint backing it.
- Manual review flow is weak — when a line item enters `needs_review`, adjudication re-runs automatically with no mechanism to insert a human decision before re-adjudication.
- Complex line item processing scenarios (e.g. coordination of benefits, bundling rules) are not handled.
- The adjudication engine works well for the covered cases but lacks custom/exception handling and is far from production grade.
- The UI is functional but not production grade — it has rough edges and is missing some critical flows.

## Trade-Offs

- **Speed vs correctness on prior usage** — prior usage is looked up at adjudication time without a lock, which is fast but not safe under concurrent submissions. A correct solution would require pessimistic locking or serialized processing per member.
- **Typed JSON rule model vs a full rule engine** — chose a typed JSON structure for coverage rules over building a general-purpose rule engine. Simpler to reason about and test, but less flexible for complex or dynamic rule authoring.
- **Fixed adjudication pipeline order vs rule-based ordering** — steps run in a fixed sequence, which made it straightforward to add explanation steps and trace how an amount changes at each stage. A dynamic ordering would be more flexible but harder to explain.
- **`paid` is a terminal state** — once a claim is marked paid it cannot transition further. Simple and safe, but means no correction path if paid in error.
- **One active policy per member enforced in application code** — the constraint is real but not backed by a DB unique index. Chose simplicity over strictness here.
- **Dispute overturn approves the full billed amount** — rather than re-running the adjudication pipeline with different inputs, an overturn short-circuits to full approval. Simpler to implement but not how a real payer would handle it.
- **Built a small UI even though the assignment only required one demonstrable interface** — went further than required. In hindsight, that time would have been better spent tightening validation, prior-usage correctness, database constraints, and the manual-review and dispute edges.
- I stored diagnosis information as standardized codes rather than free-text clinical notes. This reduces unnecessary sensitive text in the system, but the codes are still health data and would need PHI-level handling in production.
