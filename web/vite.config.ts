import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../src/interfaces/server/public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/auth": API_TARGET,
      "/personas": API_TARGET,
      "/sessions": API_TARGET,
      "/plans": API_TARGET,
    },
  },
});
