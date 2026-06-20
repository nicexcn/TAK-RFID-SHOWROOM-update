// Proves วิธี B: two pushers tagged ?device=table / ?device=handheld are kept SEPARATE
// even though BOTH send device_id:"UNKNOWN" in the payload. The relay stamps the tag so
// subscribers filter correctly and downstream sees the right device_id.
const RELAY = process.env.RELAY_URL || "ws://localhost:8081";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const got = { table: [], handheld: [], all: [] };

async function sub(name, q) {
  const ws = new WebSocket(`${RELAY}/${q}`);
  ws.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.epc) got[name].push(`${d.device_id}/${d.epc.slice(-4)}`); } catch {} };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error(name + " sub fail")); });
  return ws;
}
async function pusher(tag) {
  const ws = new WebSocket(`${RELAY}/?role=pusher&device=${tag}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error(tag + " push fail")); });
  return ws;
}

const subTable = await sub("table", "?device=table");
const subHand = await sub("handheld", "?device=handheld");
const subAll = await sub("all", "");
const pTable = await pusher("table");
const pHand = await pusher("handheld");
await wait(120);

// BOTH pushers send device_id:"UNKNOWN" in the body (the real-world problem) — distinct epcs.
pTable.send(JSON.stringify({ status: "SCANNING", device_id: "UNKNOWN", epc: "AAAA00000000000000001001", rssi: -50, count: 1 }));
pHand.send(JSON.stringify({ status: "SCANNING", device_id: "UNKNOWN", epc: "AAAA00000000000000001009", rssi: -50, count: 1 }));
await wait(500);
[subTable, subHand, subAll, pTable, pHand].forEach((w) => w.close());

console.log("sub ?device=table     →", got.table);
console.log("sub ?device=handheld  →", got.handheld);
console.log("sub (all)             →", got.all);
const pass =
  JSON.stringify(got.table) === JSON.stringify(["table/1001"]) &&
  JSON.stringify(got.handheld) === JSON.stringify(["handheld/1009"]) &&
  got.all.length === 2 && got.all.includes("table/1001") && got.all.includes("handheld/1009");
console.log(pass ? "\n✅ PASS — แยก reader ได้ + stamp device_id ถูก (UNKNOWN → table/handheld)" : "\n❌ FAIL");
process.exit(pass ? 0 : 1);
