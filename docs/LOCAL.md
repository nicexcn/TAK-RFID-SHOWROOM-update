# Running locally

How to set up and run the TAK RFID Showroom system on your machine.

## Stack

- **Next.js 16** (App Router) — the web app (admin + the public TV `/display`). Port **3000**.
- **Prisma + PostgreSQL** (Supabase) — database.
- **Relay** (`relay/`) — a tiny WebSocket server that bridges RFID reader middleware to browsers. Port **8081**. Only needed for *live* scanning.
- **Supabase Storage** (optional) — product images + the `/display` idle video.
- **Supabase Realtime** (optional) — instant notifications / TV sync (falls back to polling if absent).

```
RFID reader/middleware ──ws(pusher)──► [relay :8081] ──ws(subscriber)──► browser (Surface Scan / Display)
                                                                          │
web app (:3000) ◄──────────────── Prisma ──────────────────► PostgreSQL (Supabase)
```

## Prerequisites

- **Node.js 20+** (developed on 26). Check: `node -v`
- **npm** (the repo uses `package-lock.json`)
- A **PostgreSQL** database — easiest is a free [Supabase](https://supabase.com) project

## Quick start

```bash
npm install                         # installs deps + runs `prisma generate`
cp .env.example .env                # then edit .env (see below)
npm run db:push                     # create the tables from prisma/schema.prisma
npm run setup:admin                 # create login: admin / admin1234
npm run dev                         # http://localhost:3000
```

Open <http://localhost:3000>, log in with **admin / admin1234**, then change the password in **Settings → Account**.

> **One-click** (Unix/macOS): `./scripts/dev.sh` does any missing setup (deps, `db:push`, admin user) **and** runs the web app + relay together. Ctrl+C stops both.

## Environment (`.env`)

Copy `.env.example` to `.env` and fill it in. Variables:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase Postgres. The **session pooler (`:5432`)** is fastest locally but caps at **15 connections** — add `?connection_limit=5` so the dev pool doesn't exhaust it. Simplest is to use the **transaction pooler (`:6543`, `?pgbouncer=true&connection_limit=1`)** like production (multiplexes, no 15-client cap). |
| `JWT_SECRET` | ✅ | Any long random string. The app **refuses to start without it**. |
| `SUPABASE_URL` | ⬜ | Enables image/video **uploads** (Supabase Storage). Server-side only. |
| `SUPABASE_SERVICE_KEY` | ⬜ | service_role key — **secret**, never expose / never `NEXT_PUBLIC`. |
| `SUPABASE_BUCKET` | ⬜ | Default `product-images` (public; auto-created/configured on first upload). |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ⬜ | Enables **realtime** push (notifications, TV sync). Without them the app polls instead. |
| `SCAN_INGEST_KEY` | ⬜ | Shared secret for server-side scan ingest (`/api/scan`). Must match the relay's `SCAN_INGEST_KEY`. Unset = ingest disabled. |

> Without the `SUPABASE_*` storage vars you can still **paste image/video URLs**; only direct *upload* needs them.

## Database

The project uses **`prisma db push`** (schema-first, no migration files):

```bash
npm run db:push        # apply prisma/schema.prisma to the DB
npm run db:generate    # regenerate the Prisma client (also runs on install + build)
npm run db:studio      # browse data in Prisma Studio
```

> ⚠️ After **any schema change** (`db:push` / `db:generate`), **restart `npm run dev`** — the running dev server caches the old Prisma client and will error on new columns until restarted.

## Login / admin user

```bash
npm run setup:admin                                  # admin / admin1234 (super_admin)
node scripts/create-user.js <username> <password> [role]   # custom user
```

Idempotent — re-running resets that user's password. More users can be added in-app at **Settings → Account**.

## Running

**Web app** (one terminal):

```bash
npm run dev          # dev, http://localhost:3000
# or a production-style build:
npm run build && npm start
```

**Relay** (second terminal — only when you have a real RFID reader):

```bash
cd relay && npm install      # once
cd .. && npm run relay       # ws://localhost:8081  (PORT=8081, INGEST_KEY="" = open, dev only)
```

## RFID readers (the relay)

Live scanning flows **reader → relay → browser**:

1. Start the relay (`npm run relay`). It listens on `ws://localhost:8081`.
2. Point your reader middleware at it as a **pusher**, tagging its stream with a device id:
   `ws://<this-machine-ip>:8081/?role=pusher&device=<reader-id>`
3. The browser subscribes automatically — on **localhost the app auto-targets `:8081`**; in production it uses the **Cloud Relay URL** set in **Settings → Media**.
4. Register your readers in **Settings → Media → Readers** (name + device tag) so they show by name in the picker on the Surface Scan / Display / Add-Product pages.

**No physical reader?** Use the **simulators** built into the **Surface Scan** page ("จำลองการสแกน") and the **`/display`** page (the ⚙ → Demo button) — no relay needed.

Optional server-side persistence: give the relay `APP_BASE_URL` (your app URL) + `SCAN_INGEST_KEY` (matching the app's) so it POSTs scans to `/api/scan` itself. Otherwise the browser persists scans (the default, fine for local).

## TV display

Open **`/display`** (no login). Configure it in **Settings → Media**: idle video (loop/Fit-Fill), screen rotation (per-screen override `?rotate=90`), reader, slide duration. Use the **"Open /display ↗"** link in Settings to preview.

## Tests

```bash
npm test            # unit tests (vitest)
npm run test:api    # API tests
```

## Deploy to Vercel

> Full production guide (Vercel env, the relay on Fly.io, readers, post-deploy checklist) → **[`DEPLOY.md`](DEPLOY.md)**.

The repo is linked to a Vercel project; the CLI deploys local files directly (no git push needed):

```bash
vercel deploy            # preview build (gets its own URL, behind Deployment Protection)
vercel deploy --prod     # promote to production (tak-rfid-showroom.vercel.app)
```

- Set the env vars in the **Vercel dashboard** (Production env). Use the **transaction pooler** (`:6543`, `connection_limit=1`) for `DATABASE_URL`.
- The build runs `prisma generate && next build` automatically.
- Local and production share the **same Supabase DB**, so `db:push` already keeps prod's schema in sync — no separate migration step.

## Troubleshooting

| Symptom | Fix |
|---|---|
| App won't start | `JWT_SECRET` not set in `.env`. |
| "Unknown column / field" errors after editing the schema | Restart `npm run dev` (stale cached Prisma client). |
| DB feels slow locally | The **session pooler (`:5432`)** is faster than the transaction pooler — but see the next row. |
| 500s with `max clients reached in session mode` | The session pooler hit its **15-connection** cap. Switch `DATABASE_URL` to the **transaction pooler** (`:6543`, `pgbouncer=true&connection_limit=1`) — or add `connection_limit=5` to the `:5432` URL — then **restart the dev server**. (`prisma db push` may need the `:5432` URL — pgbouncer transaction mode blocks some DDL.) |
| Scan button stuck on "Connecting…" | The relay isn't reachable — start `npm run relay`, or set the Cloud Relay URL (HTTPS needs `wss://`). |
| Upload fails ("not configured") | Set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, or paste a URL instead. Idle video is **MP4/WEBM, ≤ 50 MB** (the Supabase project's global cap). |
| Notifications/TV not updating instantly | Set `NEXT_PUBLIC_SUPABASE_*` for realtime; otherwise it polls every few seconds. |
