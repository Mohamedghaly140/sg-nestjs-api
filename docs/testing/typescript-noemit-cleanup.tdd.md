# Full-project TypeScript no-emit cleanup — TDD evidence

**Date:** 2026-07-15  
**Source plan:** none; the journey was derived from the requested compiler cleanup.

## User journey

As a backend maintainer, I want the full project—including unit and e2e test sources—to pass strict TypeScript compilation so dependency type changes and unsafe test fixtures cannot hide regressions.

## Task report

- **RED:** `pnpm exec tsc --noEmit` exited 2 with 19 errors across 10 test files. The failures covered incomplete Nest `ArgumentsHost` objects, current Clerk JSON/JWT fields, missing class-transformer options, string inputs to Decimal fixtures, a recursive transaction mock annotation, a non-mock Cloudinary function type, and unsafe optional/header access.
- **GREEN:** after test-only fixture and narrowing corrections, `pnpm exec tsc --noEmit` exited 0 with no diagnostics.
- **Regression:** `pnpm test` passed 55/55 suites and 328/328 tests; `pnpm lint` passed; `pnpm test:cov` passed the same 55 suites and 328 tests.
- **Behavior guarantee:** production source and runtime behavior are unchanged; the test code now remains compatible with the installed dependency types and strict compiler settings.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Every TypeScript source included by the project config compiles without emitting output | `pnpm exec tsc --noEmit` | compile-time | PASS | Exit 0, no diagnostics |
| 2 | Existing unit behavior remains intact after the fixture corrections | `pnpm test` | unit | PASS | 55 suites, 328 tests |
| 3 | Changed TypeScript test code satisfies repository lint rules | `pnpm lint` | static analysis | PASS | Exit 0 |
| 4 | The unit suite still produces a coverage report successfully | `pnpm test:cov` | coverage | PASS | 55 suites, 328 tests |

## Coverage and known gaps

The coverage run reports 55.04% global line coverage because the configured collector includes controllers, DTOs, modules, and bootstrap files that are primarily exercised by the separate e2e suite. The repository's Phase 11 threshold is service coverage of at least 80% (money paths at least 95%); the affected services remain above that requirement: Clerk sync/token verification 100%, cart 97.15%, reviews 88.67%, and uploads 94.73% line coverage. No new behavior or uncovered production branch was introduced.

The changed e2e sources were compiler-checked but not executed because their changes only replace unsafe type assertions/narrow optional values and the e2e suite mutates the configured development database. Existing unit tests and the compile-time RED/GREEN gate cover this maintenance scope.

## Merge evidence

RED and GREEN evidence is preserved above. No new behavioral test was needed: the pre-existing compiler failures themselves were the compile-time RED reproducer, and the exact same command is GREEN after the corrections.
