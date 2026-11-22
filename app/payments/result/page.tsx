import {redirect} from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PaymentResultPage({searchParams}: {searchParams: Promise<{reference?: string}>}) {
  const {reference = ""} = await searchParams;
  if (!/^CQ-[0-9]{6,}$/.test(reference)) redirect("/checkout");
  // The return URL is only for navigation. The signed server notification controls payment state.
  redirect(`/orders/${encodeURIComponent(reference)}`);
}
