# 11 — Notifications ⛔ Not yet available

> **Phase 9 has not started.** Nothing on this page exists in the running API — every route below returns **404** today. This page exists only so the frontend team can anticipate the surface. **Do not integrate.**

## Planned: POST /admin/notifications/broadcast

PROMO broadcast to all active users. · Planned role: **Admin**

Planned request body:

```json
{ "title": "Summer Sale", "body": "Up to 50% off dresses", "metadata": { "url": "/sale" } }
```

Planned success: **202** `{ "queued": true }` — inserts are batched server-side; type is fixed to `PROMO`.

## When it ships

Phase 9 also adds the customer-facing bell endpoints (`GET /notifications`, mark-read). This page will be rewritten with the final contract, and the [README](./README.md) "not available" list updated. Track status in [`../../DEVELOPMENT_PHASES.md`](../../DEVELOPMENT_PHASES.md).
