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
    if (reader.name || reader.device || reader.url) out.push(reader);
  }
  return out;
}

// Resolve a reader to a concrete WebSocket subscriber URL, given the relay base.
//  - explicit url  -> normalized and used as-is (LAN / direct / a different relay)
//  - device tag    -> `${relayBase}/?device=<device>`
//  - neither       -> `${relayBase}/` (all readers) if a base exists, else ""
export function readerUrl(r: { device?: string; url?: string }, relayBase: string): string {
  const url = (r.url || "").trim();
  if (url) return normalizeWsUrl(url);
  const base = (relayBase || "").replace(/\/+$/, "");
  if (!base) return "";
  return r.device ? `${base}/?device=${encodeURIComponent(r.device.trim())}` : `${base}/`;
}
