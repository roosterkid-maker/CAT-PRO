import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,

    // Keep the browser on one origin in local development. The backend owns
    // port 5000; Vite is the only process the browser talks to directly.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },

      "/socket.io": {
        target: "ws://127.0.0.1:5000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
