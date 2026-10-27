"use client";
import { useCopy } from '@/i18n/client';


import {skuLabel, optionLabel} from "@/i18n/catalog";
import {getProduct} from "@/lib/products";
import Image from "next/image";
import Link from "next/link";
import { productPhotos } from "@/lib/product-photos";
import { useCart } from "./cart-provider";



export function CartView() {
  const tr = useCopy();

  const { items, ready, subtotal, setQuantity, removeItem } = useCart();

  if (!ready) return <section className="st-cart-state" aria-live="polite"><p>{tr("بنحمّل السلة…")}</p></section>;
  if (items.length === 0) return <section className="st-cart-state"><span aria-hidden="true">▣</span><h2>{tr("السلة لسه فاضية.")}</h2><p>{tr("اختار منتجًا متاحًا للطلب بعد اعتماد العينة والسعر والمخزون.")}</p><Link className="st-button st-button-orange" href="/products">{tr("تصفح المنتجات ←")}</Link></section>;

  return <section className="st-cart-layout"><div className="st-cart-main"><div className="st-cart-panel"><div className="st-cart-panel-head"><h2>{tr("عناصر طلبك")} <span>({items.length})</span></h2><Link href="/products">{tr("تكملة التسوق ←")}</Link></div><div className="st-cart-lines">{items.map((item) => <article className="st-cart-line" key={item.key}><div className="st-cart-line-photo"><Image src={productPhotos[item.slug] ?? "/stitch/stand.webp"} alt={tr("تصور بصري لمنتج {value0}", {value0: skuLabel(tr, item.slug, {}, item.name)})} fill sizes="110px" /></div><div className="st-cart-line-details"><span>{tr(getProduct(item.slug)?.category ?? item.slug)}</span><h3>{skuLabel(tr, item.slug, {}, item.name)}</h3><p>{(item.optionValues ? Object.values(item.optionValues) : item.choices).map((choice) => optionLabel(tr, choice)).join(" · ")}</p>{item.customDesign && <p>{tr("تصميم مخصص لـ")}{item.customDesign.businessName}<br /><bdi dir="ltr">{item.customDesign.destinationUrl}</bdi><small>{tr("ملف الطباعة يُرفع بعد تسجيل الطلب من صفحة المتابعة.")}</small></p>}</div><div className="st-cart-line-controls"><button className="st-cart-remove" type="button" onClick={() => removeItem(item.key)} aria-label={tr("إزالة {value0} من السلة", {value0: skuLabel(tr, item.slug, {}, item.name)})}>{tr("إزالة")}</button><div className="quantity-control"><button type="button" aria-label={tr("تقليل كمية {value0}", {value0: skuLabel(tr, item.slug, {}, item.name)})} disabled={item.quantity <= 1} onClick={() => setQuantity(item.key, item.quantity - 1)}>−</button><span>{item.quantity}</span><button type="button" aria-label={tr("زيادة كمية {value0}", {value0: skuLabel(tr, item.slug, {}, item.name)})} disabled={item.quantity >= 20} onClick={() => setQuantity(item.key, item.quantity + 1)}>＋</button></div><strong>{tr.money(item.unitPriceEgp * item.quantity)}</strong></div></article>)}</div></div><div className="st-cart-help"><strong>{tr("سعر وشحن واضحان")}</strong><p>{tr("خطوة إتمام الطلب تراجع السعر والتوافر ورسوم الشحن من قاعدة البيانات قبل تأكيد الطلب.")}</p></div></div><aside className="st-cart-summary"><p className="st-kicker">{tr("مراجعة قبل الطلب")}</p><h2>{tr("ملخص السلة")}</h2><div><span>{tr("قيمة المنتجات")}</span><strong>{tr.money(subtotal)}</strong></div><div><span>{tr("الشحن")}</span><span>{tr("يُحدد في الخطوة التالية")}</span></div><p>{tr("هنعرض الإجمالي النهائي بعد مراجعة السلة وبيانات الشحن.")}</p><Link className="st-button st-button-orange" href="/checkout">{tr("استكمال الطلب ←")}</Link><small>{tr("الدفع يتاح فقط للمنتجات المعتمدة ومع شركة شحن مفعّلة.")}</small></aside></section>;
}
