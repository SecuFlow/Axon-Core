import { redirect } from "next/navigation";
import { LogoUploader } from "@/components/LogoUploader";
import { getCanManageBrandingForDashboardUser } from "@/lib/companyBranding.server";

export default async function DashboardBrandingPage() {
  const allowed = await getCanManageBrandingForDashboardUser();
  if (!allowed) {
    redirect("/dashboard/konzern");
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Branding</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Logo und Primärfarbe für Ihre Organisation. Zugang haben
        Inhaber-Konten sowie Admin-/Manager-Rollen.
      </p>
      <div className="mt-8 max-w-2xl">
        <LogoUploader />
      </div>
    </div>
  );
}
