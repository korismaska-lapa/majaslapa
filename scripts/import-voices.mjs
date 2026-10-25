import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

const zipPath = process.argv[2] || "C:/Users/perli/Desktop/media_library_export-koris_maska-2026_09_07_19_42_08.zip";
const xmlPath = process.argv[3] || "C:/Users/perli/Desktop/korismaska.WordPress.2026-09-07.xml";
const outputRoot = resolve("public/media/voices");
const manifestPath = resolve("content/voices.json");

const decode = (value = "") => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const field = (item, name) => decode(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`))?.[1] || "").trim();
const slugify = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const xml = await readFile(xmlPath, "utf8");
const titles = new Map();
for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
  const guid = field(item, "guid");
  if (!/\.(mp3|wav|m4a|ogg)(?:\?|$)/i.test(guid)) continue;
  let filename = guid.split("/").pop().split("?")[0];
  try { filename = decodeURIComponent(filename); } catch {}
  titles.set(filename.toLowerCase(), field(item, "title"));
}

const voiceNames = [
  ["1. soprāns", /(?:1\.?\s*sopr[aā]ns|soprano\s*1|s1)$/i],
  ["2. soprāns", /(?:2\.?\s*sopr[aā]ns|soprano\s*2|s2)$/i],
  ["1. alts", /(?:1\.?\s*alts?|alto\s*1|a1)$/i],
  ["2. alts", /(?:2\.?\s*alts?|alto\s*2|a2)$/i],
  ["1. tenors", /(?:1\.?\s*tenors?|tenor\s*1|t1)$/i],
  ["2. tenors", /(?:2\.?\s*tenors?|tenor\s*2|t2)$/i],
  ["Baritons", /baritons?|baritone|b1$/i],
  ["Bass", /bass|b2$/i]
];

const inferVoice = (title, filename) => {
  const segments = title.split(/\s+[–—-]\s+/);
  const ending = segments.at(-1)?.trim() || "";
  const prefix = filename.replace(/\.[^.]+$/, "").split(/[-_\s]/)[0];
  const voice = voiceNames.find(([, pattern]) => pattern.test(ending))?.[0]
    || voiceNames.find(([, pattern]) => pattern.test(prefix))?.[0]
    || "Pilnais ieraksts";
  const song = voice === "Pilnais ieraksts" || segments.length < 2
    ? title || filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")
    : segments.slice(0, -1).join(" – ");
  return { voice, song };
};

const collectionFor = (relativePath) => {
  const directory = relativePath.split("/").slice(0, -1).join("/");
  if (/dziesmu sv[eē]tku/i.test(directory)) return "Dziesmu svētki 2013";
  const dated = directory.match(/(?:^|\/)(20\d{2})\/(\d{2})/);
  if (dated) return `Repertuārs ${dated[1]}`;
  if (/muzika/i.test(directory)) return "Kora ieraksti";
  return "Repertuāra arhīvs";
};

const openZip = (path) => new Promise((resolvePromise, reject) => {
  yauzl.open(path, { lazyEntries: true }, (error, zip) => error ? reject(error) : resolvePromise(zip));
});
const openEntry = (zip, entry) => new Promise((resolvePromise, reject) => {
  zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolvePromise(stream));
});

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const zip = await openZip(zipPath);
const tracks = [];
let completed = 0;

await new Promise((resolvePromise, reject) => {
  zip.on("error", reject);
  zip.on("end", resolvePromise);
  zip.on("entry", async (entry) => {
    try {
      if (!/\.(mp3|wav|m4a|ogg)$/i.test(entry.fileName)) {
        zip.readEntry();
        return;
      }
      const relative = entry.fileName.split("/").slice(1).join("/");
      const originalName = relative.split("/").pop();
      const title = titles.get(originalName.toLowerCase()) || "";
      const collection = collectionFor(relative);
      const extension = extname(originalName).toLowerCase();
      const filename = `${String(completed + 1).padStart(3, "0")}-${slugify(originalName.slice(0, -extension.length))}${extension}`;
      const collectionSlug = slugify(collection);
      const target = resolve(outputRoot, collectionSlug, filename);
      await mkdir(dirname(target), { recursive: true });
      await pipeline(await openEntry(zip, entry), createWriteStream(target));
      const { voice, song } = inferVoice(title, originalName);
      tracks.push({
        collection,
        song,
        voice,
        src: `/media/voices/${collectionSlug}/${filename}`,
        bytes: entry.uncompressedSize
      });
      completed += 1;
      if (completed % 25 === 0) console.log(`Extracted ${completed} recordings...`);
      zip.readEntry();
    } catch (error) { reject(error); }
  });
  zip.readEntry();
});

tracks.sort((a, b) => a.collection.localeCompare(b.collection, "lv") || a.song.localeCompare(b.song, "lv") || a.voice.localeCompare(b.voice, "lv"));
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(tracks, null, 2)}\n`);
console.log(`Imported ${tracks.length} recordings into ${outputRoot}`);
