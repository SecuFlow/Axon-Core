import { Suspense } from "react";
import { RegisterContent } from "./RegisterContent";

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-black px-6 text-zinc-500">
          Lädt…
        </main>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
