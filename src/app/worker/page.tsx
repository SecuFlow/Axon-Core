import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** `/worker` → `/worker/dashboard` (Demo-Query bleibt erhalten). */
export default async function WorkerIndexPage({ searchParams }: Props) {
  const q = await searchParams;
  const raw = q.demo;
  const demo =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw[0]
        : undefined;
  const d = typeof demo === "string" ? demo.trim() : "";
  if (d) {
    redirect(`/worker/dashboard?demo=${encodeURIComponent(d)}`);
  }
  redirect("/worker/dashboard");
}
