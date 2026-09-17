import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vue()],
  // The project lives in OneDrive, which marks synced files as reparse points. Following them
  // like symlinks breaks module resolution, so resolve paths as they appear on disk.
  resolve: { preserveSymlinks: true },
  build: {
    outDir: fileURLToPath(new URL("../dist", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Reachable from a phone on the same Wi-Fi, so the app can be opened in Nimiq Pay's Custom URL field.
    host: true,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
