import crypto from "node:crypto";
import { readdir, readFile, rename, unlink, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import express from "express";
import multer from "multer";
import nodemailer from "nodemailer";

const root = resolve(".");
const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const dataRoot = resolve(process.env.DATA_DIR || root);
const siteFile = join(dataRoot, "content", "site.json");
const voicesFile = join(dataRoot, "content", "voices.json");
const postsDirectory = join(dataRoot, "content", "posts");
const uploadsDirectory = join(dataRoot, "public", "media", "uploads");
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || (production ? "0.0.0.0" : "127.0.0.1");

if (production && !process.env.ADMIN_PASSWORD) {
  console.warn("ADMIN_PASSWORD is unset; using the local default (123). Set ADMIN_PASSWORD for a stronger password.");
}

const copyIfMissing = async (from, to) => {
  if (existsSync(to)) return;
  const { cp } = await import("node:fs/promises");
  if (!existsSync(from)) return;
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
};

if (dataRoot !== root) {
  await copyIfMissing(join(root, "content"), join(dataRoot, "content"));
}
const sessions = new Map();
const loginAttempts = new Map();
const contactAttempts = new Map();
const contactTo = process.env.CONTACT_TO || "korismaska@gmail.com";
const mailFrom = process.env.MAIL_FROM || "Koris MASKA <korismaska@korismaska.lv>";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clip = (value, max) => String(value || "").trim().slice(0, max);

const createMailTransport = () => {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } : undefined
    });
  }
  return nodemailer.createTransport({
    sendmail: true,
    newline: "unix",
    path: process.env.SENDMAIL_PATH || "/usr/sbin/sendmail"
  });
};

const sendContactMail = async (message) => {
  try {
    await createMailTransport().sendMail(message);
  } catch (sendmailError) {
    if (process.env.SMTP_HOST) throw sendmailError;
    try {
      await nodemailer.createTransport({
        host: "127.0.0.1",
        port: 25,
        secure: false,
        tls: { rejectUnauthorized: false }
      }).sendMail(message);
    } catch {
      throw sendmailError;
    }
  }
};

await mkdir(postsDirectory, { recursive: true });
await mkdir(uploadsDirectory, { recursive: true });

const app = express();

app.use("/media", express.static(join(root, "public", "media")));
app.use("/media", express.static(join(root, "media")));
app.use("/assets", express.static(join(root, "dist", "assets")));
app.use("/assets", express.static(join(root, "assets")));
app.use(express.static(join(root, "public")));
app.use(express.static(root));

app.disable("x-powered-by");
app.use(express.json({ limit: "3mb" }));
app.use("/api", (_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});

const parseCookies = (header = "") => Object.fromEntries(header.split(";").map((part) => {
  const index = part.indexOf("=");
  return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
}).filter(([key]) => key));

const currentSession = (request) => {
  const token = parseCookies(request.headers.cookie).maska_session;
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  session.expires = Date.now() + 12 * 60 * 60 * 1000;
  return session;
};

const requireAdmin = (request, response, next) => {
  if (!currentSession(request)) return response.status(401).json({ error: "Authentication required" });
  const origin = request.headers.origin;
  if (origin && new URL(origin).host !== request.headers.host) return response.status(403).json({ error: "Origin rejected" });
  next();
};

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const sessionCookie = (request, token) => {
  const proto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const https = request.secure || proto === "https";
  const value = token
    ? `maska_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`
    : "maska_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";
  return https ? `${value}; Secure` : value;
};

const atomicJsonWrite = async (path, value) => {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
};

const validateSite = (value) => {
  const valid = value && typeof value === "object"
    && value.copy?.lv && value.copy?.en
    && value.details && value.media
    && Array.isArray(value.stats)
    && Array.isArray(value.achievements?.lv) && Array.isArray(value.achievements?.en)
    && Array.isArray(value.programmes?.lv) && Array.isArray(value.programmes?.en)
    && Array.isArray(value.albums) && Array.isArray(value.videos)
    && Array.isArray(value.voices?.lv) && Array.isArray(value.voices?.en);
  if (!valid) throw Object.assign(new Error("Required site sections are missing or malformed"), { status: 400 });
};

const readSite = async () => JSON.parse(await readFile(siteFile, "utf8"));
const readVoices = async () => JSON.parse(await readFile(voicesFile, "utf8"));
const readPosts = async () => {
  const files = (await readdir(postsDirectory)).filter((file) => file.endsWith(".json"));
  const posts = await Promise.all(files.map(async (file) => JSON.parse(await readFile(join(postsDirectory, file), "utf8"))));
  return posts.sort((a, b) => b.date.localeCompare(a.date));
};

const slugify = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `post-${Date.now()}`;
const postFilename = (post) => `${post.date}-${post.slug}.json`;
const normalizePost = (input, existing = {}) => {
  const title = {
    lv: String(input?.title?.lv || "").trim(),
    en: String(input?.title?.en || "").trim()
  };
  if (!title.lv) throw new Error("Latvian title is required");
  const body = {
    lv: Array.isArray(input?.body?.lv) ? input.body.lv.map(String).filter(Boolean) : String(input?.body?.lv || "").split(/\n{2,}/).filter(Boolean),
    en: Array.isArray(input?.body?.en) ? input.body.en.map(String).filter(Boolean) : String(input?.body?.en || "").split(/\n{2,}/).filter(Boolean)
  };
  const excerpt = {
    lv: String(input?.excerpt?.lv || body.lv[0] || "").slice(0, 320),
    en: String(input?.excerpt?.en || body.en[0] || "").slice(0, 320)
  };
  return {
    id: existing.id || Number(input.id) || Date.now(),
    slug: slugify(String(input.slug || title.lv)),
    date: /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : new Date().toISOString().slice(0, 10),
    title,
    excerpt,
    body,
    image: String(input.image || existing.image || "/media/MASKA_small_vertical.jpg")
  };
};

app.get("/api/content", async (_request, response, next) => {
  try {
    response.json({ site: await readSite(), posts: await readPosts(), voices: await readVoices() });
  } catch (error) { next(error); }
});

app.get("/api/session", (request, response) => response.json({ authenticated: Boolean(currentSession(request)) }));

app.post("/api/login", (request, response) => {
  const key = request.ip;
  const attempt = loginAttempts.get(key) || { count: 0, reset: Date.now() + 10 * 60 * 1000 };
  if (attempt.reset < Date.now()) Object.assign(attempt, { count: 0, reset: Date.now() + 10 * 60 * 1000 });
  attempt.count += 1;
  loginAttempts.set(key, attempt);
  if (attempt.count > 10) return response.status(429).json({ error: "Too many attempts. Try again later." });

  if (!safeEqual(request.body?.password || "", process.env.ADMIN_PASSWORD || "123")) {
    return response.status(401).json({ error: "Incorrect password" });
  }
  loginAttempts.delete(key);
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { expires: Date.now() + 12 * 60 * 60 * 1000 });
  response.set("Set-Cookie", sessionCookie(request, token));
  response.json({ authenticated: true });
});

app.post("/api/logout", (request, response) => {
  const token = parseCookies(request.headers.cookie).maska_session;
  if (token) sessions.delete(token);
  response.set("Set-Cookie", sessionCookie(request, ""));
  response.json({ authenticated: false });
});

app.post("/api/contact", async (request, response, next) => {
  try {
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          return response.status(403).json({ error: "Origin rejected" });
        }
      } catch {
        return response.status(403).json({ error: "Origin rejected" });
      }
    }

    const key = request.ip;
    const attempt = contactAttempts.get(key) || { count: 0, reset: Date.now() + 10 * 60 * 1000 };
    if (attempt.reset < Date.now()) Object.assign(attempt, { count: 0, reset: Date.now() + 10 * 60 * 1000 });
    attempt.count += 1;
    contactAttempts.set(key, attempt);
    if (attempt.count > 8) return response.status(429).json({ error: "Too many messages. Try again later." });

    const kind = request.body?.kind === "join" ? "join" : "contact";
    if (clip(request.body?.website, 80)) return response.json({ sent: true });

    const name = clip(request.body?.name, 120);
    const email = clip(request.body?.email, 120).toLowerCase();
    const subject = kind === "join" ? `Pieteikums korim — ${name}` : clip(request.body?.subject, 200);
    const message = clip(request.body?.message, 5000);
    const phone = clip(request.body?.phone, 40);
    const voice = clip(request.body?.voice, 80);
    if (!name || !emailPattern.test(email) || !subject || !message) {
      return response.status(400).json({ error: "Please complete all required fields." });
    }

    const lines = [
      kind === "join" ? "Jauns pieteikums korim no mājaslapas." : "Jauna ziņa no mājaslapas formas «Raksti mums».",
      "",
      `Vārds: ${name}`,
      `E-pasts: ${email}`,
      phone ? `Tālrunis: ${phone}` : "",
      voice ? `Balss: ${voice}` : "",
      "",
      message
    ].filter(Boolean).join("\n");

    await sendContactMail({
      from: mailFrom,
      to: contactTo,
      replyTo: `${name} <${email}>`,
      subject,
      text: lines
    });
    response.json({ sent: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "The message could not be sent." });
  }
});

app.put("/api/admin/site", requireAdmin, async (request, response, next) => {
  try {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      return response.status(400).json({ error: "Site content must be an object" });
    }
    validateSite(request.body);
    await atomicJsonWrite(siteFile, request.body);
    response.json({ site: request.body });
  } catch (error) { next(error); }
});

app.post("/api/admin/posts", requireAdmin, async (request, response, next) => {
  try {
    const post = normalizePost(request.body);
    const path = join(postsDirectory, postFilename(post));
    if (existsSync(path)) return response.status(409).json({ error: "A post with this date and URL identifier already exists" });
    await atomicJsonWrite(path, post);
    response.status(201).json({ post });
  } catch (error) { next(error); }
});

app.put("/api/admin/posts/:id", requireAdmin, async (request, response, next) => {
  try {
    const posts = await readPosts();
    const existing = posts.find((post) => String(post.id) === request.params.id);
    if (!existing) return response.status(404).json({ error: "Post not found" });
    const oldFile = join(postsDirectory, postFilename(existing));
    const post = normalizePost(request.body, existing);
    const newFile = join(postsDirectory, postFilename(post));
    if (oldFile !== newFile && existsSync(newFile)) return response.status(409).json({ error: "Another post already uses this date and URL identifier" });
    await atomicJsonWrite(newFile, post);
    if (oldFile !== newFile && existsSync(oldFile)) await unlink(oldFile);
    response.json({ post });
  } catch (error) { next(error); }
});

app.delete("/api/admin/posts/:id", requireAdmin, async (request, response, next) => {
  try {
    const post = (await readPosts()).find((item) => String(item.id) === request.params.id);
    if (!post) return response.status(404).json({ error: "Post not found" });
    await unlink(join(postsDirectory, postFilename(post)));
    response.status(204).end();
  } catch (error) { next(error); }
});

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadsDirectory),
  filename: (_request, file, callback) => {
    const extension = extname(file.originalname).toLowerCase();
    const name = slugify(basename(file.originalname, extension)).slice(0, 80);
    callback(null, `${Date.now()}-${name}${extension}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => callback(null, /^(image|audio)\//.test(file.mimetype) || file.mimetype === "application/pdf")
});
app.post("/api/admin/upload", requireAdmin, upload.single("file"), (request, response) => {
  if (!request.file) return response.status(400).json({ error: "No supported file supplied" });
  response.status(201).json({ path: `/media/uploads/${request.file.filename}` });
});

if (dataRoot !== root) app.use(express.static(join(dataRoot, "public")));
app.use(express.static(join(root, "public")));

if (production) {
  app.use(express.static(join(root, "dist")));
  app.use((request, response, next) => {
    if (request.method === "GET" && request.accepts("html")) return response.sendFile(join(root, "dist", "index.html"));
    next();
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.status || 500).json({ error: error.message || "Server error" });
});

app.listen(port, host, () => {
  console.log(`MASKA site running at http://127.0.0.1:${port}`);
  if (host === "0.0.0.0") console.log(`Other devices on the same network: http://<this-PC-IPv4>:${port}`);
  if (!process.env.ADMIN_PASSWORD) console.log("Admin /login uses the local default password.");
});
