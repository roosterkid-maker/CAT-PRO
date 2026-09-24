import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/*
 * One id per build, baked into the bundle and published as /version.json.
 * An open dashboard compares the two and reloads itself after a deploy, so a
 * tab left open never keeps running (and polling) retired code.
 */
const BUILD_ID = `${Date.now()}`;

function buildVersionFile(): Plugin {
  return {
    name: "cat-pro-build-version",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId: BUILD_ID }),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    buildVersionFile(),
  ],

  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },

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
