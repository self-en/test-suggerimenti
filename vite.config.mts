import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the React app in web/ into dist/, which Fastify then serves statically
// (see src/server.ts). Named .mts because package.json is "type": "commonjs"
// (the backend is compiled to CommonJS for OTel's require-based instrumentation).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  // `npm run dev` runs Vite (this) and the Fastify backend side by side; proxy
  // the API and health probe to the backend so dev matches production.
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/healthz": "http://localhost:3000",
    },
  },
});
