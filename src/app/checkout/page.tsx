import Link from "next/link";

type Props = {
  searchParams: Promise<{ canceled?: string; registered?: string; stripe_error?: string }>;
};

export default async function CheckoutPage({ searchParams }: Props) {
  const q = await searchParams;
  const showStripeHint = q.stripe_error === "1" || q.registered === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030304] px-6 text-zinc-100">
      <section className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white">
          {q.canceled === "1" ? "Checkout abgebrochen" : "Checkout erforderlich"}
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          {q.canceled === "1"
            ? "Du kannst den Zahlungsvorgang jederzeit erneut starten — z. B. über den Login, wenn dein Konto bereits existiert."
            : "Dein Unternehmen ist noch nicht abonniert. Bitte schließe den Abo-Prozess ab."}
        </p>
        {showStripeHint ? (
          <p className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-xs text-slate-300">
            Stripe-Checkout ist nicht erreichbar. Bitte{" "}
            <code className="rounded bg-black/30 px-1">STRIPE_SECRET_KEY</code> und{" "}
            <code className="rounded bg-black/30 px-1">STRIPE_PRICE_ID</code> in der
            Umgebung setzen (Vercel / .env).
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[#00D1FF]/50 bg-[#00D1FF] px-6 text-sm font-semibold text-[#030304] transition hover:bg-[#33ddff]"
          >
            Zum Login
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.03] px-6 text-sm font-medium text-white transition hover:border-[#00D1FF]/40"
          >
            Registrieren
          </Link>
        </div>
      </section>
    </main>
  );
}
