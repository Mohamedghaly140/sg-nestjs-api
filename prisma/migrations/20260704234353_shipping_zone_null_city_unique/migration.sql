-- Postgres treats each NULL as distinct, so @@unique([country, governorate, city])
-- alone allows multiple governorate-wide (city = null) rows. Enforce at most one
-- governorate-wide zone per (country, governorate) with the partial unique index
-- declared by ShippingZone's schema-level @@unique(... where: { city: null }).
CREATE UNIQUE INDEX "shippingZones_country_governorate_null_city_key"
  ON "shippingZones"("country", "governorate")
  WHERE "city" IS NULL;
