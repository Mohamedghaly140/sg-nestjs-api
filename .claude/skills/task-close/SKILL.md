---
name: task-close
description: Checks a just-completed coding task against CLAUDE.md's mandatory "After Completing Any Task" checklist (phase status, API spec, DATABASE.md, CHANGELOG, ADRs) before it's considered done.
user-invocable: false
---

# Task Close

Verifies the mandatory doc-update checklist in `CLAUDE.md` was actually followed, instead of trusting memory.

## When to Activate

- Right before telling the user a coding task is finished.
- After any change to `src/`, `prisma/schema.prisma`, or anything under `docs/`.

## The Checklist

Reproduced verbatim from `CLAUDE.md` §"After Completing Any Task" — check each item against the actual diff (`git status` / `git diff --stat`), not against intent.

### 1. Phase status + checklist — `docs/DEVELOPMENT_PHASES.md`
- Find which phase(s) the touched files belong to.
- Tick the relevant `- [ ]` → `- [x]` items under that phase's "Features / tasks".
- If every task in the phase is now checked, flip the phase heading emoji `⬜` → `✅` (or `🟨` if partially done) **and** the matching line in the "Master Implementation Progress" list at the bottom — both in the same edit, per the doc's own instruction.

### 2. API spec — `docs/API_SPECIFICATION.md`
- Only relevant if a controller route was added or changed.
- Use the `new-endpoint` skill's template section to add/update the entry in the correct numbered section.

### 3. Database docs — `docs/DATABASE.md`
- Only relevant if `prisma/schema.prisma` changed.
- Must include: the rationale/business rule behind the change, and confirmation a migration was created (`npx prisma migrate dev`) — not just the schema edited.

### 4. Changelog — `docs/CHANGELOG.md`
- Always required, for every completed task, no exceptions.
- Insert a **new entry at the top**, immediately under the intro line (newest-first — do not append at the bottom).
- Match the existing entry's shape exactly:
  ```markdown
  ## YYYY-MM-DD — <scope> · <short title>

  - <what changed>
  - <key decisions, if any>
  - <schema/docs touched, if any>
  - <open items or follow-ups, if any>
  ```
- Use today's actual date, not a placeholder.

### 5. New ADR — `docs/ADR-000N-*.md`
- Only when a significant, hard-to-reverse architectural decision was made (auth strategy, payment flow, stock reservation strategy, etc. — see existing ADRs 0001–0004 for the bar).
- Most tasks won't need one — don't create one speculatively.

### 6. Lint + tests
- `pnpm lint` and `pnpm test` (or the narrower `pnpm test -- <pattern>` for the touched area) must pass.
- The active phase's "Definition of Done" in `DEVELOPMENT_PHASES.md` (and the phase's own "Acceptance criteria") must be satisfied, not just "code runs."

## Procedure

1. Run `git status` and `git diff --stat` to see exactly what changed.
2. Walk the checklist above in order, marking each item as "not applicable," "already done," or "missing."
3. For anything missing, fix it now (update the doc, add the changelog entry, tick the checkbox) rather than deferring it — the rule is these land **in the same task**.
4. If an item is ambiguous (e.g., "was this actually a significant architectural decision?"), don't guess — surface the question to the user instead of silently skipping or silently adding an ADR.
5. Only after every applicable item is confirmed done, report the task as complete.
