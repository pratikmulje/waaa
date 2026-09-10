/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#080C10",
          raised: "#0D1117",
          panel: "#111820",
          border: "#1C2530",
          hover: "#161E28",
        },
        ink: {
          DEFAULT: "#E2EAF0",
          muted: "#7A8FA0",
          faint: "#4A5C6A",
        },
        accent: {
          DEFAULT: "#38BDF8",
          glow: "#67D7FF",
          dim: "#1E7FAF",
          subtle: "rgba(56,189,248,0.08)",
        },
        emerald: {
          glow: "#10D9A0",
        },
        cyan: {
          glow: "#38BDF8",
        },
        violet: {
          glow: "#A78BFA",
        },
        amber: {
          glow: "#FBBF24",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(56,189,248,0.25)",
        "glow-sm": "0 0 16px -4px rgba(56,189,248,0.20)",
        panel:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.7)",
        "glass":
          "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 4px 16px -8px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse at 20% -10%, rgba(56,189,248,0.06), transparent 50%), radial-gradient(ellipse at 80% -10%, rgba(167,139,250,0.05), transparent 50%)",
        "glass-surface":
          "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        "accent-gradient":
          "linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.2s ease-out",
        "thinking": "thinking 1.4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        thinking: {
          "0%, 80%, 100%": { transform: "scale(0)", opacity: "0.3" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
      },
      transitionTimingFunction: {
        "smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
