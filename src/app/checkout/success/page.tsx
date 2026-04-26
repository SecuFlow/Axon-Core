import { redirect } from "next/navigation";
import { SuccessClient } from "./SuccessClient";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const q = await searchParams;
  const sessionId = (q.session_id ?? "").trim();
  if (!sessionId) {
    redirect("/checkout?canceled=1");
  }
  return <SuccessClient sessionId={sessionId} />;
}

