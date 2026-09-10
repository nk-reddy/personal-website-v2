import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://www.nikreddy.com",
  output: "server",
  adapter: vercel(),
  prefetch: {
    defaultStrategy: "hover"
  },
  publicDir: "./assets"
});
