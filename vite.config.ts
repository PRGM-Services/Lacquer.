import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5173 },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  // .wgsl and .glsl files are imported as raw strings via the "?raw" suffix,
  // which Vite supports natively.
});
