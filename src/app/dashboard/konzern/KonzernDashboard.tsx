"use client";

import dynamic from "next/dynamic";

// Recharts (ResponsiveContainer) benutzt window.ResizeObserver und crasht im SSR.
// Im Demo-Modus (?demo=...) umgeht die Middleware den Auth-Redirect, dadurch wuerde
// die Page tatsaechlich SSR-gerendert -> 500. Loesung: clientseitig laden.
const KonzernDashboardClient = dynamic(() => import("./KonzernDashboardClient"), {
  ssr: false,
  loading: () => null,
});

export default function KonzernDashboard() {
  return <KonzernDashboardClient />;
}
