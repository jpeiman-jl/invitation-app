export default defineNuxtConfig({
  compatibilityDate: "2025-02-01",
  devtools: { enabled: true },
  modules: ["@pinia/nuxt", "@nuxtjs/tailwindcss", "@vueuse/nuxt"],
  css: ["./assets/css/main.css"],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || "http://localhost:4000"
    }
  },
  app: {
    head: {
      title: "InviteHub — Gather beautifully",
      titleTemplate: "%s · InviteHub",
      meta: [
        { name: "description", content: "Create thoughtful invitations, collect RSVPs, and bring everyone together." },
        { name: "theme-color", content: "#f7f5f0" }
      ],
      htmlAttrs: { lang: "en" }
    }
  },
  typescript: {
    strict: true,
    typeCheck: true
  }
});
