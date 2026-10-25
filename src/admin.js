let selectedPostId = null;
let selectedIndex = { achievements: null, albums: null, videos: null, people: null, carousel: null };
let activeTab = "site";

const escape = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

const phpUrl = (url) => {
  if (url === "/api/content") return "/content-api.php";
  if (url === "/api/login") return "/admin-api.php?r=login";
  if (url === "/api/logout") return "/admin-api.php?r=logout";
  if (url === "/api/session") return "/admin-api.php?r=session";
  if (url === "/api/admin/site") return "/admin-api.php?r=site";
  if (url === "/api/admin/upload") return "/admin-api.php?r=upload";
  if (url === "/api/admin/posts") return "/admin-api.php?r=posts";
  const post = url.match(/^\/api\/admin\/posts\/([^/?#]+)$/);
  if (post) return `/admin-api.php?r=posts&id=${encodeURIComponent(post[1])}`;
  return null;
};

class ApiError extends Error {
  constructor(message, { fromJson = false } = {}) {
    super(message);
    this.fromJson = fromJson;
  }
}

const parseApiResponse = async (response) => {
  if (response.status === 204) return null;
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    if (!response.ok) throw new ApiError(`Request failed (${response.status})`);
    return null;
  }
  if (trimmed[0] !== "{" && trimmed[0] !== "[") {
    throw new ApiError("Serveris neatbild.");
  }
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new ApiError("Nederīga servera atbilde.");
  }
  if (!response.ok) throw new ApiError(result?.error || `Request failed (${response.status})`, { fromJson: true });
  return result;
};

export const request = async (url, options = {}) => {
  const method = String(options.method || "GET").toUpperCase();
  const init = {
    ...options,
    cache: "no-store",
    credentials: "same-origin",
    headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options.headers }
  };
  const php = phpUrl(url);
  const attempts = [];
  if (php) {
    attempts.push(method === "DELETE"
      ? { url: `${php}${php.includes("?") ? "&" : "?"}action=delete`, init: { ...init, method: "POST" } }
      : { url: php, init });
  }
  attempts.push({ url, init });
  let lastError;
  for (const attempt of attempts) {
    try {
      return await parseApiResponse(await fetch(attempt.url, attempt.init));
    } catch (error) {
      if (error.fromJson) throw error;
      lastError = error instanceof ApiError ? error : new ApiError("Serveris neatbild.");
    }
  }
  throw lastError;
};

const youtubeId = (value = "") => {
  const raw = String(value).trim();
  return raw.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1]
    || raw.match(/^([A-Za-z0-9_-]{11})$/)?.[1]
    || raw;
};

export const loginView = () => `
  <main class="admin-auth">
    <section class="login-card">
      <img src="/media/maska-logo.png" alt="MASKA">
      <p class="admin-kicker">Satura pārvaldība</p>
      <h1>Admin panelis</h1>
      <form id="login-form" class="admin-form">
        <label for="admin-password">Parole</label>
        <input id="admin-password" name="password" type="password" required autofocus autocomplete="current-password">
        <p class="admin-error" role="alert" hidden></p>
        <button class="button" type="submit">Ieiet</button>
      </form>
      <a href="/" data-route>← Atgriezties vietnē</a>
    </section>
  </main>`;

const stringFields = (content, language) => Object.entries(content.copy[language])
  .filter(([key, value]) => typeof value === "string" && !["conductorText1", "conductorText2", "conductorRole"].includes(key))
  .map(([key, value]) => `
    <label class="admin-field">
      <span>${escape(key)}</span>
      <textarea data-content-path="copy.${language}.${key}" rows="${value.length > 150 ? 4 : 2}">${escape(value)}</textarea>
    </label>`).join("");

const detailFields = (content) => Object.entries(content.details)
  .map(([key, value]) => `<label class="admin-field"><span>${escape(key)}</span><input data-content-path="details.${key}" value="${escape(value)}"></label>`).join("");

const postEditor = (posts) => {
  const post = posts.find((item) => String(item.id) === String(selectedPostId));
  const editing = Boolean(post);
  const value = (path, fallback = "") => path.reduce((current, key) => current?.[key], post) ?? fallback;
  return `
    <form id="post-form" class="post-editor" data-id="${editing ? post.id : ""}">
      <div class="admin-section-head"><div><p class="admin-kicker">${editing ? "Rediģēt" : "Jauns ieraksts"}</p><h2>${editing ? escape(post.title.lv) : "Pievienot jaunumu"}</h2></div>${editing ? `<button class="danger-button" type="button" id="delete-post">Dzēst</button>` : ""}</div>
      <div class="admin-form-grid">
        <label class="admin-field"><span>Datums</span><input type="date" name="date" required value="${escape(value(["date"], new Date().toISOString().slice(0, 10)))}"></label>
        <label class="admin-field"><span>URL identifikators</span><input name="slug" value="${escape(value(["slug"]))}" placeholder="izveidosies-no-virsraksta"></label>
      </div>
      <label class="admin-field"><span>Attēla ceļš</span><div class="media-input"><input id="post-image" name="image" value="${escape(value(["image"], "/media/maska-placeholder.jpg"))}"><label class="upload-button">Augšupielādēt<input id="media-upload" type="file" accept="image/*,audio/*,.pdf" hidden></label></div></label>
      <div class="admin-language-grid">
        ${["lv", "en"].map((language) => `<fieldset><legend>${language.toUpperCase()}</legend>
          <label class="admin-field"><span>Virsraksts</span><input name="title.${language}" ${language === "lv" ? "required" : ""} value="${escape(value(["title", language]))}"></label>
          <label class="admin-field"><span>Īss apraksts</span><textarea name="excerpt.${language}" rows="3">${escape(value(["excerpt", language]))}</textarea></label>
          <label class="admin-field"><span>Raksta saturs</span><textarea name="body.${language}" rows="16" placeholder="Atdali rindkopas ar tukšu rindu">${escape((value(["body", language], []) || []).join("\n\n"))}</textarea></label>
        </fieldset>`).join("")}
      </div>
      <p class="admin-status" role="status"></p>
      <button class="button" type="submit">${editing ? "Saglabāt izmaiņas" : "Publicēt ierakstu"}</button>
    </form>`;
};

const achievementItems = (content) => {
  const lv = content.achievements?.lv || [];
  const en = content.achievements?.en || [];
  return lv.map((item, index) => ({
    year: item.year || en[index]?.year || "",
    title: { lv: item.title || "", en: en[index]?.title || "" },
    text: { lv: item.text || "", en: en[index]?.text || "" }
  }));
};

const listEditor = ({ kind, items, labels, emptyTitle, form }) => {
  const index = selectedIndex[kind];
  const editing = Number.isInteger(index) && items[index];
  return `
    <div class="admin-title"><p class="admin-kicker">${labels.kicker}</p><h1>${labels.title}</h1><p>${labels.lead}</p></div>
    <div class="posts-admin">
      <div class="post-list">
        <button class="new-post-button" type="button" data-new-item="${kind}">+ ${labels.add}</button>
        ${items.map((item, itemIndex) => `<button type="button" class="${itemIndex === index ? "active" : ""}" data-edit-item="${kind}" data-index="${itemIndex}"><time>${escape(item.meta)}</time><strong>${escape(item.label)}</strong></button>`).join("")}
      </div>
      <form id="${kind}-form" class="post-editor" data-kind="${kind}" data-index="${editing ? index : ""}">
        <div class="admin-section-head">
          <div><p class="admin-kicker">${editing ? "Rediģēt" : "Jauns ieraksts"}</p><h2>${editing ? escape(items[index].label) : emptyTitle}</h2></div>
          ${editing ? `<button class="danger-button" type="button" data-delete-item="${kind}">Dzēst</button>` : ""}
        </div>
        ${form(editing ? items[index].raw : null)}
        <p class="admin-status" role="status"></p>
        <button class="button" type="submit">${editing ? "Saglabāt izmaiņas" : "Pievienot"}</button>
      </form>
    </div>`;
};

const achievementForm = (item) => `
  <label class="admin-field"><span>Gads</span><input name="year" required value="${escape(item?.year || "")}" placeholder="2019"></label>
  <div class="admin-language-grid">
    ${["lv", "en"].map((language) => `<fieldset><legend>${language.toUpperCase()}</legend>
      <label class="admin-field"><span>Nosaukums</span><input name="title.${language}" ${language === "lv" ? "required" : ""} value="${escape(item?.title?.[language] || "")}"></label>
      <label class="admin-field"><span>Apraksts</span><textarea name="text.${language}" rows="4">${escape(item?.text?.[language] || "")}</textarea></label>
    </fieldset>`).join("")}
  </div>`;

const albumForm = (item) => `
  <div class="admin-form-grid">
    <label class="admin-field"><span>Albuma nosaukums</span><input name="title" required value="${escape(item?.title || "")}"></label>
    <label class="admin-field"><span>Gads</span><input name="year" required value="${escape(item?.year || "")}" placeholder="2019"></label>
  </div>
  <label class="admin-field"><span>Vāka attēls</span><div class="media-input"><input id="album-image" name="image" value="${escape(item?.image || "")}" placeholder="/media/..."><label class="upload-button">Augšupielādēt<input data-upload-target="#album-image" type="file" accept="image/*" hidden></label></div></label>
  <label class="admin-field"><span>Spotify vai ārējā saite</span><input name="url" type="url" value="${escape(item?.url || "")}" placeholder="https://open.spotify.com/album/..."></label>
  <div class="admin-language-grid">
    ${["lv", "en"].map((language) => `<fieldset><legend>${language.toUpperCase()}</legend>
      <label class="admin-field"><span>Apraksts</span><textarea name="description.${language}" rows="4">${escape(item?.description?.[language] || "")}</textarea></label>
    </fieldset>`).join("")}
  </div>`;

const videoForm = (item) => `
  <label class="admin-field"><span>Video nosaukums</span><input name="title" required value="${escape(item?.title || "")}"></label>
  <label class="admin-field"><span>YouTube saite vai ID</span><input name="youtubeId" required value="${escape(item?.youtubeId || "")}" placeholder="https://www.youtube.com/watch?v=..."></label>`;

const carouselForm = (item) => `
  <label class="admin-field"><span>Attēla ceļš</span><div class="media-input"><input id="carousel-image" name="image" required value="${escape(item?.image || "")}" placeholder="/media/slide1.jpg"><label class="upload-button">Augšupielādēt<input data-upload-target="#carousel-image" type="file" accept="image/*" hidden></label></div></label>
  <p class="admin-help">Karuselis rāda attēlu ainavas rāmī 16:10, tāpat kā jaunumu sīktēlu. Cita proporcija tiek aizpildīta līdz malām.</p>
  <div class="admin-language-grid">
    ${["lv", "en"].map((language) => `<fieldset><legend>${language.toUpperCase()}</legend>
      <label class="admin-field"><span>Alt teksts</span><input name="alt.${language}" value="${escape(item?.alt?.[language] || "")}" placeholder="Īss apraksts (nav obligāts)"></label>
    </fieldset>`).join("")}
  </div>`;

const personForm = (item) => `
  <label class="admin-field"><span>Vārds</span><input name="name" required value="${escape(item?.name || "")}"></label>
  <label class="admin-field"><span>Foto</span><div class="media-input"><input id="person-image" name="photo" value="${escape(item?.photo || "")}" placeholder="/media/..."><label class="upload-button">Augšupielādēt<input data-upload-target="#person-image" type="file" accept="image/*" hidden></label></div></label>
  <div class="admin-language-grid">
    ${["lv", "en"].map((language) => `<fieldset><legend>${language.toUpperCase()}</legend>
      <label class="admin-field"><span>Amats</span><input name="occupation.${language}" ${language === "lv" ? "required" : ""} value="${escape(item?.occupation?.[language] || "")}" placeholder="Diriģents"></label>
      <label class="admin-field"><span>Iezīme</span><input name="label.${language}" value="${escape(item?.label?.[language] || "")}" placeholder="Mākslinieciskais vadītājs"></label>
      <label class="admin-field"><span>Teksts</span><textarea name="text.${language}" rows="8">${escape(item?.text?.[language] || "")}</textarea></label>
    </fieldset>`).join("")}
  </div>`;

const collectionView = (content) => {
  if (activeTab === "achievements") {
    const items = achievementItems(content);
    return listEditor({
      kind: "achievements",
      items: items.map((item) => ({ raw: item, meta: item.year, label: item.title.lv || item.title.en })),
      labels: { kicker: "Par kori", title: "Sasniegumi", lead: "Pievieno un rediģē konkursa rezultātus latviski un angliski.", add: "Jauns sasniegums" },
      emptyTitle: "Pievienot sasniegumu",
      form: achievementForm
    });
  }
  if (activeTab === "albums") {
    return listEditor({
      kind: "albums",
      items: (content.albums || []).map((item) => ({ raw: item, meta: item.year, label: item.title })),
      labels: { kicker: "Mūzika", title: "Albumi", lead: "Albumu vāki, gads, apraksti un Spotify saites.", add: "Jauns albums" },
      emptyTitle: "Pievienot albumu",
      form: albumForm
    });
  }
  if (activeTab === "people") {
    return listEditor({
      kind: "people",
      items: (content.people || []).map((item) => ({ raw: item, meta: item.occupation?.lv || item.occupation?.en || "", label: item.name })),
      labels: { kicker: "Par kori", title: "Cilvēki", lead: "Pirmais ieraksts ir Jānis Ozols lapas Par kori sākumā. Pārējiem foto pārmaiņus ir pa labi un pa kreisi.", add: "Jauns cilvēks" },
      emptyTitle: "Pievienot cilvēku",
      form: personForm
    });
  }
  if (activeTab === "carousel") {
    return listEditor({
      kind: "carousel",
      items: (content.carousel || []).map((item) => ({
        raw: item,
        meta: "Sākums",
        label: String(item.image || "").split("/").pop() || "Attēls"
      })),
      labels: { kicker: "Sākums", title: "Karuselis", lead: "Sākuma lapas attēli blakus sadaļai Par kori. Secība ir tāda pati kā sarakstā. Dzēs, lai noņemtu no karuseļa.", add: "Jauns attēls" },
      emptyTitle: "Pievienot attēlu",
      form: carouselForm
    });
  }
  return listEditor({
    kind: "videos",
    items: (content.videos || []).map((item) => ({ raw: item, meta: item.youtubeId, label: item.title })),
    labels: { kicker: "Mūzika", title: "Video", lead: "YouTube videoklipi mūzikas lapai. Ielīmē saiti vai video ID.", add: "Jauns video" },
    emptyTitle: "Pievienot video",
    form: videoForm
  });
};

export const adminView = (content, posts) => {
  if (selectedPostId && !posts.some((post) => String(post.id) === String(selectedPostId))) selectedPostId = null;
  const tabs = [
    ["site", "Vietnes saturs"],
    ["posts", `Jaunumi <span>${posts.length}</span>`],
    ["achievements", `Sasniegumi <span>${(content.achievements?.lv || []).length}</span>`],
    ["people", `Cilvēki <span>${(content.people || []).length}</span>`],
    ["carousel", `Karuselis <span>${(content.carousel || []).length}</span>`],
    ["albums", `Albumi <span>${(content.albums || []).length}</span>`],
    ["videos", `Video <span>${(content.videos || []).length}</span>`]
  ];
  return `
    <main class="admin-shell">
      <header class="admin-header"><a href="/" data-route><img src="/media/maska-logo.png" alt="MASKA"></a><div><a href="/" target="_blank">Skatīt vietni ↗</a><button id="logout-button" type="button">Iziet</button></div></header>
      <div class="admin-workspace">
        <aside class="admin-sidebar">
          <p class="admin-kicker">Pārvaldība</p>
          ${tabs.map(([tab, label]) => `<button class="${activeTab === tab ? "active" : ""}" data-admin-tab="${tab}">${label}</button>`).join("")}
        </aside>
        <section class="admin-main">
          ${activeTab === "site" ? `
            <div class="admin-title"><p class="admin-kicker">Visas lapas</p><h1>Vietnes saturs</h1><p>Rediģē tekstus un kontaktinformāciju. Sasniegumus, cilvēkus, karuseļa attēlus, albumus un video pievieno atsevišķās sadaļās.</p></div>
            <form id="quick-site-form" class="admin-content-form">
              <details open><summary>Kontaktinformācija</summary><div class="admin-form-grid">${detailFields(content)}</div></details>
              <details><summary>Latviešu teksti</summary><div class="admin-form-grid">${stringFields(content, "lv")}</div></details>
              <details><summary>Angļu teksti</summary><div class="admin-form-grid">${stringFields(content, "en")}</div></details>
              <p class="admin-status" role="status"></p><button class="button" type="submit">Saglabāt laukus</button>
            </form>
            <form id="json-site-form" class="json-editor">
              <details><summary>Pilnais datu redaktors</summary><p>Šeit ir pieejams viss vietnes datu modelis. Nepareizs JSON netiks saglabāts.</p><textarea id="site-json" spellcheck="false">${escape(JSON.stringify(content, null, 2))}</textarea><p class="admin-status" role="status"></p><button class="button" type="submit">Saglabāt visus datus</button></details>
            </form>` : activeTab === "posts" ? `
            <div class="admin-title"><p class="admin-kicker">Arhīvs</p><h1>Jaunumi</h1><p>Katrs ieraksts glabājas savā failā un ir pieejams jaunās vietnes adresē.</p></div>
            <div class="posts-admin">
              <div class="post-list"><button class="new-post-button" type="button" id="new-post">+ Jauns ieraksts</button>${posts.map((post) => `<button type="button" class="${String(post.id) === String(selectedPostId) ? "active" : ""}" data-edit-post="${post.id}"><time>${escape(post.date)}</time><strong>${escape(post.title.lv)}</strong></button>`).join("")}</div>
              ${postEditor(posts)}
            </div>` : collectionView(content)}
        </section>
      </div>
    </main>`;
};

const setPath = (object, path, value) => {
  const parts = path.split(".");
  const key = parts.pop();
  const target = parts.reduce((current, part) => current[part], object);
  target[key] = value;
};

const readCollection = (content, kind) => {
  if (kind === "achievements") return achievementItems(content);
  return [...(content[kind] || [])];
};

const writeCollection = (updated, kind, items) => {
  if (kind === "achievements") {
    updated.achievements = {
      lv: items.map((item) => ({ year: item.year, title: item.title.lv, text: item.text.lv })),
      en: items.map((item) => ({ year: item.year, title: item.title.en || item.title.lv, text: item.text.en || item.text.lv }))
    };
    return;
  }
  updated[kind] = items;
  if (kind === "people" && items[0]) {
    updated.details = { ...updated.details, conductor: items[0].name || updated.details.conductor };
    updated.media = { ...updated.media, conductorPortrait: items[0].photo || updated.media.conductorPortrait };
  }
};

const itemFromForm = (kind, data) => {
  if (kind === "achievements") {
    return {
      year: String(data.get("year") || "").trim(),
      title: { lv: String(data.get("title.lv") || "").trim(), en: String(data.get("title.en") || "").trim() },
      text: { lv: String(data.get("text.lv") || "").trim(), en: String(data.get("text.en") || "").trim() }
    };
  }
  if (kind === "albums") {
    return {
      title: String(data.get("title") || "").trim(),
      year: String(data.get("year") || "").trim(),
      image: String(data.get("image") || "").trim(),
      url: String(data.get("url") || "").trim(),
      description: { lv: String(data.get("description.lv") || "").trim(), en: String(data.get("description.en") || "").trim() }
    };
  }
  if (kind === "carousel") {
    return {
      image: String(data.get("image") || "").trim(),
      alt: { lv: String(data.get("alt.lv") || "").trim(), en: String(data.get("alt.en") || "").trim() }
    };
  }
  if (kind === "people") {
    return {
      name: String(data.get("name") || "").trim(),
      photo: String(data.get("photo") || "").trim(),
      occupation: { lv: String(data.get("occupation.lv") || "").trim(), en: String(data.get("occupation.en") || "").trim() },
      label: { lv: String(data.get("label.lv") || "").trim(), en: String(data.get("label.en") || "").trim() },
      text: { lv: String(data.get("text.lv") || "").trim(), en: String(data.get("text.en") || "").trim() }
    };
  }
  return {
    title: String(data.get("title") || "").trim(),
    youtubeId: youtubeId(data.get("youtubeId"))
  };
};

export function bindLogin(onSuccess) {
  document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".admin-error");
    error.hidden = true;
    try {
      await request("/api/login", { method: "POST", body: JSON.stringify({ password: new FormData(form).get("password") }) });
      onSuccess();
    } catch (exception) {
      error.textContent = exception.message;
      error.hidden = false;
    }
  });
}

export function bindAdmin({ content, posts, refresh, navigate }) {
  document.querySelector("#logout-button")?.addEventListener("click", async () => {
    await request("/api/logout", { method: "POST" });
    navigate("/login");
  });
  document.querySelectorAll("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => {
    activeTab = button.dataset.adminTab;
    refresh(false);
  }));
  document.querySelectorAll("[data-edit-post]").forEach((button) => button.addEventListener("click", () => {
    selectedPostId = button.dataset.editPost;
    refresh(false);
  }));
  document.querySelector("#new-post")?.addEventListener("click", () => {
    selectedPostId = null;
    refresh(false);
  });
  document.querySelectorAll("[data-new-item]").forEach((button) => button.addEventListener("click", () => {
    selectedIndex[button.dataset.newItem] = null;
    refresh(false);
  }));
  document.querySelectorAll("[data-edit-item]").forEach((button) => button.addEventListener("click", () => {
    selectedIndex[button.dataset.editItem] = Number(button.dataset.index);
    refresh(false);
  }));

  document.querySelector("#quick-site-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const updated = structuredClone(content);
    event.currentTarget.querySelectorAll("[data-content-path]").forEach((field) => setPath(updated, field.dataset.contentPath, field.value));
    await saveSite(updated, event.currentTarget, refresh);
  });
  document.querySelector("#json-site-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveSite(JSON.parse(event.currentTarget.querySelector("#site-json").value), event.currentTarget, refresh);
    } catch (exception) {
      showStatus(event.currentTarget, exception.message, true);
    }
  });

  document.querySelectorAll("[data-upload-target], #media-upload").forEach((upload) => {
    upload.addEventListener("change", async () => {
      if (!upload.files[0]) return;
      const data = new FormData();
      data.append("file", upload.files[0]);
      try {
        const result = await request("/api/admin/upload", { method: "POST", body: data });
        const target = upload.dataset.uploadTarget
          ? document.querySelector(upload.dataset.uploadTarget)
          : document.querySelector("#post-image");
        if (target) {
          target.value = result.path;
          showStatus(upload.closest("form"), "Foto pievienots. Saglabā, lai tas parādītos lapā.");
        }
      } catch (exception) {
        showStatus(upload.closest("form"), exception.message, true);
      }
    });
  });

  document.querySelector("#post-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const post = {
      date: data.get("date"), slug: data.get("slug"), image: data.get("image"),
      title: { lv: data.get("title.lv"), en: data.get("title.en") },
      excerpt: { lv: data.get("excerpt.lv"), en: data.get("excerpt.en") },
      body: { lv: data.get("body.lv"), en: data.get("body.en") }
    };
    const id = form.dataset.id;
    try {
      const result = await request(id ? `/api/admin/posts/${id}` : "/api/admin/posts", { method: id ? "PUT" : "POST", body: JSON.stringify(post) });
      selectedPostId = result.post.id;
      await refresh(true);
    } catch (exception) { showStatus(form, exception.message, true); }
  });
  document.querySelector("#delete-post")?.addEventListener("click", async () => {
    if (!confirm("Vai tiešām dzēst šo ierakstu?")) return;
    const form = document.querySelector("#post-form");
    try {
      await request(`/api/admin/posts/${selectedPostId}`, { method: "DELETE" });
      selectedPostId = null;
      await refresh(true);
    } catch (exception) {
      showStatus(form, exception.message, true);
    }
  });

  document.querySelectorAll("[data-kind]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const kind = form.dataset.kind;
    const items = readCollection(content, kind);
    const item = itemFromForm(kind, new FormData(form));
    if (form.dataset.index === "") {
      items.push(item);
      selectedIndex[kind] = items.length - 1;
    } else {
      items[Number(form.dataset.index)] = item;
      selectedIndex[kind] = Number(form.dataset.index);
    }
    const updated = structuredClone(content);
    writeCollection(updated, kind, items);
    await saveSite(updated, form, refresh);
  }));
  document.querySelectorAll("[data-delete-item]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Vai tiešām dzēst šo ierakstu?")) return;
    const kind = button.dataset.deleteItem;
    const items = readCollection(content, kind);
    items.splice(selectedIndex[kind], 1);
    selectedIndex[kind] = null;
    const updated = structuredClone(content);
    writeCollection(updated, kind, items);
    await saveSite(updated, button.closest("form"), refresh);
  }));
}

async function saveSite(updated, form, refresh) {
  try {
    await request("/api/admin/site", { method: "PUT", body: JSON.stringify(updated) });
    showStatus(form, "Saglabāts.");
    await refresh(true);
  } catch (exception) { showStatus(form, exception.message, true); }
}

function showStatus(form, message, error = false) {
  const status = form?.querySelector(".admin-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", error);
}
