-- Temporary 1 EGP price for existing unpriced SKUs. Approval and sale gates stay closed.
update public.product_skus
set price_minor = 100
where price_minor is null and price_approved = false;
