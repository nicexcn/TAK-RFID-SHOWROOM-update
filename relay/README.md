# TAK RFID — WebSocket Relay (Option E)

A tiny standalone Node + `ws` relay that bridges the RFID reader middleware to
browsers **over the public internet**, so the web app can run on Vercel (HTTPS)
without the LAN-only `ws://` mixed-content problem and without per-site tunnels.

```
reader → middleware (WS client, role=pusher) ──wss──► [RELAY: rooms by deviceId] ──wss──► browsers (subscribers)
```

Vercel can't host a long-lived WebSocket server, so this relay runs on any
always-on host. It is the only piece that must live outside Vercel.

## Connect URL

```
wss://<relay-host>/?room=<deviceId>&role=<pusher|subscriber>&key=<INGEST_KEY>
```

| param  | who | meaning |
|--------|-----|---------|
| `room` | both | the reader's deviceId (Speedway serial / handheld mac). Pushers send into it; subscribers in the same room receive. |
| `role` | both | `pusher` (the middleware) or `subscriber` (a browser, default). |
| `key`  | pusher only | must equal the relay's `INGEST_KEY` env, else the connection is closed. Subscribers don't need a key (parity with the public TV display). |

The relay forwards each message **verbatim** — it does not parse. Pushers send the
same RFID JSON the LAN middleware already emits, e.g.
`{"status":"SCANNING","epc":"WY7204X","rssi":-58,"count":1,"battery":90,"mac_address":"AA:BB:.."}`.

## Deploy

Any host that keeps a process alive and terminates TLS gives you `wss://` for free:

- **Railway / Render / Fly.io** — point at this folder; it has a `Dockerfile`.
  Set env `INGEST_KEY` to a long random secret. The platform's domain is your `wss://` host.
- **VPS** — `npm install && npm start` behind Caddy/nginx with a cert for `wss://`.

```bash
# local dev
INGEST_KEY=dev npm install && INGEST_KEY=dev npm start   # ws://localhost:8081
# health: GET /  ->  {"ok":true,"rooms":N}
```

## Wiring the two ends (app side — already built)

- **Configure once:** Admin → **Settings → Display Settings → Cloud Relay URL** =
  `wss://<relay-host>`. Stored in `AppSettings.relayUrl`, served publicly via
  `GET /api/display/config`.
- **TV `/display`:** open ⚙ → the **"Cloud reader (relay)"** field appears → type the
  reader's **room/deviceId** → **ใช้ relay**. It builds `wss://<relay>/?room=<id>` and
  the existing WS client subscribes (no code change). You can still paste a full
  LAN `ws://` URL in the top field instead.
- **Handheld `/admin/rfid`:** the device reader field already accepts a full
  `wss://<relay>/?room=<deviceId>` URL (same WS client).
- **Middleware (MPT spec):** instead of running a LAN WS server, connect OUT as a
  WS **client** to `wss://<relay-host>/?room=<deviceId>&role=pusher&key=<INGEST_KEY>`
  and send each scan as the existing RFID JSON. Auto-reconnect on drop. Include the
  device id (mac/serial) so `room` is stable and unique per reader.
