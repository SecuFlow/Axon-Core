import { NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maskedMode(key: string): "live" | "test" | "unknown" {
  const k = key.trim();
  if (k.startsWith("sk_live_")) return "live";
  if (k.startsWith("sk_test_")) return "test";
  return "unknown";
}

export async function GET() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const whsec = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const price = process.env.STRIPE_PRICE_LOCATION_MONTHLY?.trim() ?? "";

  const stripe = getStripeServer();

  return NextResponse.json(
    {
      ok: Boolean(stripe && secret),
      stripe: {
        configured: Boolean(stripe && secret),
        mode: secret ? maskedMode(secret) : "unknown",
      },
      webhook: {
        signing_secret_set: Boolean(whsec),
        looks_valid: whsec.startsWith("whsec_"),
      },
      price: {
        location_monthly_set: Boolean(price),
        looks_valid: price.startsWith("price_"),
      },
      hint:
        "Wenn mode=test ist, aber du Live erwartest: du hast den falschen Secret Key in der Umgebung gesetzt.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

