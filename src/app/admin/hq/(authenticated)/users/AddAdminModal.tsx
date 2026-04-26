"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { createAdminUserAction } from "./actions";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function AddAdminModal({ open, onClose, onCreated }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setError(null);
    setPending(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await createAdminUserAction({
        firstName,
        lastName,
        email,
        password,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      onCreated();
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) handleClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-admin-title"
      >
        <div className="flex items-center justify-between border-b border-[#1f1f1f] px-5 py-4">
          <h2
            id="add-admin-title"
            className="font-mono text-sm font-medium uppercase tracking-[0.14em] text-[#c4c4c4]"
          >
            Neuen Admin hinzufügen
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-[#6b6b6b] transition hover:bg-[#1a1a1a] hover:text-[#c4c4c4]"
            aria-label="Schließen"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="add-admin-first"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]"
                >
                  Vorname
                </label>
                <input
                  id="add-admin-first"
                  name="firstName"
                  type="text"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-sm text-[#d4d4d4] outline-none focus:border-[#c9a962]/50"
                />
              </div>
              <div>
                <label
                  htmlFor="add-admin-last"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]"
                >
                  Nachname
                </label>
                <input
                  id="add-admin-last"
                  name="lastName"
                  type="text"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-sm text-[#d4d4d4] outline-none focus:border-[#c9a962]/50"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="add-admin-email"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]"
              >
                E-Mail
              </label>
              <input
                id="add-admin-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-sm text-[#d4d4d4] outline-none focus:border-[#c9a962]/50"
              />
            </div>

            <div>
              <label
                htmlFor="add-admin-password"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]"
              >
                Temporäres Passwort
              </label>
              <input
                id="add-admin-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-sm text-[#d4d4d4] outline-none focus:border-[#c9a962]/50"
              />
              <p className="mt-1 font-mono text-[9px] text-[#4a4a4a]">
                Mindestens 8 Zeichen. Der Nutzer soll es nach dem ersten Login
                ändern.
              </p>
            </div>
          </div>

          {error ? (
            <p className="mt-4 text-sm text-[#c8c8c8]">{error}</p>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={pending}
              className="rounded border border-[#2a2a2a] bg-[#111] px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-[#8a8a8a] transition hover:border-[#3a3a3a] disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded border border-[#c9a962]/40 bg-[#c9a962]/15 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-[#d4c896] transition hover:bg-[#c9a962]/25 disabled:opacity-50"
            >
              {pending ? "…" : "Admin anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
