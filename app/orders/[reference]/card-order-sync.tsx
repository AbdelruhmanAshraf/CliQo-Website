"use client";

import {useEffect} from "react";
import {useCart} from "@/app/cart-provider";

export function CardOrderSync({paymentMethod, paymentState, attemptStatus}: {paymentMethod: "card" | "cod"; paymentState: string; attemptStatus: string | null}) {
  const {clearCart} = useCart();
  useEffect(() => {
    if (paymentMethod !== "card" || attemptStatus === "late_success") return;
    if (paymentState === "paid") clearCart();
    if (paymentState === "paid" || paymentState === "failed") {
      window.sessionStorage.removeItem("cliqo-checkout-attempt");
    }
  }, [attemptStatus, clearCart, paymentMethod, paymentState]);
  return null;
}
