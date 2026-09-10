import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://www.nikhilreddy.com",
  output: "server",
  adapter: vercel(),
  publicDir: "./assets"
});
