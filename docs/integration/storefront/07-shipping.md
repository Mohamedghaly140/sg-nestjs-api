# 07 — Shipping

Use the public fee lookup before checkout to display an estimate. Checkout performs the same lookup again and owns the final fee.

---

## GET /shipping/fee

Resolve a destination to the most-specific active shipping zone. · **Auth: Public**

### Query parameters

| Param | Type | Required | Validation / behavior |
|---|---|---|---|
| `country` | string | ✔ | trimmed, non-empty |
| `governorate` | string | ✔ | trimmed, non-empty |
| `city` | string | — | trimmed; city-specific zone is tried first |

Example:

```
GET /api/v1/shipping/fee?country=Egypt&governorate=Cairo&city=Nasr%20City
```

### Example success response — `data` (200)

```json
{
  "fee": "65.00",
  "zone": {
    "country": "Egypt",
    "governorate": "Cairo",
    "city": null
  }
}
```

Resolution order:

1. Active exact `(country, governorate, city)` match when `city` is supplied.
2. Active governorate-wide `(country, governorate, city = null)` fallback.

The returned `zone` identifies which rule won. A null `zone.city` means the governorate-wide rate was used. Values are trimmed but not case-normalized; use the same canonical labels as the address UI/backend shipping-zone configuration.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 422 | `SHIPPING_NOT_AVAILABLE` | No active city-specific or governorate-wide zone matches |

An estimate can become stale if the shipping configuration changes. Always display the fee returned by the completed order as final.

