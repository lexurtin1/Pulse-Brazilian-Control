import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [
    react(),
    // npm workspaces hoist cesium to the repo root's node_modules rather
    // than packages/ui's own, so the plugin's package-relative defaults
    // (node_modules/cesium/Build/...) need to be pointed there explicitly.
    cesium({
      cesiumBuildRootPath: "../../node_modules/cesium/Build",
      cesiumBuildPath: "../../node_modules/cesium/Build/Cesium/",
    }),
  ],
  server: {
    port: 5173,
    // Fallback for local dev when not using `vercel dev`: run `vercel dev
    // --listen 3000` in a second terminal for the /api functions, and this
    // proxy forwards the frontend's relative /api/* fetches to it.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
