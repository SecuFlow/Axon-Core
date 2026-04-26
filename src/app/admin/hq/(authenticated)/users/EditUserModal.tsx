"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";

export type AdminRoleUi = "mitarbeiter" | "manager" | "admin";

export type EditableUser = {
  id: string;
  email: string;
  name: string | null;
  role: AdminRoleUi;
  is_subscribed: boolean;
};

type Props = {
  user: EditableUser | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function EditUserModal({ user, open, onClose, onSaved }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [role, setRole] = useState<AdminRoleUi>("mitarbeiter");
  const [initialEmail, setInitialEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loginConfirmOpen, setLoginConfirmOpen] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    setEmail(user.email);
    setInitialEmail(user.email);
    setPassword("");
    setIsSubscribed(user.is_subscribed);
    setRole(user.role);
    setError(null);
    setLoginConfirmOpen(false);
  }, [user, open]);

  if (!open || !user) return null;

  const loginDataWillChange =
    email.trim() !== initialEmail.trim() || password.length > 0;

  async function submitPatch() {
    const target = user;
    if (!target) return;

    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        email: email.trim(),
        is_subscribed: role === "manager" ? true : isSubscribed,
        role,
      };
      if (password.length > 0) {
        body.password = password;
      }

      const resp = await fetch(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload: { error?: string } = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(payload.error ?? "Speichern fehlgeschlagen");
        return;
      }

      setPassword("");
      setInitialEmail(email.trim());
      setLoginConfirmOpen(false);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loginDataWillChange) {
      setLoginConfirmOpen(true);
      return;
    }
    void submitPatch();
  }

  function handleConfirmLoginChange() {
    void submitPatch();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
      >
        <div className="flex items-center justify-between border-b border-[#1f1f1f] px-5 py-4">
          <h2
            id="edit-user-title"
            className="font-mono text-sm font-medium uppercase tracking-[0.14em] text-[#c4c4c4]"
          >
            Nutzer bearbeiten
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#6b6b6b] transition hover:bg-[#1a1a1a] hover:text-[#c4c4c4]"
            aria-label="Schließen"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>

        {loginConfirmOpen ? (
          <div className="px-5 py-6">
            <p className="text-sm leading-relaxed text-[#a8a8a8]">
              Bist du sicher, dass du die Logindaten dieses Nutzers ändern
              möchtest?
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setLoginConfirmOpen(false)}
                disabled={saving}
                className="rounded border border-[#2a2a2a] bg-[#111] px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-[#8a8a8a] transition hover:border-[#3a3a3a] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleConfirmLoginChange}
                disabled={saving}
                className="rounded border border-[#c9a962]/40 bg-[#c9a962]/15 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-[#d4c896] transition hover:bg-[#c9a962]/25 disabled:opacity-50"
              >
                {saving ? "…" : "Ja, ändern"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-5">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="edit-email"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]"
                >
                  E-Mail
                </label>
                <input
                  id="edit-email"
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-sm text-[#d4d4d4] outline-none focus:border-[#c9a962]/50"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-password"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]"
                >
                  Neues Passwort vergeben
                </label>
                <input
                  id="edit-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leer lassen = unverändert"
                  className="w-full rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-sm text-[#d4d4d4] outline-none focus:border-[#c9a962]/50"
                />
                <p className="mt-1 font-mono text-[9px] text-[#4a4a4a]">
                  Mindestens 8 Zeichen, falls gesetzt
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8a8a8a]">
                  Abo aktiv (is_subscribed)
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isSubscribed}
                  onClick={() => {
                    if (role === "manager") return;
                    setIsSubscribed((v) => !v);
                  }}
                  disabled={role === "manager"}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    isSubscribed ? "bg-[#c9a962]/40" : "bg-[#2a2a2a]"
                  } ${role === "manager" ? "opacity-60" : ""}`}
                >
                  <span
                    className={`absolute top-1 size-5 rounded-full bg-[#d4d4d4] transition-transform ${
                      isSubscribed ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div>
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a]">
                  Rolle
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-xs has-[:checked]:border-[#c9a962]/50 has-[:checked]:bg-[#c9a962]/10">
                    <input
                      type="radio"
                      name="role"
                      value="mitarbeiter"
                      checked={role === "mitarbeiter"}
                      onChange={() => setRole("mitarbeiter")}
                      className="sr-only"
                    />
                    Mitarbeiter
                  </label>
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-xs has-[:checked]:border-[#c9a962]/50 has-[:checked]:bg-[#c9a962]/10">
                    <input
                      type="radio"
                      name="role"
                      value="manager"
                      checked={role === "manager"}
                      onChange={() => {
                        setRole("manager");
                        setIsSubscribed(true);
                      }}
                      className="sr-only"
                    />
                    Manager
                  </label>
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-xs has-[:checked]:border-[#c9a962]/50 has-[:checked]:bg-[#c9a962]/10">
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={role === "admin"}
                      onChange={() => setRole("admin")}
                      className="sr-only"
                    />
                    Admin
                  </label>
                </div>
                <p className="mt-1 font-mono text-[9px] text-[#4a4a4a]">
                  Manager ist fest mit aktivem Stripe-Abo verknüpft.
                </p>
              </div>
            </div>

            {error ? (
              <p className="mt-4 text-sm text-[#c8c8c8]">{error}</p>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded border border-[#2a2a2a] bg-[#111] px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-[#8a8a8a] transition hover:border-[#3a3a3a] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded border border-[#c9a962]/40 bg-[#c9a962]/15 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-[#d4c896] transition hover:bg-[#c9a962]/25 disabled:opacity-50"
              >
                {saving ? "…" : "Speichern"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
