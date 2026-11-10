/** @type {import('tailwindcss').Config} */
// GrantFlow 2026 theme — "Aurora Deep Dark" (default) + light variant.
// Semantic colors are CSS variables so [data-theme="light"] can override
// them in index.css; accent colors stay the same in both themes.
// Sources: 2026 Web3 design round-ups (deep dark + cyber-gradients, liquid
// glass 2.0 / aurora, bento stats, kinetic type, 16px mobile base) and
// 2026 UI/UX guidance (dark mode is a designed palette, not an inversion;
// persisted toggle that respects the system preference on first load;
// skeleton loading; WCAG contrast on every state).
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
        panel: "var(--gf-panel)", // translucent overlay tint (replaces bg-white/5)
        panelStrong: "var(--gf-panel-strong)", // translucent overlay tint (replaces bg-white/10)
        panelInset: "var(--gf-panel-inset)", // inset panel tint (replaces bg-black/20)
        acid: "#a3e635", // primary action accent
        acidDeep: "#65a30d",
        acidInk: v("acid-ink"), // text on acid
        violet: "#7c5cff",
        cyan: "#22d3ee",
        pink: "#f472b6",
        gold: "#fbbf24",
        rose: "#fb7185",
        mint: "#34d399",
      },
      fontFamily: {
        display: ["Sora", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "var(--gf-shadow-card)",
        glow: "0 0 0 1px rgba(163,230,53,0.25), 0 8px 32px rgba(163,230,53,0.14)",
        glass: "var(--gf-shadow-card)",
      },
      keyframes: {
        auroraDrift: {
          "0%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(4%, -6%, 0) scale(1.12)" },
          "100%": { transform: "translate3d(-3%, 4%, 0) scale(1.05)" },
        },
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
        aurora: "auroraDrift 24s ease-in-out infinite alternate",
        "fade-up": "fadeUp 0.5s ease both",
      },
    },
  },
  plugins: [],
};
