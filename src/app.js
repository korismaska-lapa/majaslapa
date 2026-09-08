import "./styles.css";
import { posts as builtInPosts } from "./posts.js";
import defaultSite from "../content/site.json";
import defaultVoiceTracks from "../content/voices.json";
import { adminView, bindAdmin, bindLogin, loginView } from "./admin.js";

const app = document.querySelector("#app");
const state = {
  lang: location.pathname.startsWith("/en") ? "en" : "lv",
  menu: false,
  visiblePosts: 12,
  year: "",
  adminAuthenticated: false
};

let site = structuredClone(defaultSite);
let copy = site.copy;
let posts = [...builtInPosts];
let voiceTracks = [...defaultVoiceTracks];

const route = () => {
  const parts = location.pathname.split("/").filter(Boolean);
  const routeParts = parts[0] === "en" ? parts.slice(1) : parts;
  if (routeParts[0] === "news" && routeParts[1]) return "article";
  return routeParts[0] || "home";
};
const articleSlug = () => {
  const parts = location.pathname.split("/").filter(Boolean);
  const routeParts = parts[0] === "en" ? parts.slice(1) : parts;
  return routeParts[0] === "news" ? decodeURIComponent(routeParts.slice(1).join("/")) : "";
};
const href = (name = "") => `${state.lang === "en" ? "/en" : ""}${name && name !== "home" ? `/${name}` : "/"}`;
const postHref = (post) => href(`news/${encodeURIComponent(post.slug)}`);
const t = () => copy[state.lang];
const escapeHtml = (value = "") => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const FALLBACK_POST_IMAGE = "/media/maska-logo.png";
const postImage = (post) => String(post?.image || "").trim() || FALLBACK_POST_IMAGE;
const postImg = (post) => {
  const src = postImage(post);
  const fallbackClass = src === FALLBACK_POST_IMAGE ? " logo-fallback" : "";
  return `<img src="${escapeHtml(src)}" alt="" loading="lazy" class="${fallbackClass.trim()}" onerror="this.onerror=null;this.src='${FALLBACK_POST_IMAGE}';this.classList.add('logo-fallback')">`;
};
const youtubeUrlRe = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})[^\s]*/gi;
const youtubeEmbed = (id) => `<div class="article-embed video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
function renderArticleParagraph(paragraph, index) {
  const ids = [];
  const text = String(paragraph).replace(youtubeUrlRe, (_, id) => {
    if (!ids.includes(id)) ids.push(id);
    return " ";
  }).replace(/\s+/g, " ").trim();
  const embeds = ids.map(youtubeEmbed).join("");
  if (!text) return embeds;
  return `<p${index === 0 ? " class=\"article-lead\"" : ""}>${escapeHtml(text)}</p>${embeds}`;
}

function header() {
  const current = route() === "article" ? "concerts" : route();
  return `
    <header class="site-header">
      <a class="brand" href="${href()}" data-route aria-label="MASKA — ${state.lang === "lv" ? "sākums" : "home"}">
        <img src="${site.media.logo}" alt="MASKA">
      </a>
      <button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="${state.menu}"><span></span></button>
      <div class="nav-wrap ${state.menu ? "open" : ""}">
        <nav class="main-nav" aria-label="Main navigation">
          ${t().nav.map(([label, name]) => `<a class="${current === name ? "active" : ""}" href="${href(name)}" data-route>${label}</a>`).join("")}
        </nav>
        <div class="lang-switch" aria-label="Language">
          <button class="${state.lang === "lv" ? "active" : ""}" data-lang="lv" type="button">LV</button>
          <button class="${state.lang === "en" ? "active" : ""}" data-lang="en" type="button">EN</button>
        </div>
      </div>
    </header>`;
}

function footer() {
  const c = t();
  const d = site.details;
  return `
    <footer class="site-footer">
      <div class="footer-grid">
        <div class="footer-brand"><img src="${site.media.logo}" alt="MASKA"><p>${c.footerBlurb}</p></div>
        <div class="footer-col"><h2>${c.pages}</h2>${c.nav.slice(0, 4).map(([label, name]) => `<a href="${href(name)}" data-route>${label}</a>`).join("")}</div>
        <div class="footer-col"><h2>${c.contact}</h2><a href="mailto:${d.generalEmail}">${d.generalEmail}</a><a href="tel:${d.phoneHref}">${d.phone}</a><a href="${d.mapUrl}" target="_blank" rel="noreferrer">${d.address}</a></div>
        <div class="footer-col"><h2>${c.follow}</h2><a href="${d.facebook}" target="_blank" rel="noreferrer">Facebook — Koris MASKA</a><a href="${d.instagram}" target="_blank" rel="noreferrer">Instagram — @korismaska</a><a href="${d.spotify}" target="_blank" rel="noreferrer">Spotify — Koris Maska</a></div>
      </div>
      <div class="footer-bottom"><span>© 2026 Koris MASKA</span></div>
    </footer>`;
}

const pageHero = (eyebrow, title, lead, image, extraClass = "") => `
  <section class="page-hero${extraClass ? ` ${extraClass}` : ""}" style="--hero-image:url('${image}')">
    <div class="page-hero-inner"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${lead ? `<p>${lead}</p>` : ""}</div>
  </section>`;

function joinBand() {
  const c = t();
  const d = site.details;
  return `<section class="join-band">
    <div><p class="eyebrow">${c.joinEyebrow}</p><h2>${c.joinTitle}</h2><p class="lead">${c.joinLead}</p><a class="button" href="${href("join")}" data-route>${c.apply}</a></div>
    <dl class="facts">
      <div class="fact"><dt>${c.rehearsals}</dt><dd>${c.rehearsalValue}</dd></div>
      <div class="fact"><dt>${c.venue}</dt><dd>${c.venueValue}</dd></div>
      <div class="fact"><dt>${c.gettingThere}</dt><dd>${c.travelValue}</dd></div>
      <div class="fact"><dt>${c.president}</dt><dd>${d.president} · <a href="mailto:${d.presidentEmail}">${d.presidentEmail}</a> · <a href="tel:${d.phoneHref}">${d.phone}</a></dd></div>
    </dl>
  </section>`;
}

function programmeCard(item) {
  const post = posts.find((candidate) => candidate.slug === item.postSlug);
  const destination = post ? postHref(post) : href("concerts");
  return `<a class="programme" href="${destination}" data-route>
    <span class="tag">${escapeHtml(item.tag)}</span>
    <h3>${escapeHtml(item.title)} <span aria-hidden="true">→</span></h3>
    <p>${escapeHtml(item.text)}</p>
  </a>`;
}

function home() {
  const c = t();
  return `
    <main id="main">
      <section class="hero" style="--home-hero:url('${site.media.homeHero}')">
        <div class="hero-content"><p class="eyebrow">${c.heroEyebrow}</p><h1>${c.heroTitle}</h1><p class="lead">${c.heroLead}</p>
          <div class="button-row"><a class="button" href="${href("music")}" data-route>${c.listen}</a><a class="button secondary" href="${href("join")}" data-route>${c.join}</a></div>
        </div>
      </section>
      <section class="section home-about">
        <div><h2 class="section-title">${c.aboutTitle}</h2><div class="rule"></div><p class="prose-lead">${c.aboutLead}</p><div class="prose"><p>${c.about1}</p><p>${c.about2}</p><p>${c.about3}</p></div><a class="text-link" href="${href("about")}" data-route>${c.aboutMore}</a></div>
        <div class="stat-list">${site.stats.map((stat) => `<div class="stat"><span>${escapeHtml(c[stat.labelKey] || stat.labelKey)}</span><strong>${escapeHtml(stat.value)}</strong></div>`).join("")}</div>
      </section>
      <section class="section surface">
        <div class="section-head"><div><h2 class="section-title">${c.concertsNews}</h2><div class="rule"></div></div><a class="text-link" href="${href("concerts")}" data-route>${c.allNews}</a></div>
        <div class="feature-grid">
          ${posts[0] ? `<a class="feature-card" href="${postHref(posts[0])}" data-route>${postImg(posts[0])}<div class="card-body"><span class="tag">${c.news} · ${formatDate(posts[0].date)}</span><h3>${escapeHtml(posts[0].title[state.lang] || posts[0].title.lv)}</h3><p>${escapeHtml(posts[0].excerpt[state.lang] || posts[0].excerpt.lv)}</p></div></a>` : ""}
          <div class="programme-list">${site.programmes[state.lang].map(programmeCard).join("")}</div>
        </div>
      </section>
      <section class="section"><h2 class="section-title">${c.musicTitle}</h2><div class="rule"></div><p class="prose">${c.musicLead}</p>
        <div class="music-cards">
          <a class="music-card" href="${href("music")}#albums" data-route><span class="tag">Spotify</span><h3>${c.recordings}</h3><p>${c.recordingsNote}</p><span class="arrow">→</span></a>
          <a class="music-card" href="${href("music")}#video" data-route><span class="tag">YouTube</span><h3>${c.video}</h3><p>${c.videoNote}</p><span class="arrow">→</span></a>
          <a class="music-card" href="${href("music")}#voices" data-route><span class="tag">${state.lang === "lv" ? "Koristiem" : "For singers"}</span><h3>${c.voices}</h3><p>${c.voicesNote}</p><span class="arrow">→</span></a>
        </div>
      </section>
      ${joinBand()}
    </main>`;
}

function about() {
  const c = t();
  const achievements = site.achievements[state.lang];
  return `<main id="main">
    ${pageHero(c.heroEyebrow, c.aboutTitle, c.aboutPageLead, site.media.aboutHero)}
    <section class="section story-grid"><div><img class="portrait" src="${site.media.conductorPortrait}" alt="${site.details.conductor}"></div><div class="leader-card"><p class="eyebrow">${c.conductor}</p><h2>${site.details.conductor}</h2><p class="role">${c.conductorRole}</p><div class="prose"><p>${c.conductorText1}</p><p>${c.conductorText2}</p><p>${c.about2}</p><p>${c.about3}</p></div></div></section>
    <section class="section surface"><h2 class="section-title">${c.achievements}</h2><div class="rule"></div><div class="achievement-grid">${achievements.map(({ year, title, text }) => `<article class="achievement"><span class="year">${escapeHtml(year)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join("")}</div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">${c.collaboration}</h2><div class="rule"></div></div></div><div class="prose"><p>${c.collaborationText}</p></div></section>
    ${joinBand()}
  </main>`;
}

const formatDate = (date) => new Intl.DateTimeFormat(state.lang === "lv" ? "lv-LV" : "en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));

function concerts() {
  const c = t();
  const years = [...new Set(posts.map((post) => post.date.slice(0, 4)))];
  const filtered = state.year ? posts.filter((post) => post.date.startsWith(state.year)) : posts;
  const shown = filtered.slice(0, state.visiblePosts);
  return `<main id="main">
    ${pageHero(c.news, c.concertsNews, c.concertsLead, site.media.concertsHero)}
    <section class="section surface">
      <div class="tabs"><button class="chip ${state.year === "" ? "active" : ""}" type="button" data-year="">${c.allYears}</button>${years.map((year) => `<button class="chip ${state.year === year ? "active" : ""}" type="button" data-year="${year}">${year}</button>`).join("")}</div>
      <div class="news-grid" id="news-grid">${shown.map(newsCard).join("")}</div>
      ${shown.length === 0 ? `<p class="voice-empty">${state.lang === "lv" ? "Šajā gadā nav ierakstu." : "No articles for this year."}</p>` : ""}
      ${state.visiblePosts < filtered.length ? `<button class="button load-more" type="button">${c.loadMore}</button>` : ""}
    </section>
  </main>`;
}

function newsCard(post) {
  const title = escapeHtml(post.title[state.lang] || post.title.lv);
  const excerpt = escapeHtml(post.excerpt[state.lang] || post.excerpt.lv);
  return `<a class="news-card" data-post-year="${post.date.slice(0, 4)}" href="${postHref(post)}" data-route>${postImg(post)}<div class="news-card-body"><span class="date">${formatDate(post.date)}</span><h2>${title}</h2>${excerpt ? `<p>${excerpt}</p>` : ""}</div></a>`;
}

function article() {
  const c = t();
  const post = posts.find((item) => item.slug === articleSlug());
  if (!post) {
    return `<main id="main">${pageHero(c.news, "404", state.lang === "lv" ? "Šāds jaunums nav atrasts." : "This article could not be found.", "/media/MASKA_small_vertical.jpg")}<section class="section"><a class="button" href="${href("concerts")}" data-route>${c.allNews}</a></section></main>`;
  }

  const title = escapeHtml(post.title[state.lang] || post.title.lv);
  const translatedBody = post.body[state.lang] || [];
  const body = translatedBody.length ? translatedBody : post.body.lv;
  const fallback = state.lang === "en" && !translatedBody.length;
  const currentIndex = posts.indexOf(post);
  const nextPost = posts[currentIndex + 1];

  return `<main id="main">
    ${pageHero(`${c.news} · ${formatDate(post.date)}`, title, "", postImage(post), `article-hero${postImage(post) === FALLBACK_POST_IMAGE ? " logo-fallback" : ""}`)}
    <article class="section article-layout">
      <aside class="article-aside"><a class="text-link" href="${href("concerts")}" data-route>← ${c.allNews}</a></aside>
      <div class="article-body">
        ${fallback ? `<p class="translation-note">${state.lang === "lv" ? "" : "This archive article is currently available in Latvian."}</p>` : ""}
        ${body.map((paragraph, index) => renderArticleParagraph(paragraph, index)).join("")}
        ${nextPost ? `<a class="next-article" href="${postHref(nextPost)}" data-route><span>${state.lang === "lv" ? "Nākamais arhīvā" : "Next in the archive"}</span><strong>${escapeHtml(nextPost.title[state.lang] || nextPost.title.lv)}</strong> →</a>` : ""}
      </div>
    </article>
  </main>`;
}

function voiceArchive() {
  const groups = new Map();
  for (const track of voiceTracks) {
    const key = `${track.collection}\u0000${track.song}`;
    if (!groups.has(key)) groups.set(key, { collection: track.collection, song: track.song, tracks: [] });
    groups.get(key).tracks.push(track);
  }
  const collections = [...new Set(voiceTracks.map((track) => track.collection))];
  const labels = state.lang === "lv"
    ? { search: "Meklēt skaņdarbu", all: "Visas kolekcijas", tracks: "ieraksti", download: "Lejupielādēt" }
    : { search: "Search repertoire", all: "All collections", tracks: "recordings", download: "Download" };
  return `
    <div class="voice-tools">
      <label><span>${labels.search}</span><input id="voice-search" type="search" placeholder="${labels.search}…"></label>
      <label><span>${state.lang === "lv" ? "Kolekcija" : "Collection"}</span><select id="voice-collection"><option value="">${labels.all}</option>${collections.map((collection) => `<option value="${escapeHtml(collection)}">${escapeHtml(collection)}</option>`).join("")}</select></label>
    </div>
    <div class="voice-library">
      ${[...groups.values()].map((group) => `<details class="voice-song" data-collection="${escapeHtml(group.collection)}" data-search="${escapeHtml(`${group.song} ${group.collection} ${group.tracks.map((track) => track.voice).join(" ")}`.toLowerCase())}">
        <summary><span><small>${escapeHtml(group.collection)}</small><strong>${escapeHtml(group.song)}</strong></span><em>${group.tracks.length} ${labels.tracks}</em></summary>
        <div class="voice-recordings">${group.tracks.map((track) => `<div class="voice-track"><strong>${escapeHtml(track.voice)}</strong><audio controls preload="none" src="${track.src}"></audio><a href="${track.src}" download aria-label="${labels.download}: ${escapeHtml(group.song)} — ${escapeHtml(track.voice)}">↓</a></div>`).join("")}</div>
      </details>`).join("")}
    </div>
    <p class="voice-empty" hidden>${state.lang === "lv" ? "Nekas nav atrasts." : "No recordings found."}</p>`;
}

function music() {
  const c = t();
  const albums = site.albums;
  const videos = site.videos;
  return `<main id="main">
    ${pageHero(c.musicTitle, c.recordings, c.musicPageLead, site.media.musicHero)}
    <section class="section" id="albums"><h2 class="section-title">${c.albumsTitle}</h2><div class="rule"></div><div class="album-grid">${albums.map((album) => `<article class="album"><img src="${album.image}" alt="${escapeHtml(album.title)}" loading="lazy"><div class="album-content"><span class="tag">${escapeHtml(album.year)}</span><h2>${escapeHtml(album.title)}</h2><p>${escapeHtml(album.description?.[state.lang] || album.description?.lv || c[album.descriptionKey] || "")}</p><a href="${album.url}" target="_blank" rel="noreferrer">${c.listenSpotify} →</a></div></article>`).join("")}</div></section>
    <section class="section surface" id="video"><h2 class="section-title">${c.videoTitle}</h2><div class="rule"></div><div class="video-grid">${videos.map((video) => `<article class="video-card"><div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${video.youtubeId}" title="${escapeHtml(video.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><h3>${escapeHtml(video.title)}</h3></article>`).join("")}</div></section>
    <section class="section" id="voices"><h2 class="section-title">${c.singersTitle}</h2><div class="rule"></div><p class="prose">${c.singerArchive}</p>${voiceArchive()}</section>
  </main>`;
}

function join() {
  const c = t();
  const d = site.details;
  return `<main id="main">
    ${pageHero(c.joinEyebrow, c.joinTitle, c.joinPageLead, site.media.joinHero)}
    <section class="section contact-grid">
      <div><h2 class="section-title">${c.whatToExpect}</h2><div class="rule"></div><div class="contact-list"><div class="contact-item"><span>01</span><strong>${c.expectation1}</strong></div><div class="contact-item"><span>02</span><strong>${c.expectation2}</strong></div><div class="contact-item"><span>03</span><strong>${c.expectation3}</strong></div></div></div>
      <div><h2 class="section-title">${c.formTitle}</h2><div class="rule"></div>${applicationForm(c)}</div>
    </section>
    <section class="section surface contact-grid"><a class="map-link" href="${d.mapUrl}" target="_blank" rel="noreferrer"><h3>${c.venue}</h3><p>${d.address}</p><span class="text-link" style="color:white">${c.openMap} →</span></a><div><dl class="facts" style="background:var(--ink);padding:28px"><div class="fact"><dt>${c.rehearsals}</dt><dd>${c.rehearsalValue}</dd></div><div class="fact"><dt>${c.gettingThere}</dt><dd>${c.travelValue}</dd></div><div class="fact"><dt>${c.president}</dt><dd>${d.president} · ${d.presidentEmail} · ${d.phone}</dd></div></dl></div></section>
  </main>`;
}

function applicationForm(c) {
  return `<form class="form mail-form" data-kind="join">
    <div class="field"><label for="name">${c.name}</label><input id="name" name="name" required autocomplete="name"></div>
    <div class="field"><label for="email">${c.email}</label><input id="email" name="email" type="email" required autocomplete="email"></div>
    <div class="field"><label for="phone">${c.phone}</label><input id="phone" name="phone" autocomplete="tel"></div>
    <div class="field"><label for="voice">${c.voice}</label><select id="voice" name="voice"><option value="">—</option>${site.voiceOptions.map((option) => `<option>${escapeHtml(option)}</option>`).join("")}</select></div>
    <div class="field"><label for="message">${c.message}</label><textarea id="message" name="message" required></textarea></div>
    <div class="hp-field" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <button class="button" type="submit">${c.send}</button><p class="form-note">${c.privacy}</p>
  </form>`;
}

function contact() {
  const c = t();
  const d = site.details;
  return `<main id="main">
    ${pageHero(c.contactEyebrow, c.contact, c.contactPageLead, site.media.contactHero)}
    <section class="section contact-grid">
      <div><h2 class="section-title">${c.contact}</h2><div class="rule"></div><div class="contact-list"><div class="contact-item"><span>${c.general}</span><a href="mailto:${d.generalEmail}">${d.generalEmail}</a></div><div class="contact-item"><span>${c.president}</span><strong>${d.president}</strong><br><a href="mailto:${d.presidentEmail}">${d.presidentEmail}</a> · <a href="tel:${d.phoneHref}">${d.phone}</a></div><div class="contact-item"><span>${c.social}</span><a href="${d.facebook}" target="_blank">Facebook — Koris MASKA</a><br><a href="${d.instagram}" target="_blank">Instagram — @korismaska</a></div><div class="contact-item"><span>${c.location}</span><a href="${d.mapUrl}" target="_blank">${d.address}</a></div></div></div>
      <div><h2 class="section-title">${c.writeUs}</h2><div class="rule"></div><form class="form mail-form" data-kind="contact"><div class="field"><label for="contact-name">${c.name}</label><input id="contact-name" name="name" required autocomplete="name"></div><div class="field"><label for="contact-email">${c.email}</label><input id="contact-email" name="email" type="email" required autocomplete="email"></div><div class="field"><label for="subject">${c.subject}</label><input id="subject" name="subject" required></div><div class="field"><label for="contact-message">${c.question}</label><textarea id="contact-message" name="message" required></textarea></div><div class="hp-field" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><button class="button" type="submit">${c.sendMessage}</button><p class="form-note">${c.privacy}</p></form></div>
    </section>
  </main>`;
}

async function loadContent() {
  try {
    const response = await fetch("/api/content", { cache: "no-store" });
    if (!response.ok) return;
    const content = await response.json();
    site = content.site;
    copy = site.copy;
    posts = content.posts;
    voiceTracks = content.voices || voiceTracks;
  } catch {
    // The bundled content remains available for static previews.
  }
}

async function refreshAdmin(reloadContent = true) {
  if (reloadContent) await loadContent();
  render(true);
}

function render(keepScroll = false) {
  state.lang = location.pathname.startsWith("/en") ? "en" : "lv";
  const pages = { home, about, concerts, article, music, join, contact };
  const current = route();
  if (current === "login" || current === "admin") {
    document.documentElement.lang = "lv";
    document.title = `${current === "admin" ? "Admin panelis" : "Ieiet"} — Koris MASKA`;
    app.innerHTML = current === "admin" && state.adminAuthenticated ? adminView(site, posts) : loginView();
    bind();
    if (!keepScroll) window.scrollTo(0, 0);
    return;
  }
  const currentPost = current === "article" ? posts.find((item) => item.slug === articleSlug()) : null;
  document.documentElement.lang = state.lang;
  document.querySelector(".skip-link").textContent = state.lang === "lv" ? "Pāriet uz saturu" : "Skip to content";
  const pageTitle = currentPost?.title[state.lang] || currentPost?.title.lv || t().nav.find(([, name]) => name === current)?.[0] || "";
  document.title = `${current === "home" ? "" : `${pageTitle || "MASKA"} — `}Koris MASKA`;
  app.innerHTML = `<div class="site-shell">${header()}${(pages[current] || home)()}${footer()}</div>`;
  bind();
  if (!keepScroll) {
    const target = location.hash && document.querySelector(location.hash);
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }
}

function navigate(url) {
  history.pushState({}, "", url);
  state.menu = false;
  state.visiblePosts = 12;
  state.year = "";
  document.body.classList.remove("menu-open");
  render();
}

function bind() {
  document.querySelectorAll("[data-route]").forEach((link) => link.addEventListener("click", (event) => {
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    navigate(`${url.pathname}${url.hash}`);
  }));
  if (route() === "login" || route() === "admin") {
    bindLogin(() => {
      state.adminAuthenticated = true;
      navigate("/admin");
    });
    if (state.adminAuthenticated) bindAdmin({ content: site, posts, refresh: refreshAdmin, navigate });
    return;
  }
  document.querySelector(".menu-toggle")?.addEventListener("click", () => {
    state.menu = !state.menu;
    document.body.classList.toggle("menu-open", state.menu);
    render(true);
  });
  document.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => {
    const current = route() === "article" ? `news/${encodeURIComponent(articleSlug())}` : route();
    state.lang = button.dataset.lang;
    localStorage.setItem("maska-lang", state.lang);
    history.replaceState({}, "", href(current));
    render(true);
  }));
  document.querySelector(".load-more")?.addEventListener("click", () => {
    const filtered = state.year ? posts.filter((post) => post.date.startsWith(state.year)) : posts;
    state.visiblePosts = Math.min(filtered.length, state.visiblePosts + 12);
    render(true);
  });
  document.querySelectorAll("[data-year]").forEach((button) => button.addEventListener("click", () => {
    state.year = button.dataset.year || "";
    state.visiblePosts = 12;
    render(true);
  }));
  const voiceSearch = document.querySelector("#voice-search");
  const voiceCollection = document.querySelector("#voice-collection");
  const filterVoices = () => {
    const query = voiceSearch?.value.trim().toLocaleLowerCase("lv") || "";
    const collection = voiceCollection?.value || "";
    let visible = 0;
    document.querySelectorAll(".voice-song").forEach((song) => {
      const matches = (!query || song.dataset.search.includes(query)) && (!collection || song.dataset.collection === collection);
      song.hidden = !matches;
      if (matches) visible += 1;
    });
    const empty = document.querySelector(".voice-empty");
    if (empty) empty.hidden = visible > 0;
  };
  voiceSearch?.addEventListener("input", filterVoices);
  voiceCollection?.addEventListener("change", filterVoices);
  document.querySelectorAll(".mail-form").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const note = form.querySelector(".form-note");
    const button = form.querySelector("button[type=submit]");
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    note.classList.remove("ok", "error");
    try {
      const payloadBody = JSON.stringify({ kind: form.dataset.kind, ...values });
      const readJson = async (response) => {
        const text = await response.text();
        try {
          return { ok: response.ok, data: JSON.parse(text) };
        } catch {
          return { ok: false, data: null };
        }
      };
      let result = await readJson(await fetch("/send-mail.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadBody
      }));
      if (!result.data) {
        result = await readJson(await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payloadBody
        }));
      }
      if (!result.ok || !result.data?.sent) {
        throw new Error(result.data?.error || "send failed");
      }
      form.reset();
      note.textContent = t().formSent;
      note.classList.add("ok");
    } catch (error) {
      note.textContent = error.message && error.message !== "send failed"
        ? `${t().formError} ${error.message}`
        : t().formError;
      note.classList.add("error");
    } finally {
      button.disabled = false;
    }
  }));
}

window.addEventListener("popstate", () => render());
async function bootstrap() {
  await loadContent();
  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (response.ok) state.adminAuthenticated = Boolean((await response.json()).authenticated);
  } catch {}
  if (route() === "admin" && !state.adminAuthenticated) history.replaceState({}, "", "/login");
  render();
}
bootstrap();
