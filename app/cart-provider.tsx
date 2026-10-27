"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CustomDesign = { businessName: string; destinationUrl: string };

export type CartLine = {
  key: string;
  skuId: string;
  slug: string;
  name: string;
  unitPriceEgp: number;
  quantity: number;
  choices: string[];
  optionValues?: Record<string, string>;
  customDesign?: CustomDesign;
};

type NewLine = Omit<CartLine, "key" | "quantity">;
type CartContextValue = {
  items: CartLine[];
  ready: boolean;
  count: number;
  subtotal: number;
  addItem: (line: NewLine) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "cliqo-cart-v1";

function validLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter((line): line is CartLine => Boolean(
    line && typeof line === "object" &&
    typeof line.key === "string" && typeof line.skuId === "string" &&
    typeof line.slug === "string" &&
    typeof line.name === "string" && Number.isFinite(line.unitPriceEgp) &&
    Number.isInteger(line.quantity) && line.quantity > 0 &&
    Array.isArray(line.choices) && line.choices.every((choice: unknown) => typeof choice === "string") &&
    (line.optionValues === undefined || (
      line.optionValues && typeof line.optionValues === "object" && !Array.isArray(line.optionValues) &&
      Object.values(line.optionValues).every((value) => typeof value === "string")
    )) &&
    (line.customDesign === undefined || (
      typeof line.customDesign?.businessName === "string" && line.customDesign.businessName.length > 0 &&
      typeof line.customDesign?.destinationUrl === "string" && line.customDesign.destinationUrl.startsWith("https://")
    ))
  ));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(validLines(JSON.parse(stored)));
    } catch {
      setItems([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        // The cart remains usable for this session when browser storage is unavailable.
      }
    }
  }, [items, ready]);

  const addItem = useCallback((line: NewLine) => {
    if (!Number.isFinite(line.unitPriceEgp) || line.unitPriceEgp <= 0) return;
    const key = line.skuId + (line.customDesign ? ":" + encodeURIComponent(JSON.stringify(line.customDesign)) : "");
    setItems((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) return current.map((item) => item.key === key ? { ...item, quantity: Math.min(20, item.quantity + 1) } : item);
      return [...current, { ...line, key, quantity: 1 }];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    setItems((current) => current.map((item) => item.key === key ? { ...item, quantity: Math.min(20, quantity) } : item));
  }, []);

  const removeItem = useCallback((key: string) => setItems((current) => current.filter((item) => item.key !== key)), []);
  const clearCart = useCallback(() => {
    setItems([]);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Cart state still clears in memory. */ }
  }, []);
  const value = useMemo(() => ({
    items,
    ready,
    count: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.unitPriceEgp * item.quantity, 0),
    addItem,
    setQuantity,
    removeItem,
    clearCart,
  }), [items, ready, addItem, setQuantity, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
