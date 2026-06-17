const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

/**
 * Best-effort realtime nudge: tells any open /display screens to refetch
 * /api/sessions/display immediately, instead of waiting for the slow fallback
 * poll. Sent over Supabase Realtime's HTTP broadcast endpoint (no persistent
 * connection — works on serverless). Fire-and-forget: if it fails, the display's
 * fallback poll still catches up, so callers don't need to await/handle errors.
 */
export async function broadcastDisplayChanged(): Promise<void> {
  if (!SUPA_URL || !SUPA_KEY) return;
  try {
    await fetch(`${SUPA_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: "sessions-display", event: "changed", payload: {} }],
      }),
    });
  } catch {
    /* ignore — the display's fallback poll covers missed nudges */
  }
}
