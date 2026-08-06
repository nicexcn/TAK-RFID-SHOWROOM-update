const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

/**
 * Best-effort realtime nudge over Supabase Realtime's HTTP broadcast endpoint (no
 * persistent connection — works on serverless). Fire-and-forget: if it fails, the
 * subscribers' fallback poll still catches up, so callers don't need to await/handle it.
 */
async function broadcast(topic: string, event = "changed", payload: unknown = {}): Promise<void> {
  if (!SUPA_URL || !SUPA_KEY) return;
  try {
    await fetch(`${SUPA_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
      // Cap the wait so a slow/hung realtime endpoint can never stall the request that
      // awaits this (the prepare click). Subscribers' fallback poll covers a dropped nudge.
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* ignore — subscribers' fallback poll covers missed nudges */
  }
}

/** Tell open /display screens to refetch the displayed session immediately. */
export function broadcastDisplayChanged(): Promise<void> {
  return broadcast("sessions-display", "changed");
}

/** "Identify screens" — every open /display flashes its own name so staff can match label→TV. */
export function broadcastDisplayIdentify(): Promise<void> {
  return broadcast("sessions-display", "identify");
}

// What a "notifications" broadcast carries, so subscribers can apply the change
// directly instead of refetching. Unknown/absent payloads fall back to a refetch.
export type NotifEvent =
  | { type: "create"; notification: unknown }
  | { type: "update"; notification: unknown }
  | { type: "delete"; id: string }
  | { type: "readAll" }
  | { type: "refetch" };

/** Push a notification change to the notifications page + sidebar badge (+ scan page). */
export function broadcastNotifications(payload: NotifEvent = { type: "refetch" }): Promise<void> {
  return broadcast("notifications", "changed", payload);
}
