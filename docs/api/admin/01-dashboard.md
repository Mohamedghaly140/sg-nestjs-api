# Dashboard API

Covers `features/admin/dashboard/` — the read-only aggregate metrics for the admin home page.

Requires role **MANAGER or ADMIN**. Conventions: see [00-conventions.md](./00-conventions.md).

---

## GET /api/admin/dashboard/metrics

Single aggregate call returning everything the dashboard renders (KPI cards, charts, tables). The current implementation runs 14 queries in parallel and merges them — keep it one endpoint so the dashboard needs one round trip.

**Maps from:** `features/admin/dashboard/services/get-dashboard-metrics.ts → getDashboardMetrics()`; response type `DashboardMetrics` in `features/admin/dashboard/types/index.ts`.

No parameters. All time windows are computed server-side from "now":

- **current** = start of the current calendar month → now; **previous** = the full previous calendar month.
- `revenueByDay` covers the trailing 30 days.

### Response `data` (`DashboardMetrics`)

All aggregate values are plain JSON **numbers** (not decimal strings) — these are chart/KPI inputs, not editable records.

```jsonc
{
  "revenue":       { "current": 45200.5, "previous": 39100 },   // sum totalOrderPrice, status NOT IN (CANCELLED, REFUNDED)
  "orders":        { "current": 88, "previous": 73 },           // all statuses counted
  "newCustomers":  { "current": 25, "previous": 19 },           // users with role USER created in window
  "avgOrderValue": { "current": 513.6, "previous": 535.6 },     // revenue / orders, 0 when no orders
  "pendingOrders": 7,                                            // count status = PENDING (all time)
  "lowStockCount": 4,                                            // count quantity < 10 AND status = ACTIVE
  "activeCoupons": 3,                                            // isActive AND expire > now AND (maxUsage = 0 OR usedCount < maxUsage)

  "ordersByStatus": [                                            // all time, grouped
    { "status": "PENDING", "count": 7 },
    { "status": "DELIVERED", "count": 61 }
  ],

  "revenueByDay": [                                              // trailing 30 days, day buckets, ascending
    { "date": "Jun 8", "revenue": 1240.0 }                       // date pre-formatted "MMM d"
  ],

  "recentOrders": [                                              // 10 most recent
    {
      "id": "cko…",
      "humanOrderId": "ORD-000042",
      "customerName": "Sara Ahmed",                              // user.name ?? anonName ?? "Guest"
      "status": "PROCESSING",
      "paymentMethod": "CASH",
      "totalOrderPrice": 1348,                                   // number or null
      "createdAt": "2026-07-07T…"
    }
  ],

  "topProducts": [                                               // top 5 by all-time revenue (sum quantity × price over order items)
    {
      "id": "cku…",
      "name": "Silk Dress",
      "imageUrl": "https://…",
      "categoryName": "Dresses",
      "revenue": 12980,
      "units": 20
    }
  ],

  "lowStockProducts": [                                          // quantity < 10 AND ACTIVE, quantity asc, max 20
    { "id": "cku…", "name": "Silk Dress", "quantity": 2, "categoryName": "Dresses", "status": "ACTIVE" }
  ]
}
```

### Notes for the implementer

- Revenue sums exclude `CANCELLED` and `REFUNDED` orders; **order counts do not** (they count all statuses) — match this asymmetry.
- `revenueByDay.date` is currently pre-formatted as `"MMM d"` by the service. An implementation may instead return ISO dates and let the frontend format — if so, agree with the frontend and update this doc; the default contract is the formatted string.
- `topProducts` joins all order items regardless of order status or date (all-time), category name included.
