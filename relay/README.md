# TAK RFID — WebSocket Relay (Option E)

A tiny standalone Node + `ws` relay that bridges the RFID reader middleware to
browsers **over the public internet**, so the web app can run on Vercel (HTTPS)
without the LAN-only `ws://` mixed-content problem and without per-site tunnels.

```
                                              ┌──wss──► browsers (subscribers)   ← live TV/staff display
reader → middleware (WS client, role=pusher) ─┤
                                              └──POST /api/scan (Vercel)         ← server-side persistence
```

Vercel can't host a long-lived WebSocket server, so this relay runs on any
always-on host. It is the only piece that must live outside Vercel.

The relay does two things with every scan a pusher sends:
1. **forwards** it verbatim to subscribers (live display — works even with no DB), and
2. (optional) **ingests** it into the app's `/api/scan` so the **server** persists the
   scan — attributed to the active session bound to that reader. This is the "confident
   path": scans are saved regardless of whether any browser is open, and a fixed reader
   can save with no browser in the loop. Enable it with `APP_BASE_URL` + `SCAN_INGEST_KEY`.

## Connect URL

The reader's identity is **in every message** (`device_id`), so there are **no rooms**.

```
pusher      wss://<relay-host>/?role=pusher&key=<INGEST_KEY>
pusher      wss://<relay-host>/?role=pusher&key=<KEY>&device=<id>  → tag this reader's stream
subscriber  wss://<relay-host>/                    → receives ALL readers
subscriber  wss://<relay-host>/?device=<device_id> → receives only that reader
```

| param    | who | meaning |
|----------|-----|---------|
| `role`   | both | `pusher` (the middleware) or `subscriber` (a browser, default). |
| `key`    | pusher only | must equal the relay's `INGEST_KEY` env, else the connection is closed. Subscribers don't need a key (parity with the public TV display). |
| `device` | both | **pusher:** tag — stamp this id onto every message this pusher sends (overrides the payload `device_id`). **subscriber:** filter — receive only scans whose `device_id` matches. Omit to receive all. |

Pushers send the RFID JSON the reader emits; `device_id` (with `mac_address` /
`serial_number` accepted as aliases) is read from the body:

```json
{ "status": "SCANNING", "device_id": "00:11:22:33:44:55", "epc": "E2802026FFFF00001234", "rssi": -50.0, "count": 1, "battery": 100 }
```

The relay forwards each message verbatim; it parses only to read `device_id` (for routing +
persistence) and `epc` (for persistence).

### Separating multiple readers

Each reader stays distinct by its `device_id`. Best is for each middleware to send its own
real id in the body (handheld = mac, table = serial). If a middleware can't — e.g. it sends a
generic/`"UNKNOWN"` id — tag it at connect time instead and the relay stamps it:

```
BLE handheld → wss://<relay>/?role=pusher&key=<KEY>&device=handheld   (or its mac)
Table reader → wss://<relay>/?role=pusher&key=<KEY>&device=table      (or its serial)

watch handheld → wss://<relay>/?device=handheld
watch table    → wss://<relay>/?device=table
watch both     → wss://<relay>/
```

## Deploy

Any host that keeps a process alive and terminates TLS gives you `wss://` for free:

- **Railway / Render / Fly.io** — point at this folder; it has a `Dockerfile`.
  Set env `INGEST_KEY` to a long random secret. The platform's domain is your `wss://` host.
- **VPS** — `npm install && npm start` behind Caddy/nginx with a cert for `wss://`.

### Env vars

| env | required | meaning |
|-----|----------|---------|
| `INGEST_KEY` | for prod | secret a **pusher** must present (`?key=`). Empty disables the pusher gate (dev only). |
| `PORT` | no | listen port (default 8081; most platforms inject this). |
| `APP_BASE_URL` | for persistence | the app origin, e.g. `https://your-app.vercel.app`. Set with `SCAN_INGEST_KEY` to turn on server-side persistence; unset = pure forwarder. |
| `SCAN_INGEST_KEY` | for persistence | must EQUAL the app's `SCAN_INGEST_KEY` env. Sent to `/api/scan` as the `x-ingest-key` header. |

```bash
# local dev — forwarder only
INGEST_KEY=dev npm install && INGEST_KEY=dev npm start   # ws://localhost:8081
# local dev — with server-side persistence
INGEST_KEY=dev APP_BASE_URL=http://localhost:3000 SCAN_INGEST_KEY=<same-as-app> npm start
# health: GET /  ->  {"ok":true,"subscribers":N,"ingest":true|false}
```

## Server-side persistence (the "confident path")

When `APP_BASE_URL` + `SCAN_INGEST_KEY` are set, the relay also POSTs each scan to
`POST {APP_BASE_URL}/api/scan` (header `x-ingest-key: <SCAN_INGEST_KEY>`, body
`{ "scans": [{ "deviceId": "<device_id>", "rfidTag": "<epc>" }] }`). It dedups the reader's
repeat-scan burst and batches on a 500 ms window; failed POSTs are requeued with backoff.

Attribution is server-side: `/api/scan` maps each scan's `device_id` to the **active Session
whose `readerId` matches**. Staff bind the reader by starting the session while subscribed
with `?device=<device_id>` (`/admin/rfid` derives `readerId` from that param); the browser
then shows scans live but no longer POSTs them (no double-write). A scan from a reader with
**no** active session is forwarded to the display but not persisted (returned under
`noSession`) — e.g. an ambient fixed table reader.

## Wiring the two ends (app side — already built)

- **Configure once:** Admin → **Settings → Display Settings → Cloud Relay URL** =
  `wss://<relay-host>`. Stored in `AppSettings.relayUrl`, served publicly via
  `GET /api/display/config`.
- **TV `/display`:** open ⚙ → the **"Cloud relay — device_id"** field appears → leave it
  empty for **all** readers, or enter a `device_id` to pin one reader → **ใช้ relay**. It
  builds `wss://<relay>/` (or `…/?device=<id>`) and the existing WS client subscribes (no
  code change). You can still paste a full LAN `ws://` URL in the top field instead.
- **Handheld `/admin/rfid`:** the device reader field accepts a full relay URL; add
  `?device=<device_id>` to bind that reader to the session (server persists its scans).
- **Middleware (MPT spec):** instead of running a LAN WS server, connect OUT as a
  WS **client** to `wss://<relay-host>/?role=pusher&key=<INGEST_KEY>` and send each scan as
  the RFID JSON including `device_id`. Auto-reconnect on drop. No room/URL state to manage —
  the relay routes and attributes from the `device_id` in each message.
