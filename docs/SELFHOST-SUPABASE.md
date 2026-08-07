# Self-Hosting Supabase on the Windows Server (WSL2)

**Goal:** run Supabase (Postgres + Storage + Realtime + Studio) on the on-prem Windows Server 2025 box, serving the on-prem TAK app only. Vercel keeps using Supabase Cloud (or is retired later). No inbound DB exposure.

> **Decision record (2026-07-23):** WSL2, **not** Hyper-V. The box has 16 GB RAM with ~5.4 GB free (already running DNS + the TAK app + relay.exe). A Hyper-V VM takes a *fixed* RAM reservation that would starve production; WSL2 shares memory dynamically (capped in `.wslconfig`) and returns it when idle. Revisit Hyper-V only after a RAM bump to 32 GB. Migrating WSL2→VM later is just another `pg_dump`→restore.

---

## 0. Server facts (verified 2026-07-23)
- Windows Server 2025 Standard, build 26100 — WSL2 supported.
- 8 logical CPUs · C: 108 GB free · **16 GB RAM, ~5.4 GB free** (the binding constraint).
- Hyper-V **Disabled**, WSL2 **not installed** (stub only), Docker **not installed** — greenfield.

## 1. What the TAK app actually uses from Supabase (so we trim the rest)
Verified against the code at HEAD:
- **Postgres** — via Prisma `DATABASE_URL`. *(required)*
- **Storage** — `src/app/api/upload/sign/route.ts` signed uploads for product images. *(required)*
- **Realtime** — HTTP broadcast `src/lib/realtime.ts` + browser subscribe `src/lib/supabaseBrowser.ts`. *(required; degrades to polling if down)*
- **Kong** gateway (`:8000`) fronts Storage+Realtime. *(required)*
- **Studio + Meta + PostgREST + Auth** — keep (light). *Login uses the app's own JWT (`verifyToken`), NOT Supabase Auth — but keep GoTrue present; Storage/Realtime expect it and the anon/service keys validate against `JWT_SECRET`.*

**Disable to fit 6 GB (the RAM hogs, all unused by the app):**
`analytics` (Logflare — biggest), `vector`, `functions` (Edge Functions), `supavisor` (pooler — we connect direct on 5432; dropping it also removes the old `:6543` DDL gotcha), `imgproxy` (app uses next/image, not Storage transforms).

---

## 2. Install WSL2 + Ubuntu (PowerShell as Admin, on the server)
> Reminder: `Set-PSReadLineOption -HistorySaveStyle SaveNothing` first. Over wush, each command needs an explicit Enter.

```powershell
wsl --install -d Ubuntu-24.04    # installs WSL2 + kernel + Ubuntu; REBOOT when prompted
# after reboot, launch once to create the UNIX user:
wsl -d Ubuntu-24.04
```

Cap WSL2 memory so it can never crowd out DNS + the app. Create `C:\Users\<you>\.wslconfig`:
```ini
[wsl2]
memory=6GB
processors=4
swap=2GB
```
Then `wsl --shutdown` and relaunch to apply.

## 3. Install Docker Engine INSIDE Ubuntu (not Docker Desktop)
Inside the WSL Ubuntu shell:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER          # log out/in of the WSL shell after this
# ensure docker starts with the distro (WSL2 has systemd on by default on 24.04):
sudo systemctl enable --now docker
docker version                          # verify
```

## 4. Clone Supabase + configure secrets
```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```
**Regenerate EVERY secret in `.env`** — never boot on the published placeholders:
- `POSTGRES_PASSWORD` — new strong value.
- `JWT_SECRET` — 40+ random chars.
- `ANON_KEY` / `SERVICE_ROLE_KEY` — generate a matching pair from that `JWT_SECRET` (use the generator at supabase.com/docs/guides/self-hosting/docker#generate-api-keys, or a local JWT tool).
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` — Studio login.
- `SITE_URL` → `https://nimitrlog.com` (the app's primary URL; `app.nimitrlog.com` 301-redirects to it); `API_EXTERNAL_URL` / `SUPABASE_PUBLIC_URL` → the host the app reaches (see §6).

## 5. Trim the stack, then start
Simplest trim: start only the services we need (Compose starts named services + their deps):
```bash
docker compose up -d db rest realtime storage kong studio meta auth
# analytics/vector/functions/supavisor/imgproxy are simply not started.
```
> If Studio or others hard-depend on `analytics` in the current compose file, comment out the `analytics` + `vector` service blocks and any `depends_on: [analytics]` lines, then `docker compose up -d`. Verify: `docker compose ps` (all `healthy`), Studio on `http://localhost:8000`.

## 6. Point the on-prem app at it
The app runs on Windows; Supabase runs in WSL2. Reach it via `localhost` (WSL2 forwards localhost to Windows by default). In the app's **on-prem `.env`** (NOT the Vercel one):
```
DATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY>
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
```
> **Realtime from the browser** (`/display`, notifications) needs a URL the *browser* can reach — `localhost:8000` works only if the browser is on the server. For staff devices, expose Kong `:8000` on the LAN (e.g. `http://<server-lan-ip>:8000`) via a Windows `netsh portproxy` to the WSL2 IP, and set the two `NEXT_PUBLIC_*`/external URLs to that. Realtime failing only degrades to polling, so this is non-blocking to start.

Then recreate schema + migrate data (see §7).

## 7. Migrate data from Supabase Cloud
```bash
# from the Cloud DB (direct 5432 connection string, NOT the 6543 pooler):
pg_dump "postgresql://postgres:<cloudpw>@<cloud-host>:5432/postgres" \
  --no-owner --no-privileges -Fc -f cloud.dump
# restore into the local one:
pg_restore --no-owner --no-privileges -d "postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres" cloud.dump
```
Alternatively, since schema is Prisma-managed: `npx prisma db push` (direct 5432) to create tables, then dump/restore just the data, then reseed the admin login. Verify row counts match before cutover.

## 8. Backups (now 100% your responsibility — Cloud did this silently)
WSL2 has no VM snapshot, so lean on `pg_dump` + file copy:
```bash
# nightly dump inside WSL (cron or a Windows Scheduled Task calling `wsl ...`):
docker exec supabase-db pg_dump -U postgres -Fc postgres > /backups/tak-$(date +%F).dump
```
- Keep 7 daily + 4 weekly. Copy `/backups` out to a Windows path / NAS.
- Also back up `supabase/docker/volumes/storage` (uploaded images) and the `.env` (secrets).
- **Test a restore** once before trusting it.

## 9. Gotchas specific to this setup
- **Keys change everywhere** — regenerating `JWT_SECRET`/anon/service means updating the app `.env` AND anything else holding Supabase keys, in lockstep. (The relay's `subscriberKey`/`ingestKey` are relay↔app, independent of Supabase — unaffected.)
- **No more auto-pause** — self-hosted never pauses (a plus vs Cloud).
- **No `:6543` pooler split** — you connect direct on 5432; the DDL-no-op-on-6543 gotcha disappears.
- **Upgrades are manual & occasionally breaking** — `pg_dump` first, always. WSL2 has no snapshot rollback, so the dump IS your rollback.
- **WSL2 autostart** — WSL doesn't auto-start on boot by default. Add a Scheduled Task (at startup, run `wsl -d Ubuntu-24.04 -u root -- service docker start` or rely on systemd) so Supabase comes back after a server reboot.
- **Memory pressure** — watch that WSL2 + DNS + app + relay coexist under 16 GB. If it's tight, this is the signal to buy RAM and move to a Hyper-V VM.

---

## When to graduate to Hyper-V
Add RAM to 32 GB → enable Hyper-V → Ubuntu Server VM → repeat §3–§8 inside the VM. Migration is the same `pg_dump`→restore. You then gain VM snapshots (snapshot before every upgrade) and hard resource isolation from the production app.
