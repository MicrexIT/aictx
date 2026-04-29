import { fileURLToPath } from "node:url";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const viewerRoot = fileURLToPath(new URL(".", import.meta.url));
const outputRoot = fileURLToPath(new URL("../dist/viewer", import.meta.url));

export default defineConfig({
  root: viewerRoot,
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: outputRoot,
    emptyOutDir: true
  }
});
