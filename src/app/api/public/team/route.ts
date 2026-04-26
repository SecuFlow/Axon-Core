import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export type PublicTeamMember = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  sort_order: number;
};

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function displayRole(row: {
  public_title?: unknown;
  role?: unknown;
}): string {
  const pt =
    typeof row.public_title === "string" && row.public_title.trim()
      ? row.public_title.trim()
      : "";
  if (pt) return pt;
  return typeof row.role === "string" ? row.role : "";
}

export async function GET() {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ items: [] as PublicTeamMember[] });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let r: {
    data: unknown;
    error: { message: string } | null;
  } = await service
    .from("team_members")
    .select("id,name,role,public_title,is_public,email,phone,photo_url,sort_order,created_at")
    .eq("is_public", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (r.error?.message.includes("public_title")) {
    r = await service
      .from("team_members")
      .select("id,name,role,is_public,email,phone,photo_url,sort_order,created_at")
      .eq("is_public", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
  }

  if (r.error?.message.includes("is_public")) {
    return NextResponse.json({ items: [] as PublicTeamMember[] });
  }

  if (r.error) {
    if (r.error.message.toLowerCase().includes("team_members")) {
      return NextResponse.json({ items: [] as PublicTeamMember[] });
    }
    return NextResponse.json({ error: r.error.message }, { status: 500 });
  }

  const rows = (r.data ?? []) as Array<{
    id?: string;
    name?: string;
    role?: string;
    public_title?: string | null;
    email?: string | null;
    phone?: string | null;
    photo_url?: string | null;
    sort_order?: number;
  }>;

  const items: PublicTeamMember[] = rows
    .filter((row) => typeof row.id === "string" && typeof row.name === "string")
    .map((row) => ({
      id: row.id as string,
      name: row.name as string,
      role: displayRole(row),
      email: row.email ?? null,
      phone: row.phone ?? null,
      photo_url: row.photo_url ?? null,
      sort_order: typeof row.sort_order === "number" ? row.sort_order : 100,
    }));

  return NextResponse.json({ items });
}
