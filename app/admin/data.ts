export const orderStatusLabels = {
  new: "جديد", confirmed: "مؤكد", awaiting_design: "بانتظار التصميم",
  in_production: "قيد الإنتاج", quality_check: "فحص الجودة",
  ready_to_ship: "جاهز للشحن", shipped: "تم الشحن",
  delivered: "تم التسليم", cancelled: "ملغي", returned: "مرتجع",
} as const;

export const lineStatusLabels = {
  pending: "بانتظار البدء", awaiting_design: "بانتظار التصميم",
  in_production: "قيد الإنتاج", quality_check: "فحص الجودة", ready: "جاهز",
} as const;

export type OrderStatus = keyof typeof orderStatusLabels;
export type LineStatus = keyof typeof lineStatusLabels;
export type OrderRow = {
  id: string; reference: string; customer: string; phone: string; city: string;
  createdAt: string; payment: "card" | "cod"; paymentState: string;
  totalMinor: number; status: OrderStatus;
  lines: {
    id: string; name: string; option: string; qty: number; status: LineStatus;
    design?: { tier: string; businessName: string; destinationUrl: string; files: { name: string; url: string }[] };
  }[];
  notes: { id: number; body: string; createdAt: string }[];
};

export const paymentStateLabels: Record<string, string> = {
  pending: "بانتظار الدفع", paid: "مدفوع", failed: "فشل الدفع",
  cod_to_collect: "بانتظار التحصيل", cod_collected: "تم التحصيل",
  cod_settled: "تمت التسوية", refunded: "تم رد المبلغ",
};
