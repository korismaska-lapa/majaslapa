import { copyFile, cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

const builtHtml = join(dist, "app.html");
await copyFile(builtHtml, join(root, "index.html"));
await mkdir(join(root, "assets"), { recursive: true });
await cp(join(dist, "assets"), join(root, "assets"), { recursive: true });

console.log("Synced dist/ to index.html and assets/ for static hosting.");
