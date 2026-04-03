import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/diag\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "diag-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
});
