/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  // Tailwind's JIT engine only generates CSS for class names it can find as
  // literal text in these files. app.js builds most of the UI as template
  // strings, so it MUST be listed here — otherwise every dynamically
  // rendered screen (dashboard, admin page, project cards...) silently
  // loses its styling once the CDN's live scanner is gone.
  content: ["./index.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        // EDITORIAL PALETTE. The landing is built on custom .lp-* classes and
        // uses no Tailwind colour utilities at all, so remapping these ramps
        // restyles every signed-in surface - dashboard, jobs, admin, candidate,
        // add-project - AND every modal, which app.js appends straight to
        // document.body where no view-scoped stylesheet can reach it.
        //
        // Two ramps do the work. `slate` becomes the warm neutral scale of the
        // landing (paper -> ink), and `blue` becomes the accent scale, so the
        // old blue-50 chips, blue-900 buttons and blue-900 text all land in the
        // palette instead of being hunted down one class at a time. The
        // semantic hues are kept but warmed, so an error still reads as an
        // error rather than joining the accent.
        // TEXT vs FILL. The accent is deliberately light because it reads as a
        // fill - a button, a progress bar, an icon. Small text needs the same
        // hue a long way down: #E85D2A on card is 3.43:1, this is 5.12:1.
        primary: "#E85D2A",
        "primary-text": "#B9491F",
        "primary-container": "#B0421B",
        "primary-fixed": "#FBEDE6",
        "primary-fixed-dim": "#F7DFD2",
        // The label on a solid accent fill. White here is 3.48:1; ink is 5.31:1.
        "on-primary": "#17130E",
        secondary: "#6B2710",
        "secondary-container": "#17130E",
        "on-secondary": "#F7F3EC",
        tertiary: "#17130E",
        "tertiary-container": "#2E2820",
        surface: "#F7F3EC",
        "surface-container": "#EFE9DE",
        "surface-container-low": "#F7F3EC",
        "surface-container-high": "#E7DFD2",
        "surface-container-highest": "#D5C9B6",
        "surface-container-lowest": "#FFFDF9",
        "on-surface": "#17130E",
        "on-surface-variant": "#6B6156",
        // `outline` is used for the ink-panel eyebrows ("THE PROBLEM"), so it
        // has to clear text contrast, not just border contrast.
        outline: "#746C60",
        "outline-variant": "#E1D9CB",
        "slate-950": "#0F0C09",
        "slate-900": "#17130E",
        "slate-800": "#2E2820",
        // 400 through 700 are solved to a contrast target against the lightest
        // surface app text lands on (the accent tint), not chosen by eye:
        // 400 is 4.5:1, then 6, 8 and 11. Each step was checked against the
        // next so they cannot collapse into each other. Before this they ran
        // 2.2 / 3.3 / 5.9 / 7.3 - i.e. two of the four failed, and 400 was
        // carrying 100 text uses.
        "slate-700": "#39322A",
        "slate-600": "#4E473E",
        "slate-500": "#615950",
        "slate-400": "#746C60",
        // 300 stays where it is: it is a border and divider step (34 border
        // uses). As text it was 1.61:1, which is why the app shell routes
        // text-slate-300 to the 400 tone instead of darkening this one.
        "slate-300": "#D5C9B6",
        "slate-200": "#E7DFD2",
        "slate-100": "#F3EEE5",
        "slate-50": "#FAF7F2",
        // Accent ramp. 50-400 are tints for chips and badges, 500 is the
        // accent, 800-950 are ink: blue-900 was the Apply button and the
        // outline buttons' text, and the editorial equivalent of that solid
        // block is ink, not orange.
        "blue-50": "#FBEDE6",
        "blue-100": "#F7DFD2",
        "blue-200": "#F2C9B4",
        "blue-300": "#ECA98B",
        "blue-400": "#E8743F",
        "blue-500": "#E85D2A",
        "blue-600": "#D14E1F",
        "blue-700": "#8C3415",
        "blue-800": "#3A2A20",
        "blue-900": "#17130E",
        "blue-950": "#0F0C09",
        // Match-strength and keyword chips used indigo and sky. Warm to a
        // khaki range so they sit beside the accent instead of against it.
        "indigo-50": "#F6EFE3",
        "indigo-100": "#EDE0C9",
        "indigo-200": "#DCC9A6",
        "indigo-500": "#8A6A2F",
        "indigo-600": "#6E5426",
        "indigo-700": "#55401D",
        "sky-50": "#F2F0E6",
        "sky-200": "#DCD8C2",
        "sky-600": "#5F5A44",
        "sky-700": "#4A4636",
        emerald: {
          50: "#EDF3EC",
          100: "#D7E8D9",
          200: "#C3DEC6",
          300: "#A6D0AC",
          400: "#4E8F63",
          500: "#3F7D54",
          600: "#2F6B45",
          700: "#275A3A"
        },
        amber: {
          50: "#FCF3E2",
          100: "#F8E9C9",
          200: "#F2DFB8",
          300: "#E9CB93",
          400: "#DFB255",
          500: "#D99A2B",
          600: "#C4841F",
          700: "#96620F"
        },
        rose: {
          50: "#FCF0F1",
          100: "#F8DCDF",
          200: "#F0BDC2",
          300: "#E29AA2",
          400: "#D96B77",
          500: "#D4455C",
          600: "#C23A50",
          700: "#A32F43"
        },
        error: "#C23A50",
        "error-red": "#C23A50"
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.5rem",
        full: "9999px"
      },
      spacing: {
        gutter: "24px",
        "element-gap": "12px",
        "section-gap": "48px",
        "margin-mobile": "16px",
        "container-max": "1280px"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"]
      },
      fontSize: {
        "headline-xl": ["48px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["32px", { lineHeight: "1.25", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-md": ["24px", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-sm": ["20px", { lineHeight: "1.35", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.45", fontWeight: "400" }],
        "label-lg": ["14px", { lineHeight: "1.4", letterSpacing: "0.05em", fontWeight: "600" }],
        "label-md": ["12px", { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "500" }],
        "label-sm": ["11px", { lineHeight: "1", letterSpacing: "0.04em", fontWeight: "600" }]
      }
    }
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")]
};
