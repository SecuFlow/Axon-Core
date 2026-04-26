import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { loadWalletContext } from "@/lib/wallets";

export const runtime = "nodejs";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

export async function POST(request: NextRequest) {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server nicht konfiguriert." }, { status: 500 });
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

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const caseId =
    typeof body?.case_id === "string" && body.case_id.trim()
      ? body.case_id.trim()
      : null;
  const approvePublic = body?.approve_public === true;
  if (!content) {
    return NextResponse.json({ error: "Inhalt fehlt." }, { status: 400 });
  }
  if (content.length > 20000) {
    return NextResponse.json({ error: "Text zu lang." }, { status: 400 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const companyRes = await service
    .from("companies")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  const actorCompany = companyRes.data as
    | { tenant_id?: string | null; role?: string | null }
    | null;
  const actorTenantId =
    typeof actorCompany?.tenant_id === "string" && actorCompany.tenant_id
      ? actorCompany.tenant_id
      : null;
  const actorCompanyRole = (actorCompany?.role ?? "").toLowerCase().trim();
  const actorIsManager = actorCompanyRole === "manager" || actorCompanyRole === "admin";

  const creditRewardIfEligible = async (targetUserId: string, linkedCaseId: string) => {
    const targetUser = await service.auth.admin.getUserById(targetUserId);
    const targetRole =
      typeof targetUser.data.user?.user_metadata?.role === "string"
        ? targetUser.data.user.user_metadata.role.trim().toLowerCase()
        : "";
    if (targetRole !== "private") {
      return { rewarded: false as const, reason: "target_not_private" as const };
    }

    const txType = `knowledge_reward:${linkedCaseId}`;
    const txExists = await service
      .from("transactions")
      .select("id")
      .eq("type", txType)
      .limit(1)
      .maybeSingle();
    if (txExists.data?.id) {
      return { rewarded: false as const, reason: "already_rewarded" as const };
    }

    const walletCtx = await loadWalletContext(service, targetUserId);
    let walletId = walletCtx.walletId;
    if (!walletId) {
      const ensure = await service
        .from("wallets")
        .upsert(
          { user_id: targetUserId, balance_axn: 0, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
        .select("id")
        .single();
      walletId = (ensure.data as { id?: string } | null)?.id ?? null;
    }

    const rewardAmount = 5;
    if (walletId) {
      const inc = await service.rpc("increment_axn_balance", {
        p_wallet_id: walletId,
        p_delta: rewardAmount,
      });
      if (inc.error) {
        const row = await service
          .from("wallets")
          .select("balance_axn")
          .eq("id", walletId as string)
          .maybeSingle();
        const current = Number((row.data as { balance_axn?: unknown } | null)?.balance_axn ?? 0);
        await service
          .from("wallets")
          .update({
            balance_axn: current + rewardAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", walletId as string);
      }
    }

    await service.from("transactions").insert({
      wallet_id: walletId,
      user_id: targetUserId,
      amount_axn: rewardAmount,
      type: txType,
      created_at: new Date().toISOString(),
    });

    const rewardedUpd = await service
      .from("ai_cases")
      .update({ worker_rewarded_at: new Date().toISOString() })
      .eq("id", linkedCaseId);
    void rewardedUpd;

    return { rewarded: true as const, reason: "ok" as const };
  };

  if (caseId) {
    const caseRes = await service
      .from("ai_cases")
      .select("id, user_id, tenant_id, company_id, manager_public_approved")
      .eq("id", caseId)
      .maybeSingle();
    if (caseRes.error || !caseRes.data) {
      return NextResponse.json({ error: "Wissenseintrag nicht gefunden." }, { status: 404 });
    }
    const caseRow = caseRes.data as {
      id: string;
      user_id?: string | null;
      tenant_id?: string | null;
      company_id?: string | null;
      manager_public_approved?: boolean | null;
    };
    const caseTenant =
      (typeof caseRow.tenant_id === "string" && caseRow.tenant_id) ||
      (typeof caseRow.company_id === "string" && caseRow.company_id) ||
      null;

    if (actorTenantId && caseTenant && actorTenantId !== caseTenant && !actorIsManager) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Wissenseintrag." }, { status: 403 });
    }

    if (approvePublic) {
      if (!actorIsManager) {
        return NextResponse.json({ error: "Freigabe nur durch Manager/Admin möglich." }, { status: 403 });
      }
      await service
        .from("ai_cases")
        .update({
          manager_public_approved: true,
          manager_public_approved_at: new Date().toISOString(),
        })
        .eq("id", caseId);
    }

    const approved =
      approvePublic || caseRow.manager_public_approved === true;
    if (!approved) {
      await service
        .from("ai_cases")
        .update({ worker_public_shared_at: new Date().toISOString() })
        .eq("id", caseId);
      return NextResponse.json({
        ok: true,
        pending_manager_approval: true,
        message:
          "Wissen erfasst. Veröffentlichung und AXN-Belohnung erfolgen nach Manager-Freigabe im Konzern-Dashboard.",
      });
    }
  }

  if (isPrivate) {
    const w = await loadWalletContext(service, userId);
    let balance = w.balance_axn;
    const walletsMissing =
      w.error && /does not exist/i.test(w.error) && /wallets/i.test(w.error);
    if (walletsMissing) {
      const { data: row, error: legErr } = await service
        .from("user_axn_balances")
        .select("balance_axn")
        .eq("user_id", userId)
        .maybeSingle();
      if (legErr && !legErr.message.includes("user_axn_balances")) {
        return NextResponse.json({ error: legErr.message }, { status: 500 });
      }
      balance = row ? Number(row.balance_axn ?? 0) : 0;
    } else if (w.error) {
      return NextResponse.json({ error: w.error }, { status: 500 });
    }
    if (balance <= 0) {
      return NextResponse.json(
        { error: "Heilwissen-Upload erst ab AXN-Guthaben > 0." },
        { status: 403 },
      );
    }
  }

  const { data: inserted, error: insErr } = await service
    .from("public_knowledge")
    .insert({
      category: "Heilwissen",
      content,
    })
    .select("id")
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  let rewardResult:
    | { rewarded: true; reason: "ok" }
    | { rewarded: false; reason: "target_not_private" | "already_rewarded" }
    | null = null;
  if (caseId) {
    const row = await service
      .from("ai_cases")
      .select("user_id")
      .eq("id", caseId)
      .maybeSingle();
    const targetUserId =
      typeof (row.data as { user_id?: unknown } | null)?.user_id === "string"
        ? ((row.data as { user_id: string }).user_id)
        : null;
    if (targetUserId) {
      rewardResult = await creditRewardIfEligible(targetUserId, caseId);
    }
  }

  return NextResponse.json({
    ok: true,
    id: inserted?.id,
    rewarded: rewardResult?.rewarded === true,
    reward_reason: rewardResult?.reason ?? null,
  });
}
