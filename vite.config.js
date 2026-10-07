import { defineConfig } from "vite";
import { resolve } from "node:path";

const devAppHtml = {
  name: "maska-dev-app-html",
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const path = request.url?.split("?")[0] || "";
      if (path === "/" || path === "/index.html") request.url = "/app.html";
      next();
    });
  }
};

export default defineConfig({
  // Media is served by the CMS server directly, avoiding a second 1.5 GB copy in dist.
  publicDir: false,
  plugins: [devAppHtml],
  build: {
    rollupOptions: {
      input: resolve(__dirname, "app.html")
    }
  }
});
