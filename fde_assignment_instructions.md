# Candidate Instructions

## What This Assignment Tests

This isn't about whether you can build a CRUD app. It's about:

- **Domain modeling** - Can you decompose a problem into the right abstractions?
- **Engineering judgment** - Can you make good decisions about what to build and what to skip?
- **Test-driven thinking** - Do you write tests that encode your understanding of the domain, not just verify UI behavior?
- **AI collaboration** - Can you work effectively with AI tools while staying in control?
- **Self-awareness** - Do you know what's good and what's rough in your own work?

---

## Ground Rules

- **Ship a working application, not just a passing test suite.** We will clone your submission, set it up from your README, and run the flows you built. If it doesn't run, the tests don't count.
- **Self-review the work.** Name what's broken, thin, or skipped — and the trade-off that put it there. A calibrated gap-list with reasoning earns more credit with us than polished completeness.
- **The chat is read alongside the code.** Submit your raw AI conversations with the work — the code tells us what shipped; the chat tells us how it got there, and who was steering. Your trail of commits, conversations, and revisions tells us more about your approach than a single tidy drop.
- **You are the designer of this system.** You should be able to walk through any part of it — what it does, why it's there, where it could break.
- **The code matters as much as what it produces.** Good code is its own bar.

---

## Time

24 to 48 hours max. How you allocate it is up to you.

---

## AI Tools

Use them. We want to see how you work with AI, not without it.

**Required:** Include the raw JSONL session logs from your coding agent (Claude Code, Codex CLI, Cursor, etc.). These files show us how you think, prompt, and iterate. Not sure where your logs are? Ask your agent — "where are my session logs / JSONL files?" is a valid prompt and it should locate them for you. If your agent does not produce JSONL logs, call that out in your submission and mention which agent you used.

> **Mandatory — do not skip.** Submissions without session logs will not be reviewed.

We'll look at:

- How you prompt
- Whether you iterate or just accept
- What you caught that AI got wrong
- Whether you understand the code you submitted

---

## What to Submit

| Deliverable          | What We Want to See                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Working system**   | Does what it claims. Runs locally.                                                                                                                           |
| **Tests**            | Tests should encode domain rules, not just assert HTTP status codes.                                                                                         |
| **Domain model doc** | Your entities, relationships, state machines. Why this decomposition?                                                                                        |
| **Decisions doc**    | What you built, what you didn't, what assumptions you made.                                                                                                  |
| **Self-review**      | Honest assessment. What's good? What's rough?                                                                                                                |
| **AI artifacts**     | **Raw JSONL session logs are mandatory.** Plus chat exports, notable prompts, and corrections you made. Submissions without JSONL logs will not be reviewed. |
| **Git history**      | Your `.git` folder - we review how you approached the problem.                                                                                               |

**Submission format:** Zip/tarball with `.git` folder included. Commit history matters.

---

## What We Don't Prescribe

- Technology stack
- How to structure your code
- Which edge cases to handle
- How sophisticated to make it
- What the interface looks like

**Make decisions. Justify them.**

---

## What Makes a Good Submission

**Coherent scope.** A system that does 3 things well beats one that does 10 things poorly.

**Clear domain model.** We should understand your abstractions and why you chose them.

**Tests written before code.** Your git history should show tests appearing before or alongside implementation — not added at the end. Tests that specify behavior ("when a claim is submitted with a duplicate line item, it should...") are far more valuable than tests that just check return types.

**Honest self-assessment.** "This is rough because..." shows more maturity than "everything is perfect."

**Effective AI use.** Using AI to explore options and iterate is good. Accepting walls of code without review is a red flag.

---

## What Gets Rejected

- No AI artifacts (we can't evaluate your process)
- Can't explain your own code
- No tests, or tests clearly written after the fact (git history doesn't lie)
- No domain model documentation
- Scattered half-features with no coherence
- Self-review that doesn't match reality

---

## Next Round

If you proceed, we'll extend your system together in a 75-minute pairing session. Write code you can navigate and modify under pressure.

---

## Questions

Logistics → reach out to Sumanth Raj Urs (sumanth@realfast.ai).

Requirements → part of the assignment. Make assumptions, document them.
