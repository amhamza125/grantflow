/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f7f4ec",
        paper2: "#fffdf6",
        ink: "#1c2430",
        inksoft: "#4b5563",
        rule: "#d8d2c2",
        pine: "#14532d",
        pinebright: "#15803d",
        seal: "#b45309",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        file: "0 1px 2px rgba(28,36,48,0.08), 0 8px 28px rgba(28,36,48,0.08)",
      },
    },
  },
  plugins: [],
};
