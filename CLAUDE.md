# CLAUDE.md — Project Instructions

## After any implementation that changes the data model, API, or domain logic

Keep these four files in sync:

1. **`README.md`** — update Data Model, Directory Structure, API Reference, Seed description, and Running Tests sections to reflect the change.
2. **`docs/decisions.md`** — add a new numbered ADR if the implementation made a non-obvious design choice (schema shape, approach selection, trade-off accepted). Follow the existing format: Decision → Why not alternatives → Tradeoff.
3. **`docs/domain-model.md`** — update the Entity Relationships diagram and any section describing the changed domain concepts.
4. **Commit and push** docs changes alongside code changes (or in a follow-up commit on the same PR).

## Code conventions

- New DB tables go in `app/db/schema.ts`. Run `npm run db:generate` to create the migration, then manually verify the generated SQL is an incremental diff (not a full schema recreation).
- New repositories go in `app/db/repositories/<table>.ts` — one file per table, same pattern as existing ones.
- New services go in `app/services/<feature>Service.ts`.
- New API routes go in `app/api/routes/<feature>.ts` and must be registered in `app/api/server.ts`.

## Testing

- Unit tests (`npm test`) — pure domain logic only, no DB, no HTTP.
- Integration tests (`npm run test:integration`) — real DB required (`DATABASE_URL` set). Each `describe` block resets the DB via `beforeEach(clearDb)`.
- When adding a new integration test file, add `plans`, `planCoverageRules` (and any new tables) to the `clearDb` function alongside the existing tables.
- Do not mock the database in integration tests.

## Design constraints

- The adjudicator (`app/domain/adjudication/adjudicator.ts`) is a pure function — no I/O, no DB access.
- Plan rule mutations must never retroactively affect enrolled policies (snapshot-on-enrollment).
- Claim status is always **derived** from line item statuses via `deriveClaimStatus`, never set directly (except the terminal `paid` transition).
