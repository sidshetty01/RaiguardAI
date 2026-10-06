import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.RAILGUARD_API ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/ws": { target: backend.replace(/^http/, "ws"), ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
