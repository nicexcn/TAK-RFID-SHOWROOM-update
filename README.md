# TAK RFID Showroom

RFID-based showroom system for a LAMITAK laminate-furniture showroom — customer check-in, RFID surface scanning, takeaway / borrow-return tracking, a public TV display, and an admin dashboard.

**Next.js 16** · **Prisma + PostgreSQL (Supabase)** · a small **WebSocket relay** for RFID readers.

## Quick start

```bash
npm install
cp .env.example .env      # set DATABASE_URL (session pooler :5432) + JWT_SECRET
npm run db:push           # create tables
npm run setup:admin       # login: admin / admin1234
npm run dev               # http://localhost:3000
```

For live RFID scanning, in a second terminal: `cd relay && npm install && cd .. && npm run relay`.

**One-click** (does any missing setup, then runs the app + relay together):

```bash
./scripts/dev.sh
```

📖 Local setup, environment, relay, display, tests → **[`docs/LOCAL.md`](docs/LOCAL.md)**
🚀 Production deployment (Vercel + Fly.io + Supabase) → **[`docs/DEPLOY.md`](docs/DEPLOY.md)**

## Handy scripts

| Command | What |
|---|---|
| **`./scripts/dev.sh`** | **One-click: setup (if needed) + app + relay together** |
| `npm run dev` | Web app (dev), :3000 |
| `npm run relay` | RFID WebSocket relay, :8081 |
| `npm run db:push` / `db:studio` / `db:generate` | Prisma schema push / browse / regenerate |
| `npm run setup:admin` | Create/reset the admin login |
| `npm run build && npm start` | Production-style build |
| `npm test` / `npm run test:api` | Tests |
| **`./scripts/deploy.sh`** | **One-click: deploy to production (with confirmation)** — `--relay` also deploys the relay |
| `vercel deploy` / `vercel deploy --prod` | Deploy preview / production (manual) |
