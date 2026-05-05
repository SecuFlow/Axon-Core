import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const locId = (id ?? "").trim();
  if (!locId) {
    return NextResponse.json({ error: "Mandat-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (!UUID_RE.test(locId)) {
    return NextResponse.json(
      { error: "Ungültige Mandat-ID." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  // Beide Tabellen werden parallel gepflegt (mandates ist Nachfolger, locations
  // ist Legacy mit Backfill). Ein einfaches `delete` auf nur eine der beiden
  // gibt schweigend 0 Zeilen zurück, wenn der Datensatz nur in der anderen liegt.
  // Daher: in beiden löschen, Fehler nur dann, wenn beide scheitern UND die Tabelle existiert.
  const delMandate = await ctx.service
    .from("mandates")
    .delete({ count: "exact" })
    .eq("id", locId);
  const mandateMissing = delMandate.error?.message
    ?.toLowerCase()
    .includes("mandates");
  const mandateRows =
    typeof delMandate.count === "number" ? delMandate.count : 0;

  const delLocation = await ctx.service
    .from("locations")
    .delete({ count: "exact" })
    .eq("id", locId);
  const locationMissing = delLocation.error?.message
    ?.toLowerCase()
    .includes("locations");
  const locationRows =
    typeof delLocation.count === "number" ? delLocation.count : 0;

  const totalAffected = mandateRows + locationRows;

  // Wenn beide Tabellen existieren und keine einzige Zeile getroffen wurde → 404.
  if (
    !mandateMissing &&
    !locationMissing &&
    totalAffected === 0 &&
    !delMandate.error &&
    !delLocation.error
  ) {
    return NextResponse.json(
      { error: "Mandat nicht gefunden." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  // Fehler nur reporten, wenn die jeweilige Tabelle existiert.
  if (delMandate.error && !mandateMissing) {
    return NextResponse.json(
      { error: delMandate.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  if (delLocation.error && !locationMissing) {
    return NextResponse.json(
      { error: delLocation.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { ok: true, deleted: { mandates: mandateRows, locations: locationRows } },
    { headers: NO_STORE_HEADERS },
  );
}
