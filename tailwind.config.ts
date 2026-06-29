import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18181B",
        paper: "#F7F7F5",
        surface: "#FFFFFF",
        line: "#E6E3DB",
        muted: "#6B6860",
        faint: "#9C998F",
        action: "#155E63",
        "action-700": "#0E494D",
        ok: "#2E7D52",
        warn: "#C8841C",
        bad: "#C0392B",
        // marcas
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
