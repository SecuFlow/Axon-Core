"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bot, Loader2, Lock, Upload } from "lucide-react";

type CoinTx = {
  id: string;
  amount_axn: number;
  type: string | null;
  created_at: string | null;
};

type CoinContext = {
  isPrivate: boolean;
  balance_axn: number;
  heilwissenUnlocked: boolean;
  transactions: CoinTx[];
};

function generateStableEurSeries() {
  const pts: { label: string; eur: number }[] = [];
  for (let i = 0; i < 48; i++) {
    const noise =
      Math.sin(i * 0.35) * 0.006 +
      Math.sin(i * 0.11 + 1.2) * 0.003 +
      Math.cos(i * 0.07) * 0.002;
    pts.push({
      label: `${String(i % 24).padStart(2, "0")}:00`,
      eur: Math.round((1 + noise) * 10000) / 10000,
    });
  }
  return pts;
}

function formatAxn(n: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type Props = {
  /** Standalone = Coin-Space (heller Rahmen wie Landing); dashboard = nur Inhalt */
  variant?: "standalone" | "dashboard";
};

export function AxnCoinView({ variant = "dashboard" }: Props) {
  const [ctx, setCtx] = useState<CoinContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [healingText, setHealingText] = useState("");
  const [healingStatus, setHealingStatus] = useState<string | null>(null);
  const [healingBusy, setHealingBusy] = useState(false);
  const [chartReady, setChartReady] = useState(false);

  const chartData = useMemo(() => generateStableEurSeries(), []);

  const loadContext = useCallback(async () => {
    setLoadingCtx(true);
    setCtxError(null);
    try {
      const resp = await fetch("/api/coin/context", { credentials: "include" });
      const payload = (await resp.json()) as CoinContext & { error?: string };
      if (!resp.ok) {
        setCtxError(payload.error ?? "Kontext konnte nicht geladen werden.");
        setCtx(null);
        return;
      }
      setCtx({
        isPrivate: payload.isPrivate,
        balance_axn: payload.balance_axn,
        heilwissenUnlocked: payload.heilwissenUnlocked,
        transactions: Array.isArray(payload.transactions)
          ? payload.transactions
          : [],
      });
    } finally {
      setLoadingCtx(false);
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    setChartReady(true);
  }, []);

  const submitHealing = async () => {
    if (!ctx?.heilwissenUnlocked) return;
    const t = healingText.trim();
    if (!t) return;
    setHealingBusy(true);
    setHealingStatus(null);
    try {
      const resp = await fetch("/api/coin/healing-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: t }),
      });
      const payload = (await resp.json()) as { error?: string; ok?: boolean };
      if (!resp.ok) {
        setHealingStatus(payload.error ?? "Upload fehlgeschlagen.");
        return;
      }
      setHealingStatus("Wissen wurde gespeichert.");
      setHealingText("");
      void loadContext();
    } finally {
      setHealingBusy(false);
    }
  };

  const inner = (
    <>
      <div className="text-center">
        <p className="font-[family-name:var(--font-syne)] text-4xl font-black tracking-tight text-white sm:text-5xl">
          1 AXN = 1,00 €
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Referenzkurs (Stabilitäts-Band um die 1 €-Marke)
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        {loadingCtx ? (
          <div className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lade Konto…
          </div>
        ) : null}
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/45 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 shadow-[0_0_24px_rgba(34,197,94,0.2)]">
          <Bot className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
          Stabilitäts-Bot aktiv
        </div>
        {ctx ? (
          <>
            <div className="rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-300">
              Kontostand:{" "}
              <span className="font-bold text-yellow-400">
                {formatAxn(ctx.balance_axn)} AXN
              </span>
            </div>
            {!ctx.isPrivate ? (
              <div className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200">
                Konzern: Heilwissen durch Maschinen gedeckt
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-8 min-h-72 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
          AXN-Kurs (€) — linear
        </p>
        {chartReady ? (
          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  interval={7}
                  stroke="#334155"
                />
                <YAxis
                  domain={[0.985, 1.015]}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  stroke="#334155"
                  tickFormatter={(v) => `${Number(v).toFixed(3)} €`}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                  }}
                  labelStyle={{ color: "#cbd5e1" }}
                  formatter={(value) => [
                    `${Number(value ?? 0).toFixed(4)} €`,
                    "Kurs",
                  ]}
                />
                <ReferenceLine
                  y={1}
                  stroke="#22c55e"
                  strokeDasharray="6 4"
                  label={{
                    value: "1,00 €",
                    fill: "#4ade80",
                    fontSize: 11,
                    position: "insideTopRight",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="eur"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[260px] items-center justify-center text-sm text-slate-500">
            Diagramm wird geladen…
          </div>
        )}
      </div>

      {ctx && ctx.transactions.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
            Letzte Transaktionen
          </h2>
          <ul className="mt-4 divide-y divide-slate-800">
            {ctx.transactions.map((tx) => (
              <li
                key={tx.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span className="text-slate-400">
                  {tx.created_at
                    ? new Date(tx.created_at).toLocaleString("de-DE", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                  {tx.type ? (
                    <span className="ml-2 text-slate-500">({tx.type})</span>
                  ) : null}
                </span>
                <span
                  className={
                    tx.amount_axn >= 0
                      ? "font-semibold text-emerald-300"
                      : "font-semibold text-rose-300"
                  }
                >
                  {tx.amount_axn >= 0 ? "+" : ""}
                  {formatAxn(tx.amount_axn)} AXN
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="relative mt-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Heilwissen</h2>
            <p className="mt-1 text-sm text-slate-400">
              Wissen hochladen (Kategorie Heilwissen in der Wissensbasis).
            </p>
          </div>
          {ctx && !ctx.heilwissenUnlocked ? (
            <Lock className="h-6 w-6 shrink-0 text-amber-400" aria-label="Gesperrt" />
          ) : null}
        </div>

        <div className="relative mt-4">
          <textarea
            value={healingText}
            onChange={(e) => setHealingText(e.target.value)}
            disabled={
              loadingCtx || !ctx?.heilwissenUnlocked || healingBusy
            }
            placeholder={
              ctx?.heilwissenUnlocked
                ? "Text eingeben und hochladen…"
                : "Als Privatperson ab AXN-Guthaben > 0 freigeschaltet."
            }
            rows={5}
            className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50"
          />

          {ctx && !ctx.heilwissenUnlocked ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-[#030304]/75 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-2 text-center text-slate-300">
                <Lock className="h-10 w-10 text-amber-400/90" />
                <p className="max-w-sm text-sm">
                  {ctx.isPrivate
                    ? "Freischaltung wenn dein AXN-Guthaben über 0 liegt."
                    : "Bereich gesperrt."}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void submitHealing()}
          disabled={
            loadingCtx ||
            !ctx?.heilwissenUnlocked ||
            healingBusy ||
            !healingText.trim()
          }
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-6 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {healingBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Wissen hochladen
        </button>
        {healingStatus ? (
          <p className="mt-3 text-sm text-slate-400">{healingStatus}</p>
        ) : null}
      </section>

      {ctxError ? (
        <p className="mt-6 text-center text-sm text-amber-300">{ctxError}</p>
      ) : null}
    </>
  );

  if (variant === "standalone") {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#00D1FF]">
          Axon Coin Space
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold text-white sm:text-3xl">
          AXN-Coin
        </h1>
        <div className="mt-8 space-y-0">{inner}</div>
      </div>
    );
  }

  return <div className="space-y-0">{inner}</div>;
}
