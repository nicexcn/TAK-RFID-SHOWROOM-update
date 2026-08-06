import { normalizeWsUrl } from "@/lib/wsUrl";

// Central reader registry (AppSettings.readers). One source of truth for every screen.
// A reader is either a RELAY reader (a `device` tag appended to the shared relayUrl) or a
// DIRECT reader (an explicit `url` — LAN IP / full ws). Isomorphic: imported by the API,
// the settings editor, and the scan/display pages so they resolve URLs identically.

export interface SavedReader {
  id: string;
  name: string;
  device: string; // relay tag -> ?device=<device> against relayUrl (empty for a direct reader)
  url: string;    // explicit override -> used as-is (empty for a relay reader)
  // Optional usage hint (UX guardrail only — the transport is identical either way):
  //  "table"    = a fixed ambient reader → bind to a /display screen for live table presence.
  //  "handheld" = a roaming BLE reader → use at the scan station (Send to Display), NOT bound to
  //               a screen (its wandering reads would clobber the sent list via presence-wins).
  // Absent = unclassified. Drives a soft warning when a non-table reader is bound to a display.
  kind?: "table" | "handheld";
}

// Coerce arbitrary JSON (from the DB / a request body) into a clean reader list.
export function normalizeReaders(input: unknown): SavedReader[] {
  if (!Array.isArray(input)) return [];
  const out: SavedReader[] = [];
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const reader: SavedReader = {
      id: String(r.id ?? `r${i}`),
      name: String(r.name ?? "").trim(),
      device: String(r.device ?? "").trim(),
      url: String(r.url ?? "").trim(),
    };
    if (r.kind === "table" || r.kind === "handheld") reader.kind = r.kind; // else leave unset
    if (reader.name || reader.device || reader.url) out.push(reader);
  }
  return out;
}

// Resolve a reader to a concrete WebSocket subscriber URL, given the relay base and the
// relay's subscriber key (so the browser passes the relay's subscriber-auth — without it
// the relay upgrades then closes the socket with 1008).
//  - explicit url  -> normalized and used as-is (LAN / direct reader — no relay auth)
//  - device tag    -> `${relayBase}/?role=subscriber&key=<key>&device=<device>`
//  - neither       -> `${relayBase}/?role=subscriber&key=<key>` (all readers)
export function readerUrl(r: { device?: string; url?: string }, relayBase: string, subscriberKey = ""): string {
  const url = (r.url || "").trim();
  if (url) return normalizeWsUrl(url); // direct reader — no relay involved, no auth
  const base = (relayBase || "").replace(/\/+$/, "");
  if (!base) return "";
  const params = new URLSearchParams({ role: "subscriber" });
  if (subscriberKey) params.set("key", subscriberKey);
  if (r.device) params.set("device", r.device.trim());
  return `${base}/?${params.toString()}`;
}
