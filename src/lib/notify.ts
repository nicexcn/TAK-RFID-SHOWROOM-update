"use client";

// Notification alerting (client-only):
//  - Web Audio beep — works everywhere (http/https, iOS/Android/desktop) AFTER a user
//    gesture unlocks the audio context (browser autoplay policy).
//  - OS Notification (`new Notification`) — a bonus pop-up on desktop/Android over a secure
//    context (https) with permission; not available in plain iOS Safari tabs.
// The "เปิดเสียง" button calls enableNotifications() in a click handler to satisfy both gates.

const PREF_KEY = "tak-notif-sound";

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

export function isNotifyEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PREF_KEY) === "on";
}

export function setNotifyEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
}

export function osPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Call from a user gesture: turns alerts on, unlocks audio, and asks for OS permission. */
export async function enableNotifications(): Promise<void> {
  setNotifyEnabled(true);
  try {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") await ctx.resume();
  } catch { /* ignore */ }
  try {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch { /* ignore */ }
}

/** Short two-tone "ติ๊ง-ติ๊ง". No-op until audio is unlocked by a gesture. */
export function playBeep(): void {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  } catch { /* ignore */ }
}

/** OS pop-up where supported + permitted (desktop/Android https). No-op otherwise. */
export function showOsNotification(title: string, body: string): void {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const n = new Notification(title, { body, icon: "/icon-192.png", tag: "tak-notif" });
    setTimeout(() => n.close(), 6000);
  } catch { /* ignore */ }
}
