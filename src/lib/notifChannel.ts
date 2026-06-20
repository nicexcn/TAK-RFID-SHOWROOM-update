"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser, NOTIF_CHANNEL, NOTIF_EVENT } from "@/lib/supabaseBrowser";

// ONE shared "notifications" realtime channel for the whole app session.
//
// Previously the sidebar badge and the notifications page each opened their own
// supabaseBrowser.channel("notifications"). Two channels with the SAME topic on the
// SAME client collide, and the page's removeChannel() on unmount could tear down the
// topic the badge still relied on — leaving the badge updating only on its poll.
//
// This ref-counts a single channel: consumers register a listener (+ optional reconnect
// callback) and get an unsubscribe fn; the channel is created on the first subscriber and
// torn down only when the last one leaves.

type Listener = (payload: unknown) => void;
type Reconnect = () => void;

const messageListeners = new Set<Listener>();
const reconnectListeners = new Set<Reconnect>();
let channel: RealtimeChannel | null = null;

function ensureChannel() {
  if (channel || !supabaseBrowser) return;
  channel = supabaseBrowser
    .channel(NOTIF_CHANNEL)
    .on("broadcast", { event: NOTIF_EVENT }, (msg: { payload: unknown }) => {
      messageListeners.forEach((l) => l(msg.payload));
    })
    .subscribe((status) => {
      // Fires on every (re)connect — let consumers reconcile any nudge dropped during the
      // load race or a websocket reconnect gap.
      if (status === "SUBSCRIBED") reconnectListeners.forEach((r) => r());
    });
}

/**
 * Subscribe to notification broadcasts on the single shared channel.
 * @param onMessage   called with each broadcast payload
 * @param onReconnect called on every (re)SUBSCRIBED so the consumer can re-sync
 * @returns unsubscribe function
 */
export function subscribeNotifications(onMessage: Listener, onReconnect?: Reconnect): () => void {
  ensureChannel();
  messageListeners.add(onMessage);
  if (onReconnect) reconnectListeners.add(onReconnect);
  return () => {
    messageListeners.delete(onMessage);
    if (onReconnect) reconnectListeners.delete(onReconnect);
    if (messageListeners.size === 0 && reconnectListeners.size === 0 && channel && supabaseBrowser) {
      supabaseBrowser.removeChannel(channel);
      channel = null;
    }
  };
}
