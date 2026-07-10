// Central display registry (AppSettings.displays). One source of truth for every physical
// TV in the showroom. Each display is a zone: it shows its own bound reader's live table
// presence and only the customer lists explicitly "Sent to Display" to IT. Isomorphic —
// imported by the API, the settings editor, the /display screen and the scan page, so all
// resolve a screen's identity, bound reader and rotation identically. See src/lib/readers.ts.

export interface SavedDisplay {
  id: string;        // stable key: used as ?display=<id> on the TV URL and to pin a session (Session.displayId)
  name: string;      // friendly label shown to staff ("Table A")
  readerId: string;  // -> SavedReader.id in the reader registry (empty = no auto-connect reader)
  rotation: number;  // per-screen default rotation 0/90/180/270 (a ?rotate= URL param still overrides)
}

const ROTATIONS = [0, 90, 180, 270];

// Coerce arbitrary JSON (from the DB / a request body) into a clean display list. A row with
// no name is dropped on save (an unnamed screen is not addressable/useful), mirroring readers.
export function normalizeDisplays(input: unknown): SavedDisplay[] {
  if (!Array.isArray(input)) return [];
  const out: SavedDisplay[] = [];
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const rot = Number(r.rotation);
    const d: SavedDisplay = {
      id: String(r.id ?? `d${i}`),
      name: String(r.name ?? "").trim(),
      readerId: String(r.readerId ?? "").trim(),
      rotation: ROTATIONS.includes(rot) ? rot : 0,
    };
    if (d.name) out.push(d);
  }
  return out;
}

// The shareable URL a physical screen is opened at.
export function displayUrl(id: string): string {
  return `/display?display=${encodeURIComponent(id)}`;
}
