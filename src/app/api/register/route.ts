import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripeServer";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

function siteBaseUrl(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const url = new URL(req.url);
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function resolveCompanyName(
  rawName: string | undefined,
  email: string,
): string {
  const trimmed = (rawName ?? "").trim();
  if (trimmed.length > 0) {
    return trimmed.slice(0, 256);
  }
  const mail = email.trim();
  if (mail.length > 0) {
    return mail.slice(0, 256);
  }
  return "Neuer Konzern";
}

export async function POST(req: Request) {
  let payload: {
    username?: string;
    email?: string;
    password?: string;
    companyName?: string;
    accountType?: string;
    role?: string;
  } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültige Request-Body" },
      { status: 400 },
    );
  }

  const email = (payload.email ?? "").trim();
  const password = payload.password ?? "";
  /** Optional; leer → Anzeigename/E-Mail in resolveCompanyName */
  const username = (payload.username ?? "").trim();
  const rawRole = (payload.role ?? "").trim().toLowerCase();
  const rawAccount = (payload.accountType ?? "").trim().toLowerCase();
  if (rawRole === "worker" || rawRole === "mitarbeiter" || rawRole === "employee") {
    return NextResponse.json(
      {
        error:
          "Mitarbeiter können sich nicht selbst registrieren. Das Konto wird durch den Manager erstellt.",
      },
      { status: 403 },
    );
  }

  const normalizedRole =
    rawRole === "privat" || rawRole === "private"
      ? "private"
      : rawRole === "kleinunternehmer" || rawRole === "small_business"
        ? "small_business"
        : "enterprise";
  const accountType =
    normalizedRole === "private" || rawAccount === "private" ? "private" : "enterprise";
  const companyName = resolveCompanyName(
    username || payload.companyName,
    email,
  );

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase ist nicht konfiguriert." },
      { status: 500 },
    );
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY fehlt (für companies-Zeile)." },
      { status: 500 },
    );
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "E-Mail und Passwort sind erforderlich." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Passwort muss mindestens 8 Zeichen haben." },
      { status: 400 },
    );
  }

  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

  const { data: signData, error: signError } = await supabaseAnon.auth.signUp({
    email,
    password,
    options: {
      data: {
        role:
          normalizedRole === "private"
            ? "private"
            : normalizedRole === "small_business"
              ? "small_business"
              : "enterprise",
        username: username || null,
      },
    },
  });

  if (signError) {
    return NextResponse.json({ error: signError.message }, { status: 400 });
  }

  const user = signData.user;
  if (!user?.id) {
    return NextResponse.json(
      { error: "Registrierung unvollständig." },
      { status: 500 },
    );
  }

  const userId = user.id;

  const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const w1 = await supabaseService
    .from("wallets")
    .insert({ user_id: userId, balance_axn: 0 });
  if (w1.error && !w1.error.message.includes("duplicate")) {
    const w2 = await supabaseService.from("wallets").insert({ user_id: userId });
    if (w2.error && !w2.error.message.includes("duplicate")) {
      console.warn("[register] wallets:", w2.error.message);
    }
  }

  if (accountType !== "private") {
    let { error: companyError } = await supabaseService.from("companies").upsert(
      {
        user_id: userId,
        name: companyName,
        role: "user",
        is_subscribed: false,
        account_status: "pending",
      },
      { onConflict: "user_id" },
    );
    if (companyError?.message.includes("account_status")) {
      const fallback = await supabaseService.from("companies").upsert(
        {
          user_id: userId,
          name: companyName,
          role: "user",
          is_subscribed: false,
        },
        { onConflict: "user_id" },
      );
      companyError = fallback.error ?? null;
    }

    if (companyError) {
      let { error: insertErr } = await supabaseService.from("companies").insert({
        user_id: userId,
        name: companyName,
        role: "user",
        is_subscribed: false,
        account_status: "pending",
      });
      if (insertErr?.message.includes("account_status")) {
        const fallbackInsert = await supabaseService.from("companies").insert({
          user_id: userId,
          name: companyName,
          role: "user",
          is_subscribed: false,
        });
        insertErr = fallbackInsert.error ?? null;
      }
      if (insertErr && !insertErr.message.includes("duplicate")) {
        return NextResponse.json(
          { error: `Firma konnte nicht angelegt werden: ${insertErr.message}` },
          { status: 500 },
        );
      }
    }
  }

  const base = siteBaseUrl(req);
  // Preisquelle: DB (System-Einspeisung) > ENV fallback
  let priceIdEnterprise: string | null = process.env.STRIPE_PRICE_ID?.trim() ?? null;
  let priceIdSmb: string | null = process.env.STRIPE_PRICE_ID_SMB?.trim() ?? null;
  try {
    const cfg = await supabaseService
      .from("pricing_config")
      .select("stripe_price_id, stripe_price_id_enterprise, stripe_price_id_smb, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cfgRow = cfg.data as {
      stripe_price_id?: unknown;
      stripe_price_id_enterprise?: unknown;
      stripe_price_id_smb?: unknown;
    } | null;
    const dbEnterprise =
      typeof cfgRow?.stripe_price_id_enterprise === "string"
        ? cfgRow.stripe_price_id_enterprise.trim()
        : "";
    const dbLegacy =
      typeof cfgRow?.stripe_price_id === "string"
        ? cfgRow.stripe_price_id.trim()
        : "";
    const dbSmb =
      typeof cfgRow?.stripe_price_id_smb === "string"
        ? cfgRow.stripe_price_id_smb.trim()
        : "";
    if (dbEnterprise || dbLegacy) priceIdEnterprise = dbEnterprise || dbLegacy;
    if (dbSmb) priceIdSmb = dbSmb;
  } catch {
    // ignore: ENV fallback bleibt aktiv
  }

  let redirectUrl = `${base}/checkout?registered=1`;

  if (accountType === "private") {
    redirectUrl = `${base}/coin-space`;
  } else {
    const stripe = getStripeServer();
    const targetPriceId =
      normalizedRole === "small_business"
        ? priceIdSmb ?? priceIdEnterprise
        : priceIdEnterprise;
    if (stripe && targetPriceId) {
      try {
        const checkoutSession = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer_email: email,
          line_items: [{ price: targetPriceId, quantity: 1 }],
          success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/checkout?canceled=1`,
          metadata: { supabase_user_id: userId },
          client_reference_id: userId,
        });
        if (checkoutSession.url) {
          redirectUrl = checkoutSession.url;
        }
      } catch (e) {
        console.error("Stripe Checkout:", e);
        redirectUrl = `${base}/checkout?stripe_error=1`;
      }
    }
  }

  const res = NextResponse.json({ ok: true, redirect: redirectUrl });

  let session = signData.session;
  if (!session) {
    // Falls E-Mail-Bestätigung deaktiviert ist, erzwingen wir hier eine direkte Session.
    const signInNow = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });
    if (!signInNow.error && signInNow.data.session) {
      session = signInNow.data.session;
    }
  }
  if (session) {
    const maxAge = session.expires_in ?? 60 * 60;
    res.cookies.set("sb-access-token", session.access_token, {
      path: "/",
      maxAge,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    res.cookies.set("sb-refresh-token", session.refresh_token, {
      path: "/",
      maxAge,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }

  return res;
}
