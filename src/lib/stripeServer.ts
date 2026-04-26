import Stripe from "stripe";

/** Nur in Route Handlern / Server verwenden — niemals im Client importieren. */
export function getStripeServer(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}
