"use client";
import { useCopy } from '@/i18n/client';


import { useState } from "react";
import { useCart, type CustomDesign } from "./cart-provider";

export function CartAddButton({ skuId, slug, name, priceEgp, choices, customDesign, optionValues }: { skuId: string; slug: string; name: string; priceEgp: number; choices: string[]; optionValues?: Record<string, string>; customDesign?: CustomDesign }) {
  const tr = useCopy();

  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  return <button className="button button-primary add-to-cart" type="button" onClick={() => { addItem({ skuId, slug, name, unitPriceEgp: priceEgp, choices, customDesign, optionValues }); setAdded(true); }} aria-live="polite">{added ? tr("اتضافت للسلة ✓") : customDesign ? tr("أضف التصميم للسلة") : tr("أضف للسلة")}<span>←</span></button>;
}
