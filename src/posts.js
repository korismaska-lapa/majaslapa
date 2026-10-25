// Generated index for independent local post files.
const files = import.meta.glob("../content/posts/*.json", { eager: true, import: "default" });
export const posts = Object.values(files).sort((a, b) => b.date.localeCompare(a.date));
