# 10 — Uploads (Cloudinary signatures)

> Role: **MANAGER+**.

Image binaries never pass through this API. The dashboard uploads **directly to Cloudinary** using short-lived signed parameters from this endpoint, then hands the resulting `public_id`/`secure_url` to the product ([§03](./03-products.md)) or category ([§04](./04-categories.md)) endpoints as `imageId`/`imageUrl`.

---

## POST /admin/uploads/signature

Create signed direct-upload parameters. · **Role: Manager+**

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `folder` | `"products" \| "categories"` | ✔ | anything else → 422 |

```json
{ "folder": "products" }
```

### Example success response — `data` (200)

```json
{
  "signature": "a1b2c3d4e5f67890…",
  "timestamp": 1783075200,
  "apiKey": "123456789012345",
  "cloudName": "sg-couture",
  "folder": "products",
  "allowedFormats": "jpg,jpeg,png,webp"
}
```

### Errors

Only the [generic errors](./00-conventions.md#error-codes-used-by-admin-endpoints) (422 on a bad `folder`).

---

## Using the signature — browser upload example

`POST https://api.cloudinary.com/v1_1/<cloudName>/image/upload` as `multipart/form-data`. The signed fields (`timestamp`, `folder`, `allowed_formats`) must be sent **exactly as returned** — any change invalidates the signature.

```ts
async function uploadImage(file: File, folder: 'products' | 'categories', token: string) {
  const sigRes = await fetch(`${API_URL}/api/v1/admin/uploads/signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  });
  const { data } = await sigRes.json();

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', data.apiKey);
  form.append('timestamp', String(data.timestamp));
  form.append('signature', data.signature);
  form.append('folder', data.folder);
  form.append('allowed_formats', data.allowedFormats);

  const upRes = await fetch(`https://api.cloudinary.com/v1_1/${data.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const uploaded = await upRes.json();

  // What the backend endpoints need:
  return { imageId: uploaded.public_id as string, imageUrl: uploaded.secure_url as string };
}
```

### Rules & gotchas

- **Allowed formats:** `jpg, jpeg, png, webp` — Cloudinary rejects others because the restriction is inside the signature.
- **Max file size 5 MB** — enforce client-side before uploading (it is not part of the signature).
- **Signatures are single-use-ish and time-boxed** — request a fresh signature per upload; don't cache one for a batch.
- **Deletion is backend-owned.** Never delete Cloudinary assets from the frontend; replacing/removing images through the product/category endpoints triggers server-side cleanup.
- If the user abandons a form after uploading, that asset is orphaned in Cloudinary — upload as late as possible (e.g. on save, not on file-pick) where UX allows.
