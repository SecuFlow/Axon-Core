"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { PublicHeader } from "@/components/PublicHeader";

type FormState = {
  company: string;
  market_segment: string;
  employees: string;
  revenue_eur: string;
  hq_location: string;
  contact_name: string;
  contact_role: string;
  email: string;
  phone: string;
  message: string;
};

function isLikelyThrowawayEmail(email: string): boolean {
  const s = email.trim().toLowerCase();
  if (!s.includes("@")) return true;
  const domain = s.split("@").pop() ?? "";
  if (!domain) return true;
  return [
    "mailinator.com",
    "10minutemail.com",
    "guerrillamail.com",
    "tempmail.com",
    "yopmail.com",
  ].some((d) => domain === d || domain.endsWith(`.${d}`));
}

function isValidEmail(email: string): boolean {
  const s = email.trim();
  if (!s.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function DemoAnfordernInner() {
  const sp = useSearchParams();
  const [form, setForm] = useState<FormState>({
    company: "",
    market_segment: "",
    employees: "",
    revenue_eur: "",
    hq_location: "",
    contact_name: "",
    contact_role: "",
    email: "",
    phone: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const company = (sp.get("company") ?? "").trim();
    const segment = (sp.get("market_segment") ?? "").trim();
    if (!company && !segment) return;
    setForm((s) => ({
      ...s,
      company: s.company.trim() ? s.company : company,
      market_segment: s.market_segment.trim() ? s.market_segment : segment,
    }));
  }, [sp]);

  const enterpriseOk = useMemo(() => {
    const employees = Number(form.employees.trim());
    const revenue = Number(form.revenue_eur.trim());
    return (
      form.company.trim().length > 1 &&
      form.market_segment.trim().length > 0 &&
      Number.isFinite(employees) &&
      employees >= 250 &&
      Number.isFinite(revenue) &&
      revenue >= 50_000_000 &&
      form.hq_location.trim().length > 6 &&
      form.contact_name.trim().length > 2 &&
      isValidEmail(form.email) &&
      !isLikelyThrowawayEmail(form.email)
    );
  }, [form]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setOk(null);
    setErr(null);
    try {
      const resp = await fetch("/api/lead/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: form.company.trim(),
          market_segment: form.market_segment.trim(),
          employee_count: Number(form.employees.trim()),
          revenue_eur: Number(form.revenue_eur.trim()),
          hq_location: form.hq_location.trim(),
          contact_name: form.contact_name.trim(),
          contact_role: form.contact_role.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          message: form.message.trim(),
        }),
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setErr(p.error ?? "Anfrage konnte nicht gesendet werden.");
        return;
      }
      setOk("Demo-Anfrage wurde erfasst. Wir melden uns zeitnah zurück.");
      setForm({
        company: "",
        market_segment: "",
        employees: "",
        revenue_eur: "",
        hq_location: "",
        contact_name: "",
        contact_role: "",
        email: "",
        phone: "",
        message: "",
      });
    } catch {
      setErr("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "mt-1 w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#D4AF37]/55";
  const label =
    "block text-xs font-semibold uppercase tracking-[0.2em] text-white/55";

  return (
    <div className="relative min-h-screen bg-[#030304] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-90"
        aria-hidden
      >
        <div className="absolute -left-1/4 top-0 h-[42rem] w-[42rem] rounded-full bg-[#D4AF37]/[0.06] blur-[120px]" />
        <div className="absolute -right-1/4 top-1/3 h-[36rem] w-[36rem] rounded-full bg-[#00D1FF]/[0.05] blur-[100px]" />
      </div>

      <PublicHeader variant="simple" />

      <main className="mx-auto max-w-6xl px-6 py-14 sm:px-8 sm:py-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/[0.08] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
            <ShieldCheck className="size-3.5" aria-hidden />
            Enterprise Qualification
          </div>
          <h1 className="mt-6 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Demo anfordern
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-zinc-300 sm:text-lg">
            Für Konzerne mit mehreren Standorten und messbarem Knowledge-Drain. Wir
            melden uns mit einem präzisen Demo-Fahrplan.
          </p>

          {(sp.get("company") || sp.get("market_segment")) && !ok ? (
            <div className="mt-6 rounded-2xl border border-white/[0.10] bg-white/[0.03] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
                Vorausgefüllt
              </p>
              <p className="mt-2 text-sm text-zinc-300">
                Wir haben die Basisdaten bereits übernommen. Bitte ergänze die
                restlichen Angaben.
              </p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${
                enterpriseOk
                  ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]"
                  : "border-white/[0.10] bg-white/[0.03] text-white/55"
              }`}
            >
              <ShieldCheck className="size-4" aria-hidden />
              {enterpriseOk ? "Verified Entity" : "Enterprise Check"}
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
              DSGVO · Daten-Souveränität · Enterprise Support
            </span>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-10 grid gap-8 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-10 lg:grid-cols-2"
        >
          <div className="space-y-5">
            <div>
              <label className={label} htmlFor="company">
                Konzern
              </label>
              <input
                id="company"
                className={input}
                value={form.company}
                onChange={(e) => setForm((s) => ({ ...s, company: e.target.value }))}
                placeholder="z. B. Muster Industrie AG"
                required
              />
            </div>

            <div>
              <label className={label} htmlFor="segment">
                Marktsegment
              </label>
              <select
                id="segment"
                className={input}
                value={form.market_segment}
                onChange={(e) =>
                  setForm((s) => ({ ...s, market_segment: e.target.value }))
                }
                required
              >
                <option value="">— auswählen —</option>
                <option value="Enterprise">Enterprise</option>
                <option value="Industry / Manufacturing">Industry / Manufacturing</option>
                <option value="Energy">Energy</option>
                <option value="Logistics">Logistics</option>
                <option value="Other (Enterprise)">Other (Enterprise)</option>
              </select>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="employees">
                  Mitarbeiterzahl
                </label>
                <input
                  id="employees"
                  className={input}
                  inputMode="numeric"
                  value={form.employees}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, employees: e.target.value }))
                  }
                  placeholder="z. B. 1200"
                  required
                />
              </div>
              <div>
                <label className={label} htmlFor="revenue">
                  Umsatz (EUR/Jahr)
                </label>
                <input
                  id="revenue"
                  className={input}
                  inputMode="numeric"
                  value={form.revenue_eur}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, revenue_eur: e.target.value }))
                  }
                  placeholder="z. B. 250000000"
                  required
                />
              </div>
            </div>

            <div>
              <label className={label} htmlFor="hq">
                HQ-Location
              </label>
              <textarea
                id="hq"
                className={input}
                rows={3}
                value={form.hq_location}
                onChange={(e) =>
                  setForm((s) => ({ ...s, hq_location: e.target.value }))
                }
                placeholder="Straße, PLZ Ort, Land"
                required
              />
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className={label} htmlFor="contact">
                Ansprechpartner
              </label>
              <input
                id="contact"
                className={input}
                value={form.contact_name}
                onChange={(e) =>
                  setForm((s) => ({ ...s, contact_name: e.target.value }))
                }
                placeholder="Vor- & Nachname"
                required
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="role">
                  Rolle
                </label>
                <input
                  id="role"
                  className={input}
                  value={form.contact_role}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, contact_role: e.target.value }))
                  }
                  placeholder="z. B. COO, Head of Operations"
                />
              </div>
              <div>
                <label className={label} htmlFor="phone">
                  Telefon
                </label>
                <input
                  id="phone"
                  className={input}
                  value={form.phone}
                  onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                  placeholder="+49 …"
                />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="email">
                E-Mail
              </label>
              <input
                id="email"
                className={input}
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                placeholder="name@unternehmen.de"
                required
              />
              <p className="mt-2 text-xs text-white/40">
                Wegwerf-E-Mails werden abgelehnt.
              </p>
            </div>
            <div>
              <label className={label} htmlFor="msg">
                Kurzbeschreibung (optional)
              </label>
              <textarea
                id="msg"
                className={input}
                rows={4}
                value={form.message}
                onChange={(e) =>
                  setForm((s) => ({ ...s, message: e.target.value }))
                }
                placeholder="Kontext: Standorte, Maschinen, Wissensverlust, Zielbild…"
              />
            </div>

            {err ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {err}
              </div>
            ) : null}
            {ok ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {ok}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[#D4AF37]/55 bg-[#D4AF37] px-8 text-sm font-semibold text-[#030304] shadow-[0_0_38px_-10px_rgba(212,175,55,0.55)] transition hover:bg-[#e2c56c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Wird gesendet…" : "Demo anfordern"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function DemoAnfordernPage() {
  return (
    <Suspense fallback={null}>
      <DemoAnfordernInner />
    </Suspense>
  );
}

