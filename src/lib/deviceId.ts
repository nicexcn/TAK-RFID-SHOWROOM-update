/**
 * Station id — a stable, silent identifier for one staff station/tablet.
 *
 * Option C: session ownership is keyed on the STATION (not a throwaway per-request id),
 * so concurrent stations serving different customers don't collide and each resumes its
 * own active session on reload. The id is auto-generated once and persisted in
 * localStorage; staff never have to set it.
 */
const KEY = "tak-station-id";

function generate(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `station-${rand}`;
}

/** The current station id (creates and persists one on first use). */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = generate();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
