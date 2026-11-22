import sharp from 'sharp';

// Keep the supplied artwork intact. These two variants move the printed Scan
// label with its QR so both stay clear of the Thank You line.
for (const name of ['instagram', 'facebook']) {
  const source = `public/print-templates/stand-${name}.png`;
  const target = `public/print-templates/stand-${name}-scan-aligned.png`;
  const region = {left: 633, top: 1003, width: 155, height: 63};
  const offset = 18;
  const label = await sharp(source).extract(region).png().toBuffer();
  const cleanBackground = await sharp(source)
    .extract({...region, left: 800})
    .png().toBuffer();
  await sharp(source).composite([
    {input: cleanBackground, left: region.left, top: region.top},
    {input: label, left: region.left, top: region.top + offset},
  ]).png().toFile(target);
}
