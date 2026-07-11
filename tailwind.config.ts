import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dashboard: {
          bg: "var(--color-bg)",
          surface: "var(--color-surface)",
          "surface-2": "var(--color-surface-2)",
          border: "var(--color-border)",
          "border-2": "var(--color-border-2)",
          text: "var(--color-text)",
          muted: "var(--color-muted)",
          faint: "var(--color-faint)",
          accent: "var(--color-accent)",
          "accent-2": "var(--color-accent-2)",
          pos: "var(--color-pos)",
          neg: "var(--color-neg)",
          warn: "var(--color-warn)",
          chip: "var(--color-chip)",
        },
      },
      borderRadius: {
        "ds-sm": "var(--radius-sm)",
        "ds-md": "var(--radius-md)",
        "ds-lg": "var(--radius-lg)",
        "ds-pill": "var(--radius-pill)",
      },
      boxShadow: {
        "ds-card": "var(--shadow-card)",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Noto Sans TC"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
