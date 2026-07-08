import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
