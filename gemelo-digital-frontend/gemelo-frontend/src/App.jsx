import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
/**
 * =========================
 * Config
 * =========================
 */

const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL ||
  import.meta.env?.VITE_GEMELO_BASE_URL ||
  ""
).replace(/\/$/, "");

if (!API_BASE_URL) {
  console.error("⚠️ Falta definir VITE_API_BASE_URL (o VITE_GEMELO_BASE_URL) en el .env");
}

function apiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

const DEFAULT_ORG_UNIT_ID = 29120;

/**
 * =========================
 * CSS injection
 * =========================
 */
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,900;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');

  :root {
    --bg: #F4F5F7;
    --card: #FFFFFF;
    --border: #E2E5EA;
    --text: #0D1117;
    --muted: #6B7280;
    --brand: #0B5FFF;
    --brand-light: #EEF3FF;
    --shadow: 0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.10);
    --radius: 14px;
    --font: 'DM Sans', system-ui, sans-serif;
    --font-mono: 'DM Mono', monospace;
    --ok: #12B76A;
    --ok-bg: #ECFDF3;
    --watch: #F79009;
    --watch-bg: #FFFAEB;
    --critical: #D92D20;
    --critical-bg: #FEF3F2;
    --pending: #98A2B3;
    --pending-bg: #F2F4F7;
  }

  .dark {
    --bg: #0D1117;
    --card: #161B22;
    --border: #21262D;
    --text: #E6EDF3;
    --muted: #7D8590;
    --brand-light: #1A2844;
    --shadow: 0 1px 4px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.4);
    --ok-bg: #0D2818;
    --watch-bg: #2A1F06;
    --critical-bg: #2A0B09;
    --pending-bg: #1C2128;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .cesa-loader-wrap {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg);
    z-index: 100;
  }
  .cesa-loader-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 40px 48px;
    text-align: center;
    box-shadow: var(--shadow-lg);
    min-width: 320px;
    max-width: 480px;
  }
  .cesa-loader-title { font-size: 20px; font-weight: 800; color: var(--text); }
  .cesa-loader-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
  .cesa-loader-center { margin: 28px 0; }
  .cesa-loader-foot { font-size: 12px; color: var(--muted); }

  .cesa-water-text {
    position: relative; display: inline-block;
    font-size: 56px; font-weight: 900; letter-spacing: -2px;
    overflow: hidden; height: 72px; line-height: 72px;
  }
  .cesa-water-text__outline {
    color: transparent;
    -webkit-text-stroke: 2px var(--border);
  }
  .cesa-water-text__fill {
    position: absolute; inset: 0;
    color: var(--brand);
    clip-path: inset(100% 0 0 0);
    animation: waterFill 1.8s ease-in-out infinite alternate;
  }
  .cesa-water-text__wave {
    position: absolute; bottom: 0; left: -100%;
    width: 300%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(11,95,255,.08), transparent);
    animation: waveSlide 2s linear infinite;
  }
  @keyframes waterFill {
    0% { clip-path: inset(100% 0 0 0); }
    100% { clip-path: inset(0% 0 0 0); }
  }
  @keyframes waveSlide {
    from { transform: translateX(0); }
    to { transform: translateX(33.33%); }
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .fade-up { animation: fadeUp 0.35s ease both; }
  .fade-up-1 { animation-delay: 0.05s; }
  .fade-up-2 { animation-delay: 0.1s; }
  .fade-up-3 { animation-delay: 0.15s; }
  .fade-up-4 { animation-delay: 0.2s; }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }
  .pulse-dot {
    display: inline-block; width: 8px; height: 8px;
    border-radius: 50%; animation: pulse 1.4s ease infinite;
  }

  @keyframes fillBar {
    from { width: 0%; }
    to { width: var(--target-w); }
  }
  .fill-bar { animation: fillBar 0.7s cubic-bezier(.4,0,.2,1) both; animation-delay: 0.2s; }

  .drawer-enter { animation: drawerIn 0.28s cubic-bezier(.4,0,.2,1) both; }
  @keyframes drawerIn {
    from { transform: translateX(40px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .tr-hover { transition: background 0.15s ease; }
  .tr-hover:hover { background: rgba(11,95,255,0.04) !important; }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700; white-space: nowrap;
    letter-spacing: 0.01em;
  }

  .kpi-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    box-shadow: var(--shadow);
    transition: box-shadow 0.2s ease;
  }
  .kpi-card:hover { box-shadow: var(--shadow-lg); }

  .tag {
    display: inline-flex; align-items: center;
    padding: 3px 8px; border-radius: 6px;
    font-size: 11px; font-weight: 700;
    font-family: var(--font-mono);
    background: var(--brand-light);
    color: var(--brand);
  }

  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    border: 1px solid var(--border);
    border-radius: 8px; padding: 4px 10px;
    font-size: 12px; font-weight: 700;
    background: var(--card); color: var(--muted);
    cursor: pointer; transition: all 0.15s ease;
  }
  .chip:hover, .chip.active {
    border-color: var(--brand);
    color: var(--brand);
    background: var(--brand-light);
  }

  .btn {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
    border-radius: 10px;
    padding: 8px 14px;
    cursor: pointer;
    font-weight: 700;
    font-size: 13px;
    font-family: var(--font);
    transition: all 0.15s ease;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:hover { border-color: var(--brand); color: var(--brand); background: var(--brand-light); }
  .btn-primary {
    background: var(--brand); color: #fff; border-color: var(--brand);
  }
  .btn-primary:hover { background: #0A52E0; color: #fff; border-color: #0A52E0; }

  .scenario-card {
    border: 1px solid var(--border);
    border-radius: 10px; padding: 12px;
    display: flex; flex-direction: column; gap: 4px;
    background: var(--card);
  }
  .scenario-card.scenario-risk { border-color: #FECDCA; background: var(--critical-bg); }
  .scenario-card.scenario-base { border-color: var(--border); }
  .scenario-card.scenario-improve { border-color: #A9EFC5; background: var(--ok-bg); }

  .qc-flag {
    font-size: 12px; padding: 8px 12px;
    border-radius: 8px; background: var(--pending-bg);
    border: 1px solid var(--border);
    font-family: var(--font-mono);
    color: var(--muted);
  }

  input[type="text"], input[type="number"] {
    font-family: var(--font);
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  input[type="text"]:focus, input[type="number"]:focus {
    border-color: var(--brand) !important;
    box-shadow: 0 0 0 3px rgba(11,95,255,0.12) !important;
  }
  
  .scroll-y {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .ra-scroll {
    max-height: 260px;
    padding-right: 4px;
  }

  .ra-priority-scroll {
    max-height: 380px;
    padding-right: 4px;
    overflow-y: auto;
  }

  .empty-state {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 8px;
    padding: 40px 20px;
    color: var(--muted);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    background: var(--card);
  }
  .empty-state-icon { font-size: 32px; opacity: 0.4; }

  /* ── Course Panel ── */
  .course-panel-overlay {
    position: fixed; inset: 0;
    background: rgba(13,17,23,0.5);
    z-index: 60;
    display: flex; align-items: flex-start; justify-content: flex-end;
    padding: 0;
    backdrop-filter: blur(2px);
    animation: fadeIn 0.2s ease both;
  }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

  .course-panel {
    width: min(480px, 100vw);
    height: 100vh;
    background: var(--card);
    border-left: 1px solid var(--border);
    display: flex; flex-direction: column;
    animation: slideIn 0.28s cubic-bezier(.4,0,.2,1) both;
    box-shadow: -8px 0 40px rgba(0,0,0,0.15);
  }
  @keyframes slideIn {
    from { transform: translateX(40px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }

  .course-item {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s ease;
    text-decoration: none;
  }
  .course-item:hover { background: var(--brand-light); }
  .course-item.active { background: var(--brand-light); border-left: 3px solid var(--brand); }
  .course-item-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }

  /* ── Voice search ── */
  .voice-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--card);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 15px;
    flex-shrink: 0;
    color: var(--muted);
  }
  .voice-btn:hover { border-color: var(--brand); background: var(--brand-light); color: var(--brand); }
  .voice-btn.listening {
    border-color: var(--critical);
    background: var(--critical-bg);
    color: var(--critical);
    animation: voicePulse 1s ease infinite;
  }
  @keyframes voicePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(217,45,32,0.3); }
    50%       { box-shadow: 0 0 0 6px rgba(217,45,32,0); }
  }

  /* ── Voice hint ── */
  .voice-hint {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 10px;
    border: 1px dashed var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    flex-wrap: wrap;
  }

  /* ── Main Tab Bar ── */
  .main-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0;
  }
  .main-tab {
    padding: 8px 16px 10px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    cursor: pointer;
    border-radius: 8px 8px 0 0;
    border: 1px solid transparent;
    border-bottom: none;
    background: transparent;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: -1px;
    position: relative;
  }
  .main-tab:hover { color: var(--text); background: var(--card); border-color: var(--border); }
  .main-tab.active {
    color: var(--brand);
    background: var(--card);
    border-color: var(--border);
    border-bottom-color: var(--card);
  }
  .main-tab .tab-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor; opacity: 0.6;
  }

  /* ── AI Assistant Panel ── */
  .ai-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .ai-status-outer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    transition: all 0.25s;
    min-height: 48px;
  }
  .ai-status-outer.listening {
    border-color: rgba(217,45,32,0.45);
    background: var(--critical-bg);
  }
  .ai-status-outer.thinking {
    border-color: rgba(11,95,255,0.35);
    background: var(--brand-light);
  }
  .ai-status-outer.speaking {
    border-color: rgba(18,183,106,0.35);
    background: var(--ok-bg);
  }
  .ai-status-icon {
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; flex-shrink: 0;
    background: var(--card);
    border: 1px solid var(--border);
  }
  .ai-wave {
    display: flex; align-items: center; gap: 2px; height: 18px;
  }
  .ai-wave-bar {
    width: 3px; border-radius: 2px;
    animation: waveAI 1.1s ease-in-out infinite;
  }
  .ai-wave-bar:nth-child(1) { height: 6px;  animation-delay: 0s; }
  .ai-wave-bar:nth-child(2) { height: 12px; animation-delay: 0.1s; }
  .ai-wave-bar:nth-child(3) { height: 18px; animation-delay: 0.2s; }
  .ai-wave-bar:nth-child(4) { height: 12px; animation-delay: 0.1s; }
  .ai-wave-bar:nth-child(5) { height: 6px;  animation-delay: 0s; }
  @keyframes waveAI {
    0%, 100% { transform: scaleY(0.4); }
    50%       { transform: scaleY(1); }
  }
  .ai-chat {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    max-height: 340px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    scrollbar-width: thin;
  }
  .ai-bubble-wrap { display: flex; flex-direction: column; }
  .ai-bubble-wrap.user { align-items: flex-end; }
  .ai-bubble-wrap.bot  { align-items: flex-start; }
  .ai-bubble {
    max-width: 86%;
    font-size: 12.5px;
    line-height: 1.55;
    padding: 9px 13px;
    border-radius: 8px;
  }
  .ai-bubble.bot {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0 8px 8px 8px;
  }
  .ai-bubble.user {
    background: var(--brand-light);
    border: 1px solid rgba(11,95,255,0.25);
    border-radius: 8px 0 8px 8px;
    color: var(--text);
  }
  .ai-meta {
    font-size: 9px; font-weight: 800;
    letter-spacing: 0.07em; text-transform: uppercase;
    color: var(--muted); margin-bottom: 3px;
    display: flex; align-items: center; gap: 6px;
  }
  .ai-voice-badge {
    background: var(--brand-light); color: var(--brand);
    border-radius: 999px; padding: 1px 7px;
    font-size: 9px; font-weight: 700;
  }
  .ai-speak-btn {
    border: 1px solid var(--border);
    background: transparent;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 10px; font-weight: 700;
    color: var(--muted);
    cursor: pointer;
    margin-top: 5px;
    transition: all 0.15s;
  }
  .ai-speak-btn:hover { border-color: var(--ok); color: var(--ok); }
  .ai-speak-btn.active { border-color: var(--ok); color: var(--ok); background: var(--ok-bg); }
  .ai-typing {
    display: flex; align-items: center; gap: 4px; padding: 6px 2px;
  }
  .ai-typing-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--brand);
    animation: waveAI 1.2s ease-in-out infinite;
  }
  .ai-typing-dot:nth-child(2) { animation-delay: 0.15s; }
  .ai-typing-dot:nth-child(3) { animation-delay: 0.3s; }
  .ai-chip-btn {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 13px;
    font-size: 11px; font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .ai-chip-btn:hover {
    border-color: var(--brand);
    color: var(--brand);
    background: var(--brand-light);
  }
  .ai-input {
    flex: 1;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 12px; font-weight: 600;
    background: var(--card);
    color: var(--text);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    font-family: var(--font);
  }
  .ai-input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(11,95,255,0.1);
  }
  .ai-input::placeholder { color: var(--muted); }
  .ai-send-btn {
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 10px 18px;
    font-size: 12px; font-weight: 800;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
    font-family: var(--font);
  }
  .ai-send-btn:hover { opacity: 0.85; }
  .ai-toggle {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
  }
  .ai-toggle.active { border-color: var(--ok); background: var(--ok-bg); }
  .ai-toggle-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--muted); transition: background 0.2s;
  }
  .ai-toggle.active .ai-toggle-dot { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
  .ai-stop-btn {
    background: var(--critical-bg);
    border: 1px solid rgba(217,45,32,0.3);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 11px; font-weight: 700;
    color: var(--critical);
    cursor: pointer;
    transition: all 0.15s;
    display: none;
  }
  .ai-stop-btn.visible { display: block; }
  .ai-guide-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  @media (max-width: 640px) {
    .ai-guide-grid { grid-template-columns: 1fr; }
    .main-tabs { overflow-x: auto; }
  }
`;

function toDate(x) {
  const d = x ? new Date(x) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function weeksBetween(start, end) {
  if (!start || !end) return 0;
  const ms = Math.max(0, end.getTime() - start.getTime());
  return ms / (7 * 24 * 60 * 60 * 1000);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function injectStyles() {
  if (typeof document === "undefined") return;
  const id = "gemelo-styles";
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = GLOBAL_STYLES;
  document.head.appendChild(el);
}

/**
 * =========================
 * Hook: Media Query
 * =========================
 */
function useMediaQuery(query) {
  const getMatch = () => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  };
  const [matches, setMatches] = React.useState(getMatch);

  React.useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    onChange();

    if (m.addEventListener) m.addEventListener("change", onChange);
    else m.addListener(onChange);

    return () => {
      if (m.removeEventListener) m.removeEventListener("change", onChange);
      else m.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

/**
 * =========================
 * Colors
 * =========================
 */
const COLORS = {
  critical: "#D92D20",
  watch: "#F79009",
  ok: "#12B76A",
  pending: "#98A2B3",
  brand: "#0B5FFF",
};

const STATUS_CONFIG = {
  solido: { bg: "var(--ok-bg)", fg: "#1B5E20", dot: COLORS.ok, label: "Óptimo" },
  "óptimo": { bg: "var(--ok-bg)", fg: "#1B5E20", dot: COLORS.ok, label: "Óptimo" },
  optimo: { bg: "var(--ok-bg)", fg: "#1B5E20", dot: COLORS.ok, label: "Óptimo" },
  observacion: { bg: "var(--watch-bg)", fg: "#9A3412", dot: COLORS.watch, label: "Seguimiento" },
  "en seguimiento": { bg: "var(--watch-bg)", fg: "#9A3412", dot: COLORS.watch, label: "Seguimiento" },
  "en desarrollo": { bg: "var(--watch-bg)", fg: "#9A3412", dot: COLORS.watch, label: "En desarrollo" },
  critico: { bg: "var(--critical-bg)", fg: "#B42318", dot: COLORS.critical, label: "Crítico" },
  cargando: { bg: "var(--brand-light)", fg: "#1D4ED8", dot: COLORS.brand, label: "Cargando" },
  pending: { bg: "var(--pending-bg)", fg: "var(--muted)", dot: COLORS.pending, label: "Pendiente" },
  alto: { bg: "var(--critical-bg)", fg: "#B42318", dot: COLORS.critical, label: "Alto" },
  medio: { bg: "var(--watch-bg)", fg: "#9A3412", dot: COLORS.watch, label: "Medio" },
  bajo: { bg: "var(--ok-bg)", fg: "#1B5E20", dot: COLORS.ok, label: "Bajo" },
};

/**
 * =========================
 * Helpers
 * =========================
 */
function normStatus(x) {
  return String(x || "").toLowerCase().trim();
}

function colorForRisk(risk) {
  const r = normStatus(risk);
  if (r === "alto" || r === "critico") return COLORS.critical;
  if (r === "medio" || r === "en desarrollo") return COLORS.watch;
  if (r === "bajo" || r === "óptimo") return COLORS.ok;
  return COLORS.pending;
}

function colorForPct(pct, thresholds) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return COLORS.pending;
  const p = Number(pct);
  const thr = thresholds || { critical: 50, watch: 70 };
  if (p < Number(thr.critical)) return COLORS.critical;
  if (p < Number(thr.watch)) return COLORS.watch;
  return COLORS.ok;
}

function contentRhythmStatus(progressRatio) {
  if (progressRatio == null) {
    return { status: "pending", color: COLORS.pending, bg: "var(--pending-bg)", label: "Pendiente" };
  }
  if (progressRatio < 0.8) {
    return { status: "critico", color: COLORS.critical, bg: "var(--critical-bg)", label: "Crítico" };
  }
  if (progressRatio < 1.0) {
    return { status: "observacion", color: COLORS.watch, bg: "var(--watch-bg)", label: "En seguimiento" };
  }
  return { status: "solido", color: COLORS.ok, bg: "var(--ok-bg)", label: "Óptimo" };
}

function colorForLearningOutcome(m, thresholds) {
  const st = normStatus(m?.status);
  if (st === "critico") return COLORS.critical;
  if (st === "en desarrollo" || st === "en seguimiento" || st === "observacion") return COLORS.watch;
  if (st === "optimo" || st === "solido" || st === "óptimo") return COLORS.ok;
  return colorForPct(m?.avgPct, thresholds);
}

function fmtPct(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "—";
  return `${Number(x).toFixed(1)}%`;
}

function fmtGrade10FromPct(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return "—";
  return (Number(pct) / 10).toFixed(1);
}

function flattenOutcomeDescriptions(payload) {
  const sets = payload?.outcomeSets;
  if (!Array.isArray(sets)) return [];
  const flat = [];
  for (const s of sets) {
    for (const o of s?.Outcomes || []) {
      if (o?.Description) flat.push(String(o.Description));
    }
  }
  return flat;
}

function isVisibleContentItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.IsHidden === true) return false;

  // En Brightspace content root:
  // Type 0 = módulo/folder
  // Type 1 = topic/item
  // Queremos contar solo contenido real, no módulos.
  return Number(item.Type) !== 0;
}

function safeAvg(list) {
  const nums = (Array.isArray(list) ? list : [])
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function apiGet(path, opts = {}) {
  const res = await fetch(apiUrl(path), {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...(opts.headers || {}) },
    signal: opts.signal,
  });

  const ct = res.headers.get("content-type") || "";
  const isJson =
    ct.includes("application/json") ||
    ct.includes("application/problem+json");

  if (!res.ok) {
    const body = isJson
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => "");
    const msg =
      typeof body === "string"
        ? body
        : body?.detail || body?.message || body?.error || JSON.stringify(body);
    throw new Error(`HTTP ${res.status} - ${String(msg).slice(0, 600)}`);
  }

  if (!isJson) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Respuesta no JSON (${ct}): ${txt.slice(0, 300)}`);
  }

  return res.json();
}

async function mapLimit(arr, limit, mapper) {
  const list = Array.isArray(arr) ? arr : [];
  const results = new Array(list.length);
  let i = 0;
  const workers = new Array(Math.min(limit, list.length)).fill(null).map(async () => {
    while (i < list.length) {
      const idx = i++;
      results[idx] = await mapper(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function pickCriticalMacroFromGemelo(g) {
  const arr = g?.macro?.units || g?.macroUnits || [];
  if (!Array.isArray(arr) || !arr.length) return null;
  const copy = arr
    .map((x) => ({ code: x.code, pct: Number(x.pct ?? x.avgPct ?? 0) }))
    .filter((x) => x.code);
  if (!copy.length) return null;
  copy.sort((a, b) => a.pct - b.pct);
  return copy[0];
}

function computeRiskFromPct(pct) {
  // Calcula riesgo basado en nota de 0-100:
  //   < 50%  → alto   (nota < 5.0)
  //   50-70% → medio  (nota 5.0 – 7.0)
  //   ≥ 70%  → bajo   (nota ≥ 7.0)
  //   null   → pending
  if (pct == null || Number.isNaN(Number(pct))) return "pending";
  const p = Number(pct);
  if (p < 50) return "alto";
  if (p < 70) return "medio";
  return "bajo";
}

function suggestRouteForStudent(s, thresholds) {
  const risk = String(s?.risk || "").toLowerCase();
  const perf = s?.currentPerformancePct != null ? Number(s.currentPerformancePct) : null;
  const cov = s?.coveragePct != null ? Number(s.coveragePct) : null;

  if (cov != null && cov < 40) {
    return {
      id: "route_coverage",
      title: "Ruta 0 — Activar evidencia",
      summary: "Priorizar calificación de evidencias pendientes.",
      actions: [
        "Identificar 1 evidencia crítica y publicarla esta semana",
        "Acordar fecha de entrega con el estudiante",
      ],
    };
  }

  if (risk === "alto") {
    return {
      id: "route_high_risk",
      title: "Ruta 1 — Recuperación",
      summary: "Intervención inmediata con plan corto (7 días).",
      actions: [
        "Reunión 1:1 (15 min) para acordar objetivo semanal",
        "Actividad de refuerzo o re-entrega enfocada en el error",
        "Retroalimentación concreta + checklist de mejora",
      ],
    };
  }

  if (risk === "medio" || (perf != null && perf < thresholds.watch)) {
    const macro = s?.mostCriticalMacro?.code;
    return {
      id: "route_watch",
      title: "Ruta 2 — Ajuste dirigido",
      summary: macro ? `Enfoque: ${macro} (${fmtPct(s?.mostCriticalMacro?.pct)})` : "Enfoque: desempeño general",
      actions: [
        "Microtarea guiada (30–45 min) sobre el punto débil",
        "Ejemplo resuelto + plantilla de entrega",
        "Seguimiento en próxima evidencia",
      ],
    };
  }

  return {
    id: "route_ok",
    title: "Ruta 3 — Mantener desempeño",
    summary: "Sostener ritmo y calidad.",
    actions: ["Mantener entregas a tiempo", "Extensión opcional: reto avanzado"],
  };
}

/**
 * =========================
 * UI Atoms
 * =========================
 */

function StatusBadge({ status }) {
  const s = normStatus(status);
  const cfg = STATUS_CONFIG[s] || {
    bg: "var(--pending-bg)",
    fg: "var(--muted)",
    dot: COLORS.pending,
    label: status || "—",
  };
  return (
    <span className="badge" style={{ background: cfg.bg, color: cfg.fg }}>
      <span className="pulse-dot" style={{ background: cfg.dot, width: 6, height: 6 }} />
      {cfg.label}
    </span>
  );
}

function Card({ title, right, children, className = "", style = {} }) {
  return (
    <div className={`kpi-card ${className}`} style={style}>
      {(title || right) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>
            {title}
          </div>
          <div>{right}</div>
        </div>
      )}
      {children}
    </div>
  );
}

function Stat({ label, value, sub, valueColor }) {
  return (
    <div>
      {label ? (
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 2,
          }}
        >
          {label}
        </div>
      ) : null}
      <div style={{ fontSize: 26, color: valueColor || "var(--text)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, fontWeight: 500 }}>{sub}</div> : null}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", width: "100%", margin: "4px 0" }} />;
}

function ProgressBar({ value, color, showLabel = false, animate = true }) {
  const pct = Math.max(0, Math.min(100, Number(value ?? 0)));
  const mountedRef = React.useRef(false);
  const [didMount, setDidMount] = React.useState(false);

  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setDidMount(true);
    }
  }, []);

  const shouldAnimate = animate && didMount;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(148,163,184,0.15)", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div
          className={shouldAnimate ? "fill-bar" : ""}
          style={{
            "--target-w": `${pct}%`,
            width: shouldAnimate ? undefined : `${pct}%`,
            height: "100%",
            background: color || COLORS.brand,
            borderRadius: 999,
            transition: shouldAnimate ? undefined : "none",
          }}
        />
      </div>
      {showLabel && (
        <div style={{ position: "absolute", right: 0, top: -18, fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
          {fmtPct(pct)}
        </div>
      )}
    </div>
  );
}

function InfoTooltip({ text }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  if (!String(text || "").trim()) return null;

  const updatePos = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();

    const tooltipWidth = Math.min(280, Math.floor(window.innerWidth * 0.65));
    // Prefer left-aligned to avoid overflow on rightmost columns
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft  = rect.left;
    let left;
    if (spaceRight >= tooltipWidth + 12) {
      // enough room to the right
      left = Math.min(rect.left, window.innerWidth - tooltipWidth - 12);
    } else if (spaceLeft >= tooltipWidth + 12) {
      // align to left edge of button
      left = Math.max(12, rect.right - tooltipWidth);
    } else {
      // center and clamp
      left = Math.max(12, Math.min(
        rect.left + rect.width / 2 - tooltipWidth / 2,
        window.innerWidth - tooltipWidth - 12
      ));
    }

    const tooltipHeightGuess = 100;
    const top =
      rect.top > tooltipHeightGuess + 16
        ? rect.top - tooltipHeightGuess - 10
        : rect.bottom + 10;

    setPos({ top, left });
  };

  React.useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  return (
    <>
      <span
        ref={ref}
        style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}
        onMouseEnter={() => {
          updatePos();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          updatePos();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          updatePos();
          setOpen((v) => !v);
        }}
      >
        <span
          role="button"
          tabIndex={0}
          aria-label="Ver descripción"
          style={{
            display: "inline-flex",
            width: 16,
            height: 16,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--border)",
            color: "var(--muted)",
            fontSize: 10,
            fontWeight: 900,
            cursor: "help",
            background: "var(--card)",
            lineHeight: 1,
          }}
        >
          ?
        </span>
      </span>

      {open && (
        <div
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: "min(320px, 75vw)",
            zIndex: 99999,
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
            borderRadius: 12,
            padding: 10,
            color: "var(--text)",
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {text}
        </div>
      )}
    </>
  );
}

function SortTh({ label, active, dir, onClick, title }) {
  return (
    <th
      onClick={onClick}
      title={title}
      style={{
        padding: "10px 10px",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: active ? "var(--brand)" : "var(--muted)",
      }}
    >
      {label} {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}

function CoverageBars({ donePct, pendingPct, overduePct, openPct }) {
  const d  = Math.max(0, Math.min(100, Number(donePct   ?? 0)));
  const p  = Math.max(0, Math.min(100, Number(pendingPct ?? 0)));
  const ov = Math.max(0, Math.min(100, Number(overduePct ?? 0)));
  // openPct puede pasarse explícitamente; si no, se calcula como residuo
  const op = openPct != null
    ? Math.max(0, Math.min(100, Number(openPct)))
    : Math.max(0, 100 - d - p - ov);

  const BarRow = ({ label, value, color, tooltip }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }} title={tooltip}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          fontSize: 11, color: "var(--muted)", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
          {label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 800, fontFamily: "var(--font-mono)" }}>
          {value.toFixed(1)}%
        </div>
      </div>
      <ProgressBar value={value} color={color} animate={false} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Índice de cumplimiento evaluativo
      </div>
      <BarRow label="Calificado" value={d} color={COLORS.ok}
        tooltip="Ítems con nota numérica publicada en el gradebook." />
      <BarRow label="Pendiente calificación" value={p} color={COLORS.brand}
        tooltip="El estudiante entregó pero el docente aún no ha publicado nota numérica." />
      {op > 0.5 && (
        <BarRow label="Sin entregar (abierto)" value={op} color={COLORS.pending}
          tooltip="Sin nota, sin señal de entrega, y la fecha de vencimiento aún no ha llegado." />
      )}
      <BarRow
        label="Vencido sin registro"
        value={ov}
        color={ov > 0 ? COLORS.critical : "rgba(148,163,184,0.4)"}
        tooltip="Sin nota, sin entrega registrada, y la fecha de vencimiento ya pasó. Requiere acción docente."
      />
    </div>
  );
}

function CesaLoader({ title = "Gemelo V. 1.0", subtitle = "Cargando tablero..." }) {
  React.useEffect(() => {
    injectStyles();
  }, []);

  return (
    <div className="cesa-loader-wrap">
      <div className="cesa-loader-card">
        <div>
          <div className="cesa-loader-title">{title}</div>
          <div className="cesa-loader-sub">{subtitle}</div>
        </div>
        <div className="cesa-loader-center">
          <div className="cesa-water-text" aria-label="Cargando">
            <span className="cesa-water-text__outline">CESA</span>
            <span className="cesa-water-text__fill" aria-hidden="true">
              CESA
            </span>
            <span className="cesa-water-text__wave" aria-hidden="true" />
          </div>
        </div>
        <div className="cesa-loader-foot">Conectando con Brightspace y consolidando evidencias académicas…</div>
      </div>
    </div>
  );
}

// Lista compacta de asignaciones sin RA — usada dentro del AlertsPanel
function UnlinkedItemsList({ items }) {
  const [open, setOpen] = React.useState(false);
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button
        className="btn"
        style={{ fontSize: 11, padding: "4px 10px", gap: 5 }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        {open ? "▴" : "▾"} Ver actividades sin RA ({list.length})
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {list.map((it, i) => (
            <div
              key={it.gradeObjectId ?? i}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg)",
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.name || `Ítem ${it.gradeObjectId}`}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                {it.weightPct != null && (
                  <span className="tag" style={{ background: "var(--watch-bg)", color: "#9A3412", fontSize: 10 }}>
                    {Number(it.weightPct).toFixed(1)}% peso
                  </span>
                )}
                <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  sin RA
                </span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted)", padding: "4px 2px", fontStyle: "italic" }}>
            💡 Vincula estas actividades a una rúbrica con RA en Brightspace para incluirlas en el análisis de competencias.
          </div>
        </div>
      )}
    </div>
  );
}

function AlertsPanel({ alerts }) {
  const list = Array.isArray(alerts) ? alerts : [];
  const [open, setOpen] = React.useState(false);
  if (!list.length) return null;

  const sevRank = (s) => {
    const x = normStatus(s);
    if (x === "critico") return 0;
    if (x === "en desarrollo" || x === "en seguimiento" || x === "observacion") return 1;
    return 2;
  };

  const sorted = list.slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const countBySev = (sev) => sorted.filter((x) => normStatus(x.severity) === sev).length;
  const cCrit = countBySev("critico");
  const cObs = sorted.filter((x) => ["en desarrollo", "en seguimiento", "observacion"].includes(normStatus(x.severity))).length;
  const cSol = countBySev("solido");

  return (
    <Card>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🔭</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Radar docente</span>
            <span className="tag">{sorted.length}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {cCrit > 0 && (
              <span className="badge" style={{ background: "var(--critical-bg)", color: "#B42318" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.critical, display: "inline-block" }} />
                Críticos: {cCrit}
              </span>
            )}
            {cObs > 0 && (
              <span className="badge" style={{ background: "var(--watch-bg)", color: "#9A3412" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.watch, display: "inline-block" }} />
                Seguimiento: {cObs}
              </span>
            )}
            {cSol > 0 && (
              <span className="badge" style={{ background: "var(--ok-bg)", color: "#1B5E20" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.ok, display: "inline-block" }} />
                Óptimos: {cSol}
              </span>
            )}
          </div>
        </div>
        <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }}>
          {open ? "Ocultar ▴" : "Ver ▾"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((a) => (
            <div
              key={a.id || `${a.title}-${Math.random()}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 14,
                background: "var(--card)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 13 }}>{a.title || "Alerta"}</div>
                <StatusBadge status={a.severity} />
              </div>
              {a.message && <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{a.message}</div>}
              {a.kpis && Object.keys(a.kpis).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                  {Object.entries(a.kpis).map(([k, v]) => (
                    <span
                      key={k}
                      style={{
                        fontSize: 11,
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--muted)",
                      }}
                    >
                      {k}: <strong style={{ color: "var(--text)" }}>{typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : String(v)}</strong>
                    </span>
                  ))}
                </div>
              )}
              {/* Items sin RA — lista expandible */}
              {Array.isArray(a.items) && a.items.length > 0 && (
                <UnlinkedItemsList items={a.items} />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Drawer({ open, onClose, title, children }) {
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(13,17,23,0.45)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        className="drawer-enter"
        style={{
          width: "min(680px, 96vw)",
          height: "100%",
          background: "var(--card)",
          padding: 20,
          overflow: "auto",
          borderLeft: "1px solid var(--border)",
          color: "var(--text)",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            paddingBottom: 14,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>{title}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Detalle del gemelo digital · Vista docente</div>
          </div>
          <button className="btn" onClick={onClose}>
            ✕ Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProjectionBlock({ projection, thresholds }) {
  if (!projection || !Array.isArray(projection.scenarios) || !projection.scenarios.length) return null;

  if (projection.isFinal) {
    return (
      <Card title="Proyección final" right={<span className="tag">Cobertura 100%</span>}>
        <Stat label="Nota final" value={fmtGrade10FromPct(projection.finalPct)} valueColor={colorForPct(projection.finalPct, thresholds)} />
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          La cobertura del 100% indica que esta es la nota definitiva del curso.
        </div>
      </Card>
    );
  }

  const scenarioMeta = {
    risk: { label: "Escenario riesgo", sub: "si el resto baja", cls: "scenario-risk", icon: "📉" },
    base: { label: "Escenario base", sub: "desempeño actual", cls: "scenario-base", icon: "📊" },
    improve: { label: "Escenario mejora", sub: "si el resto sube", cls: "scenario-improve", icon: "📈" },
  };

  return (
    <Card title="Proyección de nota final" right={<span className="tag">{fmtPct(projection.coveragePct)} calificado</span>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {projection.scenarios.map((s) => {
          const meta = scenarioMeta[s.id] || { label: s.id, sub: "", cls: "scenario-base", icon: "📊" };
          return (
            <div key={s.id} className={`scenario-card ${meta.cls}`}>
              <div style={{ fontSize: 18 }}>{meta.icon}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{meta.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", color: colorForPct(s.projectedFinalPct, thresholds) }}>
                {fmtGrade10FromPct(s.projectedFinalPct)}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {meta.sub} · asume {fmtPct(s.assumptionPendingPct)} pendiente
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Notificación de ítems sin RA vinculado
function NoRaMappingNotice({ evidences, units }) {
  // Evidences with grades but whose gradeObjectId doesn't appear in any unit's evidence list
  const gradedEvIds = new Set(
    (Array.isArray(evidences) ? evidences : [])
      .filter((e) => e.scorePct != null)
      .map((e) => String(e.gradeObjectId))
  );

  // Collect all gradeObjectIds that ARE linked to a RA unit
  const linkedIds = new Set();
  for (const u of (Array.isArray(units) ? units : [])) {
    for (const ev of (u.evidence || [])) {
      if (ev.folderId != null) linkedIds.add(String(ev.folderId));
    }
  }

  // Items with grade but no RA link
  const unlinked = (Array.isArray(evidences) ? evidences : []).filter(
    (e) => e.scorePct != null && !linkedIds.has(String(e.gradeObjectId))
  );

  if (!unlinked.length) return null;

  const [open, setOpen] = React.useState(false);

  return (
    <div style={{
      marginTop: 8,
      border: "1px solid var(--watch-bg)",
      borderColor: "#FED7AA",
      borderRadius: 10,
      background: "var(--watch-bg)",
      overflow: "hidden",
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", cursor: "pointer", userSelect: "none", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#9A3412" }}>
              {unlinked.length} asignación{unlinked.length !== 1 ? "es" : ""} calificada{unlinked.length !== 1 ? "s" : ""} sin Resultado de Aprendizaje
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              Estas evidencias tienen nota pero no están vinculadas a ningún RA en la rúbrica
            </div>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #FED7AA", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {unlinked.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "var(--card)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.name || `Ítem ${e.gradeObjectId}`}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                <span className="tag" style={{ background: "var(--watch-bg)", color: "#9A3412" }}>
                  {fmtPct(e.weightPct)} peso
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: colorForPct(e.scorePct, null) }}>
                  {e.scorePct != null ? (e.scorePct / 10).toFixed(1) : "—"}
                </span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted)", padding: "4px 2px" }}>
            💡 Para que aparezcan en el análisis de RA, vincula estas asignaciones a una rúbrica con criterios mapeados en Brightspace.
          </div>
        </div>
      )}
    </div>
  );
}

function QualityFlagsBlock({ flags }) {
  const list = Array.isArray(flags) ? flags.filter((f) => f?.type) : [];
  const [open, setOpen] = React.useState(false);
  if (!list.length) return null;

  const relevant = list.filter((f) => f.type !== "role_not_enabled");
  if (!relevant.length) return null;

  return (
    <Card title={null}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔍</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Flags de calidad del modelo</span>
          <span className="tag" style={{ background: "var(--watch-bg)", color: "var(--watch)" }}>
            {relevant.length}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {relevant.map((f, i) => (
            <div key={i} className="qc-flag">
              <strong>{f.type}</strong>
              {f.message && <span style={{ marginLeft: 8, opacity: 0.8 }}>— {f.message}</span>}
              {f.rubricId && <span style={{ marginLeft: 8, opacity: 0.6 }}>rubric:{f.rubricId}</span>}
              {f.unitCode && <span style={{ marginLeft: 8, opacity: 0.6 }}>unit:{f.unitCode}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PendingItemsBlock({ pendingItems, missingValues }) {
  const items = Array.isArray(pendingItems) ? pendingItems : [];
  const missing = Array.isArray(missingValues) ? missingValues : [];
  if (!items.length && !missing.length) return null;

  const [open, setOpen] = React.useState(false);
  const topPending = items.slice(0, 5);

  return (
    <Card title={null}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Evidencias pendientes</span>
          <span className="tag">{items.length + missing.length}</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{open ? "▴" : "▾"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {topPending.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Sin calificar (por peso)
              </div>
              {topPending.map((it, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", flex: 1, minWidth: 0 }}>
                    {it.name || `Ítem ${it.gradeObjectId}`}
                  </div>
                  <span className="tag" style={{ background: "var(--watch-bg)", color: "#9A3412", flexShrink: 0 }}>
                    {fmtPct(it.weightPct)} peso
                  </span>
                </div>
              ))}
              {items.length > 5 && <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "4px 0" }}>+ {items.length - 5} más</div>}
            </div>
          )}
          {missing.length > 0 && (
            <div style={{ marginTop: items.length > 0 ? 12 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                No liberados en gradebook ({missing.length})
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Ítems sin valor visible para el estudiante. Revisar configuración de visibilidad.</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function EvidencesTimeline({ evidences, thresholds }) {
  const list = Array.isArray(evidences) ? evidences.filter((e) => e.scorePct !== null && e.scorePct !== undefined) : [];
  if (!list.length) return null;
  const [open, setOpen] = React.useState(false);

  const chartData = list.map((e) => ({
    name: (e.name || "").slice(0, 20),
    pct: Number(e.scorePct ?? 0),
  }));

  return (
    <Card title={null}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📋</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Historial de evidencias</span>
          <span className="tag">{list.length} calificadas</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{open ? "▴" : "▾"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Desempeño"]} />
                <ReferenceLine y={Number(thresholds?.watch || 70)} stroke={COLORS.watch} strokeDasharray="4 4" label={{ value: "70%", fill: COLORS.watch, fontSize: 10 }} />
                <ReferenceLine y={Number(thresholds?.critical || 50)} stroke={COLORS.critical} strokeDasharray="4 4" label={{ value: "50%", fill: COLORS.critical, fontSize: 10 }} />
                <Line type="monotone" dataKey="pct" stroke={COLORS.brand} strokeWidth={2} dot={{ fill: COLORS.brand, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// VoiceAssistant — Panel completo con chat, voz y TTS
// ─────────────────────────────────────────────────────────
function VoiceAssistant({ studentRows, overview, raDashboard, courseInfo, thresholds }) {
  const [msgs, setMsgs] = React.useState(() => [{
    id: 0, role: "bot", fromVoice: false,
    text: `Listo. Tengo cargados los datos de <strong>${courseInfo?.Name || "este curso"}</strong>. Puedo analizar riesgo, evidencias y desempeño por RA. Escríbeme o usa el micrófono 🎙️.`,
  }]);
  const [input, setInput] = React.useState("");
  const [aiStatus, setAiStatus] = React.useState("idle");
  const [voiceOut, setVoiceOut] = React.useState(true);
  const [speed, setSpeed]   = React.useState(1.0);
  const [activeSpeakId, setActiveSpeakId] = React.useState(null);
  const [liveText, setLiveText] = React.useState("");
  const chatRef  = React.useRef(null);
  const synthRef = React.useRef(null);
  const recRef   = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [msgs, aiStatus]);

  // ── Pre-compute course data ──
  const withGrades = (Array.isArray(studentRows) ? studentRows : []).filter((s) => s.currentPerformancePct != null);
  const avg = withGrades.length
    ? (withGrades.reduce((a, s) => a + Number(s.currentPerformancePct) / 10, 0) / withGrades.length).toFixed(2)
    : null;
  const altos  = (Array.isArray(studentRows) ? studentRows : []).filter((s) => computeRiskFromPct(s.currentPerformancePct) === "alto");
  const medios = (Array.isArray(studentRows) ? studentRows : []).filter((s) => computeRiskFromPct(s.currentPerformancePct) === "medio");
  const zeros  = (Array.isArray(studentRows) ? studentRows : []).filter((s) => s.currentPerformancePct == null);
  const top    = withGrades.filter((s) => s.currentPerformancePct / 10 >= 8);
  const courseName = courseInfo?.Name || "el curso";

  // ── Quick chips ──
  const CHIPS = [
    { icon: "📊", label: "estudiantes en riesgo" },
    { icon: "⚠️", label: "alertas críticas" },
    { icon: "🏆", label: "top estudiantes" },
    { icon: "📋", label: "resumen del curso" },
    { icon: "📉", label: "sin nota registrada" },
    { icon: "🎯", label: "logro por RA" },
  ];

  // ── Command processor (returns plain text for TTS + HTML for display) ──
  function processCmd(cmd) {
    const c = cmd.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

    if (c.includes("riesgo") || c.includes("risk")) {
      const resp = `Riesgo académico actual en ${courseName}.<br><br>
🔴 <strong>Alto (${altos.length}):</strong><br>
${altos.slice(0, 6).map((s) => `‣ ${s.displayName} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}${altos.length > 6 ? `<br>… y ${altos.length - 6} más` : ""}<br><br>
🟡 <strong>Medio (${medios.length}):</strong><br>
${medios.slice(0, 4).map((s) => `‣ ${s.displayName} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}${medios.length > 4 ? `<br>… y ${medios.length - 4} más` : ""}`;
      return resp;
    }

    if (c.includes("alerta") || c.includes("critico")) {
      const crit = altos.filter((s) => s.currentPerformancePct != null && s.currentPerformancePct < 50);
      return `Alertas críticas del curso.<br><br>
Sin nota registrada: ${zeros.length} estudiantes.<br>
${zeros.slice(0, 4).map((s) => `‣ ${s.displayName}`).join("<br>")}<br><br>
Nota crítica menor a 5.0: ${crit.length} estudiantes.<br>
${crit.slice(0, 5).map((s) => `‣ ${s.displayName} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}<br><br>
<strong>Acción recomendada:</strong> Contactar esta semana y verificar entregas.`;
    }

    if (c.includes("top") || c.includes("mejor") || c.includes("destacado")) {
      const sorted = [...withGrades].sort((a, b) => b.currentPerformancePct - a.currentPerformancePct).slice(0, 5);
      return `Top 5 estudiantes de ${courseName}:<br><br>
${sorted.map((s, i) => `<strong>${i + 1}.</strong> ${s.displayName}<br>&nbsp;&nbsp;Nota: ${fmtGrade10FromPct(s.currentPerformancePct)} · Cobertura: ${fmtPct(s.coveragePct)}`).join("<br><br>")}`;
    }

    if (c.includes("resumen") || c.includes("informe") || c.includes("reporte")) {
      return `Resumen de ${courseName}.<br><br>
<strong>Estudiantes:</strong> ${studentRows.length} · ${withGrades.length} con nota<br>
<strong>Promedio:</strong> ${avg ?? "—"}/10<br>
<strong>Riesgo:</strong> Alto: ${altos.length} · Medio: ${medios.length} · OK: ${studentRows.length - altos.length - medios.length}<br>
<strong>Sin nota:</strong> ${zeros.length} · <strong>Top ≥8:</strong> ${top.length}<br>
<strong>Cobertura promedio:</strong> ${fmtPct(overview?.courseGradebook?.avgCoveragePct)}`;
    }

    if (c.includes("sin nota") || c.includes("sin evidencia") || c.includes("ruta 0")) {
      return `Estudiantes sin nota registrada (Ruta 0).<br><br>
<strong>${zeros.length} requieren activación urgente:</strong><br><br>
${zeros.map((s) => `‣ ${s.displayName} (ID: ${s.userId})`).join("<br>")}<br><br>
<strong>Acción:</strong> Verificar acceso y contactar esta semana.`;
    }

    if (c.includes("ra") || c.includes("resultado") || c.includes("aprendizaje") || c.includes("competencia")) {
      const ras = Array.isArray(raDashboard?.ras) ? raDashboard.ras.filter((r) => r.studentsWithData > 0) : [];
      if (!ras.length) return "No hay datos de Resultados de Aprendizaje disponibles aún. Los RAs se calculan una vez que los estudiantes tienen evaluaciones con rúbricas calificadas.";
      return `Logro por Resultado de Aprendizaje en ${courseName}:<br><br>
${ras.sort((a, b) => a.avgPct - b.avgPct).map((r) => {
  const ico = Number(r.avgPct) < 50 ? "🔴" : Number(r.avgPct) < 70 ? "🟡" : "🟢";
  return `${ico} <strong>${r.code}:</strong> ${fmtPct(r.avgPct)} · ${r.studentsWithData}/${r.totalStudents} estudiantes`;
}).join("<br>")}<br><br>
<strong>Foco:</strong> ${ras[0]?.code ?? "—"} es el RA con menor desempeño.`;
    }

    if (c.includes("aprobado") || c.includes("pasando")) {
      const ap = withGrades.filter((s) => s.currentPerformancePct / 10 >= 7);
      return `Estudiantes aprobados (nota ≥ 7.0):<br><br>
Total: <strong>${ap.length} de ${studentRows.length}</strong> (${Math.round(ap.length / studentRows.length * 100)}%)<br><br>
${ap.sort((a, b) => b.currentPerformancePct - a.currentPerformancePct).slice(0, 8).map((s) => `‣ ${s.displayName} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}${ap.length > 8 ? `<br>… y ${ap.length - 8} más` : ""}`;
    }

    return `Entendido. Puedo ayudarte con:<br><br>
‣ "estudiantes en riesgo"<br>
‣ "alertas críticas"<br>
‣ "top estudiantes"<br>
‣ "resumen del curso"<br>
‣ "sin nota registrada"<br>
‣ "logro por RA"<br>
‣ "aprobados"<br><br>
¿Qué necesitas analizar?`;
  }

  // ── TTS ──
  function speakText(html, msgId) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const clean = html.replace(/<[^>]*>/g, "").replace(/[→↑↓★‣·]/g, " ").replace(/\s+/g, " ").trim();
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = "es-CO"; utt.rate = speed;
    synthRef.current = utt;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find((v) => v.lang.startsWith("es"));
    if (esVoice) utt.voice = esVoice;
    utt.onstart = () => { setAiStatus("speaking"); setActiveSpeakId(msgId); };
    utt.onend   = () => { setAiStatus("idle");     setActiveSpeakId(null); };
    utt.onerror = () => { setAiStatus("idle");     setActiveSpeakId(null); };
    window.speechSynthesis.speak(utt);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setAiStatus("idle"); setActiveSpeakId(null);
  }

  // ── Send message ──
  function sendMsg(text, fromVoice = false) {
    const t = (text || input).trim();
    if (!t) return;
    setInput("");
    const uid = Date.now();
    setMsgs((prev) => [...prev, { id: uid, role: "user", fromVoice, text: t }]);
    setAiStatus("thinking");
    setTimeout(() => {
      const resp = processCmd(t);
      const bid = Date.now() + 1;
      setMsgs((prev) => [...prev, { id: bid, role: "bot", fromVoice: false, text: resp }]);
      setAiStatus("idle");
      if (voiceOut) speakText(resp, bid);
    }, 500 + Math.random() * 300);
  }

  // ── Mic ──
  const voiceOk = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function toggleMic() {
    if (aiStatus === "speaking") stopSpeaking();
    if (aiStatus === "listening") {
      recRef.current?.stop();
      setAiStatus("idle"); setLiveText("");
      return;
    }
    if (!voiceOk) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "es-CO"; rec.continuous = false; rec.interimResults = true;
    rec.onstart  = () => { setAiStatus("listening"); setLiveText(""); };
    rec.onend    = () => { if (aiStatus === "listening") { setAiStatus("idle"); setLiveText(""); } };
    rec.onerror  = () => { setAiStatus("idle"); setLiveText(""); };
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join("");
      setLiveText(t);
      if (e.results[e.results.length - 1].isFinal) {
        rec.stop(); setAiStatus("thinking"); setLiveText("");
        setTimeout(() => sendMsg(t, true), 300);
      }
    };
    recRef.current = rec; rec.start();
  }

  const SM = {
    idle:      { icon: "🎓", label: "Listo para instrucciones", sub: "Escribe o usa el micrófono", color: "var(--muted)" },
    listening: { icon: "🎙️", label: "Escuchando…", sub: liveText || "Habla en español", color: "var(--critical)" },
    thinking:  { icon: "⚙️", label: "Analizando datos…", sub: "Procesando tu consulta", color: "var(--brand)" },
    speaking:  { icon: "🔊", label: "Respondiendo en voz…", sub: "Haz clic en ⏹ para detener", color: "var(--ok)" },
  };
  const sm = SM[aiStatus] || SM.idle;

  return (
    <div className="ai-panel">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--brand)", boxShadow: "0 0 8px var(--brand)", animation: aiStatus !== "idle" ? "pulse 1.4s ease infinite" : "none" }} />
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Asistente IA Académica</div>
          <span className="tag" style={{ background: "var(--brand-light)", color: "var(--brand)", fontSize: 10 }}>Gemelo Digital · v2</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {studentRows.length} estudiantes · {courseInfo?.Name || "Curso activo"}
        </div>
      </div>

      {/* Status bar */}
      <div className={`ai-status-outer ${aiStatus !== "idle" ? aiStatus : ""}`}>
        <div className="ai-status-icon" style={{ fontSize: 18 }}>{sm.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: sm.color }}>{sm.label}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sm.sub}</div>
        </div>
        {(aiStatus === "listening" || aiStatus === "speaking") && (
          <div className="ai-wave">
            {[1,2,3,4,5].map((n) => (
              <div key={n} className="ai-wave-bar" style={{
                background: aiStatus === "listening" ? "var(--critical)" : "var(--ok)"
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CHIPS.map((c) => (
          <button key={c.label} className="ai-chip-btn" onClick={() => sendMsg(c.icon + " " + c.label)}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* Chat */}
      <div className="ai-chat" ref={chatRef}>
        {msgs.map((m) => (
          <div key={m.id} className={`ai-bubble-wrap ${m.role}`}>
            <div className="ai-meta">
              {m.role === "bot" ? "Asistente" : "Tú"}
              {m.fromVoice && <span className="ai-voice-badge">🎙️ voz</span>}
            </div>
            <div className={`ai-bubble ${m.role}`} dangerouslySetInnerHTML={{ __html: m.text }} />
            {m.role === "bot" && (
              <button
                className={`ai-speak-btn${activeSpeakId === m.id ? " active" : ""}`}
                onClick={() => activeSpeakId === m.id ? stopSpeaking() : speakText(m.text, m.id)}
              >
                {activeSpeakId === m.id ? "⏸ Detener" : "🔊 Escuchar"}
              </button>
            )}
          </div>
        ))}
        {aiStatus === "thinking" && (
          <div className="ai-bubble-wrap bot">
            <div className="ai-meta">Asistente</div>
            <div className="ai-bubble bot">
              <div className="ai-typing">
                <div className="ai-typing-dot" /><div className="ai-typing-dot" /><div className="ai-typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input row */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        {voiceOk && (
          <button
            className={`voice-btn${aiStatus === "listening" ? " listening" : ""}`}
            onClick={toggleMic}
            title={aiStatus === "listening" ? "Detener" : "Hablar"}
            style={{ height: 44, width: 44, fontSize: 18, flexShrink: 0 }}
          >
            {aiStatus === "listening" ? "⏹" : "🎙️"}
          </button>
        )}
        <input
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
          placeholder={aiStatus === "listening" ? "🎙️ Escuchando…" : "Escribe una instrucción o usa el micrófono…"}
        />
        <button className="ai-send-btn" onClick={() => sendMsg()}>Enviar ↵</button>
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <button
          className={`ai-toggle${voiceOut ? " active" : ""}`}
          onClick={() => { setVoiceOut((v) => !v); if (aiStatus === "speaking") stopSpeaking(); }}
        >
          <div className="ai-toggle-dot" />
          <span style={{ fontSize: 11, fontWeight: 700, color: voiceOut ? "var(--ok)" : "var(--muted)" }}>
            {voiceOut ? "🔊 Voz activada" : "🔇 Voz desactivada"}
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Velocidad:</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "var(--text)", fontFamily: "var(--font-mono)", outline: "none" }}
          >
            <option value={0.8}>Lenta</option>
            <option value={1.0}>Normal</option>
            <option value={1.2}>Rápida</option>
            <option value={1.5}>Muy rápida</option>
          </select>
          <button className={`ai-stop-btn${aiStatus === "speaking" ? " visible" : ""}`} onClick={stopSpeaking}>⏹ Detener</button>
        </div>
      </div>

      {/* Guide cards */}
      <div className="ai-guide-grid">
        {[
          { icon: "🎙️", color: "var(--brand)", title: "Entrada de Voz", desc: "Presiona el micrófono y habla en español. La transcripción se procesa automáticamente." },
          { icon: "🔊", color: "var(--ok)", title: "Salida de Voz", desc: "Activa la voz y el asistente leerá cada respuesta. Usa '🔊 Escuchar' en mensajes anteriores." },
          { icon: "⚡", color: "var(--watch)", title: "Datos Reales", desc: "Todas las respuestas usan los datos del curso en tiempo real — notas, cobertura, riesgo y RAs." },
        ].map((g) => (
          <div key={g.title} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{g.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: g.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{g.title}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{g.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Voice command helpers
// ─────────────────────────────────────────────────────────
function normalizeVoiceText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function includesAny(text, patterns) {
  return patterns.some((p) => text.includes(p));
}

function parseVoiceCommand(rawText) {
  const text = normalizeVoiceText(rawText);
  if (!text) return { type: "unknown", message: "No se reconoció ningún comando." };

  if (includesAny(text, ["resultado de aprendizaje","resultados de aprendizaje","prioridad academica","competencias","subcompetencias","logro por ra"])) {
    return { type: "navigate_section", section: "learning-outcomes", message: "Mostrando resultados de aprendizaje." };
  }
  if (includesAny(text, ["estudiantes prioritarios","prioritarios","mayor riesgo","riesgo mas alto","riesgo alto","en riesgo"])) {
    return { type: "highest_risk_student", message: "Buscando el estudiante con mayor riesgo académico." };
  }
  if (includesAny(text, ["resultado mas bajo","peor resultado","nota mas baja","menor nota","estudiante mas bajo","peor desempe"])) {
    return { type: "lowest_result_student", message: "Buscando el estudiante con menor desempeño." };
  }
  if (includesAny(text, ["estudiantes en riesgo","solo riesgo","muestrame los de riesgo","filtrar riesgo"])) {
    return { type: "filter_students_risk", message: "Filtrando estudiantes en riesgo." };
  }
  if (includesAny(text, ["evidencias","abre evidencias","mostrar evidencias"])) {
    return { type: "open_drawer_tab", tab: "evidencias", message: "Abriendo evidencias." };
  }
  if (includesAny(text, ["unidades","subcompetencias","abre unidades"])) {
    return { type: "open_drawer_tab", tab: "unidades", message: "Abriendo unidades." };
  }
  if (includesAny(text, ["intervencion","prescripcion"])) {
    return { type: "open_drawer_tab", tab: "prescripcion", message: "Abriendo intervención personalizada." };
  }
  if (includesAny(text, ["calidad","flags","calidad del modelo"])) {
    return { type: "open_drawer_tab", tab: "calidad", message: "Abriendo calidad del modelo." };
  }
  if (includesAny(text, ["resumen","volver al resumen"])) {
    return { type: "open_drawer_tab", tab: "resumen", message: "Abriendo resumen del estudiante." };
  }
  if (includesAny(text, ["aprobados","aprobado","pasando"])) {
    return { type: "filter_approved", message: "Mostrando estudiantes aprobados (≥7.0)." };
  }

  const buscarMatch = text.match(/(?:busca|buscar|abrir|abre|mostrar|muestrame)\s+a?\s*([a-zà-ü\s]+)$/i);
  if (buscarMatch?.[1] && buscarMatch[1].trim().length >= 3) {
    return { type: "find_student_by_name", name: buscarMatch[1].trim(), message: `Buscando a ${buscarMatch[1].trim()}.` };
  }
  if (includesAny(text, ["estudiantes","lista de estudiantes"])) {
    return { type: "navigate_section", section: "students", message: "Mostrando listado de estudiantes." };
  }
  if (text.length >= 3) {
    return { type: "text_search", text: rawText, message: `Buscando: ${rawText}` };
  }
  return { type: "unknown", message: "No se entendió el comando. Prueba: 'estudiante con resultado más bajo' o 'resultados de aprendizaje'." };
}

function findLowestResultStudent(rows) {
  const valid = (Array.isArray(rows) ? rows : []).filter(
    (s) => !s?.isLoading && s?.currentPerformancePct != null && !Number.isNaN(Number(s.currentPerformancePct))
  );
  if (!valid.length) return null;
  return valid.slice().sort((a, b) => Number(a.currentPerformancePct) - Number(b.currentPerformancePct))[0];
}

function findHighestRiskStudent(rows) {
  const valid = (Array.isArray(rows) ? rows : []).filter((s) => !s?.isLoading);
  if (!valid.length) return null;
  const riskRank = (s) => {
    const risk = computeRiskFromPct(s?.currentPerformancePct);
    if (risk === "alto") return 0;
    if (risk === "medio") return 1;
    if (risk === "bajo") return 2;
    return 3;
  };
  return valid.slice().sort((a, b) => {
    const rd = riskRank(a) - riskRank(b);
    if (rd !== 0) return rd;
    return Number(a?.currentPerformancePct ?? 999) - Number(b?.currentPerformancePct ?? 999);
  })[0];
}

function findStudentByName(rows, name) {
  const q = normalizeVoiceText(name);
  return (Array.isArray(rows) ? rows : []).find((s) => normalizeVoiceText(s?.displayName).includes(q)) || null;
}

// ─────────────────────────────────────────────────────────
// CoursePanel — lista de cursos del docente
// ─────────────────────────────────────────────────────────
function CoursePanel({ courses, loadingCourses, currentId, onSelect, onClose }) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        String(c.name || "").toLowerCase().includes(q) ||
        String(c.code || "").toLowerCase().includes(q)
    );
  }, [courses, search]);

  const active = filtered.filter((c) => c.isActive !== false);
  const inactive = filtered.filter((c) => c.isActive === false);

  return (
    <div className="course-panel-overlay" onClick={onClose}>
      <div className="course-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Mis cursos</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {loadingCourses ? "Cargando…" : `${courses.length} curso${courses.length !== 1 ? "s" : ""} encontrado${courses.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ padding: "6px 12px", fontSize: 12 }}>
            ✕ Cerrar
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código…"
            type="text"
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 10, padding: "8px 12px",
              fontWeight: 600, background: "var(--bg)",
              color: "var(--text)", fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingCourses ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              <div className="pulse-dot" style={{ background: "var(--brand)", width: 10, height: 10, margin: "0 auto 12px" }} />
              Consultando Brightspace…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              Sin resultados para "{search}"
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <>
                  <div style={{ padding: "8px 16px 4px", fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Activos · {active.length}
                  </div>
                  {active.map((c) => (
                    <CourseItem key={c.id} course={c} isActive={true} isCurrent={c.id === currentId} onSelect={onSelect} />
                  ))}
                </>
              )}
              {inactive.length > 0 && (
                <>
                  <div style={{ padding: "12px 16px 4px", fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Históricos · {inactive.length}
                  </div>
                  {inactive.map((c) => (
                    <CourseItem key={c.id} course={c} isActive={false} isCurrent={c.id === currentId} onSelect={onSelect} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CourseItem({ course, isActive, isCurrent, onSelect }) {
  const startYear = course.startDate ? new Date(course.startDate).getFullYear() : null;
  const endYear   = course.endDate   ? new Date(course.endDate).getFullYear()   : null;
  const period = startYear && endYear && startYear !== endYear
    ? `${startYear}–${endYear}` : startYear ? String(startYear) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`course-item${isCurrent ? " active" : ""}`}
      onClick={() => onSelect(course.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(course.id); }}
    >
      <div
        className="course-item-dot"
        style={{ background: isActive ? "var(--ok)" : "var(--muted)" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {course.name || `Curso ${course.id}`}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
          {course.code && (
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)", fontWeight: 600 }}>
              {course.code}
            </span>
          )}
          {period && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{period}</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        {isCurrent && (
          <span className="tag" style={{ fontSize: 10, padding: "2px 6px" }}>Activo</span>
        )}
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
          {course.id}
        </span>
      </div>
    </div>
  );
}

function StudentCard({ s, onOpen, weakestMacro }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(s)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen(s);
      }}
      className="kpi-card fade-up"
      style={{ cursor: "pointer" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 14 }}>{s.displayName}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>ID {s.userId}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <StatusBadge status={s.isLoading ? "cargando" : s.risk} />
          {s.hasPrescription && <span className="tag" style={{ fontSize: 10 }}>📋 Prescripción</span>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={{ textAlign: "center", padding: "8px 4px", background: "var(--bg)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 2 }}>NOTA</div>
          <div style={{ fontWeight: 900, color: colorForPct(s.currentPerformancePct, null), fontSize: 16, fontFamily: "var(--font-mono)" }}>
            {fmtGrade10FromPct(s.currentPerformancePct)}
          </div>
        </div>
        <div style={{ textAlign: "center", padding: "8px 4px", background: "var(--bg)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 2 }}>COBERTURA</div>
          <div style={{ fontWeight: 800, fontSize: 13, fontFamily: "var(--font-mono)" }}>{fmtPct(s.coveragePct)}</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>{s.coverageCountText || "—"}</div>
        </div>
        <div style={{ textAlign: "center", padding: "8px 4px", background: "var(--bg)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 2 }}>RA CRÍTICO</div>
          <div style={{ fontWeight: 800, fontSize: 12, fontFamily: "var(--font-mono)", color: s.mostCriticalMacro ? "var(--text)" : "var(--muted)" }}>
            {s.mostCriticalMacro?.code ?? weakestMacro?.code ?? "—"}
            {!s.mostCriticalMacro && weakestMacro && <span style={{ fontSize: 9, opacity: 0.6 }}>~</span>}
          </div>
        </div>
      </div>

      {s.coveragePct != null && <ProgressBar value={s.coveragePct} color={colorForPct(s.coveragePct, null)} />}

      <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{s.route?.title || "—"}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, marginTop: 1 }}>{s.route?.summary}</div>
        </div>
        <button className="btn" style={{ fontSize: 11, padding: "5px 10px" }} onClick={(e) => { e.stopPropagation(); onOpen(s); }}>
          Ver gemelo →
        </button>
      </div>
    </div>
  );
}

/**
 * =========================
 * Main App
 * =========================
 */
export default function App() {
  useEffect(() => {
    injectStyles();
  }, []);

  const isNarrow = useMediaQuery("(max-width: 900px)");
  const isMobile = useMediaQuery("(max-width: 640px)");

  // ── Section refs for voice scroll navigation ────────────
  const overviewRef        = React.useRef(null);
  const priorityRef        = React.useRef(null);
  const learningOutcomesRef = React.useRef(null);
  const studentsRef        = React.useRef(null);

  // ── Voice command state ─────────────────────────────────
  const [voiceFeedback, setVoiceFeedback] = useState("");
  const [activeSection, setActiveSection] = useState("students");
  const [advancedQuery, setAdvancedQuery] = useState({ mode: "text", target: null });

  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // Scroll to section when voice command navigates
  useEffect(() => {
    const map = {
      overview:          overviewRef,
      priority:          priorityRef,
      "learning-outcomes": learningOutcomesRef,
      students:          studentsRef,
    };
    const ref = map[activeSection];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeSection]);

  const [orgUnitId, setOrgUnitId] = useState(DEFAULT_ORG_UNIT_ID);
  const [orgUnitInput, setOrgUnitInput] = useState(String(DEFAULT_ORG_UNIT_ID));

  const [outcomesMap, setOutcomesMap] = useState({});
  const [learningOutcomesPayload, setLearningOutcomesPayload] = useState(null);
  const [contentRoot, setContentRoot] = useState([]);
  const [overview, setOverview] = useState(null);
  const [studentsList, setStudentsList] = useState(null);
  const [studentRows, setStudentRows] = useState([]);
  const [raDashboard, setRaDashboard] = useState(null);

  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [courseInfo, setCourseInfo] = useState(null);
  const [query, setQuery] = useState("");
  const [onlyRisk, setOnlyRisk] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentErr, setStudentErr] = useState("");

  const [drawerTab, setDrawerTab] = useState("resumen");

  // ── Main navigation tabs ──────────────────────────────
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard" | "assistant"

  // ── Course panel ───────────────────────────────────────
  const [showCoursePanel, setShowCoursePanel] = useState(false);
  const [courseList, setCourseList] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseListLoaded, setCourseListLoaded] = useState(false);

  // Cargar lista de cursos del docente (lazy — solo cuando abre el panel)
  const loadCourseList = React.useCallback(async () => {
    if (courseListLoaded || loadingCourses) return;
    setLoadingCourses(true);
    try {
      const data = await apiGet("/brightspace/my-course-offerings?active_only=false&limit=500");
      const items = Array.isArray(data?.items) ? data.items : [];
      // Ordenar: activos primero, luego por nombre
      items.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
      });
      setCourseList(items);
      setCourseListLoaded(true);
    } catch {
      // no bloquear la app si falla
    } finally {
      setLoadingCourses(false);
    }
  }, [courseListLoaded, loadingCourses]);

  const handleOpenCoursePanel = () => {
    setShowCoursePanel(true);
    loadCourseList();
  };

  const handleSelectCourse = (id) => {
    const v = Number(id);
    if (v > 0) {
      setOrgUnitId(v);
      setOrgUnitInput(String(v));
    }
    setShowCoursePanel(false);
  };

  // ── Voice search ───────────────────────────────────────
  const [voiceListening, setVoiceListening] = useState(false);
  const recognitionRef = React.useRef(null);

  const voiceSupported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // executeVoiceCommand MUST be declared before toggleVoice (dependency order)
  const executeVoiceCommand = React.useCallback((rawText) => {
    const command = parseVoiceCommand(rawText);
    setVoiceFeedback(command.message || "");

    switch (command.type) {
      case "navigate_section": {
        setAdvancedQuery({ mode: "text", target: null });
        setOnlyRisk(false);
        setQuery("");
        setActiveSection(command.section);
        return;
      }
      case "lowest_result_student": {
        setAdvancedQuery({ mode: "lowest-result", target: null });
        const student = findLowestResultStudent(studentRows);
        if (student) {
          setActiveSection("students");
          setSelectedStudent(student);
          setDrawerTab("resumen");
          setVoiceFeedback(`Abriendo a ${student.displayName} — nota más baja: ${fmtGrade10FromPct(student.currentPerformancePct)}.`);
        } else {
          setVoiceFeedback("No encontré estudiantes con calificación disponible.");
        }
        return;
      }
      case "highest_risk_student": {
        setAdvancedQuery({ mode: "highest-risk", target: null });
        const student = findHighestRiskStudent(studentRows);
        if (student) {
          setActiveSection("priority");
          setSelectedStudent(student);
          setDrawerTab("resumen");
          setVoiceFeedback(`Abriendo a ${student.displayName} — estudiante priorizado por riesgo académico.`);
        } else {
          setVoiceFeedback("No encontré estudiantes priorizados.");
        }
        return;
      }
      case "filter_students_risk": {
        setAdvancedQuery({ mode: "students-at-risk", target: null });
        setActiveSection("students");
        setOnlyRisk(true);
        setQuery("");
        setVoiceFeedback("Filtro activado: solo estudiantes en riesgo.");
        return;
      }
      case "filter_approved": {
        setAdvancedQuery({ mode: "text", target: null });
        setActiveSection("students");
        setOnlyRisk(false);
        setQuery(""); // will filter via advancedQuery
        setAdvancedQuery({ mode: "approved", target: null });
        setVoiceFeedback("Mostrando estudiantes aprobados (nota ≥ 7.0).");
        return;
      }
      case "find_student_by_name": {
        setAdvancedQuery({ mode: "text", target: null });
        const student = findStudentByName(studentRows, command.name);
        if (student) {
          setActiveSection("students");
          setSelectedStudent(student);
          setDrawerTab("resumen");
          setVoiceFeedback(`Abriendo a ${student.displayName}.`);
        } else {
          setQuery(command.name);
          setActiveSection("students");
          setVoiceFeedback(`No encontré coincidencia exacta. Buscando: "${command.name}".`);
        }
        return;
      }
      case "open_drawer_tab": {
        setAdvancedQuery({ mode: "text", target: null });
        if (!selectedStudent) {
          const fallback = findHighestRiskStudent(studentRows);
          if (fallback) {
            setSelectedStudent(fallback);
            setDrawerTab(command.tab);
            setVoiceFeedback(`Abriendo ${command.tab} para ${fallback.displayName}.`);
          } else {
            setVoiceFeedback("No hay estudiante seleccionado. Abre uno primero.");
          }
        } else {
          setDrawerTab(command.tab);
          setVoiceFeedback(`Abriendo ${command.tab} para ${selectedStudent.displayName}.`);
        }
        return;
      }
      case "text_search": {
        setActiveSection("students");
        setOnlyRisk(false);
        setAdvancedQuery({ mode: "text", target: null });
        setQuery(command.text || "");
        return;
      }
      default: {
        // feedback already set above
      }
    }
  }, [studentRows, selectedStudent]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVoice = React.useCallback(() => {
    if (!voiceSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (voiceListening) {
      recognitionRef.current?.stop();
      setVoiceListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = "es-CO";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => {
      setVoiceListening(true);
      setVoiceFeedback("🎙️ Escuchando... habla ahora");
    };
    rec.onend   = () => setVoiceListening(false);
    rec.onerror = () => {
      setVoiceListening(false);
      setVoiceFeedback("No fue posible capturar el audio. Intenta de nuevo.");
    };

    rec.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (transcript) {
        executeVoiceCommand(transcript);
      } else {
        setVoiceFeedback("No se detectó un comando claro.");
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }, [voiceListening, voiceSupported, executeVoiceCommand]);

  // Stop recognition on unmount
  React.useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const hideGlobalProgressCol = isNarrow;
  const hideCriticalMacroCol = isMobile;
  const compactRouteCol = isNarrow;
  const useCards = isMobile;

  /**
   * Load course overview/student dashboard
   */
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    setLoading(true);
    setErr("");
    setOverview(null);
    setStudentsList(null);
    setStudentRows([]);
    setRaDashboard(null);
    setLearningOutcomesPayload(null);
    setOutcomesMap({});

    (async () => {
      try {
        const [ovRes, stRes, raRes, loRes] = await Promise.allSettled([
          apiGet(`/gemelo/course/${orgUnitId}/overview`, { signal: controller.signal }),
          apiGet(`/gemelo/course/${orgUnitId}/students?include=summary`, { signal: controller.signal }),
          apiGet(`/gemelo/course/${orgUnitId}/ra/dashboard`, { signal: controller.signal }),
          apiGet(`/gemelo/course/${orgUnitId}/learning-outcomes`, { signal: controller.signal }),
        ]);

        if (!isMounted) return;
        if (ovRes.status !== "fulfilled") throw ovRes.reason;
        if (stRes.status !== "fulfilled") throw stRes.reason;

        const ov = ovRes.value;
        const st = stRes.value;

        setOverview(ov);
        setStudentsList(st);
        if (raRes.status === "fulfilled") setRaDashboard(raRes.value);

        if (loRes.status === "fulfilled") {
          const payload = loRes.value;
          setLearningOutcomesPayload(payload);

          const sets = Array.isArray(payload?.outcomeSets) ? payload.outcomeSets : [];
          const map = {};
          for (const set of sets) {
            for (const o of set?.Outcomes || []) {
              const desc = String(o?.Description || "").trim();
              const m = desc.match(/^([A-Za-z0-9_.-]+)\s*-\s*(.+)$/);
              if (m) {
                const code = String(m[1]).toUpperCase();
                map[code] = {
                  code,
                  description: desc,
                  title: String(m[2] || "").trim(),
                };
              }
            }
          }
          setOutcomesMap(map);
        }

        const studentItems = (st?.students?.items || st?.items || []).slice();
        const thr = ov?.thresholds || { critical: 50, watch: 70 };

        const baseRows = studentItems.map((s) => {
          const userId = s.userId ?? s.UserId ?? s.Identifier;
          const base = {
            userId: Number(userId),
            displayName: s.displayName ?? s.DisplayName ?? "—",
            roleName: s.roleName ?? "—",
            isLoading: true,
            risk: "cargando",
            globalPct: null,
            currentPerformancePct: null,
            coveragePct: null,
            coverageCountText: null,
            gradedItemsCount: null,
            totalItemsCount: null,
            hasPrescription: false,
            mostCriticalMacro: null,
            notSubmittedWeightPct: null,
          };
          base.route = suggestRouteForStudent(base, thr);
          return base;
        });

        setStudentRows(baseRows);
        setLoading(false);

        // hasInlineSummary: detecta si el backend devolvió métricas reales con datos de nota.
        // Requisito: al menos un estudiante tiene currentPerformancePct o coveragePct real.
        // Si el batch endpoint retornó todos nulos (falla silenciosa), caemos al mapLimit.
        const _hasMeaningfulData = studentItems.some((s) => {
          const sum = s.summary ?? s.gradebook ?? {};
          return sum?.currentPerformancePct != null || sum?.coveragePct != null;
        });
        // También consideramos válido si hay estructura de items (totalItemsCount > 0)
        // para al menos un estudiante — aunque no tenga nota aún
        const _hasStructure = studentItems.some((s) => {
          const sum = s.summary ?? s.gradebook ?? {};
          return (sum?.totalItemsCount != null && sum.totalItemsCount > 0);
        });
        const hasInlineSummary = studentItems.length > 0 && (_hasMeaningfulData || _hasStructure);

        if (hasInlineSummary) {
          const details = studentItems.map((s) => {
            const userId = s.userId ?? s.UserId ?? s.Identifier;
            const sum = s.summary ?? s.gradebook ?? s;
            const gradedItemsCount = sum?.gradedItemsCount ?? sum?.coverageGradedCount ?? null;
            const totalItemsCount = sum?.totalItemsCount ?? sum?.coverageTotalCount ?? null;
            const coverageCountText =
              sum?.coverageCountText ??
              (gradedItemsCount != null && totalItemsCount != null ? `${gradedItemsCount}/${totalItemsCount}` : null);

            const row = {
              userId: Number(userId),
              displayName: s.displayName ?? s.DisplayName ?? "—",
              roleName: s.roleName ?? "—",
              isLoading: false,
              // Riesgo siempre desde nota del gradebook (no del campo risk del backend que puede ser de RA)
              risk: computeRiskFromPct(sum?.currentPerformancePct ?? null),
              globalPct: sum?.globalPct ?? null,
              currentPerformancePct: sum?.currentPerformancePct ?? null,
              coveragePct: sum?.coveragePct ?? null,
              gradedItemsCount,
              totalItemsCount,
              coverageCountText,
              hasPrescription: Boolean(sum?.hasPrescription ?? s?.hasPrescription ?? false),
              mostCriticalMacro: s?.mostCriticalMacro ?? null,
              // Nombres normalizados: pendingSubmitted + overdue para compatibilidad con toda la UI
              pendingSubmittedCount:     sum?.pendingUngradedCount      ?? sum?.pendingSubmittedCount      ?? 0,
              pendingSubmittedWeightPct: sum?.pendingUngradedWeightPct  ?? sum?.pendingSubmittedWeightPct  ?? 0,
              overdueCount:              sum?.overdueUnscoredCount       ?? sum?.overdueCount               ?? 0,
              overdueWeightPct:          sum?.overdueUnscoredWeightPct   ?? sum?.overdueWeightPct           ?? 0,
              notSubmittedCount:         sum?.overdueUnscoredCount       ?? sum?.notSubmittedCount          ?? 0,
              notSubmittedWeightPct:     sum?.overdueUnscoredWeightPct   ?? sum?.notSubmittedWeightPct      ?? 0,
            };
            row.route = suggestRouteForStudent(row, thr);
            return row;
          });

          if (!isMounted) return;
          setStudentRows(details);

          // Enriquecer con datos de overview.studentsAtRisk (ya tiene currentPerformancePct
          // calculado por build_course_overview que sí usa build_gemelo individual).
          // Esto evita hacer llamadas adicionales a /student/{id} que pueden fallar por CORS
          // en algunos entornos de producción.
          const atRiskMap = {};
          for (const s of (ov?.studentsAtRisk || [])) {
            if (s.userId != null) atRiskMap[Number(s.userId)] = s;
          }

          if (Object.keys(atRiskMap).length > 0) {
            setStudentRows((prev) =>
              prev.map((row) => {
                const ar = atRiskMap[row.userId];
                if (!ar) return row;
                const perf = ar.currentPerformancePct ?? null;
                const merged = {
                  ...row,
                  currentPerformancePct: perf,
                  coveragePct: ar.coveragePct ?? row.coveragePct,
                  risk: computeRiskFromPct(perf),
                  notSubmittedWeightPct: Number(ar.overdueUnscoredWeightPct ?? ar.notSubmittedWeightPct ?? 0),
                  overdueWeightPct:      Number(ar.overdueUnscoredWeightPct ?? ar.notSubmittedWeightPct ?? 0),
                  pendingSubmittedWeightPct: Number(ar.pendingUngradedWeightPct ?? ar.pendingSubmittedWeightPct ?? 0),
                  // mostCriticalMacro now included from backend studentsAtRisk
                  mostCriticalMacro: ar.mostCriticalMacro ?? row.mostCriticalMacro ?? null,
                };
                merged.route = suggestRouteForStudent(merged, thr);
                return merged;
              })
            );
          }
          return;
        }

        // El batch /students?include=summary no devolvió estructura (hasInlineSummary=false).
        // Enriquecer desde overview.studentsAtRisk en lugar de llamar /student/{id}
        // (esas llamadas pueden fallar por CORS en producción).
        const atRiskMap2 = {};
        for (const s of (ov?.studentsAtRisk || [])) {
          if (s.userId != null) atRiskMap2[Number(s.userId)] = s;
        }
        setStudentRows((prev) =>
          prev.map((row) => {
            const ar = atRiskMap2[row.userId];
            const perf = ar?.currentPerformancePct ?? null;
            const merged = {
              ...row,
              isLoading: false,
              currentPerformancePct: perf,
              coveragePct: ar?.coveragePct ?? row.coveragePct,
              risk: computeRiskFromPct(perf),
              notSubmittedWeightPct: Number(ar?.overdueUnscoredWeightPct ?? ar?.notSubmittedWeightPct ?? 0),
              overdueWeightPct:      Number(ar?.overdueUnscoredWeightPct ?? ar?.notSubmittedWeightPct ?? 0),
              pendingSubmittedWeightPct: Number(ar?.pendingUngradedWeightPct ?? ar?.pendingSubmittedWeightPct ?? 0),
              mostCriticalMacro: ar?.mostCriticalMacro ?? row.mostCriticalMacro ?? null,
            };
            merged.route = suggestRouteForStudent(merged, thr);
            return merged;
          })
        );
      } catch (e) {
        if (controller.signal.aborted || !isMounted) return;
        setErr(String(e?.message || e));
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [orgUnitId]);

  /**
   * Load course info + content root
   */
  useEffect(() => {
    if (!orgUnitId) return;

    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        const [courseRes, contentRes] = await Promise.allSettled([
          apiGet(`/brightspace/course/${orgUnitId}`, { signal: controller.signal }),
          apiGet(`/brightspace/course/${orgUnitId}/content/root`, { signal: controller.signal }),
        ]);

        if (!alive) return;

        if (courseRes.status === "fulfilled") {
          setCourseInfo(courseRes.value);
        } else {
          console.error("Error cargando curso:", courseRes.reason);
          setCourseInfo(null);
        }

        if (contentRes.status === "fulfilled") {
          setContentRoot(Array.isArray(contentRes.value) ? contentRes.value : []);
        } else {
          console.error("Error cargando contenido root:", contentRes.reason);
          setContentRoot([]);
        }
      } catch (e) {
        if (!alive || controller.signal.aborted) return;
        console.error("Error cargando curso/contenido:", e);
        setCourseInfo(null);
        setContentRoot([]);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [orgUnitId]);

  /**
   * Load student detail
   */
  useEffect(() => {
    if (!selectedStudent?.userId) return;

    let alive = true;
    const controller = new AbortController();

    setStudentLoading(true);
    setStudentErr("");
    setStudentDetail(null);
    setDrawerTab("resumen");

    (async () => {
      try {
        const g = await apiGet(`/gemelo/course/${orgUnitId}/student/${selectedStudent.userId}`, {
          signal: controller.signal,
        });
        if (!alive) return;

        // Si el servidor no incluyó evidencias en el gradebook (modo estudiante en server antiguo),
        // las obtenemos del endpoint directo de Brightspace.
        const hasEvidences = Array.isArray(g?.gradebook?.evidences) && g.gradebook.evidences.length > 0;
        if (!hasEvidences && g?.summary?.gradedItemsCount > 0) {
          try {
            const ev = await apiGet(
              `/brightspace/course/${orgUnitId}/grades/student/${selectedStudent.userId}/evidence`,
              { signal: controller.signal }
            );
            if (alive && Array.isArray(ev?.items)) {
              const normalized = ev.items
                .filter((e) => e.points != null || e.displayed != null)
                .map((e) => {
                  const pts  = e.points   != null ? Number(e.points)    : null;
                  const max  = e.maxPoints != null ? Number(e.maxPoints) : null;
                  const scorePct = pts != null && max != null && max > 0
                    ? Math.round((pts / max) * 1000) / 10
                    : null;
                  return {
                    gradeObjectId: e.gradeObjectId,
                    name:      e.name || `Ítem ${e.gradeObjectId}`,
                    weightPct: e.weight != null ? Number(e.weight) : null,
                    scorePct,
                    status:    scorePct != null ? "graded" : (e.displayed ? "pending" : "open"),
                  };
                });
              g.gradebook = { ...(g.gradebook || {}), evidences: normalized };
            }
          } catch {
            // evidencias no disponibles — no bloquear el drawer
          }
        }

        setStudentDetail(g);
      } catch (e) {
        if (controller.signal.aborted || !alive) return;
        setStudentErr(String(e?.message || e));
      } finally {
        if (!alive) return;
        setStudentLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [selectedStudent?.userId, orgUnitId]);

  const thresholds = overview?.thresholds || { critical: 50, watch: 70 };

  const riskData = useMemo(() => {
    // Calculado desde notas reales (no globalRiskDistribution del backend que puede ser por RA)
    const counts = { alto: 0, medio: 0, bajo: 0 };
    for (const s of studentRows) {
      if (s.isLoading || s.currentPerformancePct == null) continue;
      const r = computeRiskFromPct(s.currentPerformancePct);
      if (r in counts) counts[r]++;
    }
    return [
      { name: "Alto", key: "alto", value: counts.alto },
      { name: "Medio", key: "medio", value: counts.medio },
      { name: "Bajo", key: "bajo", value: counts.bajo },
    ];
  }, [studentRows]);

  const learningOutcomesData = useMemo(() => {
  const ras = Array.isArray(raDashboard?.ras) ? raDashboard.ras : [];
  const descList = flattenOutcomeDescriptions(learningOutcomesPayload);

  // Si los RAs existen pero TODOS tienen studentsWithData=0, no hay datos reales todavía
  const rasWithData = ras.filter((r) => Number(r.studentsWithData ?? 0) > 0);
  const effectiveRas = rasWithData.length > 0 ? ras : [];

  if (effectiveRas.length) {
    const outcomeMap = {};
    Object.values(outcomesMap || {}).forEach((o) => {
      if (o?.code) outcomeMap[String(o.code).toUpperCase()] = o;
    });

    const w = 100 / effectiveRas.length;

    return effectiveRas.map((r, idx) => {
      const code = String(r.code || `RA${idx + 1}`).toUpperCase();
      const match = outcomeMap[code];
      const fallbackDesc = descList[idx] || "";

      return {
        code,
        name: match?.title || r.label || fallbackDesc || code,
        description: match?.description || fallbackDesc || r.label || code,
        avgPct: Number(r.avgPct ?? 0),
        weightPct: Number(r.weightPct ?? w),
        status: r.status || null,
        coveragePct: Number(r.coveragePct ?? 0),
        studentsWithData: Number(r.studentsWithData ?? 0),
        totalStudents: Number(r.totalStudents ?? 0),
      };
    });
  }

  if (descList.length) {
    const w = 100 / descList.length;
    return descList.map((d, idx) => ({
      code: `RA${idx + 1}`,
      name: d,
      description: d,
      avgPct: 0,
      weightPct: w,
      status: null,
      coveragePct: 0,
      studentsWithData: 0,
      totalStudents: 0,
    }));
  }

  return [];
}, [raDashboard, learningOutcomesPayload, outcomesMap]);

const weakestAssignment = useMemo(() => {
  const allEvidence = [];

  for (const s of studentRows) {
    const evs = s?.evidences || s?.gradebook?.evidences || [];
    for (const ev of evs) {
      if (ev?.scorePct != null && !Number.isNaN(Number(ev.scorePct))) {
        allEvidence.push({
          gradeObjectId: ev.gradeObjectId,
          name: ev.name || `Ítem ${ev.gradeObjectId}`,
          scorePct: Number(ev.scorePct),
        });
      }
    }
  }

  if (!allEvidence.length) return null;

  const byItem = {};
  for (const ev of allEvidence) {
    const key = String(ev.gradeObjectId);
    if (!byItem[key]) {
      byItem[key] = {
        gradeObjectId: ev.gradeObjectId,
        name: ev.name,
        values: [],
      };
    }
    byItem[key].values.push(ev.scorePct);
  }

  const summary = Object.values(byItem).map((it) => {
    const avg = it.values.reduce((a, b) => a + b, 0) / it.values.length;
    return {
      gradeObjectId: it.gradeObjectId,
      name: it.name,
      avgPct: avg,
      count: it.values.length,
    };
  });

  summary.sort((a, b) => a.avgPct - b.avgPct);
  return summary[0] || null;
}, [studentRows]);

  const weakestMacro = useMemo(() => {
  if (!Array.isArray(learningOutcomesData) || !learningOutcomesData.length) return null;

  const valid = learningOutcomesData
    .filter((m) => m && m.avgPct != null && !Number.isNaN(Number(m.avgPct)))
    .map((m) => ({
      ...m,
      avgPct: Number(m.avgPct),
      coveragePct: Number(m.coveragePct ?? 0),
      studentsWithData: Number(m.studentsWithData ?? 0),
      totalStudents: Number(m.totalStudents ?? 0),
    }));

  if (!valid.length) return null;

  valid.sort((a, b) => a.avgPct - b.avgPct);
  return valid[0];
}, [learningOutcomesData]);

  const assignmentRiskData = useMemo(() => {
    const toItem = (raw, perf, overduePct, pendingPct, coveragePct) => {
      const risk = computeRiskFromPct(perf);
      const type =
        risk === "alto" || (perf != null && Number(perf) < 50)
          ? "low_grade"
          : overduePct > 0
          ? "overdue"
          : pendingPct > 0
          ? "pending_submitted"
          : "low_coverage";
      return {
        ...raw, type, risk,
        currentPerformancePct: perf != null ? Number(perf) : null,
        notSubmittedWeightPct: overduePct,
        pendingSubmittedWeightPct: pendingPct,
        coveragePct: Number(coveragePct ?? 0),
      };
    };

    // Fuente 1: overview.studentsAtRisk (backend)
    const backendRisk = Array.isArray(overview?.studentsAtRisk) ? overview.studentsAtRisk : [];
    let candidates = [];
    if (backendRisk.length > 0) {
      candidates = backendRisk.map((s) =>
        toItem(
          { userId: s.userId, name: s.displayName },
          s.currentPerformancePct,
          Number(s.overdueUnscoredWeightPct ?? s.notSubmittedWeightPct ?? 0),
          Number(s.pendingUngradedWeightPct ?? s.pendingSubmittedWeightPct ?? 0),
          s.coveragePct,
        )
      );
    } else {
      // Fuente 2: studentRows cargados
      const loaded = studentRows.filter((s) => !s.isLoading);
      candidates = loaded.map((s) =>
        toItem(
          { userId: s.userId, name: s.displayName },
          s.currentPerformancePct,
          Number(s.notSubmittedWeightPct ?? s.overdueWeightPct ?? 0),
          Number(s.pendingSubmittedWeightPct ?? 0),
          s.coveragePct,
        )
      );
    }

    const filtered = candidates.filter((s) => {
      if (s.risk === "alto" || s.risk === "medio") return true;
      if (s.risk === "pending") return s.coveragePct < 60 || s.notSubmittedWeightPct > 0 || s.pendingSubmittedWeightPct > 0;
      return s.notSubmittedWeightPct > 10 || s.pendingSubmittedWeightPct > 10;
    });

    const riskOrder = { alto: 0, medio: 1, pending: 2, bajo: 3 };
    filtered.sort((a, b) => {
      const ro = (riskOrder[a.risk] ?? 3) - (riskOrder[b.risk] ?? 3);
      if (ro !== 0) return ro;
      return (a.currentPerformancePct ?? 999) - (b.currentPerformancePct ?? 999);
    });

    const seen = new Set();
    return filtered.filter((s) => {
      if (seen.has(s.userId)) return false;
      seen.add(s.userId);
      return true;
    }).slice(0, 8);
  }, [overview, studentRows]);

  const avgPerfPct = overview?.courseGradebook?.avgCurrentPerformancePct ?? null;
  const avgCov = overview?.courseGradebook?.avgCoveragePct ?? null;
  const covDone = avgCov == null ? 0 : Math.max(0, Math.min(100, Number(avgCov)));

  // avgPendingUngradedPct: enviado sin nota. Fuente 1: backend. Fuente 2: promedio de studentRows.
  const avgPendingUngradedPct = useMemo(() => {
    const direct =
      overview?.courseGradebook?.avgPendingUngradedPct ??
      overview?.courseGradebook?.avgPendingSubmittedPct;
    if (direct != null && !Number.isNaN(Number(direct))) {
      return Math.max(0, Math.min(100, Number(direct)));
    }
    const loaded = studentRows.filter((s) => !s.isLoading);
    if (loaded.length > 0) {
      const vals = loaded
        .map((s) => Number(s.pendingSubmittedWeightPct ?? 0))
        .filter((x) => !Number.isNaN(x));
      if (vals.length > 0)
        return Math.min(100, vals.reduce((a, b) => a + b, 0) / loaded.length);
    }
    return 0;
  }, [overview, studentRows]);

  // avgOverdueUnscoredPct: vencido sin registro. Fuente 1: backend. Fuente 2: promedio de studentRows.
  const avgOverdueUnscoredPct = useMemo(() => {
    const direct =
      overview?.courseGradebook?.avgOverdueUnscoredPct ??
      overview?.courseGradebook?.avgNotSubmittedPct;
    if (direct != null && !Number.isNaN(Number(direct))) {
      return Math.max(0, Math.min(100, Number(direct)));
    }
    const loaded = studentRows.filter((s) => !s.isLoading);
    if (loaded.length > 0) {
      const vals = loaded
        .map((s) => Number(s.overdueWeightPct ?? s.notSubmittedWeightPct ?? 0))
        .filter((x) => !Number.isNaN(x));
      if (vals.length > 0)
        return Math.min(100, vals.reduce((a, b) => a + b, 0) / loaded.length);
    }
    // Fallback 2: studentsAtRisk si rows aún no cargaron
    const atRisk = Array.isArray(overview?.studentsAtRisk) ? overview.studentsAtRisk : [];
    if (atRisk.length > 0) {
      const total = overview?.studentsCount ?? atRisk.length;
      const sum = atRisk.reduce(
        (acc, s) => acc + Number(s.overdueUnscoredWeightPct ?? s.notSubmittedWeightPct ?? 0), 0
      );
      return Math.min(100, sum / total);
    }
    return 0;
  }, [overview, studentRows]);

  const covPending = Math.max(
    0,
    Math.min(100, 100 - covDone - avgPendingUngradedPct - avgOverdueUnscoredPct)
  );

  const studentsCount = overview?.studentsCount ?? studentsList?.students?.count ?? studentRows.length ?? 0;
  const totalStudents = Number(studentsCount || 0) || 0;
  // atRiskCount calculado desde nota real (computeRiskFromPct), no desde globalRiskDistribution del backend
  // que puede basarse en RA/rúbricas y no en el gradebook final.
  const atRiskCount = studentRows.filter((s) => {
    if (s.isLoading || s.currentPerformancePct == null) return false;
    return computeRiskFromPct(s.currentPerformancePct) !== "bajo";
  }).length;
  const atRiskPct = totalStudents > 0 ? (atRiskCount / totalStudents) * 100 : null;

  const courseStatus = useMemo(() => {
    if (avgPerfPct != null && Number(avgPerfPct) > 0) {
      const p = Number(avgPerfPct);
      if (p < thresholds.critical) return "critico";
      if (p < thresholds.watch) return "en seguimiento";
      return "solido";
    }
    // Fallback: distribución calculada desde notas reales de studentRows
    const loaded = studentRows.filter((s) => !s.isLoading && s.currentPerformancePct != null);
    if (!loaded.length) return "pending";
    const a = loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "alto").length;
    const m = loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "medio").length;
    const b = loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "bajo").length;
    if (a >= m && a >= b && a > 0) return "critico";
    if (m >= a && m >= b && m > 0) return "en desarrollo";
    if (b > 0) return "solido";
    return "pending";
  }, [avgPerfPct, thresholds, overview, studentRows]);

  const filteredStudents = useMemo(() => {
    let list = Array.isArray(studentRows) ? [...studentRows] : [];

    // advancedQuery modes override normal filters
    if (advancedQuery.mode === "lowest-result") {
      const s = findLowestResultStudent(list);
      return s ? [s] : [];
    }
    if (advancedQuery.mode === "highest-risk") {
      const s = findHighestRiskStudent(list);
      return s ? [s] : [];
    }
    if (advancedQuery.mode === "students-at-risk") {
      return list.filter((s) => ["alto", "medio"].includes(computeRiskFromPct(s.currentPerformancePct)));
    }
    if (advancedQuery.mode === "approved") {
      return list.filter((s) => s.currentPerformancePct != null && s.currentPerformancePct >= 70);
    }

    // Normal filter path
    if (onlyRisk) list = list.filter((s) => ["alto", "medio"].includes(computeRiskFromPct(s.currentPerformancePct)));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          String(s.userId).includes(q) ||
          String(s.displayName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [studentRows, query, onlyRisk, advancedQuery]);

const contentKpis = useMemo(() => {
    const root = Array.isArray(contentRoot) ? contentRoot : [];
    if (!root.length) {
      return { createdCount: null, minExpected: null, progressRatio: null };
    }

    const start = toDate(courseInfo?.StartDate);
    const end = toDate(courseInfo?.EndDate);
    if (!start) {
      return { createdCount: null, minExpected: null, progressRatio: null };
    }

    const now = new Date();
    const windowEnd = end && end < now ? end : now;

    let createdCount = 0;

    for (const mod of root) {
      if (mod?.IsHidden === true) continue;

      const items = Array.isArray(mod?.Structure) ? mod.Structure : [];
      for (const it of items) {
        const isVisible = it?.IsHidden !== true;
        const isLeafContent = Number(it?.Type) === 1; // no contar módulos/folders
        const itDate = toDate(it?.LastModifiedDate);

        if (isVisible && isLeafContent && itDate && itDate >= start) {
          createdCount += 1;
        }
      }
    }

    const weeks = weeksBetween(start, windowEnd);
    const minExpected = Math.max(1, Math.ceil(weeks / 2));
    const progressRatio = minExpected > 0 ? clamp(createdCount / minExpected, 0, 2) : null;

    return { createdCount, minExpected, progressRatio };
  }, [contentRoot, courseInfo?.StartDate, courseInfo?.EndDate]);

  const contentRhythmMeta = useMemo(() => {
    return contentRhythmStatus(contentKpis?.progressRatio);
  }, [contentKpis]);
  const performanceBands = useMemo(() => {
  const bands = [
    { name: "Excelente", key: "excellent", value: 0, color: COLORS.ok },
    { name: "Sólido", key: "solid", value: 0, color: COLORS.brand },
    { name: "Seguimiento", key: "watch", value: 0, color: COLORS.watch },
    { name: "Crítico", key: "critical", value: 0, color: COLORS.critical },
    { name: "Sin datos", key: "pending", value: 0, color: COLORS.pending },
  ];

  for (const s of studentRows) {
    const p = s?.currentPerformancePct;
    if (p == null || Number.isNaN(Number(p))) {
      bands[4].value += 1;
    } else if (Number(p) >= 85) {
      bands[0].value += 1;
    } else if (Number(p) >= 70) {
      bands[1].value += 1;
    } else if (Number(p) >= 50) {
      bands[2].value += 1;
    } else {
      bands[3].value += 1;
    }
  }

  return bands;
}, [studentRows]);

  const sortedStudents = useMemo(() => {
    const list = filteredStudents.slice();
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (s) => {
      switch (sortKey) {
        case "userId":
          return Number(s.userId || 0);
        case "grade10":
          return s.currentPerformancePct == null ? -1 : Number(s.currentPerformancePct) / 10;
        case "coverage":
          return s.coveragePct == null ? -1 : Number(s.coveragePct);
        case "risk": {
          const r = normStatus(s.risk);
          return r === "alto" ? 0 : r === "medio" ? 1 : r === "bajo" ? 2 : 3;
        }
        default:
          return String(s.displayName || "").toLowerCase();
      }
    };

    list.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "es", { sensitivity: "base" }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });

    return list;
  }, [filteredStudents, sortKey, sortDir]);

  const drawerSummary = studentDetail?.summary || {};
  const drawerMacro = (studentDetail?.macroUnits || studentDetail?.macro?.units || []).map((u) => ({
    code: u.code,
    pct: Number(u.pct || 0),
  }));
  const drawerUnits = studentDetail?.units || [];
  const drawerPrescription = Array.isArray(studentDetail?.prescription) ? studentDetail.prescription : [];
  const drawerProjection = studentDetail?.projection || null;
  const drawerGradebook = studentDetail?.gradebook || {};
  const drawerEvidences = Array.isArray(drawerGradebook?.evidences) ? drawerGradebook.evidences : [];
  const drawerPendingItems = Array.isArray(drawerGradebook?.pendingItems) ? drawerGradebook.pendingItems : [];
  const drawerMissingValues = Array.isArray(drawerGradebook?.missingValues) ? drawerGradebook.missingValues : [];
  const drawerQcFlags = Array.isArray(studentDetail?.qualityFlags) ? studentDetail.qualityFlags : [];
  const drawerPendingUngradedPct = Number(drawerSummary?.pendingUngradedWeightPct ?? 0);
  const drawerOverdueUnscoredPct = Number(drawerSummary?.overdueUnscoredWeightPct ?? 0);
  const covGraded = Number(drawerSummary?.gradedItemsCount ?? drawerGradebook?.gradedItemsCount ?? 0) || 0;
  const covTotal = Number(drawerSummary?.totalItemsCount ?? drawerGradebook?.totalItemsCount ?? 0) || 0;
  const covText =
    drawerSummary?.coverageCountText ||
    drawerGradebook?.coverageCountText ||
    (covTotal > 0 ? `${covGraded}/${covTotal}` : null);
  const covMissing = covTotal > 0 ? Math.max(0, covTotal - covGraded) : 0;

  const drawerTabs = [
    { id: "resumen", label: "Resumen", icon: "📊" },
    { id: "evidencias", label: "Evidencias", icon: "📋", count: drawerEvidences.length || undefined },
    { id: "unidades", label: "Unidades", icon: "🎯", count: drawerUnits.length || undefined },
    ...(drawerPrescription.length
      ? [{ id: "prescripcion", label: "Intervención", icon: "💊", count: drawerPrescription.length }]
      : []),
    ...(drawerQcFlags.filter((f) => f?.type && f.type !== "role_not_enabled").length
      ? [{ id: "calidad", label: "Calidad", icon: "🔍" }]
      : []),
  ];

  const makeSort = (key) => ({
    active: sortKey === key,
    dir: sortDir,
    onClick: () => {
      const d = sortKey === key && sortDir === "asc" ? "desc" : "asc";
      setSortKey(key);
      setSortDir(d);
    },
  });

  if (loading) return <CesaLoader subtitle="Cargando tablero..." />;

  if (err) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 24 }}>
        <Card title="Error al cargar el curso" right={<StatusBadge status="critico" />}>
          <div style={{ color: "var(--critical)", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{err}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Verifica: <code style={{ fontFamily: "var(--font-mono)" }}>/gemelo/course/{orgUnitId}/overview</code>
          </div>
        </Card>
      </div>
    );
  }

  if (!overview) return <CesaLoader subtitle="Inicializando información del curso..." />;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "12px" : "20px" }}>
        <div
          className="fade-up"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            gap: 12,
            flexDirection: isMobile ? "column" : "row",
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  fontSize: isMobile ? 18 : 22,
                  fontWeight: 900,
                  color: "var(--text)",
                  letterSpacing: "-0.02em",
                }}
              >
                Gemelo Digital
              </div>
              <span className="tag">Vista Docente</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              Curso{" "}
              <strong style={{ fontFamily: "var(--font-mono)" }}>
                {courseInfo?.Name || orgUnitId}
              </strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Mis cursos — abre el panel lateral */}
            <button
              className="btn btn-primary"
              onClick={handleOpenCoursePanel}
              style={{ gap: 6 }}
            >
              <span>📚</span>
              {isMobile ? "Cursos" : "Mis cursos"}
            </button>

            {/* Fallback: búsqueda directa por ID */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={orgUnitInput}
                onChange={(e) => setOrgUnitInput(e.target.value)}
                type="number"
                style={{
                  width: 110,
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontWeight: 700,
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: 13,
                }}
                placeholder="ID curso"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = Number(orgUnitInput);
                    if (v > 0) { setOrgUnitId(v); }
                  }
                }}
              />
              <button
                className="btn"
                onClick={() => { const v = Number(orgUnitInput); if (v > 0) setOrgUnitId(v); }}
                title="Ir a curso"
              >
                →
              </button>
            </div>

            <button className="btn" onClick={() => setDarkMode((v) => !v)} title="Cambiar tema">
              {darkMode ? "☀️" : "🌙"}
            </button>
          </div>
        </div>

        {/* ── Main tab bar ── */}
        <div className="main-tabs">
          <button
            className={`main-tab${activeTab === "dashboard" ? " active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <span className="tab-dot" />
            📊 Dashboard
          </button>
          <button
            className={`main-tab${activeTab === "assistant" ? " active" : ""}`}
            onClick={() => setActiveTab("assistant")}
          >
            <span className="tab-dot" />
            🤖 Asistente IA
          </button>
        </div>

        {/* ── Assistant tab ── */}
        {activeTab === "assistant" && (
          <div className="fade-up">
            <VoiceAssistant
              studentRows={studentRows}
              overview={overview}
              raDashboard={raDashboard}
              courseInfo={courseInfo}
              thresholds={thresholds}
            />
          </div>
        )}

        {/* ── Dashboard tab ── */}
        {activeTab === "dashboard" && <>

        <div className="fade-up fade-up-1" style={{ marginBottom: 12 }}>
          <AlertsPanel alerts={overview?.alerts} />
        </div>

        <div
          className="fade-up fade-up-2"
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : isNarrow ? "1fr 1fr" : "2fr 1fr 1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div ref={overviewRef}>
          <Card title="Gestión del curso" right={<StatusBadge status={courseStatus} />}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 16,
                marginBottom: 14,
              }}
            >
              <Stat
                label="Nota promedio (0–10)"
                value={avgPerfPct == null || Number(avgPerfPct) === 0 ? "—" : fmtGrade10FromPct(avgPerfPct)}
                valueColor={colorForPct(avgPerfPct, thresholds)}
                sub={
                  avgCov == null || Number(avgCov) === 0
                    ? "Sin cobertura registrada"
                    : `${fmtPct(covDone)} calificado · ${fmtPct(covPending)} pendiente`
                }
              />
              <Stat
                label="Estudiantes"
                value={studentsCount}
                sub={`${overview?.courseGradebook?.avgGradedItemsCount ?? 0}/${overview?.courseGradebook?.avgTotalItemsCount ?? 0} ítems prom.`}
              />
            </div>

            <Divider />

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                En riesgo (alto + medio)
              </div>
              <InfoTooltip text="Este indicador es un resultado. La gestión del curso se prioriza por acciones docentes: publicación sostenida de contenidos, oportunidad de retroalimentación y cierre evaluativo. Objetivo operativo: mínimo 1 contenido nuevo cada 2 semanas y retroalimentación posterior al vencimiento en máximo 8 días." />
            </div>

            <Stat
              label=""
              value={atRiskPct == null ? "—" : fmtPct(atRiskPct)}
              valueColor={
                atRiskPct != null && atRiskPct > 40
                  ? COLORS.critical
                  : atRiskPct != null && atRiskPct > 20
                  ? COLORS.watch
                  : COLORS.ok
              }
              sub={totalStudents ? `${atRiskCount} de ${totalStudents} estudiantes` : "—"}
            />

            <Divider />

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Ritmo de contenidos del profesor
              </div>
              <InfoTooltip text="Se mide el contenido o módulo actualizados/creados desde el inicio del curso." />
              <div style={{ marginLeft: "auto" }}>
                <span
                  className="badge"
                  style={{ background: contentRhythmMeta.bg, color: contentRhythmMeta.color }}
                >
                  <span
                    className="pulse-dot"
                    style={{ background: contentRhythmMeta.color, width: 6, height: 6 }}
                  />
                  {contentRhythmMeta.label}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div
                style={{
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "var(--card)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Contenidos creados
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>
                  {contentKpis?.createdCount == null ? "—" : contentKpis.createdCount}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  Desde inicio del curso
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "var(--card)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Mínimo esperado
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>
                  {contentKpis?.minExpected == null ? "—" : contentKpis.minExpected}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  Basado en avance del curso
                </div>
              </div>
            </div>

            {contentKpis?.progressRatio != null && (
              <div style={{ marginTop: 10 }}>
                <ProgressBar
                  value={Math.min(100, contentKpis.progressRatio * 100)}
                  color={contentRhythmMeta.color}
                  animate={false}
                  showLabel={false}
                />
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginTop: 6,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Cumplimiento vs mínimo</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800 }}>
                    {Math.round(contentKpis.progressRatio * 100)}%
                  </span>
                </div>
              </div>
            )}

            <Divider />

            <div style={{ marginTop: 14 }}>
              {avgCov == null || Number(avgCov) === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Cobertura no disponible (sin evidencias calificadas)
                </div>
              ) : (
                <CoverageBars
                  donePct={covDone}
                  pendingPct={avgPendingUngradedPct}
                  openPct={covPending}
                  overduePct={avgOverdueUnscoredPct}
                />
              )}
            </div>
          </Card>
          </div>

          <Card title="Riesgo académico">
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={riskData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={82}
                    paddingAngle={3}
                  >
                    {riskData.map((entry) => (
                      <Cell key={entry.key} fill={colorForRisk(entry.key)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => {
                      const v = Number(value || 0);
                      const pct = totalStudents > 0 ? (v / totalStudents) * 100 : 0;
                      return [`${v} (${pct.toFixed(1)}%)`, "Estudiantes"];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {riskData.map((r) => {
                const count = Number(r.value || 0);
                const pct = totalStudents > 0 ? (count / totalStudents) * 100 : 0;
                return (
                  <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: colorForRisk(r.key),
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, fontSize: 12, color: "var(--text)", fontWeight: 600 }}>
                      {r.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        fontFamily: "var(--font-mono)",
                        color: colorForRisk(r.key),
                      }}
                    >
                      {count}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", width: 44, textAlign: "right" }}>
                      {pct.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div ref={priorityRef}>
          <Card
            title="Estudiantes prioritarios"
            right={
              assignmentRiskData.length > 0
                ? <span className="tag" style={{ background: "var(--critical-bg)", color: "#B42318" }}>Requieren atención</span>
                : <StatusBadge status="solido" />
            }
          >
            {studentRows.some((s) => s.isLoading) && !assignmentRiskData.length ? (
              <div className="empty-state" style={{ minHeight: 120 }}>
                <span className="pulse-dot" style={{ background: COLORS.brand, width: 10, height: 10 }} />
                <span style={{ fontSize: 12 }}>Cargando datos de cobertura…</span>
              </div>
            ) : assignmentRiskData.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Nota &lt;5 · cobertura baja · ítems vencidos
                </div>
                <div style={{ overflowY: "auto", maxHeight: 420, paddingRight: 2, display: "flex", flexDirection: "column", gap: 6 }}>
                {assignmentRiskData.map((item) => {
                  const covColor = colorForPct(item.coveragePct, thresholds);
                  const hasOverdue = item.notSubmittedWeightPct > 0;
                  const hasLowGrade = item.type === "low_grade";
                  const grade10 = item.currentPerformancePct != null ? (item.currentPerformancePct / 10).toFixed(1) : null;
                  const gradeColor = item.currentPerformancePct != null ? colorForPct(item.currentPerformancePct, thresholds) : COLORS.pending;
                  const borderColor = hasLowGrade ? "#FECDCA" : hasOverdue ? "#FED7AA" : "var(--border)";
                  const bgColor = hasLowGrade ? "var(--critical-bg)" : hasOverdue ? "var(--watch-bg)" : "var(--card)";

                  return (
                    <div
                      key={item.userId}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const s = studentRows.find((r) => r.userId === item.userId);
                        if (s) setSelectedStudent(s);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const s = studentRows.find((r) => r.userId === item.userId);
                          if (s) setSelectedStudent(s);
                        }
                      }}
                      style={{
                        border: `1px solid ${borderColor}`,
                        borderRadius: 10,
                        padding: "9px 11px",
                        background: bgColor,
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        transition: "box-shadow 0.15s, transform 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.name}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            {item.type === "pending_submitted" && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: COLORS.brand, textTransform: "uppercase", letterSpacing: "0.06em" }}>⏳ Pendiente calificación</span>
                            )}
                            {item.type === "overdue" && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: COLORS.critical, textTransform: "uppercase", letterSpacing: "0.06em" }}>🔴 Vencido sin entrega</span>
                            )}
                            {item.type === "low_grade" && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: COLORS.critical, textTransform: "uppercase", letterSpacing: "0.06em" }}>⚠️ Nota crítica</span>
                            )}
                            {item.type === "low_coverage" && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>📉 Cobertura baja</span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={computeRiskFromPct(item.currentPerformancePct)} />
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {grade10 != null && (
                          <div style={{ flexShrink: 0, textAlign: "center", minWidth: 38, padding: "3px 7px", borderRadius: 8, background: "rgba(255,255,255,0.6)", border: `1px solid ${gradeColor}30` }}>
                            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Nota</div>
                            <div style={{ fontSize: 14, fontWeight: 900, fontFamily: "var(--font-mono)", color: gradeColor, lineHeight: 1.1 }}>{grade10}</div>
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Cobertura</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ flex: 1, height: 5, borderRadius: 999, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${item.coveragePct}%`, background: covColor, borderRadius: 999 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "var(--font-mono)", color: covColor, flexShrink: 0 }}>
                              {fmtPct(item.coveragePct)}
                            </span>
                          </div>
                        </div>
                        {item.pendingSubmittedWeightPct > 0 && (
                          <div style={{ flexShrink: 0, textAlign: "center", padding: "3px 7px", borderRadius: 8, background: "rgba(255,255,255,0.6)", border: "1px solid #FED7AA" }}>
                            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Pendiente</div>
                            <div style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: COLORS.watch }}>{fmtPct(item.pendingSubmittedWeightPct)}</div>
                          </div>
                        )}
                        {hasOverdue && (
                          <div style={{ flexShrink: 0, textAlign: "center", padding: "3px 7px", borderRadius: 8, background: "rgba(255,255,255,0.6)", border: "1px solid #FECDCA" }}>
                            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Vencido</div>
                            <div style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: COLORS.critical }}>{fmtPct(item.notSubmittedWeightPct)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 2 }}>
                  Haz clic en un estudiante para ver su gemelo →
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ minHeight: 160 }}>
                <span className="empty-state-icon">✅</span>
                <span style={{ fontSize: 12 }}>Sin estudiantes críticos</span>
                <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
                  Todos los estudiantes tienen cobertura ≥ 60% y sin ítems vencidos.
                </span>
              </div>
            )}
          </Card>
          </div>

          <div ref={learningOutcomesRef}>
          <Card title="Prioridad académica">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: 540,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {learningOutcomesData
                .slice()
                .sort((a, b) => a.avgPct - b.avgPct)
                .map((m) => {
                  const computedStatus =
                    m.status ||
                    (m.avgPct < thresholds.critical
                      ? "critico"
                      : m.avgPct < thresholds.watch
                      ? "observacion"
                      : "solido");

                  return (
                    <div
                      key={m.code}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: 10,
                        background: "var(--card)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="tag">{m.code}</span>
                          <InfoTooltip text={(m.description || m.name || "Sin descripción disponible.").trim()} />
                        </div>
                        <StatusBadge status={computedStatus} />
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span
                          style={{
                            fontWeight: 900,
                            fontSize: 18,
                            fontFamily: "var(--font-mono)",
                            color: colorForPct(m.avgPct, thresholds),
                          }}
                        >
                          {fmtPct(m.avgPct)}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>
                          Peso {m.weightPct ? `${Number(m.weightPct).toFixed(0)}%` : "—"}
                        </span>
                      </div>

                      {m.coveragePct != null && (
                        <div style={{ marginTop: 4 }}>
                          <ProgressBar value={m.coveragePct} color={colorForPct(m.coveragePct, thresholds)} />
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3, textAlign: "right" }}>
                            {fmtPct(m.coveragePct)} · {m.studentsWithData}/{m.totalStudents} estudiantes
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

              {!learningOutcomesData.length && (
                <div className="empty-state">
                  <span className="empty-state-icon">🎯</span>
                  <span style={{ fontSize: 12 }}>Sin datos de RA</span>
                  {Number(avgCov ?? 0) > 0 && (
                    <span style={{ fontSize: 11, color: "var(--watch)", fontWeight: 700, textAlign: "center", padding: "4px 8px", borderRadius: 8, background: "var(--watch-bg)", marginTop: 4 }}>
                      ⚠️ Hay evidencias calificadas pero sin rúbricas vinculadas a RA
                    </span>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        </div>

        <div ref={studentsRef} className="fade-up fade-up-3">
          <Card
            title={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>Estudiantes</span>
                <span className="tag">{studentsList?.students?.count ?? studentRows.length ?? 0}</span>
                {studentRows.some((s) => s.isLoading) && (
                  <span
                    className="pulse-dot"
                    style={{ background: COLORS.brand, width: 8, height: 8 }}
                    title="Cargando datos..."
                  />
                )}
              </div>
            }
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} />
                  Solo en riesgo
                </label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={voiceListening ? "🎙️ Escuchando…" : "Buscar por ID o nombre…"}
                    type="text"
                    style={{
                      width: isMobile ? 160 : 200,
                      border: `1px solid ${voiceListening ? "var(--critical)" : "var(--border)"}`,
                      borderRadius: 10,
                      padding: "7px 10px",
                      fontWeight: 600,
                      background: voiceListening ? "var(--critical-bg)" : "var(--card)",
                      color: "var(--text)",
                      fontSize: 12,
                      transition: "border-color 0.2s, background 0.2s",
                    }}
                  />
                  {voiceSupported && (
                    <button
                      className={`voice-btn${voiceListening ? " listening" : ""}`}
                      onClick={toggleVoice}
                      title={voiceListening ? "Detener escucha" : "Buscar por voz"}
                    >
                      {voiceListening ? "⏹" : "🎙️"}
                    </button>
                  )}
                </div>
              </div>
            }
          >
            {/* Voice feedback banner */}
            {voiceFeedback && (
              <div style={{
                marginBottom: 12, padding: "10px 14px", borderRadius: 10,
                border: `1px solid ${voiceListening ? "var(--critical)" : "var(--brand)"}`,
                background: voiceListening ? "var(--critical-bg)" : "var(--brand-light)",
                color: voiceListening ? "var(--critical)" : "var(--brand)",
                fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>{voiceListening ? "🎙️" : "🔍"}</span>
                <span style={{ flex: 1 }}>{voiceFeedback}</span>
                <button
                  className="btn"
                  style={{ padding: "3px 8px", fontSize: 11 }}
                  onClick={() => { setVoiceFeedback(""); setAdvancedQuery({ mode: "text", target: null }); setOnlyRisk(false); setQuery(""); }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Voice hint */}
            {voiceSupported && !voiceFeedback && (
              <div className="voice-hint" style={{ marginBottom: 10 }}>
                <span>🎙️</span>
                Prueba: <em>"resultado más bajo"</em> · <em>"resultados de aprendizaje"</em> · <em>"estudiantes en riesgo"</em>
              </div>
            )}

            {useCards ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sortedStudents.map((s) => (
                  <StudentCard key={s.userId} s={s} onOpen={setSelectedStudent} weakestMacro={weakestMacro} />
                ))}
                {!sortedStudents.length && (
                  <div className="empty-state">
                    <span className="empty-state-icon">🔍</span>
                    <span>Sin resultados para el filtro</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg)", borderBottom: "2px solid var(--border)" }}>
                      <SortTh label="ID" {...makeSort("userId")} />
                      <SortTh label="Nombre" {...makeSort("name")} />
                      <SortTh label="Riesgo" {...makeSort("risk")} />
                      <th
                        style={{
                          padding: "10px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--muted)",
                        }}
                      >
                        Ruta
                      </th>
                      {!hideCriticalMacroCol && (
                        <th
                          style={{
                            padding: "10px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--muted)",
                          }}
                        >
                          RA crítico
                        </th>
                      )}
                      {!hideGlobalProgressCol && (
                        <th
                          style={{
                            padding: "10px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--muted)",
                          }}
                        >
                          Global
                        </th>
                      )}
                      <SortTh label="Nota" {...makeSort("grade10")} />
                      <SortTh label="Cobertura" {...makeSort("coverage")} title="% del curso con evidencias calificadas" />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStudents.map((s) => (
                      <tr
                        key={s.userId}
                        onClick={() => setSelectedStudent(s)}
                        className="tr-hover"
                        style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                      >
                        <td
                          style={{
                            padding: "10px 10px",
                            fontWeight: 700,
                            color: "var(--muted)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                          }}
                        >
                          {s.userId}
                        </td>
                        <td style={{ padding: "10px 10px", fontWeight: 700, color: "var(--text)", minWidth: 180 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {s.displayName}
                            {s.hasPrescription && (
                              <span title="Tiene prescripción activa" style={{ fontSize: 14 }}>
                                📋
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <StatusBadge status={s.isLoading ? "cargando" : s.risk} />
                        </td>
                        <td style={{ padding: "10px 10px", maxWidth: compactRouteCol ? 200 : 320, minWidth: 160 }}>
                          {s.route ? (
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text)" }}>
                                {s.route.title}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--muted)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: compactRouteCol ? 180 : 300,
                                }}
                                title={s.route.summary}
                              >
                                {s.route.summary}
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        {!hideCriticalMacroCol && (
                          <td style={{ padding: "10px 10px", minWidth: 90 }}>
                            {(() => {
                              // Student-level RA (from drawer/gemelo) takes priority.
                              // Fallback: worst course-level RA as proxy.
                              const ra = s.mostCriticalMacro || weakestMacro;
                              if (!ra) return <span style={{ color: "var(--muted)" }}>—</span>;
                              const isFallback = !s.mostCriticalMacro;
                              return (
                                <div title={isFallback ? "RA del curso (sin datos individuales)" : undefined}>
                                  <div style={{
                                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800,
                                    color: isFallback ? "var(--muted)" : colorForPct(ra.pct, thresholds),
                                  }}>
                                    {ra.code}
                                    {isFallback && <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.6 }}>~</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                    {fmtPct(ra.pct ?? ra.avgPct)}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                        )}
                        {!hideGlobalProgressCol && (
                          <td
                            style={{
                              padding: "10px 10px",
                              fontFamily: "var(--font-mono)",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--text)",
                            }}
                          >
                            {fmtPct(s.globalPct)}
                          </td>
                        )}
                        <td style={{ padding: "10px 10px" }}>
                          <div
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 16,
                              fontWeight: 900,
                              color: colorForPct(s.currentPerformancePct, thresholds),
                            }}
                          >
                            {fmtGrade10FromPct(s.currentPerformancePct)}
                          </div>
                        </td>
                        <td style={{ padding: "10px 10px", minWidth: 110 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, fontFamily: "var(--font-mono)" }}>
                            {fmtPct(s.coveragePct)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                            {s.coverageCountText || "—"}
                          </div>
                          {s.coveragePct != null && (
                            <ProgressBar
                              value={s.coveragePct}
                              color={colorForPct(s.coveragePct, thresholds)}
                              animate={false}
                            />
                          )}
                        </td>
                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <button
                            className="btn"
                            style={{ fontSize: 12, padding: "5px 10px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudent(s);
                            }}
                          >
                            Ver →
                          </button>
                        </td>
                      </tr>
                    ))}

                    {!sortedStudents.length && (
                      <tr>
                        <td colSpan={9} style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                          Sin resultados para el filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        </>}

      </div>

      {/* Course Panel overlay */}
      {showCoursePanel && (
        <CoursePanel
          courses={courseList}
          loadingCourses={loadingCourses}
          currentId={orgUnitId}
          onSelect={handleSelectCourse}
          onClose={() => setShowCoursePanel(false)}
        />
      )}

      <Drawer
        open={!!selectedStudent}
        onClose={() => {
          setSelectedStudent(null);
          setStudentDetail(null);
          setStudentErr("");
          setStudentLoading(false);
        }}
        title={selectedStudent ? `${selectedStudent.displayName}` : "Estudiante"}
      >
        {studentLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
            <div className="cesa-water-text" style={{ fontSize: 36 }}>
              <span className="cesa-water-text__outline" style={{ fontSize: 36 }}>CESA</span>
              <span className="cesa-water-text__fill" aria-hidden="true" style={{ fontSize: 36 }}>CESA</span>
              <span className="cesa-water-text__wave" aria-hidden="true" />
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Consolidando gemelo digital…</div>
          </div>
        ) : studentErr ? (
          <Card title="Error" right={<StatusBadge status="critico" />}>
            <div style={{ color: "var(--critical)", fontWeight: 700 }}>{studentErr}</div>
          </Card>
        ) : !studentDetail ? (
          <Card title="Sin información" right={<StatusBadge status="pending" />}>
            <div style={{ color: "var(--muted)" }}>No hay datos consolidados para este estudiante.</div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <div style={{ textAlign: "center", padding: "12px 8px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Nota</div>
                <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em", fontFamily: "var(--font-mono)", color: colorForPct(drawerSummary?.currentPerformancePct, thresholds) }}>
                  {fmtGrade10FromPct(drawerSummary?.currentPerformancePct)}
                </div>
              </div>
              <div style={{ textAlign: "center", padding: "12px 8px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Cobertura</div>
                <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "var(--font-mono)", color: colorForPct(drawerSummary?.coveragePct, thresholds) }}>
                  {fmtPct(drawerSummary?.coveragePct)}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {covText || "—"} · faltan {covMissing}
                </div>
              </div>
              <div style={{ textAlign: "center", padding: "12px 8px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Riesgo</div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "center" }}>
                  <StatusBadge status={drawerSummary?.risk || "pending"} />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              {drawerTabs.map((tab) => (
                <button key={tab.id} className={`chip ${drawerTab === tab.id ? "active" : ""}`} onClick={() => setDrawerTab(tab.id)} style={{ fontSize: 12 }}>
                  {tab.icon} {tab.label}{" "}
                  {tab.count != null ? (
                    <span className="tag" style={{ fontSize: 10, padding: "1px 6px" }}>
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {drawerTab === "resumen" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Cobertura individual del estudiante */}
                {drawerSummary?.coveragePct != null && (
                  <Card title="Cobertura de evaluación">
                    <CoverageBars
                      donePct={drawerSummary?.coveragePct ?? 0}
                      pendingPct={drawerPendingUngradedPct}
                      openPct={Math.max(0, 100 - (drawerSummary?.coveragePct ?? 0) - drawerPendingUngradedPct - drawerOverdueUnscoredPct)}
                      overduePct={drawerOverdueUnscoredPct}
                    />
                  </Card>
                )}

                {drawerMacro.length > 0 ? (
                  <Card title="Resultados de aprendizaje del estudiante">
                    <div style={{ width: "100%", height: 220 }}>
                      <ResponsiveContainer>
                        <BarChart data={drawerMacro} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="code" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "var(--muted)" }} />
                          <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Desempeño"]} />
                          <ReferenceLine y={Number(thresholds?.watch || 70)} stroke={COLORS.watch} strokeDasharray="4 4" />
                          <ReferenceLine y={Number(thresholds?.critical || 50)} stroke={COLORS.critical} strokeDasharray="4 4" />
                          <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                            {drawerMacro.map((item) => (
                              <Cell key={item.code} fill={colorForPct(item.pct, thresholds)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                ) : learningOutcomesData.length > 0 ? (
                  <Card title="Resultados de aprendizaje del curso">
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, padding: "6px 10px", background: "var(--bg)", borderRadius: 8 }}>
                      Sin datos de evaluación por RA para este estudiante aún. Resultados del curso:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {learningOutcomesData.map((ra) => (
                        <div key={ra.code} style={{
                          display: "flex", alignItems: "flex-start", gap: 10,
                          padding: "8px 10px", borderRadius: 8,
                          border: "1px solid var(--border)", background: "var(--bg)",
                        }}>
                          <span className="tag" style={{ flexShrink: 0, marginTop: 1 }}>{ra.code}</span>
                          <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5, fontWeight: 500 }}>
                            {ra.description || ra.name || ra.code}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}

                {drawerProjection && <ProjectionBlock projection={drawerProjection} thresholds={thresholds} />}

                {selectedStudent?.route && (
                  <Card title={selectedStudent.route.title} right={<StatusBadge status={computeRiskFromPct(selectedStudent?.currentPerformancePct)} />}>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>{selectedStudent.route.summary}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(selectedStudent.route.actions || []).map((a, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ color: COLORS.brand, fontWeight: 900, minWidth: 16, fontSize: 12 }}>{i + 1}.</span>
                          <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <PendingItemsBlock pendingItems={drawerPendingItems} missingValues={drawerMissingValues} />
              </div>
            )}

            {drawerTab === "evidencias" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {drawerEvidences.length > 0 ? (
                  <>
                    <EvidencesTimeline evidences={drawerEvidences} thresholds={thresholds} />
                    <Card title="Detalle de evidencias">
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid var(--border)" }}>
                              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "left" }}>Evidencia</th>
                              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "right" }}>Peso</th>
                              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "right" }}>Nota</th>
                              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "center" }}>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drawerEvidences.map((e, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                                  {e.name || `Ítem ${e.gradeObjectId}`}
                                </td>
                                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
                                  {fmtPct(e.weightPct)}
                                </td>
                                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 900, color: colorForPct(e.scorePct, thresholds) }}>
                                  {e.scorePct != null ? (Number(e.scorePct) / 10).toFixed(1) : "—"}
                                </td>
                                <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                  <StatusBadge status={e.status || "pending"} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  <NoRaMappingNotice evidences={drawerEvidences} units={drawerUnits} />
                  </>
                ) : (
                  <div className="empty-state">
                    <span className="empty-state-icon">📭</span>
                    <span>Sin evidencias calificadas disponibles</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Los ítems del gradebook aún no tienen nota registrada.
                    </span>
                  </div>
                )}
              </div>
            )}

            {drawerTab === "unidades" && (
              <Card title="Subcompetencias / Unidades">
                {drawerUnits.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {drawerUnits.map((u) => (
                      <div key={u.code} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="tag">{u.code}</span>
                          <StatusBadge status={u.status} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 900, color: colorForPct(u.pct, thresholds) }}>
                            {fmtPct(u.pct)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{(u.evidence || []).length} evidencias</div>
                        </div>
                        <ProgressBar value={u.pct} color={colorForPct(u.pct, thresholds)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span className="empty-state-icon">🎯</span>
                    <span>Sin unidades consolidadas</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Posible falta de rúbricas evaluadas o mapeadas.
                    </span>
                  </div>
                )}
              </Card>
            )}

            {drawerTab === "prescripcion" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "var(--watch-bg)", border: "1px solid #FED7AA", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, color: "#9A3412" }}>
                  ⚠️ Este estudiante requiere intervención prioritaria.
                </div>
                {drawerPrescription.map((p) => (
                  <Card key={p.routeId} title={p.title} right={<span className="tag">{p.routeId}</span>}>
                    {p.successCriteria && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, padding: "6px 10px", background: "var(--bg)", borderRadius: 8 }}>
                        🎯 {p.successCriteria}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(p.actions || []).map((a, idx) => (
                        <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span
                            style={{
                              background: COLORS.brand,
                              color: "#fff",
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 900,
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{a}</span>
                        </div>
                      ))}
                    </div>
                    {p.priority?.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {p.priority.map((pr) => (
                          <span key={pr} className="tag" style={{ background: "var(--critical-bg)", color: "#B42318" }}>
                            {pr}
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {drawerTab === "calidad" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 12px", background: "var(--bg)", borderRadius: 8 }}>
                  Flags generados por el motor de calidad del gemelo. Indican posibles inconsistencias en rúbricas, criterios no mapeados, o datos ausentes.
                </div>
                <QualityFlagsBlock flags={drawerQcFlags} />
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}