-- Inventory management needs to omit archived product families. Keep the
-- existing row-level policies; expose only the non-sensitive archive marker.
grant select (catalog_deleted_at) on public.product_families to authenticated;
