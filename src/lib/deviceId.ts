/**
 * Station id — a stable identifier for one staff station/tablet.
 *
 * Option C: ownership is keyed on the STATION, not a throwaway browser UUID.
 * Staff assign a meaningful id once (e.g. "station-table", "tablet-2") via the
 * scan page. We persist it in localStorage so it survives reloads. If never set,
 * we fall back to a persisted generated id so nothing breaks — but the UI nudges
 * staff to name the station.
 */
const KEY = "tak-station-id";

function generate(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 4)
      : Math.random().toString(16).slice(2, 6);
  return `station-${rand}`;
}

/** The current station id (creates a persisted fallback on first use). */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = generate();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

/** Whether the station id was explicitly named by staff (vs an auto fallback). */
export function isStationNamed(): boolean {
  if (typeof window === "undefined") return false;
  const id = window.localStorage.getItem(KEY);
  return !!id && !/^station-[0-9a-f]{4}$/.test(id);
}

/** Assign a human-meaningful station id (one-time setup / change). */
export function setDeviceId(stationId: string): void {
  if (typeof window === "undefined") return;
  const v = stationId.trim();
  if (v) window.localStorage.setItem(KEY, v);
}
