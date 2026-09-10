/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0B0F12",
          raised: "#10151A",
          panel: "#141A20",
          border: "#212A31",
        },
        ink: {
          DEFAULT: "#E7EDF0",
          muted: "#8FA0AA",
          faint: "#5C6D77",
        },
        emerald: {
          glow: "#17E3A6",
        },
        cyan: {
          glow: "#5FD4E8",
        },
        violet: {
          glow: "#8B7CF6",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(23, 227, 166, 0.35)",
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 20% 0%, rgba(23,227,166,0.08), transparent 40%), radial-gradient(circle at 80% 0%, rgba(139,124,246,0.08), transparent 40%)",
      },
    },
  },
  plugins: [],
};
