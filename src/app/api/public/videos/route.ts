import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export type PublicVideoItem = {
  id: string;
  type: "demo" | "pilot";
  url: string;
  title: string;
  created_at: string;
};

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\s/g, "");
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.replace(/\s/g, "");
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ items: [] as PublicVideoItem[] });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const r = await supabase
    .from("site_content")
    .select("id,type,url,title,created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (r.error) {
    return NextResponse.json({ error: r.error.message }, { status: 500 });
  }

  return NextResponse.json({ items: (r.data ?? []) as PublicVideoItem[] });
}

