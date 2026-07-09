# 01 — Dashboard Home Metrics

> Role: **ADMIN only** (MANAGER → `403 FORBIDDEN`). All values are plain JSON **numbers** (see [00-conventions](./00-conventions.md#data-formats)).

One aggregate endpoint powers the entire dashboard home page in a single round trip.

## GET /admin/dashboard/metrics

Aggregate KPIs, charts, and lists for the dashboard home. · **Role: ADMIN**

No query or body parameters — all time windows are computed server-side from "now":

- **`current`** window = start of the current calendar month → now
- **`previous`** window = the full previous calendar month
- **`revenueByDay`** = trailing 30 days

Revenue and average-order-value figures count **paid orders only** and exclude `CANCELLED`/`REFUNDED` orders. Order counts include all statuses.

### Example request

```
GET /api/v1/admin/dashboard/metrics
Authorization: Bearer <token>
```

### Example success response — `data` (200)

```jsonc
{
  "revenue":       { "current": 45200.5, "previous": 39100 },
  "orders":        { "current": 88, "previous": 73 },
  "newCustomers":  { "current": 25, "previous": 19 },        // role USER, created in window
  "avgOrderValue": { "current": 513.6, "previous": 535.6 },  // paid revenue / paid orders; 0 when none
  "pendingOrders": 7,                                        // status = PENDING, all time
  "lowStockCount": 4,                                        // quantity < 10 AND status = ACTIVE
  "activeCoupons": 3,                                        // isActive, not expired, not exhausted
  "ordersByStatus": [
    { "status": "PENDING", "count": 7 },
    { "status": "DELIVERED", "count": 61 }
  ],
  "revenueByDay": [
    { "date": "2026-06-10", "revenue": 1240 },
    { "date": "2026-06-11", "revenue": 980 }
  ],
  "recentOrders": [
    {
      "id": "ckvorder123",
      "humanOrderId": "ORD-000042",
      "customerName": "Sara Ghaly",
      "status": "PENDING",
      "paymentMethod": "CASH",
      "totalOrderPrice": 949,
      "createdAt": "2026-07-09T12:00:00.000Z"
    }
  ],
  "topProducts": [
    {
      "id": "ckvprod123",
      "name": "Satin Cowl-Neck Dress",
      "imageUrl": "https://res.cloudinary.com/.../satin.jpg",
      "categoryName": "Dresses",
      "revenue": 12400,
      "units": 31
    }
  ],
  "lowStockProducts": [
    {
      "id": "ckvprod456",
      "name": "Silk Scarf",
      "quantity": 2,
      "categoryName": "Accessories",
      "status": "ACTIVE"
    }
  ]
}
```

### Field notes for rendering

| Field | Notes |
|---|---|
| `revenue` / `orders` / `newCustomers` / `avgOrderValue` | `{ current, previous }` pairs — render KPI cards with a % change vs. previous month. Guard against `previous = 0` when computing the delta. |
| `ordersByStatus` | All-time counts; statuses with zero orders may be absent — default missing statuses to 0. |
| `revenueByDay` | Trailing 30 days, ascending ISO dates; days with no paid revenue may be absent — fill gaps with 0 for the chart. |
| `recentOrders` | 10 most recent, any status. `customerName` falls back to `"Guest"` for unclaimed guest orders. Link rows to the order detail (§05). |
| `topProducts` | Top 5 by all-time paid item revenue. |
| `lowStockProducts` | `quantity < 10` and `ACTIVE`, ascending quantity, max 20 rows. Link to product edit (§03). |

### Errors

Only the [generic errors](./00-conventions.md#error-codes-used-by-admin-endpoints) (401/403/429/500).

### Notes

- Refresh on page focus or a manual refresh button; if polling, keep it ≥ 60 s (global rate limit).
