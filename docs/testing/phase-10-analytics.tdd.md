# Phase 10 Analytics TDD Evidence

Source plan: `/Users/mohamedghaly/.claude/plans/let-s-no-do-planing-concurrent-ember.md`.

## Journeys

- As an ADMIN, I can read dashboard and analytics aggregates with documented field names and plain JSON numbers.
- As a MANAGER or USER, I receive 403 for all six dashboard/analytics endpoints.
- As an ADMIN, ranged analytics reconcile paid revenue/product sales (`isPaid = true`, excluding `CANCELLED`/`REFUNDED`) while counts and coupon discount totals include all statuses regardless of payment.

## Evidence

| Guarantee | Test file or command | Type | Result | Evidence |
| --- | --- | --- | --- | --- |
| Date grouping boundaries switch at 60/61 and 180/181 days | `src/modules/analytics/utils/resolve-date-range.util.spec.ts` | Unit | PASS | `pnpm test -- resolve-date-range.util.spec.ts`: 9 passed |
| Raw-query bigint/Decimal-like values are coerced to JSON-safe numbers | `src/modules/analytics/utils/resolve-date-range.util.spec.ts` | Unit | PASS | `pnpm test`: 46 suites, 215 tests passed |
| All six endpoints are ADMIN-only; analytics totals reconcile with fixtures, including an unpaid non-cancelled/refunded order contributing zero revenue | `test/admin-analytics.e2e-spec.ts` | E2E | PASS | `pnpm test:e2e -- admin-analytics.e2e-spec.ts --forceExit`: 7 passed, run against the real dev DB |
| TypeScript/Swagger decorators compile | `pnpm build` | Build | PASS | `tsc --noEmit` and Nest build completed |
| Static checks pass | `pnpm lint` | Lint | PASS | ESLint completed with no errors |

## RED/GREEN Notes

- RED: `pnpm test -- resolve-date-range.util.spec.ts` failed with `Cannot find module './resolve-date-range.util'` before implementation.
- GREEN: the same focused unit target passed after adding the shared utility and numeric coercion helper.
- The e2e suite could not be executed from the sandboxed implementation environment (no DB reachability); it was run and verified separately against the real dev DB, which caught a real bug — see the 2026-07-09 "Paid-revenue reconciliation fix" changelog entry and the Codex adversarial-review finding it addresses. Fixtures previously defaulted every order to `isPaid: false`, which is why the (buggy) status-only revenue filter's numbers happened to match the original assertions; fixtures now set `isPaid` explicitly per order and assert the corrected, reconciled numbers.
