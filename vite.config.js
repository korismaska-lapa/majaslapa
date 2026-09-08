import { defineConfig } from "vite";

export default defineConfig({
  // Media is served by the CMS server directly, avoiding a second 1.5 GB copy in dist.
  publicDir: false
});
