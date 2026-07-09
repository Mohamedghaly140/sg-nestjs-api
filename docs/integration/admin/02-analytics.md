# 02 — Analytics

> Role: **ADMIN only** (MANAGER → `403 FORBIDDEN`). All values are plain JSON **numbers**.

Five read-only endpoints, one per analytics page/tab. They share the same date-range query.

## Shared query parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | `to − 30 days` | Range start (inclusive, start of day) |
| `to` | `YYYY-MM-DD` | today | Range end (inclusive, end of day) |

The range filters on `order.createdAt` (or `user.createdAt` where noted).

**Time-bucket grouping** (for the over-time series): the server picks the bucket size from the span and echoes it as `grouping` in the response — span ≤ 60 days → `"day"`, ≤ 180 days → `"week"`, else `"month"`. Bucket `date` values are ISO strings; format axis labels client-side based on `grouping`.

**Status-filter rule (applies everywhere in this section):** revenue/units aggregates count **paid** orders only (`isPaid = true`, excluding `CANCELLED`/`REFUNDED`); order/redemption **counts** and discount totals include **all** statuses. So `totalOrders × avgOrderValue ≠ totalRevenue` by design — don't "fix" this client-side.

---

## GET /admin/analytics/sales

Sales KPIs + charts. · **Role: ADMIN**

```
GET /api/v1/admin/analytics/sales?from=2026-06-01&to=2026-06-30
```

### Example success response — `data` (200)

```jsonc
{
  "totalRevenue": 45200.5,          // paid only
  "totalOrders": 102,               // all statuses
  "avgOrderValue": 513.6,           // paid revenue / paid orders; 0 when none
  "totalDiscountApplied": 3120,     // all statuses
  "grouping": "day",
  "revenueOverTime": [ { "date": "2026-06-01", "revenue": 1240 } ],   // paid only
  "ordersByStatus":  [ { "status": "DELIVERED", "count": 61 } ],
  "paymentMethodSplit": [ { "method": "CASH", "count": 102 } ]
}
```

---

## GET /admin/analytics/products

Product performance. · **Role: ADMIN**

### Example success response — `data` (200)

```jsonc
{
  "totalUnitsSold": 214,        // paid order items in range
  "activeProductsCount": 58,    // NOT range-bound (current catalog state)
  "outOfStockCount": 3,         // quantity = 0 AND ACTIVE, not range-bound
  "topProducts": [              // top 10 by paid units in range
    { "id": "ckvprod123", "name": "Satin Cowl-Neck Dress", "categoryName": "Dresses", "sold": 31, "revenue": 12400 }
  ],
  "revenueByCategory": [        // ALL categories, revenue desc
    { "name": "Dresses", "revenue": 20100 },
    { "name": "Accessories", "revenue": 0 }
  ]
}
```

Note: `topProducts` / `revenueByCategory` use LEFT JOINs — zero-sale products/categories can appear with `0` values.

---

## GET /admin/analytics/customers

Customer growth and top spenders. · **Role: ADMIN**

### Example success response — `data` (200)

```jsonc
{
  "totalCustomers": 812,        // role USER, all time
  "newThisPeriod": 44,          // user.createdAt in range
  "activeThisPeriod": 120,      // ≥ 1 order in range, any status
  "grouping": "day",
  "newCustomersOverTime": [ { "date": "2026-06-01", "count": 3 } ],
  "topSpenders": [              // top 10 by paid spend in range
    { "id": "user_2abc123", "name": "Mariam Hassan", "email": "mariam@example.com", "ordersCount": 6, "totalSpent": 8200 }
  ]
}
```

`topSpenders.totalSpent` is paid-only; `ordersCount` counts all statuses (the §-wide asymmetry).

---

## GET /admin/analytics/coupons

Coupon performance. · **Role: ADMIN**

### Example success response — `data` (200)

```jsonc
{
  "totalCoupons": 9,            // all time
  "totalRedemptions": 63,       // orders with a coupon in range, any status
  "totalDiscountGiven": 5210,   // sum of discountApplied on those orders
  "coupons": [                  // EVERY coupon, ordered by totalDiscountGiven desc
    {
      "id": "ckvcoup123",
      "name": "SAVE20",
      "discountPct": 20,
      "usedCount": 41,          // lifetime
      "maxUsage": 100,          // 0 = unlimited
      "expire": "2026-08-01T00:00:00.000Z",
      "periodRedemptions": 12,  // in range
      "totalDiscountGiven": 2210
    }
  ]
}
```

---

## GET /admin/analytics/geography

Orders and revenue by governorate. · **Role: ADMIN**

### Example success response — `data` (200)

```jsonc
{
  "rows": [                     // ordered by orderCount desc
    { "governorate": "Cairo", "orderCount": 51, "revenue": 22100 },
    { "governorate": "Giza",  "orderCount": 23, "revenue": 9800 }
  ]
}
```

Registered and guest orders are merged per governorate (guest orders use their snapshot `anonGovernorate`); orders with no governorate at all are excluded. `orderCount` includes all statuses, `revenue` is paid-only.

---

## Errors (all five)

Only the [generic errors](./00-conventions.md#error-codes-used-by-admin-endpoints); a malformed `from`/`to` (not `YYYY-MM-DD`) returns `422 VALIDATION_ERROR`.
