import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Slug für `?demo=true`: Env oder erste aktive Demo-Firma mit gesetztem `demo_slug`.
 */
export async function getDefaultDemoSlug(
  service: SupabaseClient,
): Promise<string | null> {
  const explicit = process.env.AXON_DEMO_DEFAULT_SLUG?.trim().toLowerCase();
  if (explicit) return explicit;

  const res = await service
    .from("companies")
    .select("demo_slug")
    .eq("is_demo_active", true)
    .not("demo_slug", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (res.error) return null;
  const row = res.data as { demo_slug?: string | null } | null;
  return typeof row?.demo_slug === "string" && row.demo_slug.trim()
    ? row.demo_slug.trim().toLowerCase()
    : null;
}
