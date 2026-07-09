# Analytics API

Covers `features/admin/analytics/` — five read-only endpoints, one per dashboard tab. Not paginated.

All endpoints require role **ADMIN**. MANAGER receives 403 by design. Conventions: see [00-conventions.md](./00-conventions.md).

## Shared query parameters & date-range semantics

All five endpoints take the same optional parameters (from `hooks/use-analytics-params.ts → analyticsParserSchema`, resolved by `utils/resolve-date-range.ts → resolveDateRange()`):

| Param | Type | Default |
| --- | --- | --- |
| `from` | ISO date string (`YYYY-MM-DD`) | `to − 30 days` |
| `to` | ISO date string | today |

Resolution: `end = endOfDay(to ?? now)`, `start = startOfDay(from ?? end − 30 days)`. All range filters are `createdAt >= start AND createdAt <= end`.

**Time-bucket grouping** (sales & customers): span ≤ 60 days → `day`; ≤ 180 days → `week`; else `month` (Postgres `DATE_TRUNC`). Buckets carry ISO `date` strings; the chosen `grouping` is echoed in the response.

All values are plain JSON **numbers** (chart inputs). Revenue/units-sold sums require `isPaid = true` AND exclude `CANCELLED`/`REFUNDED` orders where noted (not payment status alone — an unpaid PENDING/PROCESSING/SHIPPED order is not counted); counts include all statuses regardless of payment unless noted.

---

## GET /api/admin/analytics/sales

**Maps from:** `features/admin/analytics/services/get-sales-analytics.ts → getSalesAnalytics()`.

### Response `data` (`SalesAnalytics`)

```jsonc
{
  "totalRevenue": 45200.5,          // sum totalOrderPrice in range, isPaid = true, excl. CANCELLED/REFUNDED
  "totalOrders": 88,                 // all orders in range, any status/payment
  "avgOrderValue": 513.6,            // totalRevenue / paid order count, 0 when no paid orders
  "totalDiscountApplied": 1200,      // sum discountApplied in range (ALL statuses/payment)
  "grouping": "day",                 // "day" | "week" | "month"
  "revenueOverTime": [               // DATE_TRUNC buckets asc, isPaid = true, excl. CANCELLED/REFUNDED
    { "date": "2026-06-08", "revenue": 1240 }
  ],
  "ordersByStatus": [ { "status": "PENDING", "count": 7 } ],          // in range
  "paymentMethodSplit": [ { "method": "CASH", "count": 61 } ]         // in range
}
```

---

## GET /api/admin/analytics/products

**Maps from:** `features/admin/analytics/services/get-products-analytics.ts → getProductsAnalytics()`.

### Response `data` (`ProductsAnalytics`)

```jsonc
{
  "totalUnitsSold": 214,             // sum orderItem.quantity where order in range, isPaid = true, excl. CANCELLED/REFUNDED
  "activeProductsCount": 52,         // status = ACTIVE (not range-bound)
  "outOfStockCount": 3,              // quantity = 0 AND status = ACTIVE (not range-bound)
  "topProducts": [                   // top 10 by units sold in range; LEFT JOIN, so products with 0 sales can appear
    { "id": "cku…", "name": "Silk Dress", "categoryName": "Dresses", "sold": 20, "revenue": 12980 }
  ],
  "revenueByCategory": [             // all categories, revenue from order items in range, desc
    { "name": "Dresses", "revenue": 20110 }
  ]
}
```

`sold`/`revenue` per product/category = `SUM(orderItem.quantity × orderItem.price)` (price snapshot), order joined only when in range, `isPaid = true`, and not `CANCELLED`/`REFUNDED` — matches `Product.sold`, which only increments on the same `isPaid` flip.

---

## GET /api/admin/analytics/customers

**Maps from:** `features/admin/analytics/services/get-customers-analytics.ts → getCustomersAnalytics()`.

### Response `data` (`CustomersAnalytics`)

```jsonc
{
  "totalCustomers": 340,             // role = USER, all time
  "newThisPeriod": 25,               // role = USER, createdAt in range
  "activeThisPeriod": 61,            // role = USER with ≥ 1 order in range, any status/payment
  "grouping": "day",                 // "day" | "week" | "month"
  "newCustomersOverTime": [          // DATE_TRUNC buckets asc (same grouping rule as sales)
    { "date": "2026-06-08", "count": 3 }
  ],
  "topSpenders": [                   // top 10 by spend in range, isPaid = true, excl. CANCELLED/REFUNDED orders (ordersCount is all statuses/payment)
    { "id": "user_2abc…", "name": "Sara Ahmed", "email": "sara@…", "ordersCount": 5, "totalSpent": 6210 }
  ]
}
```

---

## GET /api/admin/analytics/coupons

**Maps from:** `features/admin/analytics/services/get-coupons-analytics.ts → getCouponsAnalytics()`.

### Response `data` (`CouponsAnalytics`)

```jsonc
{
  "totalCoupons": 15,                // all coupons, all time
  "totalRedemptions": 42,            // orders with couponId ≠ null in range (any status/payment)
  "totalDiscountGiven": 8300,        // sum discountApplied over those orders (any status/payment)
  "coupons": [                       // EVERY coupon (LEFT JOIN), ordered by totalDiscountGiven desc
    {
      "id": "cpn…",
      "name": "SAVE20",
      "discountPct": 20,             // number, not decimal string
      "usedCount": 44,               // lifetime counter from the coupon row
      "maxUsage": 100,
      "expire": "2026-12-31T23:59:59.000Z",
      "periodRedemptions": 12,       // orders with this coupon in range
      "totalDiscountGiven": 2400     // sum discountApplied for this coupon in range
    }
  ]
}
```

---

## GET /api/admin/analytics/geography

Orders and revenue grouped by governorate.

**Maps from:** `features/admin/analytics/services/get-geography-analytics.ts → getGeographyAnalytics()`.

### Business rules

- Governorate = `COALESCE(shippingAddress.governorate, order.anonGovernorate)` — merges registered and guest orders into one bucket per governorate; orders where both are null are excluded.
- Range filter on `order.createdAt`; `orderCount` is any status/payment, `revenue` requires `isPaid = true` AND excludes `CANCELLED`/`REFUNDED`.

### Response `data` (`GeographyAnalytics`)

```jsonc
{
  "rows": [                          // ordered by orderCount desc
    { "governorate": "Cairo", "orderCount": 120, "revenue": 61000 } // revenue: isPaid = true, excl. CANCELLED/REFUNDED
  ]
}
```
