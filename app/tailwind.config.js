/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#fef9f0",
          100: "#fdf6ec",
          200: "#f5e6c8",
          300: "#e8dcc8",
        },
        accent: {
          light: "#c47f17",
          dark: "#e0a84c",
        },
      },
    },
  },
  plugins: [],
};
