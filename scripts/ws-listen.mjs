// Subscribe to the relay (ALL readers) and print everything that arrives.
// SECONDS>0 → listen for that long then summarize & exit. SECONDS=0 → run forever
// (reconnects on drop) to wait for a real device — tail the log to watch.
const RELAY = process.env.RELAY_URL || "ws://localhost:8081";
const SECONDS = Number(process.env.SECONDS ?? 20);

const ts = () => new Date(Date.now()).toISOString().slice(11, 19);
let n = 0;
const devices = new Map();

function connect() {
  const ws = new WebSocket(`${RELAY}/`);
  ws.onopen = () => console.log(`${ts()}  connected ${RELAY}/  — ${SECONDS > 0 ? SECONDS + "s" : "waiting (forever)"} …`);
  ws.onerror = () => console.log(`${ts()}  connect error → retrying`);
  ws.onclose = () => { console.log(`${ts()}  disconnected → reconnecting in 2s`); setTimeout(connect, 2000); };
  ws.onmessage = (e) => {
    const raw = String(e.data).slice(0, 240);
    n++;
    if (n <= 60 || n % 50 === 0) console.log(`${ts()}  #${n}  ${raw}`);
    try {
      const d = JSON.parse(raw);
      const id = d.device_id || d.mac_address || d.serial_number || d.deviceId || "(none)";
      if (d.epc) devices.set(id, (devices.get(id) || 0) + 1);
    } catch { /* non-json */ }
  };
}
connect();

// Heartbeat so the log shows it's alive & whether anything has arrived.
setInterval(() => {
  const summary = devices.size ? [...devices].map(([id, c]) => `${id}:${c}`).join("  ") : "ยังไม่มีข้อมูล";
  console.log(`${ts()}  ♥ total=${n}  | ${summary}`);
}, 10000);

if (SECONDS > 0) {
  setTimeout(() => {
    console.log(`\n── summary ── messages: ${n}`);
    if (devices.size) for (const [id, c] of devices) console.log(`  ${id} → ${c} tag-scans`);
    else console.log("no tag scans received.");
    process.exit(0);
  }, SECONDS * 1000);
}
