# 11 — Current User Profile

These endpoints require a valid Clerk Bearer token. Successful responses use the global `{ status, message, data, meta }` envelope; validation errors return `422 VALIDATION_ERROR`.

## GET /users/me

Returns the current local user profile with `id`, `email`, composed `name`, `phone`, `role`, and `createdAt`.

The response intentionally exposes the composed display `name`, not separate name components. For an edit form, initialize `firstName` and `lastName` from Clerk's authenticated user object. Do not split the backend `name`: existing and multi-token names cannot be separated reliably.

## PATCH /users/me

Updates the authenticated user's phone and/or name.

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `firstName` | string | paired optional | trimmed, non-empty when present; must be sent with `lastName` |
| `lastName` | string | paired optional | trimmed, non-empty when present; must be sent with `firstName` |
| `phone` | string | optional | valid Egyptian phone number, unique |

The two name fields are an atomic optional pair:

- Omit both for a phone-only update.
- Send both when changing either part of the name.
- Sending only one, an empty/whitespace-only component, a composed name over 120 characters, or the legacy `name` field returns `422 VALIDATION_ERROR` before any DB or Clerk write.

Example name update:

```json
{
  "firstName": "Mary Anne",
  "lastName": "Smith"
}
```

Example phone-only update:

```json
{
  "phone": "+201000000004"
}
```

The backend stores `name` as the trimmed first component, one separator, and the trimmed last component. It sends the explicit pair to Clerk without splitting or redistributing tokens. The response continues to return the composed `name`.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `DUPLICATE_RESOURCE` | The phone number belongs to another local user. |
| 422 | `VALIDATION_ERROR` | Invalid phone/name input, incomplete name pair, or legacy `name` property. |
