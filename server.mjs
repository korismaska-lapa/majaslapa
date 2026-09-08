import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { readdir, readFile, rename, unlink, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";

const root = dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes("--production") || process.env.NODE_ENV === "production" || Boolean(process.env.PASSENGER_STARTED_AT || process.env.PASSENGER_APP_ENV);
const dataRoot = resolve(process.env.DATA_DIR || root);
const siteFile = join(dataRoot, "content", "site.json");
const voicesFile = join(dataRoot, "content", "voices.json");
const postsDirectory = join(dataRoot, "content", "posts");
const uploadsDirectory = join(dataRoot, "public", "media", "uploads");
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || (production ? "0.0.0.0" : "127.0.0.1");

const adminPasswordEncoded = process.env.ADMIN_PASSWORD_B64 || "VGFzdHVuZGFuYWshITExMQ==";
const passwordMatches = (password) => {
  try {
    const expected = process.env.ADMIN_PASSWORD
      ? Buffer.from(String(process.env.ADMIN_PASSWORD), "utf8")
      : Buffer.from(adminPasswordEncoded, "base64");
    const actual = Buffer.from(String(password || ""), "utf8");
    if (!expected.length || expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

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
const mailLog = join(root, "tmp", "mail-error.log");
const encodeSubject = (value) => `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const formatContactEmail = ({ kind, name, email, phone, voice, subject, message }) => {
  const fields = [
    ["Vārds", name],
    ["E-pasts", email]
  ];
  if (kind === "join" || phone) fields.push(["Tālrunis", phone || "—"]);
  if (kind === "join" || voice) fields.push(["Balss grupa", voice || "—"]);
  if (kind === "contact") fields.push(["Tēma", subject]);
  const kicker = kind === "join" ? "Pieteikums korim" : "Raksti mums";
  const heading = kind === "join" ? "Jauns pieteikums korim" : "Jauna ziņa no mājaslapas";
  const messageLabel = kind === "join" ? "Ziņa" : "Jautājums";
  const rule = "────────────────────────────────";
  const text = [
    "KORIS MASKA",
    heading,
    rule,
    ...fields.map(([label, value]) => `${`${label}:`.padEnd(14)}${value}`),
    "",
    messageLabel,
    rule,
    message
  ].join("\n");
  const rows = fields.map(([label, value]) => {
    let display = escapeHtml(value);
    if (label === "E-pasts" && value !== "—") {
      display = `<a href="mailto:${escapeHtml(value)}" style="color:#1e2429;text-decoration:none;border-bottom:1px solid #5bc2ce">${escapeHtml(value)}</a>`;
    } else if (label === "Tālrunis" && value && value !== "—") {
      const tel = value.replace(/[^\d+]/g, "");
      display = `<a href="tel:${escapeHtml(tel)}" style="color:#1e2429;text-decoration:none;border-bottom:1px solid #5bc2ce">${escapeHtml(value)}</a>`;
    }
    return `<tr>
      <td style="padding:11px 0 10px;border-bottom:1px solid #e6eaed;width:34%;vertical-align:top;font:600 11px/1.3 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#3aa3af">${escapeHtml(label)}</td>
      <td style="padding:11px 0 10px;border-bottom:1px solid #e6eaed;font:600 16px/1.45 Arial,sans-serif;color:#1e2429">${display}</td>
    </tr>`;
  }).join("");
  const html = `<!doctype html>
<html lang="lv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#eef2f4;font-family:Arial,sans-serif;color:#1e2429">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d7dee2">
    <tr>
      <td style="padding:22px 28px 18px;background:#1e2429;color:#fff">
        <div style="font:600 11px/1.3 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#5bc2ce">${escapeHtml(kicker)}</div>
        <div style="margin-top:8px;font:700 22px/1.25 Arial,sans-serif">${escapeHtml(heading)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 28px 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px 28px">
        <div style="font:600 11px/1.3 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#3aa3af;margin-bottom:10px">${escapeHtml(messageLabel)}</div>
        <div style="padding:16px 18px;background:#f4f8f9;border-left:3px solid #5bc2ce;font:16px/1.55 Arial,sans-serif;white-space:pre-wrap">${escapeHtml(message).replaceAll("\n", "<br>")}</div>
      </td>
    </tr>
  </table>
</body></html>`;
  return { text, html };
};

const runProcess = (command, args, input = "", env = {}) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, {
    env: { ...process.env, PATH: `/usr/sbin:/usr/bin:/bin:${process.env.PATH || ""}`, ...env }
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolvePromise();
    else reject(new Error(stderr.trim() || `${command} exited ${code}`));
  });
  child.stdin.end(input);
});

const addressOf = (value) => {
  const match = String(value).match(/<([^>]+)>/);
  return (match ? match[1] : String(value)).trim();
};

const whichCommand = (name) => new Promise((resolvePromise) => {
  const child = spawn("bash", ["-lc", `command -v ${name}`]);
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.on("error", () => resolvePromise(""));
  child.on("close", () => resolvePromise(output.trim()));
});

const sendViaSendmail = async (message) => {
  const boundary = `maska_${crypto.randomBytes(8).toString("hex")}`;
  const raw = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Reply-To: ${message.replyTo}`,
    `Subject: ${encodeSubject(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.html || message.text,
    `--${boundary}--`,
    ""
  ].join("\n");
  const bin = [
    process.env.SENDMAIL_PATH,
    "/usr/sbin/sendmail",
    "/usr/lib/sendmail",
    "/usr/bin/sendmail",
    await whichCommand("sendmail")
  ].find((path) => path && existsSync(path));
  if (!bin) throw new Error("sendmail not found");
  return runProcess(bin, ["-i", "-t"], raw);
};

const phpBins = [
  "/usr/local/bin/php",
  "/usr/bin/php",
  "/opt/cpanel/ea-php83/root/usr/bin/php",
  "/opt/cpanel/ea-php82/root/usr/bin/php",
  "/opt/cpanel/ea-php81/root/usr/bin/php",
  "/opt/cpanel/ea-php80/root/usr/bin/php"
];
const sendViaPhp = async (message) => {
  const php = phpBins.find((bin) => existsSync(bin)) || await whichCommand("php");
  if (!php || !existsSync(php)) throw new Error("php not found");
  const script = join(root, "scripts", "send-mail.php");
  if (!existsSync(script)) throw new Error("send-mail.php missing");
  return runProcess(php, [script, message.to, message.subject, message.from, message.replyTo], message.text);
};

const sendContactMail = async (message) => {
  const errors = [];
  const user = process.env.USER || process.env.USERNAME || "korismas";
  const fromAddresses = [
    message.from,
    `Koris MASKA <${user}@localhost>`,
    `${user}@localhost`
  ];
  for (const from of fromAddresses) {
    const payload = { ...message, from };
    for (const [label, send] of [["sendmail", sendViaSendmail], ["php", sendViaPhp]]) {
      try {
        await send(payload);
        return;
      } catch (error) {
        errors.push(`${label}:${error.message}`);
      }
    }
  }
  throw new Error(errors.join(" | "));
};

await mkdir(postsDirectory, { recursive: true }).catch((error) => console.error("posts dir", error));
await mkdir(uploadsDirectory, { recursive: true }).catch((error) => console.error("uploads dir", error));

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "3mb" }));

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
    && Array.isArray(value.voices?.lv) && Array.isArray(value.voices?.en)
    && (!value.people || Array.isArray(value.people));
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

  if (!passwordMatches(request.body?.password)) {
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

const handleContact = async (request, response) => {
  const logMail = async (line) => {
    try {
      await mkdir(join(root, "tmp"), { recursive: true });
      await appendFile(mailLog, `${new Date().toISOString()} ${line}\n`);
    } catch (error) {
      console.error("mail log write failed", error);
    }
  };

  try {
    await logMail(`POST /api/contact origin=${request.headers.origin || "-"} host=${request.headers.host || "-"}`);

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

    const mail = formatContactEmail({ kind, name, email, phone, voice, subject, message });

    await sendContactMail({
      from: mailFrom,
      to: contactTo,
      replyTo: `"${name.replace(/["\r\n]/g, "")}" <${email}>`,
      subject,
      text: mail.text,
      html: mail.html
    });
    await logMail(`sent to ${contactTo}`);
    response.json({ sent: true });
  } catch (error) {
    console.error(error);
    await logMail(error.stack || String(error));
    response.status(500).json({ error: error.message || "The message could not be sent." });
  }
};

app.post("/api/contact", handleContact);
app.post("/send-mail.php", handleContact);

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

app.use((request, response, next) => {
  if (request.method === "GET" && !request.path.includes(".")) {
    response.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});
app.use("/media", express.static(join(root, "public", "media")));
app.use("/media", express.static(join(root, "media")));
app.use("/assets", express.static(join(root, "assets")));
if (dataRoot !== root) app.use(express.static(join(dataRoot, "public")));
app.use(express.static(join(root, "public")));

if (!production) {
  try {
    const { createServer } = await import("vite");
    const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } catch (error) {
    console.warn("Vite is not available; using the production HTML fallback.");
  }
}

app.use("/api", (request, response) => {
  response.status(404).json({ error: `Unknown API route ${request.method} ${request.path}` });
});

app.use((request, response, next) => {
  if (request.method !== "GET" || request.path.startsWith("/api") || request.path.endsWith(".php")) return next();
  const index = join(root, "index.html");
  if (!existsSync(index)) return next();
  response.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.sendFile(index, (error) => {
    if (error && !response.headersSent) next(error);
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.status || 500).json({ error: error.message || "Server error" });
});

if (typeof globalThis.PhusionPassenger !== "undefined") {
  globalThis.PhusionPassenger.configure({ autoInstall: false });
  app.listen("passenger");
} else {
  app.listen(port, host, () => {
    console.log(`MASKA site running at http://127.0.0.1:${port}`);
    if (host === "0.0.0.0") console.log(`Other devices on the same network: http://<this-PC-IPv4>:${port}`);
  });
}
