// Tiny mock reader: connects to the relay as a tagged pusher and sends scans periodically.
// Usage: DEVICE=handheld node scripts/mock-pusher.mjs   (auto-reconnects; Ctrl-C to stop)
const RELAY = process.env.RELAY_URL || "ws://localhost:8081";
const DEVICE = process.env.DEVICE || "handheld";
const TAGS = (process.env.TAGS || "AAAA00000000000000001001,AAAA00000000000000001009").split(",");
function connect() {
  const ws = new WebSocket(`${RELAY}/?role=pusher&device=${DEVICE}`);
  ws.onopen = () => {
    console.log(`pusher "${DEVICE}" connected → ${RELAY}`);
    setInterval(() => {
      if (ws.readyState !== 1) return;
      for (const epc of TAGS) ws.send(JSON.stringify({ status: "SCANNING", device_id: "UNKNOWN", epc, rssi: -55, count: 1, battery: 90 }));
    }, 1500);
  };
  ws.onclose = () => { console.log("reconnecting…"); setTimeout(connect, 2000); };
  ws.onerror = () => {};
}
connect();
