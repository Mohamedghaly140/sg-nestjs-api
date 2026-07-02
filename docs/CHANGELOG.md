# SG Couture Backend — Changelog

> 🤖 **Claude Code:** append an entry after **every** completed task. Format: date · scope · summary · docs touched. Newest first.

## 2026-07-03 — docs · Initial specification set

- Created the full documentation system: `CLAUDE.md`, `PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API_SPECIFICATION.md`, `FEATURES.md`, `DEVELOPMENT_PHASES.md`, `CODING_STANDARDS.md`, ADRs 0001–0004.
- Key decisions recorded: Clerk identity (ADR-0001), Geidea hosted checkout (ADR-0002), atomic stock reservation (ADR-0003), anonymous cart + merge (ADR-0004).
- Schema changes specified but **not yet applied** (Migration 001): Geidea payment fields replacing Stripe, `Coupon.perUserLimit` + `CouponUsage`, `ShippingZone`, `order_number_seq`, listing indexes — see `DATABASE.md §4`.
- Open items: `DATABASE.md §7 Assumptions` (review gating, phone-at-signup strategy, address snapshots, refund automation, cart price-change UX).
- Project state: nothing implemented; active phase = Phase 0.
