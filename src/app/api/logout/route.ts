import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  // Supabase Auth Cookies (siehe Ist-Zustand).
  cookieStore.set("sb-access-token", "", { path: "/", maxAge: 0 });
  cookieStore.set("sb-refresh-token", "", { path: "/", maxAge: 0 });
  cookieStore.set("axon-session-id", "", { path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}

