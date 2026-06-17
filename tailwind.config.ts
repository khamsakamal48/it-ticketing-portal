import type { Config } from "tailwindcss";

// Color tokens are defined as RGB channels in globals.css (:root + .dark) so
// every utility supports opacity (e.g. bg-brand/10). Components use semantic
// classes only — the .dark class on <html> swaps the whole palette.
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("--bg"),
        surface: token("--surface"),
        "surface-2": token("--surface-2"),
        "surface-3": token("--surface-3"),
        border: token("--border"),
        "border-strong": token("--border-strong"),
        ring: token("--ring"),
        fg: token("--fg"),
        muted: token("--muted"),
        subtle: token("--subtle"),
        accent: token("--accent"),
        brand: {
          DEFAULT: token("--brand"),
          fg: token("--brand-fg"),
          soft: token("--brand-soft"),
        },
        // semantic status
        open: token("--open"),
        pending: token("--pending"),
        resolved: token("--resolved"),
        closed: token("--closed"),
        critical: token("--critical"),
        high: token("--high"),
        success: token("--resolved"),
        danger: token("--critical"),
        warn: token("--open"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
        "card-dark": "0 1px 2px 0 rgb(0 0 0 / 0.4), 0 1px 3px 0 rgb(0 0 0 / 0.3)",
        pop: "0 8px 30px -8px rgb(0 0 0 / 0.30), 0 2px 8px -2px rgb(0 0 0 / 0.18)",
        glow: "0 0 0 1px rgb(var(--brand) / 0.4), 0 8px 24px -6px rgb(var(--brand) / 0.35)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
        "fade-in": "fade-in 200ms ease-out",
        "slide-in": "slide-in 200ms ease-out",
        "rise-in": "rise-in 260ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
