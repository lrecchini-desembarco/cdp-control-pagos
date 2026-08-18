import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tokens de color: apuntan a variables RGB (globals.css) en vez de hex fijo,
        // para poder redefinirlas en modo oscuro (:root[data-theme="dark"]) sin
        // tocar un solo componente. El formato "rgb(var(--x) / <alpha-value>)" es
        // el que pide Tailwind para que sigan funcionando los modificadores de
        // opacidad (bg-ink/5, bg-ok/15, etc.) — con var() sin envolver, Tailwind
        // 3.x descarta esas variantes en silencio.
        ink: "rgb(var(--ink) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        action: "rgb(var(--action) / <alpha-value>)",
        "action-700": "rgb(var(--action-700) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        bad: "rgb(var(--bad) / <alpha-value>)",
        // marcas: colores de arte fijos, no cambian con el tema (ver CLAUDE.md)
        desembarco: "#B5472E",
        tasty: "#E0A024",
        mila: "#3E7C6A",
        sidebar: "#1C1B19",
        "sidebar-line": "#33312D",
        "sidebar-muted": "#8E8B83",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { card: "12px" },
      fontSize: {
        "2xs": ["11px", "16px"],
      },
    },
  },
  plugins: [],
};
export default config;
