// A session with no scan activity for this long is treated as abandoned:
// reads (TV display, session-fetch fallback) ignore it. Default 20 min.
export const SESSION_IDLE_MS = 20 * 60 * 1000;

/** Cutoff Date before which an active session counts as idle/abandoned. */
export function idleCutoff(): Date {
  return new Date(Date.now() - SESSION_IDLE_MS);
}
