-- Founder supplied new stand/coaster artwork. Card artwork remains untouched.
update public.product_families set
  catalog_images = case family_key
    when 'stand' then array['/products/mockups/stand-tap-lifestyle.webp','/products/demo/stand-all-in-one.webp']
    else array['/products/mockups/coaster-tap-lifestyle.webp','/products/demo/coaster-all-in-one.webp'] end,
  catalog_description_ar = coalesce(nullif(catalog_description_ar,''),'ستاند وكوستر NFC وQR') || ' صور التصميم تعرض شكل QR زخرفيًا غير قابل للمسح؛ كل قطعة فعلية لها كود مستقل.',
  catalog_description_en = coalesce(nullif(catalog_description_en,''),'NFC stand and coaster') || ' The QR-like pattern in product pictures is decorative and cannot be scanned; each physical item has its own code.',
  updated_at=now()
where family_key in ('stand','coaster');
notify pgrst, 'reload schema';
