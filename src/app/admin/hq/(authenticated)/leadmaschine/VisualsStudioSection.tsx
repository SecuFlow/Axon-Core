"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  ClipboardCopy,
  Download,
  Loader2,
  Mic,
  Camera,
  Palette,
  Shuffle,
} from "lucide-react";
import {
  ACCENT_PRESETS,
  TEMPLATE_META,
  type TemplateKey,
  type VisualBundle,
  generateBundleForTemplate,
} from "./visualsContentPool";

function safeFileName(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "visual"
  );
}

function hexToRgba(hex: string, alpha = 1): string {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return `rgba(0,209,255,${alpha})`;
  const num = Number.parseInt(m[1], 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

const WORKER_BG = "#030304";
const WORKER_PANEL_BORDER = "rgba(255,255,255,0.10)";
const DASH_BG = "#0b1220";
const DASH_PANEL = "#0f172a";
const DASH_LINE = "rgba(148,163,184,0.12)";

/* ───────────────────────── TEMPLATE 1: iPhone Worker-App ───────────────────────── */

function IphoneWorkerTemplate({ bundle }: { bundle: VisualBundle }) {
  const { accent, badge, headline, subline, worker } = bundle;
  const stepName =
    worker.step === "machine"
      ? "Maschine / Seriennummer"
      : worker.step === "issue"
        ? "Problem beschreiben"
        : "Foto";

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        background: `radial-gradient(circle at 22% 14%, ${hexToRgba(accent, 0.22)} 0%, rgba(3,3,4,0) 55%), linear-gradient(160deg, #03050a 0%, #0a1020 60%, #03050a 100%)`,
        color: "#e8edf6",
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--font-syne), 'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          opacity: 0.55,
        }}
      />
      <div style={{ position: "relative", padding: "80px 90px", maxWidth: 760 }}>
        <div
          style={{
            display: "inline-block",
            padding: "10px 22px",
            borderRadius: 999,
            border: `1px solid ${hexToRgba(accent, 0.55)}`,
            background: hexToRgba(accent, 0.12),
            color: accent,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {badge}
        </div>
        <h1
          style={{
            marginTop: 36,
            fontSize: 78,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          {headline}
        </h1>
        <p
          style={{
            marginTop: 28,
            fontSize: 28,
            lineHeight: 1.45,
            color: "rgba(232,237,246,0.72)",
          }}
        >
          {subline}
        </p>
      </div>

      {/* iPhone-Frame mit echter Worker-App-Optik */}
      <div
        style={{
          position: "absolute",
          right: -40,
          bottom: -100,
          width: 700,
          height: 1380,
          transform: "rotate(-7deg)",
        }}
      >
        {/* Phone Body */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 96,
            background: "linear-gradient(150deg, #1c1f2a 0%, #050608 100%)",
            boxShadow: `0 60px 160px ${hexToRgba(accent, 0.35)}, inset 0 0 0 6px rgba(255,255,255,0.06)`,
          }}
        />
        {/* Screen */}
        <div
          style={{
            position: "absolute",
            inset: 28,
            borderRadius: 76,
            background: WORKER_BG,
            padding: "44px 36px 36px",
            display: "flex",
            flexDirection: "column",
            color: "#fafafa",
          }}
        >
          {/* Top bar mit Logo & DEMO-Badge wie im echten Worker */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `1px solid ${WORKER_PANEL_BORDER}`,
              paddingBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: accent,
                  boxShadow: `0 0 16px ${hexToRgba(accent, 0.55)}`,
                }}
              />
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>
                AXON
              </span>
            </div>
            <div
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                background: "rgba(244,63,94,0.16)",
                border: "1px solid rgba(244,63,94,0.45)",
                color: "#fda4af",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 1,
              }}
            >
              LIVE
            </div>
          </div>

          <h2 style={{ marginTop: 28, fontSize: 36, fontWeight: 700 }}>
            Bericht aufnehmen
          </h2>

          {/* Schritt-Indikator (echtes UI) */}
          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              fontSize: 20,
              color: "rgba(232,237,246,0.6)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "6px 16px",
                borderRadius: 999,
                border: `1px solid ${accent}`,
                color: "#f1f5f9",
                background: hexToRgba(accent, 0.12),
                fontSize: 18,
              }}
            >
              Schritt {worker.stepIndex} von 3
            </span>
            <span>{stepName}</span>
          </div>

          {/* Maschine + Problem als Felder, wie sie in der App erscheinen */}
          <div style={{ marginTop: 24 }}>
            <div
              style={{
                fontSize: 18,
                color: "rgba(232,237,246,0.6)",
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              Maschine
            </div>
            <div
              style={{
                marginTop: 8,
                padding: "18px 20px",
                borderRadius: 18,
                border: `1px solid ${WORKER_PANEL_BORDER}`,
                background: "rgba(255,255,255,0.04)",
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              {worker.machine}
            </div>

            <div
              style={{
                marginTop: 18,
                fontSize: 18,
                color: "rgba(232,237,246,0.6)",
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              Problem
            </div>
            <div
              style={{
                marginTop: 8,
                padding: "18px 20px",
                borderRadius: 18,
                border: `1px solid ${WORKER_PANEL_BORDER}`,
                background: "rgba(255,255,255,0.04)",
                fontSize: 22,
                color: "rgba(232,237,246,0.78)",
                lineHeight: 1.35,
              }}
            >
              {worker.issue}
            </div>
          </div>

          {/* Aktions-Buttons: roter Mikro-Button + Brand-Foto-Button */}
          <div
            style={{
              marginTop: 36,
              display: "flex",
              gap: 24,
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 168,
                height: 168,
                borderRadius: 999,
                background: "rgba(220,38,38,0.32)",
                border: "2px solid rgba(252,165,165,0.7)",
                boxShadow: "0 0 60px rgba(220,38,38,0.55)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#fecaca",
                fontWeight: 700,
                gap: 8,
                textAlign: "center",
                padding: 8,
              }}
            >
              <Mic size={48} strokeWidth={1.8} />
              <span style={{ fontSize: 14, lineHeight: 1.2 }}>
                Halt mich gedrückt
                <br /> &amp; sprich
              </span>
            </div>
            <div
              style={{
                width: 168,
                height: 168,
                borderRadius: 999,
                background: hexToRgba(accent, 0.16),
                border: `2px solid ${hexToRgba(accent, 0.65)}`,
                boxShadow: `0 0 60px ${hexToRgba(accent, 0.45)}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#e0f2fe",
                fontWeight: 700,
                gap: 8,
                textAlign: "center",
                padding: 8,
              }}
            >
              <Camera size={48} strokeWidth={1.8} />
              <span style={{ fontSize: 14, lineHeight: 1.2 }}>
                Foto
                <br />
                (Schritt 3)
              </span>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Großer roter Send-Button — wie im echten UI */}
          <div
            style={{
              marginTop: 30,
              padding: "20px 24px",
              borderRadius: 999,
              background: "#991b1b",
              border: "1px solid #ef4444",
              boxShadow: "0 0 38px rgba(239,68,68,0.55)",
              color: "#fee2e2",
              fontWeight: 700,
              fontSize: 24,
              textAlign: "center",
              letterSpacing: 0.5,
            }}
          >
            Bericht abschließen &amp; speichern
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 90,
          bottom: 80,
          display: "flex",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            background: accent,
            boxShadow: `0 0 20px ${hexToRgba(accent, 0.8)}`,
          }}
        />
        <span style={{ fontSize: 26, letterSpacing: 4, color: "#aab2c4" }}>
          AXON · CORE
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────── TEMPLATE 2: Konzern-Dashboard ───────────────────────── */

function BrowserKonzernTemplate({ bundle }: { bundle: VisualBundle }) {
  const { accent, badge, headline, subline, dashboard } = bundle;

  function statusColor(s: "aktiv" | "wartung" | "offline"): string {
    if (s === "aktiv") return "#10B981";
    if (s === "wartung") return "#F59E0B";
    return "#F43F5E";
  }
  function statusLabel(s: "aktiv" | "wartung" | "offline"): string {
    if (s === "aktiv") return "Aktiv";
    if (s === "wartung") return "Wartung";
    return "Offline";
  }

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        background: `radial-gradient(circle at 80% 20%, ${hexToRgba(accent, 0.2)} 0%, rgba(3,5,10,0) 60%), linear-gradient(160deg, #03050a 0%, ${DASH_BG} 100%)`,
        color: "#e2e8f0",
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--font-syne), 'Inter', system-ui, sans-serif",
      }}
    >
      <div style={{ padding: "70px 80px 30px" }}>
        <div
          style={{
            display: "inline-block",
            padding: "10px 22px",
            borderRadius: 999,
            border: `1px solid ${hexToRgba(accent, 0.55)}`,
            background: hexToRgba(accent, 0.12),
            color: accent,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {badge}
        </div>
        <h1
          style={{
            marginTop: 28,
            fontSize: 64,
            lineHeight: 1.05,
            fontWeight: 700,
            maxWidth: 900,
            letterSpacing: -1,
          }}
        >
          {headline}
        </h1>
        <p
          style={{
            marginTop: 18,
            fontSize: 24,
            lineHeight: 1.4,
            color: "rgba(226,232,240,0.7)",
            maxWidth: 900,
          }}
        >
          {subline}
        </p>
      </div>

      {/* Browser Chrome + Inhalt */}
      <div
        style={{
          margin: "0 80px 80px",
          borderRadius: 28,
          overflow: "hidden",
          border: `1px solid ${DASH_LINE}`,
          background: "linear-gradient(180deg, #0d172b 0%, #060912 100%)",
          boxShadow: `0 60px 140px ${hexToRgba(accent, 0.25)}`,
        }}
      >
        {/* Tab-Bar / Browser */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "18px 24px",
            background: "#0a1020",
            borderBottom: `1px solid ${DASH_LINE}`,
          }}
        >
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#F43F5E" }} />
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#F59E0B" }} />
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#10B981" }} />
          <div style={{ marginLeft: 18, fontSize: 16, color: "#7e879a" }}>
            axon-core.de / dashboard / konzern
          </div>
        </div>

        <div style={{ padding: 32 }}>
          {/* KPIs: Gesichertes Wissen + Aktive Experten — wie im echten Dashboard */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              marginBottom: 26,
            }}
          >
            <div
              style={{
                padding: 22,
                borderRadius: 22,
                background: hexToRgba(accent, 0.07),
                border: `1px solid ${hexToRgba(accent, 0.35)}`,
                boxShadow: `0 0 44px -14px rgba(0,0,0,0.4)`,
              }}
            >
              <div style={{ fontSize: 16, color: "rgba(226,232,240,0.7)" }}>
                Gesichertes Wissen
              </div>
              <div style={{ marginTop: 8, fontSize: 44, fontWeight: 800 }}>
                {dashboard.kpiSecured.toLocaleString("de-DE")}{" "}
                <span style={{ fontSize: 16, fontWeight: 400, color: accent }}>
                  Wissens-Einträge
                </span>
              </div>
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 10,
                  height: 80,
                }}
              >
                {[60, 78, 50, 92, 71, 85, 64].map((v, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${v}%`,
                      borderRadius: "8px 8px 0 0",
                      background: accent,
                      opacity: 0.85,
                    }}
                  />
                ))}
              </div>
            </div>
            <div
              style={{
                padding: 22,
                borderRadius: 22,
                background: "rgba(56,189,248,0.06)",
                border: "1px solid rgba(56,189,248,0.3)",
                boxShadow: "0 0 44px -14px rgba(56,189,248,0.38)",
              }}
            >
              <div style={{ fontSize: 16, color: "rgba(226,232,240,0.7)" }}>
                Aktive Experten
              </div>
              <div style={{ marginTop: 8, fontSize: 44, fontWeight: 800 }}>
                {dashboard.kpiExperts}{" "}
                <span style={{ fontSize: 16, fontWeight: 400, color: "#7dd3fc" }}>
                  eingeloggte Mitarbeiter
                </span>
              </div>
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 10,
                  height: 80,
                }}
              >
                {[40, 55, 70, 62, 88, 74, 80].map((v, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${v}%`,
                      borderRadius: "8px 8px 0 0",
                      background: "#3b82f6",
                      opacity: 0.85,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Letzte Aktivitäten — wie im Original */}
          <div
            style={{
              padding: 20,
              borderRadius: 20,
              border: `1px solid ${DASH_LINE}`,
              background: "rgba(15,23,42,0.6)",
              marginBottom: 22,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
              Letzte Aktivitäten
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {dashboard.activities.slice(0, 3).map((a, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom:
                      i < 2 ? `1px solid ${DASH_LINE}` : "none",
                    fontSize: 17,
                  }}
                >
                  <span style={{ color: "#64748b", fontSize: 14 }}>{a.time}</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{a.machine}</span>
                  <span style={{ color: "#64748b" }}>·</span>
                  <span style={{ color: "rgba(253,164,175,0.9)" }}>{a.error}</span>
                  <span style={{ color: "#475569" }}>→</span>
                  <span style={{ color: "rgba(110,231,183,0.92)" }}>{a.solution}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Maschinen-Inventar (3 Cards) */}
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
            Maschinen-Inventar
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14,
            }}
          >
            {dashboard.machines.slice(0, 3).map((m, i) => {
              const c = statusColor(m.status);
              return (
                <div
                  key={i}
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    border: `1px solid ${DASH_LINE}`,
                    background: DASH_PANEL,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#f1f5f9",
                        lineHeight: 1.15,
                      }}
                    >
                      {m.name}
                    </div>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: hexToRgba(c, 0.18),
                        color: c,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        border: `1px solid ${hexToRgba(c, 0.5)}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {statusLabel(m.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {m.location}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      color: "#475569",
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                    }}
                  >
                    Serial · {m.serial}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── TEMPLATE 3: Stats Hero ───────────────────────── */

function StatsHeroTemplate({ bundle }: { bundle: VisualBundle }) {
  const { accent, badge, headline, subline } = bundle;
  return (
    <div
      style={{
        width: 1080,
        height: 1080,
        background: `radial-gradient(circle at 50% 0%, ${hexToRgba(accent, 0.35)} 0%, rgba(0,0,0,0) 60%), linear-gradient(180deg, #03050a 0%, #0a1020 100%)`,
        color: "#e8edf6",
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--font-syne), 'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: "relative",
          padding: "100px 90px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "10px 22px",
            borderRadius: 999,
            border: `1px solid ${hexToRgba(accent, 0.55)}`,
            background: hexToRgba(accent, 0.12),
            color: accent,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
            width: "fit-content",
          }}
        >
          {badge}
        </div>
        <h1
          style={{
            marginTop: 32,
            fontSize: 96,
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          {headline}
        </h1>
        <p
          style={{
            marginTop: 28,
            fontSize: 30,
            lineHeight: 1.45,
            color: "rgba(232,237,246,0.78)",
            maxWidth: 880,
          }}
        >
          {subline}
        </p>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 22,
          }}
        >
          {[
            { value: "78 %", label: "schnellere Reaktion" },
            { value: "12 ×", label: "mehr Wartungsdaten" },
            { value: "0", label: "Excel-Templates" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: 26,
                borderRadius: 22,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 800,
                  color: accent,
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: 22, color: "#aab2c4", marginTop: 8 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              background: accent,
              boxShadow: `0 0 20px ${hexToRgba(accent, 0.8)}`,
            }}
          />
          <span style={{ fontSize: 28, letterSpacing: 4, color: "#aab2c4" }}>
            AXON · CORE
          </span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── TEMPLATE 4: Quote Card ───────────────────────── */

function QuoteCardTemplate({ bundle }: { bundle: VisualBundle }) {
  const { accent, badge, quote } = bundle;
  const initial =
    quote.person
      .split(/\s+/)
      .map((p) => p[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || "AX";

  return (
    <div
      style={{
        width: 1080,
        height: 1080,
        background: `radial-gradient(circle at 80% 20%, ${hexToRgba(accent, 0.25)} 0%, rgba(0,0,0,0) 60%), linear-gradient(160deg, #03050a 0%, #0a1020 100%)`,
        color: "#e8edf6",
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--font-syne), 'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          padding: "90px 100px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "10px 22px",
            borderRadius: 999,
            border: `1px solid ${hexToRgba(accent, 0.55)}`,
            background: hexToRgba(accent, 0.12),
            color: accent,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
            width: "fit-content",
          }}
        >
          {badge}
        </div>

        <div
          style={{
            marginTop: 36,
            fontSize: 130,
            color: hexToRgba(accent, 0.6),
            lineHeight: 0.8,
            fontWeight: 800,
          }}
        >
          “
        </div>
        <blockquote
          style={{
            margin: 0,
            marginTop: -28,
            fontSize: 54,
            lineHeight: 1.18,
            fontWeight: 600,
            color: "#f8fafc",
            maxWidth: 880,
          }}
        >
          {quote.text}
        </blockquote>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${hexToRgba(accent, 0.65)} 0%, rgba(255,255,255,0.06) 100%)`,
              border: `1px solid ${hexToRgba(accent, 0.5)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 800,
              color: "#04060d",
              letterSpacing: 1,
            }}
          >
            {initial}
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{quote.person}</div>
            <div style={{ fontSize: 20, color: "#aab2c4", marginTop: 4 }}>
              {quote.company}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── TEMPLATE 5: Feature Trio ───────────────────────── */

function FeatureTrioTemplate({ bundle }: { bundle: VisualBundle }) {
  const { accent, badge, headline, subline, featureTrio } = bundle;
  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        background: `radial-gradient(circle at 50% 0%, ${hexToRgba(accent, 0.25)} 0%, rgba(0,0,0,0) 55%), linear-gradient(180deg, #03050a 0%, #0a1020 100%)`,
        color: "#e8edf6",
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--font-syne), 'Inter', system-ui, sans-serif",
      }}
    >
      <div style={{ padding: "80px 90px" }}>
        <div
          style={{
            display: "inline-block",
            padding: "10px 22px",
            borderRadius: 999,
            border: `1px solid ${hexToRgba(accent, 0.55)}`,
            background: hexToRgba(accent, 0.12),
            color: accent,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {badge}
        </div>
        <h1
          style={{
            marginTop: 28,
            fontSize: 74,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: -1,
            maxWidth: 900,
          }}
        >
          {headline}
        </h1>
        <p
          style={{
            marginTop: 20,
            fontSize: 26,
            lineHeight: 1.45,
            color: "rgba(232,237,246,0.78)",
            maxWidth: 900,
          }}
        >
          {subline}
        </p>
      </div>

      <div
        style={{
          margin: "20px 90px 80px",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 22,
        }}
      >
        {featureTrio.map((f, i) => (
          <div
            key={i}
            style={{
              padding: 32,
              borderRadius: 24,
              border: `1px solid ${hexToRgba(accent, 0.3)}`,
              background: `linear-gradient(135deg, ${hexToRgba(accent, 0.08)} 0%, rgba(15,23,42,0.5) 100%)`,
              display: "flex",
              alignItems: "flex-start",
              gap: 24,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: hexToRgba(accent, 0.25),
                border: `1px solid ${hexToRgba(accent, 0.55)}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: accent,
                fontWeight: 800,
                fontSize: 30,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: "#f8fafc",
                  marginBottom: 6,
                }}
              >
                {f.title}
              </div>
              <div style={{ fontSize: 22, color: "#aab2c4", lineHeight: 1.4 }}>
                {f.body}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 90,
          bottom: 50,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: accent,
            boxShadow: `0 0 16px ${hexToRgba(accent, 0.8)}`,
          }}
        />
        <span style={{ fontSize: 24, letterSpacing: 4, color: "#aab2c4" }}>
          AXON · CORE
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────── Section ───────────────────────── */

function templateRatio(tpl: TemplateKey): { w: number; h: number } {
  if (tpl === "stats_hero" || tpl === "quote_card") return { w: 1080, h: 1080 };
  return { w: 1080, h: 1350 };
}

export function VisualsStudioSection() {
  const [tpl, setTpl] = useState<TemplateKey>("iphone_worker");
  const [bundle, setBundle] = useState<VisualBundle>(() =>
    generateBundleForTemplate("iphone_worker"),
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const onSelectTemplate = useCallback((next: TemplateKey) => {
    setTpl(next);
    setBundle(generateBundleForTemplate(next));
  }, []);

  const regenerate = useCallback(() => {
    setBundle(generateBundleForTemplate(tpl));
  }, [tpl]);

  const updateBundle = useCallback((patch: Partial<VisualBundle>) => {
    setBundle((b) => ({ ...b, ...patch }));
  }, []);

  const dims = useMemo(() => templateRatio(tpl), [tpl]);
  const previewScale = useMemo(() => {
    // 1080×1350 → ~345 wide; 1080×1080 → ~378 wide. Wir wollen ~min(360px) Vorschau.
    return 360 / dims.w;
  }, [dims.w]);

  const handleDownload = useCallback(async () => {
    if (!previewRef.current) return;
    setBusy(true);
    setStatus(null);
    try {
      const dataUrl = await toPng(previewRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#03050a",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `axon-${safeFileName(tpl)}-${safeFileName(bundle.headline)}.png`;
      a.click();
      setStatus("PNG heruntergeladen.");
    } catch (err) {
      setStatus(
        err instanceof Error
          ? `Konnte nicht exportieren: ${err.message}`
          : "Konnte nicht exportieren.",
      );
    } finally {
      setBusy(false);
      window.setTimeout(() => setStatus(null), 3000);
    }
  }, [tpl, bundle.headline]);

  const handleCopyCaption = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(bundle.caption);
      setStatus("Caption kopiert.");
      window.setTimeout(() => setStatus(null), 2000);
    } catch {
      setStatus("Konnte Caption nicht kopieren.");
      window.setTimeout(() => setStatus(null), 2500);
    }
  }, [bundle.caption]);

  const template = (() => {
    if (tpl === "iphone_worker") return <IphoneWorkerTemplate bundle={bundle} />;
    if (tpl === "browser_konzern") return <BrowserKonzernTemplate bundle={bundle} />;
    if (tpl === "stats_hero") return <StatsHeroTemplate bundle={bundle} />;
    if (tpl === "quote_card") return <QuoteCardTemplate bundle={bundle} />;
    return <FeatureTrioTemplate bundle={bundle} />;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#d4c896]">
            Visuals · Social Studio
          </h2>
          <p className="mt-1 max-w-3xl font-mono text-[10px] leading-relaxed text-[#6a6a6a]">
            Posting-Vorlagen mit echtem Produkt-Look — Worker-App und
            Konzern-Dashboard 1:1 nachgebildet. „Neu generieren" mischt
            Headlines, Captions, Maschinen-Daten und Akzentfarbe so lange, bis
            du die richtige Variante hast.
          </p>
        </div>
        <button
          type="button"
          onClick={regenerate}
          className="inline-flex items-center gap-2 self-start rounded-md border border-[#c9a962]/40 bg-[#c9a962]/[0.10] px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#e4d3a0] transition hover:border-[#c9a962]/60 hover:bg-[#c9a962]/[0.16]"
        >
          <Shuffle className="size-3.5" strokeWidth={1.8} aria-hidden />
          Neu generieren
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TEMPLATE_META.map((t) => {
          const active = tpl === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onSelectTemplate(t.key)}
              className={`rounded-md border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                active
                  ? "border-[#c9a962]/55 bg-[#c9a962]/[0.10] text-[#e4d3a0]"
                  : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
              }`}
            >
              <span className="block">{t.label}</span>
              <span className="mt-0.5 block font-mono text-[8px] normal-case tracking-[0.08em] text-[#6a6a6a]">
                {t.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="overflow-hidden rounded-md border border-[#1a1a1a] bg-[#070707] p-6">
          <div className="flex justify-center">
            <div
              style={{
                width: dims.w * previewScale,
                height: dims.h * previewScale,
                position: "relative",
              }}
            >
              <div
                ref={previewRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                }}
              >
                {template}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-[#9a9a9a]">
              Badge
            </label>
            <input
              type="text"
              value={bundle.badge}
              onChange={(e) => updateBundle({ badge: e.target.value })}
              maxLength={60}
              className="mt-1 w-full rounded-md border border-[#1f1f1f] bg-[#070707] px-3 py-2 font-mono text-[11px] text-[#e4e4e4] focus:border-[#c9a962]/55 focus:outline-none"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-[#9a9a9a]">
              Headline
            </label>
            <textarea
              value={bundle.headline}
              onChange={(e) => updateBundle({ headline: e.target.value })}
              rows={3}
              maxLength={140}
              className="mt-1 w-full resize-none rounded-md border border-[#1f1f1f] bg-[#070707] px-3 py-2 font-mono text-[11px] text-[#e4e4e4] focus:border-[#c9a962]/55 focus:outline-none"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-[#9a9a9a]">
              Subline
            </label>
            <textarea
              value={bundle.subline}
              onChange={(e) => updateBundle({ subline: e.target.value })}
              rows={4}
              maxLength={300}
              className="mt-1 w-full resize-none rounded-md border border-[#1f1f1f] bg-[#070707] px-3 py-2 font-mono text-[11px] text-[#cdd5e6] focus:border-[#c9a962]/55 focus:outline-none"
            />
          </div>
          {tpl === "quote_card" ? (
            <div className="space-y-3 rounded-md border border-[#1a1a1a] bg-[#0a0a0a] p-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
                Zitat — kommt aus dem Pool, „Neu generieren" würfelt eines:
              </div>
              <textarea
                value={bundle.quote.text}
                onChange={(e) =>
                  updateBundle({
                    quote: { ...bundle.quote, text: e.target.value },
                  })
                }
                rows={3}
                className="w-full resize-none rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[11px] text-[#cdd5e6] focus:border-[#c9a962]/55 focus:outline-none"
              />
              <input
                type="text"
                value={bundle.quote.person}
                onChange={(e) =>
                  updateBundle({
                    quote: { ...bundle.quote, person: e.target.value },
                  })
                }
                className="w-full rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[11px] text-[#e4e4e4] focus:border-[#c9a962]/55 focus:outline-none"
                placeholder="Rolle"
              />
              <input
                type="text"
                value={bundle.quote.company}
                onChange={(e) =>
                  updateBundle({
                    quote: { ...bundle.quote, company: e.target.value },
                  })
                }
                className="w-full rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[11px] text-[#9a9a9a] focus:border-[#c9a962]/55 focus:outline-none"
                placeholder="Firma / Branche"
              />
            </div>
          ) : null}
          <div>
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#9a9a9a]">
              <Palette className="size-3.5" strokeWidth={1.6} aria-hidden />
              Akzentfarbe
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => updateBundle({ accent: p.color })}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1.5 font-mono text-[10px] transition ${
                    bundle.accent === p.color
                      ? "border-[#c9a962]/55 bg-[#c9a962]/[0.10] text-[#e4d3a0]"
                      : "border-[#2a2a2a] bg-[#0a0a0a] text-[#9a9a9a] hover:border-[#3a3a3a]"
                  }`}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: p.color,
                    }}
                  />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-[#9a9a9a]">
              Caption für Social Post
            </label>
            <textarea
              value={bundle.caption}
              onChange={(e) => updateBundle({ caption: e.target.value })}
              rows={8}
              className="mt-1 w-full resize-y rounded-md border border-[#1f1f1f] bg-[#070707] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#cdd5e6] focus:border-[#c9a962]/55 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/40 bg-[#c9a962]/[0.10] px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#e4d3a0] transition hover:border-[#c9a962]/60 hover:bg-[#c9a962]/[0.16] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={1.8} aria-hidden />
              ) : (
                <Download className="size-3.5" strokeWidth={1.8} aria-hidden />
              )}
              Als PNG herunterladen
            </button>
            <button
              type="button"
              onClick={() => void handleCopyCaption()}
              className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#9a9a9a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
            >
              <ClipboardCopy className="size-3.5" strokeWidth={1.8} aria-hidden />
              Caption kopieren
            </button>
            <button
              type="button"
              onClick={regenerate}
              className="inline-flex items-center gap-2 rounded-md border border-[#3b6a5c]/55 bg-[#0e1d18] px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#9ed4be] transition hover:border-[#3b6a5c]/80 hover:bg-[#142b25]"
            >
              <Shuffle className="size-3.5" strokeWidth={1.8} aria-hidden />
              Neu würfeln
            </button>
          </div>

          {status ? (
            <p className="font-mono text-[10px] text-[#9a9a9a]">{status}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
