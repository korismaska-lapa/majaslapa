# Koris MASKA redesign

A responsive bilingual site prototype built from:

- the WordPress WXR export from 7 September 2026;
- the matching WordPress media-library export;
- the supplied visual design handoff.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

The application now runs through `server.mjs`; this is required for the content manager and
file persistence.

## Run with Docker

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/), then from this folder:

```bash
docker compose up -d --build
```

- Site: http://127.0.0.1:5173
- Login: http://127.0.0.1:5173/login
- Admin password: set `ADMIN_PASSWORD` in the environment or a local `.env` (copy `.env.example`). This machine has used `123` for local Docker, for example `ADMIN_PASSWORD=123 docker compose up -d --build`. Do not commit a real `.env`.

Persisted data stays on the host, not in the image:

| Host path | Container path | What it holds |
| --- | --- | --- |
| `./content` | `/app/content` | `site.json`, `voices.json`, news posts |
| `./public/media/uploads` | `/app/public/media/uploads` | CMS uploads |
| `./public/media/voices` | `/app/public/media/voices` | rehearsal MP3s (~1.5 GB) |

`DATA_DIR` is left unset so the server uses those folders directly. Voice files are bind-mounted and are never `COPY`ed into the image. Sessions are cookie + in-memory, so there is no session mount.

If something else is already listening on 5173 (for example `start-host.bat`), stop that process first or change the left-hand port in `docker-compose.yml`.

`start-host.bat` remains the bare-metal option. Docker is an additional path.

## Host on Railway

This is a Node app, not a static site. Railway (or any always-on Node host) can serve the
public pages and keep admin edits.

1. Push this repo to GitHub.
2. At [railway.app](https://railway.app) create a project from that GitHub repo.
3. Set variables:
   - `ADMIN_PASSWORD` — a strong password, not `123`
   - `NODE_ENV=production`
   - `DATA_DIR=/data`
4. Add a volume and mount it at `/data`. Without a volume, edits are lost when the
   service restarts.
5. After the first deploy, open `/login` on the Railway URL.

Do not commit `public/media/voices/` — that folder is about 1.5 GB. The voice-parts
catalogue still loads; upload rehearsal tracks later through the admin panel, or copy
them onto the Railway volume.

Point `korismaska.lv` at Railway from the service Settings → Networking → Custom domain.

## Content manager

Open `/login`. The temporary development password is `123`.

For any deployed environment, set `ADMIN_PASSWORD` to a strong secret. The password is checked
only on the server and successful logins receive an HttpOnly, SameSite session cookie.

The manager supports:

- editing all LV/EN page copy and contact information;
- editing the complete site data model (achievements, programmes, albums, videos, statistics,
  navigation and media paths);
- creating, editing and deleting bilingual news posts;
- uploading images, audio, and PDF files.

Site settings are persisted in `content/site.json`, posts in `content/posts/`, and new files in
`public/media/uploads/`. A production host therefore needs a persistent writable filesystem
or these storage functions should be moved to a database/object-storage service.

## Content

Each public WordPress post is converted into its own JSON file in `content/posts/`. A generated
`src/posts.js` index loads those files into the news archive:

```bash
npm run import:wxr
```

The importer intentionally includes only published `post` records. It excludes Ninja Forms
submissions and other private data in the export.

News cards and article navigation stay entirely within the new site under `/news/<slug>`.
Article pages use local content and local display images; they do not link back to the old
WordPress posts.

Selected original images are in `public/media`. The 1.7 GB source media archive has not been
duplicated into this project. The voice-parts page therefore presents the archive structure
without publishing the 384 rehearsal MP3 files.

## Routes

Latvian routes live at `/`, `/about`, `/concerts`, `/music`, `/join`, and `/contact`.
English equivalents use the `/en/` prefix. The included `_redirects` file provides SPA fallback
on hosts that support Netlify-style redirects; another host should rewrite all routes to
`index.html`.
