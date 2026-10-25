import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const source = process.argv[2] || "C:/Users/perli/Desktop/korismaska.WordPress.2026-09-07.xml";
const target = resolve("src/posts.js");
const postsDirectory = resolve("content/posts");
const xml = await readFile(source, "utf8");

const field = (block, tag) => {
  const escaped = tag.replace(":", "\\:");
  return block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${escaped}>`))?.[1]?.trim() || "";
};

const decode = (value) => value
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;|&#8220;|&#8221;/gi, "\"")
  .replace(/&#8216;|&#8217;/gi, "’")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const languageParts = (value) => {
  const parts = { lv: "", en: "" };
  for (const match of value.matchAll(/<!--:(LV|lv|en)-->([\s\S]*?)<!--:-->/g)) {
    parts[match[1].toLowerCase()] += ` ${match[2]}`;
  }
  for (const match of value.matchAll(/\[:(LV|lv|en)\]([\s\S]*?)(?=\[:(?:LV|lv|en)\]|\[:\]|$)/g)) {
    parts[match[1].toLowerCase()] += ` ${match[2]}`;
  }
  if (!parts.lv && !parts.en) parts.lv = value;
  return parts;
};

const clean = (value) => decode(value)
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
  .replace(/\[[^\]]+\]/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const shorten = (text, max = 230) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};

const slugify = (value) => {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch {}
  return decoded
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

const paragraphs = (value) => {
  const prepared = value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/<[^>]+>/g, " ");

  return decode(prepared)
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 2);
};

const images = [
  "/media/MASKA-pie-ESTONIA.jpg",
  "/media/054Mixed-Choir-Maska-Letonia.jpg",
  "/media/IMG_2232.jpg"
];

const posts = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
  .map((match) => match[1])
  .filter((item) => field(item, "wp:post_type") === "post" && field(item, "wp:status") === "publish")
  .map((item, index) => {
    const rawTitle = field(item, "title");
    const rawContent = field(item, "content:encoded");
    const titleParts = languageParts(rawTitle);
    const contentParts = languageParts(rawContent);
    const lvTitle = clean(titleParts.lv || titleParts.en);
    const enTitle = clean(titleParts.en) || lvTitle;
    const lvBody = clean(contentParts.lv || contentParts.en);
    const enBody = clean(contentParts.en);
    const date = field(item, "wp:post_date").slice(0, 10);
    const slug = slugify(field(item, "wp:post_name")) || `news-${field(item, "wp:post_id")}`;
    const recentImage = date.startsWith("2026") ? "/media/WhatsApp-Image-2026-07-05-at-17.47.35-scaled.jpeg"
      : date === "2025-05-08" ? "/media/493034798_1430567188206445_113497777326511862_n.jpg"
      : date.startsWith("2025") ? "/media/gal_561_4574.jpg"
      : date.startsWith("2024") ? "/media/Maska-Perkons.png"
      : date === "2023-12-03" ? "/media/ZieMASKAsvetki_2023.jpg"
      : date.startsWith("2023") ? "/media/CODICF227-1.jpg"
      : date.startsWith("2022") ? "/media/Baobabs_variants_2_png-01.png"
      : date.startsWith("2019") ? "/media/Maska_dziesmu_kari.png"
      : images[index % images.length];

    return {
      id: Number(field(item, "wp:post_id")),
      slug,
      date,
      title: { lv: lvTitle, en: enTitle },
      excerpt: {
        lv: shorten(lvBody),
        en: shorten(enBody || lvBody)
      },
      body: {
        lv: paragraphs(contentParts.lv || contentParts.en),
        en: paragraphs(contentParts.en)
      },
      image: recentImage
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

await rm(postsDirectory, { recursive: true, force: true });
await mkdir(postsDirectory, { recursive: true });
await Promise.all(posts.map((post) => {
  const safeSlug = post.slug.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || `post-${post.id}`;
  return writeFile(resolve(postsDirectory, `${post.date}-${safeSlug}.json`), `${JSON.stringify(post, null, 2)}\n`);
}));
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `// Generated index for independent local post files.\nconst files = import.meta.glob("../content/posts/*.json", { eager: true, import: "default" });\nexport const posts = Object.values(files).sort((a, b) => b.date.localeCompare(a.date));\n`);
console.log(`Imported ${posts.length} published posts into ${postsDirectory}`);
