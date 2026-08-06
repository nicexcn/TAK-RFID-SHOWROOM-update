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
  // Per-screen IDLE overrides. ALL optional — absent/empty means "inherit the global AppSettings
  // value". Resolved by resolveDisplaySettings() as `perScreen ?? global`. Stored inside the
  // AppSettings.displays JSON, so adding these needs no DB migration.
  idleVideoUrl?: string;                 // override idle single-media URL (image or video)
  idleImages?: string[];                 // override idle slideshow images (non-empty wins over idleVideoUrl)
  idleSlideSeconds?: number;             // override seconds per idle slide
  idleVideoFit?: "contain" | "cover";    // override Fit/Fill
  slideDuration?: number;                // override product-slide seconds
}

const ROTATIONS = [0, 90, 180, 270];

// The global idle/slide settings a display inherits when it has no per-screen override.
// (Rotation is resolved separately in /display via its own ?rotate=/localStorage cascade.)
export interface DisplayGlobals {
  idleVideoUrl: string;
  idleImages: string[];
  idleSlideSeconds: number;
  idleVideoFit: "contain" | "cover";
  slideDuration: number;
}

// The effective settings a given screen renders with (per-screen override else global).
export interface ResolvedDisplaySettings {
  idleVideoUrl: string;
  idleImages: string[];
  idleSlideSeconds: number;
  idleVideoFit: "contain" | "cover";
  slideDuration: number;
}

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
    // Optional per-screen overrides — only KEEP a key when it's a real value, so an absent /
    // blank field cleanly means "inherit global" (never persist empty overrides).
    const iv = typeof r.idleVideoUrl === "string" ? r.idleVideoUrl.trim() : "";
    if (iv) d.idleVideoUrl = iv;
    if (Array.isArray(r.idleImages)) {
      const imgs = r.idleImages.filter((u): u is string => typeof u === "string" && u.length > 0);
      if (imgs.length) d.idleImages = imgs;
    }
    const sec = Math.floor(Number(r.idleSlideSeconds));
    if (Number.isFinite(sec) && sec >= 1) d.idleSlideSeconds = Math.min(120, sec);
    if (r.idleVideoFit === "cover" || r.idleVideoFit === "contain") d.idleVideoFit = r.idleVideoFit;
    const sd = Math.floor(Number(r.slideDuration));
    if (Number.isFinite(sd) && sd >= 1) d.slideDuration = Math.min(120, sd);
    if (d.name) out.push(d);
  }
  return out;
}

// Effective idle/slide settings for one screen: per-screen override wins, else the global default.
// `display` may be undefined (a Default/unregistered screen) → everything falls back to global.
export function resolveDisplaySettings(
  display: SavedDisplay | undefined,
  g: DisplayGlobals,
): ResolvedDisplaySettings {
  return {
    idleVideoUrl: display?.idleVideoUrl ?? g.idleVideoUrl,
    idleImages: display?.idleImages ?? g.idleImages,
    idleSlideSeconds: display?.idleSlideSeconds ?? g.idleSlideSeconds,
    idleVideoFit: display?.idleVideoFit ?? g.idleVideoFit,
    slideDuration: display?.slideDuration ?? g.slideDuration,
  };
}

// The shareable URL a physical screen is opened at.
export function displayUrl(id: string): string {
  return `/display?display=${encodeURIComponent(id)}`;
}
