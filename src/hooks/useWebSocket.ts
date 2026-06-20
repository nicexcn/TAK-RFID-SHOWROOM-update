"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { parseRfidMessage } from "@/lib/rfidMessage";
import { normalizeWsUrl } from "@/lib/wsUrl";

interface UseWebSocketOptions {
  url: string;
  onTag: (epc: string, rssi: number, count: number) => void;
  onBattery?: (level: number) => void;
  onStatus?: (status: "START" | "STOP" | "CLEAR") => void;
  onConnectionChange?: (connected: boolean) => void;
  enabled?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  error: string | null;
}

const RECONNECT_DELAY = 4000;
const MAX_BACKOFF_MS = 30_000;

export function useWebSocket({
  url,
  onTag,
  onBattery,
  onStatus,
  onConnectionChange,
  enabled = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const currentUrlRef = useRef<string>(""); // URL the live socket is connected to (to detect URL switches)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retriesRef = useRef(0);
  const stoppedRef = useRef(false); // set by disconnect() to stop auto-reconnect
  const enabledRef = useRef(enabled);
  const callbacksRef = useRef({ onTag, onBattery, onStatus, onConnectionChange });

  callbacksRef.current = { onTag, onBattery, onStatus, onConnectionChange };
  enabledRef.current = enabled;

  const updateConnected = useCallback((connected: boolean) => {
    setIsConnected(connected);
    callbacksRef.current.onConnectionChange?.(connected);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const handleMessage = useCallback((raw: string) => {
    const evt = parseRfidMessage(raw);
    const cb = callbacksRef.current;
    switch (evt.type) {
      case "status":
        cb.onStatus?.(evt.status);
        break;
      case "tag":
        cb.onTag(evt.epc, evt.rssi, evt.count);
        if (evt.battery !== undefined) cb.onBattery?.(evt.battery);
        break;
      case "battery":
        cb.onBattery?.(evt.battery);
        break;
    }
  }, []);

  const closeSocket = useCallback(() => {
    const ws = socketRef.current;
    if (!ws) return;
    // Detach handlers FIRST so closing the old socket doesn't fire onclose → auto-reconnect
    // to the URL we're leaving (which would leak a second connection).
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try { ws.close(); } catch { /* already closing */ }
    socketRef.current = null;
  }, []);

  const connectWs = useCallback(() => {
    if (!url || !enabledRef.current) return;

    clearReconnectTimer();
    const fullUrl = normalizeWsUrl(url);

    // Already connected to this exact URL → nothing to do (avoid redundant reconnects).
    if (socketRef.current?.readyState === WebSocket.OPEN && currentUrlRef.current === fullUrl) return;
    // Otherwise tear down whatever is open/connecting first — covers switching to a new URL
    // (the bug: changing the reader URL left the old socket open) and stale half-open sockets.
    closeSocket();
    setError(null);

    try {
      const ws = new WebSocket(fullUrl);
      currentUrlRef.current = fullUrl;

      ws.onopen = () => {
        updateConnected(true);
        retriesRef.current = 0;
        setError(null);
      };

      ws.onmessage = (event) => {
        handleMessage(event.data);
      };

      ws.onclose = () => {
        updateConnected(false);
        socketRef.current = null;

        // Reconnect INDEFINITELY while enabled (the TV is a 24/7 kiosk — giving up
        // after N tries would let a >20s network blip kill the display forever).
        // Exponential backoff capped at MAX_BACKOFF_MS so we don't hammer the reader.
        if (enabledRef.current && !stoppedRef.current) {
          retriesRef.current += 1;
          const delay = Math.min(MAX_BACKOFF_MS, RECONNECT_DELAY * 2 ** Math.min(retriesRef.current - 1, 4));
          reconnectTimerRef.current = setTimeout(connectWs, delay);
        }
      };

      ws.onerror = () => {
        setError("ไม่สามารถเชื่อมต่อได้");
      };

      socketRef.current = ws;
    } catch (e) {
      setError(String(e));
      updateConnected(false);
    }
  }, [url, clearReconnectTimer, updateConnected, handleMessage, closeSocket]);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    stoppedRef.current = true; // explicit user disconnect — don't auto-reconnect
    closeSocket();
    updateConnected(false);
  }, [clearReconnectTimer, updateConnected, closeSocket]);

  const connect = useCallback(() => {
    stoppedRef.current = false;
    retriesRef.current = 0;
    connectWs();
  }, [connectWs]);

  useEffect(() => {
    return () => {
      clearReconnectTimer();
      closeSocket();
    };
  }, [clearReconnectTimer, closeSocket]);

  return { isConnected, connect, disconnect, error };
}
