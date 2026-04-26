import type { SupabaseClient } from "@supabase/supabase-js";

export type WalletTransactionRow = {
  id: string;
  amount_axn: number;
  type: string | null;
  created_at: string | null;
};

function num(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

export function balanceFromWalletRow(row: Record<string, unknown> | null): number {
  if (!row) return 0;
  if ("balance_axn" in row && row.balance_axn != null) return num(row.balance_axn);
  if ("balance" in row && row.balance != null) return num(row.balance);
  return 0;
}

function amountFromTxRow(row: Record<string, unknown>): number {
  if ("amount_axn" in row && row.amount_axn != null) return num(row.amount_axn);
  if ("amount" in row && row.amount != null) return num(row.amount);
  return 0;
}

function typeFromTxRow(row: Record<string, unknown>): string | null {
  const t =
    row.type ??
    row.kind ??
    row.transaction_type ??
    row.label ??
    row.description;
  if (typeof t === "string" && t.length > 0) return t;
  return null;
}

/**
 * Liest Wallet + letzte Transaktionen. Erwartet Tabellen wallets / transactions (Migration im Projekt).
 * Unterstützt balance_axn oder balance; Transaktionen per user_id oder wallet_id.
 */
export async function loadWalletContext(
  service: SupabaseClient,
  userId: string,
): Promise<{
  balance_axn: number;
  walletId: string | null;
  transactions: WalletTransactionRow[];
  error: string | null;
}> {
  const empty = (): WalletTransactionRow[] => [];

  const first = await service
    .from("wallets")
    .select("id,user_id,balance_axn,balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (first.error) {
    const msg = first.error.message ?? "";
    if (msg.includes("relation") && msg.includes("wallets")) {
      return { balance_axn: 0, walletId: null, transactions: empty(), error: msg };
    }
    const minimal = await service
      .from("wallets")
      .select("id,user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (minimal.error) {
      return { balance_axn: 0, walletId: null, transactions: empty(), error: minimal.error.message };
    }
    let row = minimal.data as Record<string, unknown> | null;
    if (!row) {
      const ins = await service.from("wallets").insert({ user_id: userId });
      if (ins.error && !ins.error.message.includes("duplicate")) {
        return { balance_axn: 0, walletId: null, transactions: empty(), error: ins.error.message };
      }
      const again = await service
        .from("wallets")
        .select("id,user_id")
        .eq("user_id", userId)
        .maybeSingle();
      row = ( again.data ?? null) as Record<string, unknown> | null;
    }
    const wid = typeof row?.id === "string" ? row.id : null;
    const txs = await loadTransactions(service, userId, wid);
    return { balance_axn: 0, walletId: wid, transactions: txs, error: null };
  }

  let walletRow = first.data as Record<string, unknown> | null;
  if (!walletRow) {
    const ins = await service.from("wallets").insert({ user_id: userId, balance_axn: 0 });
    if (ins.error && !ins.error.message.includes("duplicate")) {
      return {
        balance_axn: 0,
        walletId: null,
        transactions: empty(),
        error: ins.error.message,
      };
    }
    const again = await service
      .from("wallets")
      .select("id,user_id,balance_axn,balance")
      .eq("user_id", userId)
      .maybeSingle();
    walletRow = (again.data ?? null) as Record<string, unknown> | null;
  }

  const walletId = typeof walletRow?.id === "string" ? walletRow.id : null;
  const balance_axn = balanceFromWalletRow(walletRow);
  const transactions = await loadTransactions(service, userId, walletId);
  return { balance_axn, walletId, transactions, error: null };
}

async function loadTransactions(
  service: SupabaseClient,
  userId: string,
  walletId: string | null,
): Promise<WalletTransactionRow[]> {
  const mapRows = (rows: unknown[] | null): WalletTransactionRow[] => {
    if (!rows?.length) return [];
    return rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : String(row.id ?? "");
      return {
        id,
        amount_axn: amountFromTxRow(row),
        type: typeFromTxRow(row),
        created_at: typeof row.created_at === "string" ? row.created_at : null,
      };
    });
  };

  const byUser = await service
    .from("transactions")
    .select("id,amount_axn,amount,type,kind,description,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (!byUser.error && byUser.data) {
    return mapRows(byUser.data as unknown[]);
  }

  if (walletId) {
    const byWallet = await service
      .from("transactions")
      .select("id,amount_axn,amount,type,kind,description,created_at")
      .eq("wallet_id", walletId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (!byWallet.error && byWallet.data) {
      return mapRows(byWallet.data as unknown[]);
    }
  }

  return [];
}
