import { defineConfig } from "vite";
import { resolve } from "path";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        splashscreen: resolve(__dirname, "splashscreen.html"),
      },
    },
  },
});
