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
  createdAt: string; payment: "card" | "cod" | "test"; paymentState: string; paymentAttempt?: string | null;
  totalMinor: number; status: OrderStatus;
  lines: {
    id: string; name: string; option: string; qty: number; status: LineStatus;
    stockUnits: number;
    testItemIds?: string[];
    design?: { tier: "T1" | "T2"; businessName: string; destinationUrl: string | null; brief: string | null; files: { name: string; url: string }[] };
  }[];
  notes: { id: number; body: string; createdAt: string }[];
};

export const paymentStateLabels: Record<string, string> = {
  pending: "بانتظار الدفع", paid: "مدفوع", failed: "فشل الدفع",
  cod_to_collect: "بانتظار التحصيل", cod_collected: "تم التحصيل",
  cod_settled: "تمت التسوية", refunded: "تم رد المبلغ",
};

export const paymentAttemptLabels: Record<string, string> = {
  creating: "إنشاء رابط الدفع",
  pending: "بانتظار إشعار البوابة",
  succeeded: "تأكيد البوابة وصل",
  failed: "محاولة الدفع فشلت",
  expired: "انتهت مهلة الدفع",
  late_success: "دفع متأخر؛ يحتاج مراجعة",
  refunded: "تأكيد الاسترداد وصل",
};
