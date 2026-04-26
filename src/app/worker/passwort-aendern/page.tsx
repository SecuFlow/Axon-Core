"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function WorkerPasswordChangePage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Die neuen Passwörter stimmen nicht überein.");
      return;
    }

    setPending(true);
    try {
      const resp = await fetch("/api/worker/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(payload.error ?? "Passwort konnte nicht geändert werden.");
        return;
      }
      router.push("/worker/dashboard");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-56px)] items-center justify-center px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-black/30 p-7">
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
          Passwort beim Erstlogin ändern
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Dieses Konto wurde durch den Manager angelegt. Bitte vergib jetzt ein
          eigenes Passwort.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <input
            type="password"
            required
            minLength={8}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Aktuelles Passwort"
            className="w-full rounded-lg border border-white/[0.12] bg-[#0b0b0d] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-[color:var(--brand-primary,#00d1ff)]/60"
          />
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Neues Passwort"
            className="w-full rounded-lg border border-white/[0.12] bg-[#0b0b0d] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-[color:var(--brand-primary,#00d1ff)]/60"
          />
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Neues Passwort wiederholen"
            className="w-full rounded-lg border border-white/[0.12] bg-[#0b0b0d] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-[color:var(--brand-primary,#00d1ff)]/60"
          />

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[color:var(--brand-primary,#00d1ff)] bg-[color:var(--brand-primary,#00d1ff)] px-6 text-sm font-semibold text-black transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Speichern..." : "Passwort speichern"}
          </button>
        </form>
      </section>
    </main>
  );
}
