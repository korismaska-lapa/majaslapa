import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

const base = process.env.TEST_URL || "http://127.0.0.1:5173";
let createdId = null;
let uploadedPath = null;

const login = await fetch(`${base}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || "123" })
});
if (!login.ok) throw new Error(`Login failed: ${login.status}`);
const cookie = login.headers.get("set-cookie").split(";")[0];

const api = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { Cookie: cookie, ...options.headers }
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`${path}: ${body?.error || response.status}`);
  return body;
};

try {
  const content = await api("/api/content");
  const initialCount = content.posts.length;
  await api("/api/admin/site", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(content.site)
  });

  const created = await api("/api/admin/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: "2099-01-01",
      slug: "cms-automated-test",
      title: { lv: "CMS automātiskais tests", en: "CMS automated test" },
      excerpt: { lv: "Pagaidu ieraksts.", en: "Temporary post." },
      body: { lv: "Pirmā rindkopa.\n\nOtrā rindkopa.", en: "First paragraph.\n\nSecond paragraph." },
      image: "/media/MASKA_small_vertical.jpg"
    })
  });
  createdId = created.post.id;

  const updated = await api(`/api/admin/posts/${createdId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...created.post, title: { ...created.post.title, lv: "CMS tests — rediģēts" } })
  });
  if (updated.post.title.lv !== "CMS tests — rediģēts") throw new Error("Post update was not persisted");

  const form = new FormData();
  form.append("file", new Blob([await readFile("assets/maska-logo.png")], { type: "image/png" }), "cms-test-logo.png");
  const uploaded = await api("/api/admin/upload", { method: "POST", body: form });
  uploadedPath = uploaded.path;

  await api(`/api/admin/posts/${createdId}`, { method: "DELETE" });
  createdId = null;
  const finalContent = await api("/api/content");
  if (finalContent.posts.length !== initialCount) throw new Error("Post cleanup count does not match");
  console.log(`CMS test passed: login, site save, post create/update/delete, upload (${initialCount} existing posts)`);
} finally {
  if (createdId) await api(`/api/admin/posts/${createdId}`, { method: "DELETE" }).catch(() => {});
  if (uploadedPath) await unlink(resolve("public", uploadedPath.replace(/^\//, ""))).catch(() => {});
}
