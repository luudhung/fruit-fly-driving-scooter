import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  publicDir: "public",
  assetsInclude: ["**/*.wgsl"],
  build: {
    outDir: "dist",
    target: "esnext",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        play: resolve(__dirname, "play.html"),
        bench: resolve(__dirname, "bench.html"),
        upstream: resolve(__dirname, "upstream.html"),
        stock: resolve(__dirname, "stock.html"),
        fulllife: resolve(__dirname, "fulllife.html"),
      },
    },
  },
  server: { port: 8766, host: "127.0.0.1" },
});
