# SG Couture — Storefront API Integration Guide

> **Audience:** frontend developers building the SG Couture web storefront and future mobile app.
> **Status:** Live contract · Started from the actual backend code on **2026-07-15**.
> **Base URL:** `https://<api-host>/api/v1`

This folder documents storefront-facing integration details that need more client guidance than the authoritative endpoint catalog.

## Relationship to other docs

| Doc | Role |
|---|---|
| [`../../API_SPECIFICATION.md`](../../API_SPECIFICATION.md) | Authoritative backend contract for storefront and admin APIs. |
| Swagger UI at **`/api/docs`** | Interactive OpenAPI reference generated from the running backend. |
| [`../admin/`](../admin/) | Separate admin-dashboard integration guide. |

## Module guide

| Doc | Endpoints |
|---|---|
| [01-profile.md](./01-profile.md) | `GET /users/me`, `PATCH /users/me` |
