export function isCustomerItemConfigured(
  item: { landing_page_id: string | null; payment_identifier: string | null; recipient_label: string | null; destination_url: string | null },
  face: string,
  publishedPages: ReadonlySet<string>,
) {
  if (face === "all-in-one") return item.landing_page_id !== null && publishedPages.has(item.landing_page_id);
  if (face === "instapay" || face === "vodafone") return Boolean(item.payment_identifier && item.recipient_label);
  return Boolean(item.destination_url);
}
