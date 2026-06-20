import { prisma } from "@/lib/prisma";

// A session with no scan activity for this long is treated as abandoned: reads (TV display,
// session-fetch fallback) ignore it. The window is AppSettings.sessionTimeout (minutes),
// cached briefly so frequent reads don't hammer the DB connection pool.
const DEFAULT_MIN = 20;
const TTL_MS = 30_000;
let cache: { ms: number; at: number } | null = null;

async function idleMs(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.ms;
  try {
    const s = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { sessionTimeout: true },
    });
    const mins = s?.sessionTimeout && s.sessionTimeout > 0 ? s.sessionTimeout : DEFAULT_MIN;
    cache = { ms: mins * 60_000, at: now };
    return cache.ms;
  } catch {
    return cache?.ms ?? DEFAULT_MIN * 60_000;
  }
}

/** Cutoff Date before which an active session counts as idle/abandoned (uses sessionTimeout). */
export async function idleCutoff(): Promise<Date> {
  return new Date(Date.now() - (await idleMs()));
}

/** Drop the cached timeout so a settings change takes effect immediately. */
export function invalidateIdleCache(): void {
  cache = null;
}
