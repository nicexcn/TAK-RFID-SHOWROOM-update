# Production deployment

How the live system is deployed. For running on your machine, see [`LOCAL.md`](LOCAL.md).

## What runs where

| Component | Host | Notes |
|---|---|---|
| **Web app** (Next.js) | **Vercel** — `tak-rfid-showroom.vercel.app`, region `sin1` | Admin + public `/display`. Serverless. |
| **Database + Storage** | **Supabase** (Postgres + Storage) | Shared with local dev. |
| **RFID relay** (WebSocket) | **Fly.io** — `tak-rfid-relay.fly.dev` | Vercel can't host a long-lived WS server, so the relay lives here. See [`../relay/README.md`](../relay/README.md). |
| **RFID readers / middleware** | On-site (showroom) | Push scans to the relay over `wss://`. |

```
readers ──wss(pusher)──► [relay @ Fly.io] ──wss(subscriber)──► browsers (Vercel app)
                                │                                       │
                                └──POST /api/scan──► Vercel ──Prisma──► Supabase
```

## Prerequisites

- A **Vercel** account with the project linked (`.vercel/project.json` → `tak-rfid-showroom`) + `vercel` CLI logged in (`vercel whoami`).
- A **Fly.io** account + `flyctl` (`fly auth login`).
- The **Supabase** project (Postgres + Storage).

---

## 1. Database (Supabase)

Local and production share **the same Supabase database**, so the schema is already kept in sync by `npm run db:push` from dev — there is **no separate prod migration step**. Use:

- **Connection string for Vercel**: the **transaction pooler** (serverless-friendly):
  `postgresql://…@…pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
  (Local dev uses the **session pooler** `:5432` instead — see LOCAL.md.)
- Schema changes are non-destructive `db:push`es. A **destructive** change (dropped column) needs `npx prisma db push --accept-data-loss`.

## 2. Storage (Supabase)

- Bucket `product-images` (public) — product images + the `/display` idle video. Auto-configured on first upload (allowed MIME + size).
- **Max upload = 50 MB** (the Supabase project's global cap). To allow larger idle videos, raise it in **Supabase → Project Settings → Storage → max file size**, then bump `MAX_UPLOAD_MB` in `src/lib/storage.ts`.

## 3. Web app → Vercel

### Environment variables (Vercel → Project → Settings → Environment Variables, **Production**)

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase **transaction pooler** (`:6543`, `pgbouncer=true&connection_limit=1`) |
| `JWT_SECRET` | ✅ | long random string (same secret keeps sessions valid across deploys) |
| `SUPABASE_URL` | ✅ | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | ✅ | service_role key — **secret** |
| `SUPABASE_BUCKET` | ⬜ | `product-images` (default) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅* | enables realtime (notifications + TV sync); without it the app polls |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅* | anon/publishable key |
| `SCAN_INGEST_KEY` | ⬜ | shared secret for relay → `/api/scan`. **Must equal the relay's `SCAN_INGEST_KEY`.** |

\* Not strictly required, but recommended in production for instant notifications/display.

### Deploy

The CLI deploys the **local working tree** directly (no git push needed):

```bash
vercel deploy            # preview build → its own URL (behind Deployment Protection, 401 unless logged into Vercel)
vercel deploy --prod     # build + promote to production (tak-rfid-showroom.vercel.app)
```

> **One-click** (asks to confirm first): `npm run deploy` deploys the web app to prod; `npm run deploy -- --relay` also runs `fly deploy` for the relay.

- The build runs `prisma generate && next build` automatically; `vercel.json` pins region `sin1`.
- Preview URLs are auth-gated by **Vercel Deployment Protection**; the canonical domain is public.
- If GitHub integration is enabled on the project, pushing the production branch also triggers a deploy — pick one method to avoid surprises.

### Rollback

```bash
vercel ls                                  # list deployments
vercel rollback <deployment-url>           # repoint the domain to a previous good build
```

## 4. RFID relay → Fly.io

The relay is `relay/` (Node + `ws`, Dockerfile + `fly.toml` included). Full details in [`relay/README.md`](../relay/README.md).

```bash
cd relay
fly launch --no-deploy                     # first time (app "tak-rfid-relay", region sin) — or: fly apps create tak-rfid-relay
fly secrets set INGEST_KEY=$(openssl rand -base64 32)   # pusher auth — required in production

# Optional "confident path" (relay persists scans itself, even with no browser open):
fly secrets set APP_BASE_URL=https://tak-rfid-showroom.vercel.app
fly secrets set SCAN_INGEST_KEY=<same value as the app's SCAN_INGEST_KEY>

fly deploy                                 # → wss://tak-rfid-relay.fly.dev
```

`fly.toml` keeps `min_machines_running = 1` so persistent WebSocket connections aren't dropped.

**Then point the app at it:** in the app → **Settings → Media → Cloud Relay URL** = `wss://tak-rfid-relay.fly.dev`. The Surface Scan / Display / Add-Product pages subscribe through it (filtered by device tag); on an HTTPS page the relay URL **must be `wss://`**.

> A quick alternative for testing (no Fly): run the relay anywhere and expose it with an `wss://` tunnel (e.g. ngrok), then set that URL as the Cloud Relay URL.

## 5. RFID readers

Point each reader's middleware at the relay as a **pusher**, with the relay key and a device tag:

```
wss://tak-rfid-relay.fly.dev/?role=pusher&key=<INGEST_KEY>&device=<reader-id>
```

Then register each reader in **Settings → Media → Readers** (name + the same device tag) so it shows by name. See `relay/README.md` for the message format and multi-reader separation.

## 6. Post-deploy checklist

```bash
# app is up + new code is live (public endpoint shows the current settings shape):
curl -s https://tak-rfid-showroom.vercel.app/api/display/config | jq

curl -o /dev/null -w '%{http_code}\n' https://tak-rfid-showroom.vercel.app/login    # → 200
```

- [ ] `/login` returns **200**, you can log in.
- [ ] `/api/display/config` returns the expected fields (`readers`, `relayUrl`, `idleVideoUrl`, `displayRotation`, `idleVideoFit`).
- [ ] **Settings → Media → Cloud Relay URL** points at the live relay (`wss://…`).
- [ ] Relay reachable: `curl https://tak-rfid-relay.fly.dev/devices` returns `{"devices":[…]}`.
- [ ] A reader pushes → it appears under "Connected to relay (live)" on Surface Scan, and a scan shows up.
- [ ] `/display` shows the idle screen / video and the right **rotation** for the physical TV (`?rotate=90` per screen, or the global default in Settings).

## Updating

- **App**: `vercel deploy --prod` again (or push if git-integrated).
- **Relay**: `cd relay && fly deploy`.
- **Schema**: `npm run db:push` from dev updates the shared DB for both — then `vercel deploy --prod` so prod runs the matching code. Restart isn't needed on Vercel (each deploy is fresh).
