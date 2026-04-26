import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { loadWalletContext, type WalletTransactionRow } from "@/lib/wallets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

async function legacyBalanceFromUserAxn(
  service: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await service
    .from("user_axn_balances")
    .select("balance_axn")
    .eq("user_id", userId)
    .maybeSingle();
  if (error?.message?.includes("user_axn_balances")) return null;
  if (error) return null;
  const row = data as { balance_axn?: unknown } | null;
  return row ? Number(row.balance_axn ?? 0) : 0;
}

export type CoinContextResponse = {
  isPrivate: boolean;
  balance_axn: number;
  heilwissenUnlocked: boolean;
  transactions: WalletTransactionRow[];
};

export async function GET(request: NextRequest) {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY fehlt." },
      { status: 500 },
    );
  }

  const accessToken = request.cookies.get("sb-access-token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Session ist nicht gueltig." }, { status: 401 });
  }

  const userId = userData.user.id;
  const roleRaw =
    typeof userData.user.user_metadata?.role === "string"
      ? userData.user.user_metadata.role.trim().toLowerCase()
      : "";
  const isPrivate = roleRaw === "private";

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const walletCtx = await loadWalletContext(service, userId);

  let balance_axn = walletCtx.balance_axn;
  let transactions = walletCtx.transactions;

  if (walletCtx.error) {
    const missingWallet =
      /does not exist/i.test(walletCtx.error) && /wallets/i.test(walletCtx.error);
    if (missingWallet) {
      return NextResponse.json(
        {
          error:
            "Tabelle wallets fehlt. Bitte Migration in Supabase ausfuehren.",
          heilwissenUnlocked: !isPrivate,
          balance_axn: 0,
          isPrivate,
          transactions: [] as WalletTransactionRow[],
        },
        { status: 503 },
      );
    }
    if (isPrivate) {
      const legacy = await legacyBalanceFromUserAxn(service, userId);
      if (legacy !== null) {
        balance_axn = legacy;
        transactions = [];
      } else {
        return NextResponse.json({ error: walletCtx.error }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: walletCtx.error }, { status: 500 });
    }
  }

  const heilwissenUnlocked = !isPrivate || balance_axn > 0;

  const body: CoinContextResponse = {
    isPrivate,
    balance_axn,
    heilwissenUnlocked,
    transactions,
  };

  return NextResponse.json(body);
}
