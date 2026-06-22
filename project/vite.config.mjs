import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "static",
  build: {
    outDir: "public",
    // Admin and product media live in public/uploads on Hostinger.
    // Keep them intact when rebuilding the frontend bundle.
    emptyOutDir: false,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5000",
    },
  },
});
