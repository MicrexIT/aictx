import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://memory.aictx.dev",
  vite: {
    plugins: [tailwindcss()]
  }
});
