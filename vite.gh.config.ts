import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

// Standalone static SPA build for GitHub Pages.
// Run with: bun run build:gh
// Set GH_BASE to "/repo-name/" for project pages, or leave default ("./") for user/custom domains.
export default defineConfig({
  root: "gh",
  base: process.env.GH_BASE ?? "./",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist-gh"),
    emptyOutDir: true,
  },
});