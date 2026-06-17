/**
 * Normalize a user-entered reader address into a WebSocket URL.
 * Accepts:
 *   "192.168.1.104"             -> "ws://192.168.1.104:8080"   (LAN / HTTP demo)
 *   "192.168.1.104:9000"        -> "ws://192.168.1.104:9000"
 *   "ws://host:8080"            -> unchanged
 *   "wss://xxx.ngrok-free.app"  -> unchanged   (HTTPS/remote via ngrok tunnel)
 *   "https://xxx.ngrok-free.app"-> "wss://xxx.ngrok-free.app"  (convenience)
 */
export function normalizeWsUrl(input: string): string {
  const v = (input || "").trim();
  if (!v) return "";
  if (v.startsWith("ws://") || v.startsWith("wss://")) return v;
  if (v.startsWith("https://")) return "wss://" + v.slice("https://".length);
  if (v.startsWith("http://")) return "ws://" + v.slice("http://".length);
  if (v.includes(":")) return `ws://${v}`; // host:port supplied
  return `ws://${v}:8080`; // bare host -> default reader port
}

/**
 * On an HTTPS page, a plain ws:// connection is blocked by the browser
 * (mixed content). Returns a warning string if that mismatch applies, else null.
 */
export function wsMixedContentWarning(wsUrl: string): string | null {
  if (typeof window === "undefined") return null;
  if (window.location.protocol === "https:" && wsUrl.startsWith("ws://")) {
    return "หน้านี้เป็น HTTPS — เชื่อม ws:// ไม่ได้ ใช้ wss:// (เช่น ngrok) แทน";
  }
  return null;
}
