#!/usr/bin/env python3
"""Organize an existing CliQo factory ZIP without creating stock or identities."""
import argparse
import csv
from datetime import date
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile

import arabic_reshaper
from bidi.algorithm import get_display
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

ROOT = Path(__file__).resolve().parents[1]
GREEN, ORANGE, GRAY = '#00241C', '#FF6A00', '#E6E8EB'
DESIGNS = [('GOOGLE_WHITE', 'Google أبيض'), ('GOOGLE_CLEAR', 'Google شفاف'),
           ('FACEBOOK', 'Facebook'), ('INSTAGRAM', 'Instagram'), ('TIKTOK', 'TikTok'),
           ('INSTAPAY', 'InstaPay'), ('VODAFONE_CASH', 'Vodafone Cash'), ('ALL_IN_ONE', 'All-in-One')]


def rtl(value):
    return get_display(arabic_reshaper.reshape(str(value)))


def text(c, value, x, y, size=10, color=GREEN, align='right'):
    c.setFillColor(colors.HexColor(color))
    c.setFont('Arabic', size)
    getattr(c, {'right': 'drawRightString', 'left': 'drawString', 'center': 'drawCentredString'}[align])(x, y, rtl(value))


def write_pdf(path, pages):
    writer = PdfWriter()
    for page in pages:
        writer.add_page(page)
    writer.add_metadata({'/Title': path.stem, '/Author': 'CliQo'})
    with path.open('wb') as out:
        writer.write(out)


def csv_file(path, rows):
    with path.open('w', encoding='utf-8-sig', newline='') as out:
        csv.writer(out).writerows(rows)


def design_for(name):
    if 'Google' in name:
        return 1 if 'شفاف' in name else 0
    for index, (_, label) in enumerate(DESIGNS[2:], 2):
        if label.lower() in name.lower():
            return index
    raise ValueError('Unknown product design')


def activation_card(row):
    """One printable paper card; its QR contains public identity, never the code."""
    stream = io.BytesIO()
    c = canvas.Canvas(stream, pagesize=(85.6 * mm, 54 * mm))
    c.setTitle('CliQo activation card - ' + row['short'])
    c.setFillColor(colors.white)
    c.rect(0, 0, 85.6 * mm, 54 * mm, fill=1, stroke=0)
    c.drawImage(str(ROOT / 'public/brand/cliqo-2026-pdf-primary.png'), 5 * mm, 42 * mm,
                width=23 * mm, height=8 * mm, preserveAspectRatio=True, mask='auto')
    text(c, 'فعّل قطعتك', 80.6 * mm, 45.5 * mm, 12)
    c.setFillColor(colors.HexColor(GREEN))
    c.roundRect(5 * mm, 32 * mm, 75.6 * mm, 8 * mm, 2 * mm, fill=1, stroke=0)
    text(c, 'رقم القطعة', 77 * mm, 35 * mm, 7, '#FFFFFF')
    c.setFont('Helvetica-Bold', 12)
    c.setFillColor(colors.white)
    c.drawString(9 * mm, 34.5 * mm, row['short'])
    activation_url = 'https://cliqoeg.com/activate?item=' + row['public']
    widget = QrCodeWidget(activation_url, barLevel='M')
    x1, y1, x2, y2 = widget.getBounds()
    d = Drawing(22 * mm, 22 * mm, transform=[22 * mm/(x2-x1), 0, 0, 22 * mm/(y2-y1), 0, 0])
    d.add(widget)
    renderPDF.draw(d, c, 5 * mm, 8 * mm)
    text(c, 'افتح التفعيل', 16 * mm, 5.8 * mm, 5.8, align='center')
    text(c, 'كود التفعيل الخاص', 55 * mm, 27 * mm, 8, align='center')
    c.setStrokeColor(colors.HexColor(ORANGE))
    c.setLineWidth(1)
    c.roundRect(31 * mm, 14 * mm, 48 * mm, 10 * mm, 2 * mm, stroke=1, fill=0)
    c.setFillColor(colors.HexColor(GREEN))
    c.setFont('Helvetica-Bold', 22)
    c.drawCentredString(55 * mm, 16.5 * mm, row['code'])
    text(c, 'سجّل دخولك، ثم اكتب الكود.', 55 * mm, 10.6 * mm, 6, align='center')
    text(c, 'يُستخدم مرة واحدة • احتفظ به داخل العبوة', 55 * mm, 7 * mm, 5.4, align='center')
    name = ('استاند' if row['family'] == 'stand' else 'كوستر') + ' · ' + DESIGNS[row['design']][1]
    text(c, name, 80.6 * mm, 2.4 * mm, 5.6)
    c.showPage()
    c.save()
    return stream.getvalue(), activation_url


def guide(path, count, stand_count, coaster_count, batch):
    c = canvas.Canvas(str(path), pagesize=(210 * mm, 297 * mm))
    c.setTitle('CliQo - دليل التصنيع والتغليف v2')
    def start(title, number):
        c.setFillColor(colors.HexColor(GREEN))
        c.rect(0, 257 * mm, 210 * mm, 40 * mm, fill=1, stroke=0)
        text(c, 'CliQo | دليل التصنيع والتغليف', 194 * mm, 281 * mm, 11, '#FFFFFF')
        text(c, title, 194 * mm, 268 * mm, 21, '#FFFFFF')
        text(c, f'دفعة {batch} • الإصدار 2', 194 * mm, 246 * mm, 10)
        text(c, f'{number} / 4', 16 * mm, 12 * mm, 9, align='left')
    def line(value, y, size=11):
        text(c, value, 194 * mm, y * mm, size)
    def box(title, body, y):
        c.setFillColor(colors.HexColor('#F3F6F4'))
        c.roundRect(16 * mm, (y - 24) * mm, 178 * mm, 30 * mm, 3 * mm, fill=1, stroke=0)
        text(c, title, 188 * mm, (y - 3) * mm, 13)
        text(c, body, 188 * mm, (y - 15) * mm, 10)
    start('ابدأ من هنا', 1)
    line(f'{count} قطعة • {stand_count} استاند + {coaster_count} كوستر • نفس المعرفات والأكواد الحالية', 229)
    box('01_STANDS | الاستاندات', 'حسب التصميم، وتحت كل تصميم فولدر مستقل لكل ID.', 209)
    box('02_COASTERS | الكوسترات', 'حسب التصميم، وتحت كل تصميم فولدر مستقل لكل ID.', 171)
    box('03_BATCH_PRINT | طباعة الدفعة', 'ملف للاستاندات، ملف للكوسترات، وملف منفصل لكروت التفعيل الورقية.', 133)
    box('04_OWNER_ONLY | سجل المالك', 'كشف الأكواد والمعرفات؛ ملفات الأكريليك لا تحتاج هذا المجلد.', 95)
    line('افتح OPEN-INDEX.html بعد فك الضغط: صور + بحث + روابط الملفات.', 51)
    line('الـPDF داخل فولدر القطعة: الوجه، الظهر بالـID، ثم كارت التفعيل.', 39)
    line('اطبع بالمقاس الفعلي 100%؛ صفحة الكارت ورق وصفحتا المنتج أكريليك.', 27, 10)
    c.showPage()
    start('قطعة وكارت: نفس الـID', 2)
    line('الـID يعرّف القطعة؛ كود التفعيل يثبت ملكيتها للعميل.', 229, 13)
    for y, title, subtitle in [(201, 'المنتج', 'ID دائم على الظهر؛ QR عام على الوجه'),
                               (153, 'كارت التفعيل', 'نفس ID واضح + كود خاص + QR عام للتفعيل'),
                               (105, 'قائمة التغليف', 'نفس ID + SKU + حالة الفحص؛ الأكواد في سجل المالك')]:
        box(title, subtitle, y)
    line('اختيار مقترح: كارت ورقي سميك 350 جم تقريبًا، مطفي، 85.6 × 54 مم.', 57, 10.5)
    line('الكارت داخل جزء مغلق من العبوة؛ يمكن تجربة ملصق خدش فوق الكود.', 43, 10.5)
    line('الكود خارج جسم المنتج وخارج روابط QR وNFC.', 29, 11)
    c.showPage()
    start('تجهيز مئة إلى مئتي قطعة يوميًا', 3)
    steps = [
        ('01 | دفعة محددة', 'رتّب حسب النوع والتصميم، وجهّز صواني من عشر إلى عشرين قطعة.'),
        ('02 | تصنيع وفحص', 'راجع ID والطباعة وQR، ثم فحص NFC حسب مسار المنتج.'),
        ('03 | مطابقة الكارت', 'رقم الكارت يطابق رقم القطعة ورقم ملصق الصينية أو الكيس.'),
        ('04 | إغلاق العبوة', 'علّم قائمة التغليف بعد الفحص، ثم أغلق العبوة.'),
    ]
    for index, (title, body) in enumerate(steps):
        box(title, body, 210 - index * 39)
    line('تطوير مقترح للداشبورد: مسح القطعة ثم الكارت؛ قبول التطابق فقط.', 43, 10.5)
    line('الفحص الآلي المقترح غير منفّذ؛ قائمة التغليف الحالية للمراجعة اليدوية.', 29, 10.5)
    c.showPage()
    start('إخفاء NFC داخل المنتج', 4)
    box('الكوستر', 'تجويف خلفي للشريحة واللاصق، ثم ظهر كامل من لباد/فلين أو غطاء مناسب.', 213)
    box('الاستاند', 'شريحة خلف علامة اللمس، وغطاء متناسق أو ظهر مطبوع معتم.', 174)
    box('النسخة الشفافة', 'جزء مطبوع معتم ضمن التصميم لإخفاء الهوائي؛ الغطاء الشفاف لا يخفيه.', 135)
    line('هذه مقترحات للعينة؛ العمق واللاصق وسُمك الغطاء يحددها المصنع.', 91, 10.5)
    line('قرب المعدن قد يضعف القراءة. تُراجع شريحة on-metal وطبقة ferrite عند الحاجة.', 77, 10)
    line('اختبر التجميع النهائي على iPhone وAndroid والأسطح المستهدفة قبل الكمية.', 63, 10.5)
    text(c, 'مرجع تقني: NXP - NFC Antenna Design Made Easy', 194 * mm, 43 * mm, 9)
    c.linkURL('https://www.nxp.com/company/about-nxp/smarter-world-blog/BL-NFC-ANTENNA-DESIGN-MADE-EASY',
              (16 * mm, 38 * mm, 194 * mm, 49 * mm), relative=0)
    line('التصدير يعيد ترتيب الدفعة فقط؛ لم ينشئ مخزونًا أو أكوادًا جديدة.', 25, 10)
    c.showPage()
    c.save()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--batch', default=date.today().isoformat(), help='Batch date, YYYY-MM-DD')
    args = parser.parse_args()
    date.fromisoformat(args.batch)
    with zipfile.ZipFile(args.source) as source:
        source_rows = list(csv.reader(io.StringIO(source.read('manifest.csv').decode('utf-8-sig'))))[1:]
    count = len(source_rows)
    stand_count = sum(row[1] == 'stand' for row in source_rows)
    coaster_count = sum(row[1] == 'coaster' for row in source_rows)
    if not count or stand_count + coaster_count != count:
        raise ValueError('Expected stand/coaster inventory records')
    pdfmetrics.registerFont(TTFont('Arabic', '/System/Library/Fonts/Supplemental/Arial.ttf'))
    target = args.destination / f'CliQo_BATCH-{args.batch.replace("-", "")}_{count}PCS_V2'
    target.mkdir(parents=True, exist_ok=False)
    os.chmod(target, 0o700)
    for folder in ['00_START_HERE', '01_STANDS', '02_COASTERS', '03_BATCH_PRINT', '04_OWNER_ONLY']:
        (target / folder).mkdir()
    source_hashes, products, stand_pages, coaster_pages, card_pages = {}, [], [], [], []
    with zipfile.ZipFile(args.source) as archive:
        manifest = list(csv.reader(io.StringIO(archive.read('manifest.csv').decode('utf-8-sig'))))
        original_pdf = PdfReader(io.BytesIO(archive.read('Factory-Prints.pdf')))
        if len(manifest) != count + 1 or len(original_pdf.pages) != 3 * count:
            raise ValueError('Source PDF must contain front, back and card for each manifest row')
        rows = []
        for raw in manifest[1:]:
            sequence, family, name, sku, short, public, url, code = raw
            if not re.fullmatch(r'[A-F0-9]{12}', short) or not re.fullmatch(r'\d{6}', code):
                raise ValueError('Invalid identity or activation code')
            if short != public.replace('-', '')[:12].upper():
                raise ValueError('Identity mismatch')
            rows.append(dict(sequence=int(sequence), family=family, name=name, sku=sku, short=short,
                             public=public, url=url, code=code, design=design_for(name)))
        if len({r['public'] for r in rows}) != count or sorted(r['sequence'] for r in rows) != list(range(1, count+1)):
            raise ValueError('Duplicate item identity')
        rows.sort(key=lambda r: (r['family'] != 'stand', r['design']))
        for position, row in enumerate(rows, 1):
            family_dir = '01_STANDS' if row['family'] == 'stand' else '02_COASTERS'
            design_dir = f'{row["design"]+1:02d}_{DESIGNS[row["design"]][0]}'
            relative = Path(family_dir) / design_dir / ('ID-' + row['short'])
            folder = target / relative
            acrylic, paper = folder / '01_ACRYLIC_PRODUCT', folder / '02_PAPER_ACTIVATION_CARD'
            acrylic.mkdir(parents=True)
            paper.mkdir()
            source_prefix = next(n.split('/')[0] for n in archive.namelist()
                                 if n.endswith('/01-front-with-qr.png') and row['short'] in n)
            for old, new in [('01-front-with-qr.png', 'Front-with-QR.png'), ('01-front-with-qr.svg', 'Front-with-QR.svg'),
                             ('02-back-engrave-id.png', 'Back-ID.png'), ('02-back-engrave-id.svg', 'Back-ID.svg'),
                             ('03-qr.svg', 'QR.svg')]:
                data = archive.read(source_prefix + '/' + old)
                (acrylic / new).write_bytes(data)
                source_hashes[str(relative / '01_ACRYLIC_PRODUCT' / new)] = hashlib.sha256(data).hexdigest()
            card_data, activation_url = activation_card(row)
            card_reader = PdfReader(io.BytesIO(card_data))
            with tempfile.TemporaryDirectory() as temp:
                temp_pdf = Path(temp) / 'card.pdf'
                temp_pdf.write_bytes(card_data)
                subprocess.run(['pdftoppm', '-r', '300', '-singlefile', '-png', str(temp_pdf), str(paper / 'Activation-Card')],
                               check=True, capture_output=True)
            (paper / 'Print-Spec.txt').write_text('الخامة المقترحة: ورق سميك مطفي، 85.6 × 54 مم.\n'
                'صفحة الكارت داخل PDF القطعة هي الصفحة الثالثة، وداخل ملف طباعة الكروت المجمع.\n'
                'QR الكارت يحمل رابط التفعيل ومعرف القطعة فقط؛ لا يحمل كود التفعيل.\n', encoding='utf-8')
            first = (row['sequence'] - 1) * 3
            front, back, card = original_pdf.pages[first], original_pdf.pages[first+1], card_reader.pages[0]
            pdf_name = 'ID-' + row['short'] + '__PRODUCT-AND-CARD.pdf'
            write_pdf(folder / pdf_name, [front, back, card])
            (stand_pages if row['family'] == 'stand' else coaster_pages).extend([front, back])
            card_pages.append(card)
            (folder / 'NFC-URL.txt').write_text(row['url'] + '\n', encoding='utf-8')
            (folder / 'Identity.txt').write_text('\n'.join([row['name'], 'SKU: '+row['sku'], 'ID: '+row['short'],
                'PUBLIC_ID: '+row['public'], 'QR/NFC: '+row['url'], 'ACTIVATION: '+activation_url])+'\n', encoding='utf-8')
            item = dict(row, position=position, folder=relative.as_posix(), pdf=(relative/pdf_name).as_posix(),
                        image=(relative/'01_ACRYLIC_PRODUCT/Front-with-QR.png').as_posix(),
                        card=(relative/'02_PAPER_ACTIVATION_CARD/Activation-Card.png').as_posix())
            products.append(item)
        write_pdf(target/'03_BATCH_PRINT/01_ACRYLIC-STANDS_100x150mm.pdf', stand_pages)
        write_pdf(target/'03_BATCH_PRINT/02_ACRYLIC-COASTERS_120x120mm.pdf', coaster_pages)
        write_pdf(target/'03_BATCH_PRINT/03_PAPER-ACTIVATION-CARDS_85.6x54mm.pdf', card_pages)
        csv_file(target/'00_START_HERE/Inventory-Index.csv', [['الترتيب','النوع','التصميم','SKU','ID','PUBLIC_ID','QR-NFC','فولدر القطعة']]+
                 [[r['position'],r['family'],r['name'],r['sku'],r['short'],r['public'],r['url'],r['folder']] for r in products])
        csv_file(target/'00_START_HERE/Packing-Checklist.csv', [['الترتيب','النوع','التصميم','SKU','ID','فحص QR','فحص NFC حسب المسار','مطابقة كارت التفعيل','تم التغليف','ملاحظات']]+
                 [[r['position'],r['family'],r['name'],r['sku'],r['short'],'','','','',''] for r in products])
        csv_file(target/'04_OWNER_ONLY/Activation-Codes.csv', [['الترتيب','المنتج','SKU','ID','PUBLIC_ID','كود التفعيل','رابط QR-NFC']]+
                 [[r['position'],r['name'],r['sku'],r['short'],r['public'],r['code'],r['url']] for r in products])
    guide(target/'00_START_HERE/Manufacturing-and-Packing-Guide-AR.pdf', count, stand_count, coaster_count, args.batch)
    (target/'00_START_HERE/README-AR.txt').write_text('ابدأ بفتح OPEN-INDEX.html من جذر الحزمة بعد فك الضغط.\n'
        'المنتجات: نوع > تصميم > ID. لكل قطعة PDF من ٣ صفحات: وجه، ظهر ID، كارت تفعيل.\n'
        'الأكريليك: ملفات 01 و02 داخل 03_BATCH_PRINT. كروت الورق: ملف 03 داخل نفس المجلد.\n'
        'الأكواد سرية داخل 04_OWNER_ONLY وعلى كروت التفعيل، وليست على جسم المنتج.\n'
        f'هذا تنظيم جديد لنفس الـ{count} قطعة الحالية؛ لم تتغير الأكواد أو IDs.\n', encoding='utf-8')
    (target/'00_START_HERE/Asset-Checksums.json').write_text(json.dumps(source_hashes, indent=2), encoding='utf-8')
    cards = []
    for item in products:
        e = {key: html.escape(str(value), quote=True) for key, value in item.items() if key != 'code'}
        cards.append(f'<article data-search="{e["name"]} {e["sku"]} {e["short"]}"><img loading="lazy" src="{e["image"]}" alt="{e["name"]}"><div><h3>{e["position"]:s}. {e["name"]}</h3><strong dir="ltr">ID: {e["short"]}</strong><small dir="ltr">{e["sku"]}</small><a href="{e["pdf"]}">PDF القطعة: الوجه + الظهر + كارت التفعيل</a><a href="{e["image"]}">صورة وجه المنتج بالـQR</a><a href="{e["card"]}">صورة كارت التفعيل الورقي</a></div></article>')
    document = '''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CliQo | فهرس دفعة التصنيع</title><style>
*{box-sizing:border-box}body{margin:0;background:#F4F6F5;color:#00241C;font:16px Arial,sans-serif}header,main{max-width:1200px;margin:auto;padding:28px}header{background:#00241C;color:white;border-bottom:5px solid #FF6A00}h1{margin:8px 0}p{line-height:1.8}nav{display:flex;gap:10px;flex-wrap:wrap}a{color:inherit}nav a{background:white;color:#00241C;padding:12px;border-radius:8px;text-decoration:none}input{width:100%;padding:16px;border:1px solid #A8B8B0;border-radius:10px;font:inherit;margin:20px 0}section{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}article{border:1px solid #D9E0DC;background:white;border-radius:12px;overflow:hidden}article img{width:100%;height:210px;object-fit:contain;padding:12px;background:#E6E8EB}article div{padding:16px}h3{font-size:16px;line-height:1.6;margin:0 0 12px}strong,small{display:block;text-align:right;margin-bottom:8px}article a{display:block;font-size:13px;line-height:1.7;padding:8px 0;border-top:1px solid #E6E8EB}h2{margin-top:36px}@media(max-width:900px){section{grid-template-columns:repeat(2,1fr)}}@media(max-width:500px){section{grid-template-columns:1fr}}[hidden]{display:none!important}
</style><header><div>CliQo | دفعة 2026-11-08 | v2</div><h1>ملفات التصنيع والتغليف</h1><p>٨ استاند + ٨ كوستر. قطعة واحدة من كل تصميم. نفس IDs وأكواد الدفعة الحالية.<br>PDF كل قطعة: الصفحة ١ وجه أكريليك، ٢ ظهر ID، ٣ كارت ورقي. ملفات الدفعة المجمعة حسب الخامة أدناه.</p><nav><a href="00_START_HERE/Manufacturing-and-Packing-Guide-AR.pdf">دليل عربي</a><a href="03_BATCH_PRINT/01_ACRYLIC-STANDS_100x150mm.pdf">طباعة الاستاندات</a><a href="03_BATCH_PRINT/02_ACRYLIC-COASTERS_120x120mm.pdf">طباعة الكوسترات</a><a href="03_BATCH_PRINT/03_PAPER-ACTIVATION-CARDS_85.6x54mm.pdf">طباعة كروت التفعيل</a><a href="00_START_HERE/Packing-Checklist.csv">قائمة التغليف</a></nav></header><main><label for="search">ابحث باسم التصميم أو SKU أو ID</label><input id="search" type="search" placeholder="Google أبيض أو ID القطعة"><h2>01 | الاستاندات</h2><section>''' + ''.join(cards[:stand_count]) + '</section><h2>02 | الكوسترات</h2><section>' + ''.join(cards[stand_count:]) + '''</section></main><script>document.getElementById('search').addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();document.querySelectorAll('article').forEach(x=>x.hidden=!x.dataset.search.toLowerCase().includes(q))});</script></html>'''
    document = document.replace('دفعة 2026-11-08', 'دفعة '+args.batch).replace('٨ استاند + ٨ كوستر. قطعة واحدة من كل تصميم.', f'{stand_count} استاند + {coaster_count} كوستر. كل وحدة لها ID مستقل.')
    (target/'OPEN-INDEX.html').write_text(document, encoding='utf-8')
    pdf_files = list(target.rglob('*.pdf'))
    assert len(pdf_files) == count + 4
    assert all(len(PdfReader(p).pages) == 3 for p in target.glob('0[12]_*/*/ID-*/*.pdf'))
    for relative, expected in source_hashes.items():
        assert hashlib.sha256((target/relative).read_bytes()).hexdigest() == expected
    for path in target.rglob('*'):
        os.chmod(path, 0o700 if path.is_dir() else 0o600)
    result_zip = args.destination/f'CliQo-Factory-{stand_count}-Stands-{coaster_count}-Coasters-Organised-V2.zip'
    with zipfile.ZipFile(result_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out:
        for path in sorted(target.rglob('*')):
            if path.is_file():
                out.write(path, Path(target.name)/path.relative_to(target))
    os.chmod(result_zip, 0o600)
    with zipfile.ZipFile(result_zip) as verify:
        assert verify.testzip() is None
    print(json.dumps({'zip': str(result_zip), 'directory': str(target), 'pieces': len(products),
                      'pdf_files': len(pdf_files), 'unchanged_product_assets': len(source_hashes)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
