/**
 * Pure parser for messages received from an RFID middleware over WebSocket.
 *
 * Both the Impinj Speedway (SPEEDWAY AUTO-SEND) and the Chainway MR20 (UHF-BLE)
 * middlewares emit the same JSON shapes, plus a raw-EPC-string fallback. This is
 * isolated from the React hook so it can be unit-tested without a DOM/WebSocket.
 */

export type RfidEvent =
  | { type: "tag"; epc: string; rssi: number; count: number; battery?: number; deviceId?: string }
  | { type: "status"; status: "START" | "STOP" | "CLEAR" }
  | { type: "battery"; battery: number }
  | { type: "unknown" };

const SESSION_STATUSES = new Set(["START", "STOP", "CLEAR"]);

// The reader identity MPT confirmed is sent in every message (handheld = mac,
// Speedway = serial, unique per device). Accept the various field spellings.
function readDeviceId(data: Record<string, unknown>): string | undefined {
  const v =
    data.deviceId ?? data.device_id ?? data.mac_address ?? data.macAddress ??
    data.mac ?? data.serial_number ?? data.serialNumber ?? data.serial;
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

export function parseRfidMessage(raw: string): RfidEvent {
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // Plain-text fallback: some readers broadcast the raw EPC string.
    const trimmed = raw.trim();
    if (trimmed.length > 5) {
      return { type: "tag", epc: trimmed, rssi: -70, count: 1 };
    }
    return { type: "unknown" };
  }

  if (!data || typeof data !== "object") return { type: "unknown" };

  const status = data.status as string | undefined;

  if (status && SESSION_STATUSES.has(status)) {
    return { type: "status", status: status as "START" | "STOP" | "CLEAR" };
  }

  if (status === "SCANNING" || data.epc !== undefined) {
    const epc = String(data.epc ?? "");
    if (!epc) return { type: "unknown" };
    const rssi = parseFloat(String(data.rssi ?? -70));
    const count = parseInt(String(data.count ?? 1), 10);
    const event: RfidEvent = {
      type: "tag",
      epc,
      rssi: Number.isFinite(rssi) ? rssi : -70,
      count: Number.isFinite(count) ? count : 1,
    };
    if (data.battery !== undefined) {
      (event as { battery?: number }).battery = Number(data.battery);
    }
    const deviceId = readDeviceId(data);
    if (deviceId) (event as { deviceId?: string }).deviceId = deviceId;
    return event;
  }

  if (data.type === "BATTERY" || (data.battery !== undefined && data.epc === undefined)) {
    const battery = Number(data.battery ?? data.value);
    return { type: "battery", battery };
  }

  return { type: "unknown" };
}
