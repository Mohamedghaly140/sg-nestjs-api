# Admin Backend API Specification

REST API contract for the **admin dashboard** when the project is split into a separate backend and frontend. Every endpoint replaces an existing read service (`features/admin/*/services/`) or Server Action mutation (`features/admin/*/actions/`) — the "Maps from" column names the exact source file whose validation, business rules, and response shape the backend must reproduce.

Start with **[00-conventions.md](./00-conventions.md)** — auth (Clerk Bearer JWT + role tiers), response envelope, pagination, error codes, decimal/date serialization, and backend-owned side effects (Cloudinary cleanup, Clerk sync, slug allocation).

## Endpoint catalog

Role: **M/A** = MANAGER or ADMIN · **A** = ADMIN only.

| Method | Path | Role | Maps from | Doc |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/dashboard/metrics` | M/A | `dashboard/services/get-dashboard-metrics.ts` | [01](./01-dashboard.md) |
| GET | `/api/admin/products` | M/A | `products/services/get-products.ts` | [02](./02-products.md) |
| GET | `/api/admin/products/filter-options` | M/A | `products/services/get-product-filter-options.ts` | [02](./02-products.md) |
| GET | `/api/admin/products/form-data` | M/A | `product-form/services/get-product-form-data.ts` | [02](./02-products.md) |
| GET | `/api/admin/products/:id` | M/A | `product-detail/services/get-product-detail.ts` | [02](./02-products.md) |
| GET | `/api/admin/products/:id/form` | M/A | `product-form/services/get-product-by-id.ts` | [02](./02-products.md) |
| POST | `/api/admin/products` | M/A | `products/actions/createProduct.ts` | [02](./02-products.md) |
| PUT | `/api/admin/products/:id` | M/A | `products/actions/updateProduct.ts` | [02](./02-products.md) |
| DELETE | `/api/admin/products/:id` | M/A | `products/actions/deleteProduct.ts` | [02](./02-products.md) |
| DELETE | `/api/admin/products/:id/images/:productImageId` | M/A | `products/actions/deleteProductImage.ts` | [02](./02-products.md) |
| POST | `/api/admin/products/:id/duplicate` | M/A | `products/actions/duplicateProduct.ts` | [02](./02-products.md) |
| PATCH | `/api/admin/products/:id/featured` | M/A | `products/actions/toggleFeatured.ts` | [02](./02-products.md) |
| PATCH | `/api/admin/products/:id/status` | M/A | `products/actions/updateProductStatus.ts` | [02](./02-products.md) |
| GET | `/api/admin/categories` | M/A | `categories/services/get-categories.ts` | [03](./03-categories.md) |
| POST | `/api/admin/categories` | M/A | `categories/actions/createCategory.ts` | [03](./03-categories.md) |
| PUT | `/api/admin/categories/:id` | M/A | `categories/actions/updateCategory.ts` | [03](./03-categories.md) |
| DELETE | `/api/admin/categories/:id` | M/A | `categories/actions/deleteCategory.ts` | [03](./03-categories.md) |
| POST | `/api/admin/categories/:id/subcategories` | M/A | `categories/actions/createSubcategory.ts` | [03](./03-categories.md) |
| PUT | `/api/admin/subcategories/:id` | M/A | `categories/actions/updateSubcategory.ts` | [03](./03-categories.md) |
| DELETE | `/api/admin/subcategories/:id` | M/A | `categories/actions/deleteSubcategory.ts` | [03](./03-categories.md) |
| GET | `/api/admin/orders` | M/A | `orders/services/get-orders.ts` | [04](./04-orders.md) |
| GET | `/api/admin/orders/:id` | M/A | `order-detail/services/get-order.ts` | [04](./04-orders.md) |
| PATCH | `/api/admin/orders/:id/status` | M/A | `order-detail/actions/updateOrderStatus.ts` | [04](./04-orders.md) |
| PATCH | `/api/admin/orders/:id/paid` | M/A | `order-detail/actions/togglePaid.ts` | [04](./04-orders.md) |
| GET | `/api/admin/customers` | M/A | `customers/services/get-customers.ts` | [05](./05-customers.md) |
| GET | `/api/admin/customers/:id` | M/A | `customer-detail/services/get-customer.ts` | [05](./05-customers.md) |
| PATCH | `/api/admin/customers/:id/active` | M/A | `customers/actions/toggleCustomerActive.ts` | [05](./05-customers.md) |
| GET | `/api/admin/users` | A | `users/services/get-users.ts` | [06](./06-users.md) |
| POST | `/api/admin/users` | A | `users/actions/createUser.ts` | [06](./06-users.md) |
| PATCH | `/api/admin/users/:id` | A | `users/actions/updateUser.ts` | [06](./06-users.md) |
| DELETE | `/api/admin/users/:id` | A | `users/actions/deleteUser.ts` | [06](./06-users.md) |
| GET | `/api/admin/coupons` | M/A | `coupons/services/get-coupons.ts` | [07](./07-coupons.md) |
| POST | `/api/admin/coupons` | M/A | `coupons/actions/createCoupon.ts` | [07](./07-coupons.md) |
| PUT | `/api/admin/coupons/:id` | M/A | `coupons/actions/updateCoupon.ts` | [07](./07-coupons.md) |
| PATCH | `/api/admin/coupons/:id/deactivate` | M/A | `coupons/actions/deactivateCoupon.ts` | [07](./07-coupons.md) |
| DELETE | `/api/admin/coupons/:id` | M/A | `coupons/actions/deleteCoupon.ts` | [07](./07-coupons.md) |
| GET | `/api/admin/analytics/sales` | M/A | `analytics/services/get-sales-analytics.ts` | [08](./08-analytics.md) |
| GET | `/api/admin/analytics/products` | M/A | `analytics/services/get-products-analytics.ts` | [08](./08-analytics.md) |
| GET | `/api/admin/analytics/customers` | M/A | `analytics/services/get-customers-analytics.ts` | [08](./08-analytics.md) |
| GET | `/api/admin/analytics/coupons` | M/A | `analytics/services/get-coupons-analytics.ts` | [08](./08-analytics.md) |
| GET | `/api/admin/analytics/geography` | M/A | `analytics/services/get-geography-analytics.ts` | [08](./08-analytics.md) |

Source paths are relative to `features/admin/`. 41 endpoints total.

## Coverage notes

- **Settings** (`features/admin/settings/`) is a "coming soon" placeholder with no actions or services — no endpoints yet.
- `products/actions/productActionHelpers.ts` (schemas, `computePriceAfterDiscount`, form parsing) and `product-form/schemas/product-schema.ts` are shared helpers — their rules are folded into the product endpoints in [02-products.md](./02-products.md).
- Existing non-admin routes stay as documented in `docs/architecture/06-api-design.md` (storefront/mobile API); the Clerk webhook (`app/api/webhooks/clerk`) and Cloudinary signing endpoint (`app/api/sign-cloudinary-params`) also move to the backend but are out of scope for this spec.
