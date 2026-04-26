import { assertAdminHqAccess } from "@/app/admin/hq/_lib/assertAdminHqAccess";
import { DiagnosticCheckClient } from "./DiagnosticCheckClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DiagnosticCheckPage() {
  await assertAdminHqAccess();
  return <DiagnosticCheckClient />;
}

