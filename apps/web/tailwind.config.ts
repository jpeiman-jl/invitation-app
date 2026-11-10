export default {
  content: ["./app/**/*.{vue,ts}", "./components/**/*.{vue,ts}", "./pages/**/*.vue"],
  theme: {
    extend: {
      colors: {
        ink: "#242a25",
        paper: "#f7f5f0",
        moss: "#536e5c",
        "moss-dark": "#3e5847",
        line: "#e5e3dc"
      },
      boxShadow: {
        soft: "0 18px 48px rgba(39, 45, 39, 0.08)"
      }
    }
  }
};
