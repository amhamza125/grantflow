/** @type {import('tailwindcss').Config} */
// GrantFlow theme — light warm alabaster default + clean carbon dark mode.
// Semantic colors are CSS variables so [data-theme="dark"] can override
// them in index.css. Accents are the semantic set: emerald #0F766E
// (primary + MET), amber #B45309 (PARTIAL + pending), crimson #BE123C
// (NOT_MET / expired / rejected), cobalt #1D4ED8 (assessment in progress).
const v = (name) => `rgb(var(--gf-${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        night: v("night"), // page background
        night2: v("night2"), // raised surface / toast background
        surface: v("surface"), // solid card surface
        surface2: v("surface2"),
        mist: v("mist"), // primary text
        steel: v("steel"), // secondary text
        line: "var(--gf-line)",
        lineStrong: "var(--gf-line-strong)",
        panel: "var(--gf-panel)", // flat card tint
        panelStrong: "var(--gf-panel-strong)",
        panelInset: "var(--gf-panel-inset)", // inset panel tint
        acid: "#0f766e", // primary action accent (emerald)
        acidDeep: "#0b5e57",
        acidInk: v("acid-ink"), // text on acid
        violet: "#1d4ed8",
        cyan: "#1d4ed8",
        pink: "#be123c",
        gold: "#b45309",
        rose: "#be123c",
        mint: "#0f766e",
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "var(--gf-shadow-card)",
        glow: "0 0 0 1px rgba(15,118,110,0.25), 0 8px 24px rgba(15,118,110,0.12)",
        glass: "var(--gf-shadow-card)",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "fade-up": "fadeUp 0.5s ease both",
      },
    },
  },
  plugins: [],
};
