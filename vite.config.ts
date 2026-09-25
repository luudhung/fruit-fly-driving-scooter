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
        app: resolve(__dirname, "app.html"),
        play: resolve(__dirname, "play.html"),
        bench: resolve(__dirname, "bench.html"),
        motorbike: resolve(__dirname, "motorbike.html"),
        upstream: resolve(__dirname, "upstream.html"),
      },
    },
  },
  server: { port: 8766, host: "127.0.0.1" },
});
