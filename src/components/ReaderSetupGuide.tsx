"use client";

import { useState } from "react";

// Collapsible "How to connect a reader / middleware" guide, shown in Settings next to the
// reader registry. Static content — consolidates the setup knowledge that was previously only
// in scattered field placeholders + code comments. No API; safe to render anywhere.
export default function ReaderSetupGuide() {
  const [open, setOpen] = useState(false);

  const code: React.CSSProperties = {
    fontFamily: "monospace", fontSize: "0.75rem",
    background: "var(--color-bg)", padding: "1px 6px", borderRadius: 4,
    color: "var(--color-text)", wordBreak: "break-all",
  };
  const h = { color: "var(--color-text)" };
  const muted = { color: "var(--color-text-muted)" };
  const sub = { color: "var(--color-text-subtle)" };

  return (
    <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
      <button onClick={() => setOpen((s) => !s)} className="text-sm font-medium" style={h}>
        {open ? "▾" : "▸"} How to connect a reader / middleware
      </button>
      {open && (
        <div className="mt-3 p-4 rounded-xl space-y-4 text-sm" style={{ background: "var(--color-hover)", border: "1px solid var(--color-border)" }}>
          {/* The model */}
          <div>
            <p className="font-medium mb-1" style={h}>How scans reach the app</p>
            <p style={muted}>
              Every reader (UHF table, BLE handheld, etc.) is bridged to a WebSocket by its
              <b> middleware</b> — the app never talks to a reader directly. Two ways to wire it:
            </p>
            <p className="mt-1" style={sub}>
              <b>Relay</b> (recommended, works off-LAN): middleware → cloud relay → this app.<br />
              <b>Direct LAN</b>: the app connects straight to a reader/middleware WebSocket on the local network.
            </p>
          </div>

          {/* Relay reader */}
          <div>
            <p className="font-medium mb-1" style={h}>A. Relay reader</p>
            <ol className="list-decimal ml-4 space-y-1" style={muted}>
              <li>Set the shared <b>Relay URL</b> + <b>Subscriber key</b> above (once for all relay readers).</li>
              <li>Add a reader below and give it a <b>Device tag</b> — any short label you choose for that
                physical reader, e.g. <span style={code}>table-1</span> (leave URL blank).</li>
              <li>Point the reader&apos;s middleware at the relay as a <b>pusher</b>:</li>
            </ol>
            <p className="mt-1" style={muted}>Template (replace each <span style={code}>&lt;…&gt;</span>):</p>
            <p className="mt-1" style={code}>wss://&lt;relay-host&gt;/?role=pusher&amp;key=&lt;pusher-key&gt;&amp;device=&lt;device-tag&gt;</p>
            <p className="mt-2" style={muted}>Example, filled in:</p>
            <p className="mt-1" style={code}>wss://ws.nimitrlog.com/?role=pusher&amp;key=Sk9f2aQ...&amp;device=table-1</p>
            <p className="mt-2" style={sub}>
              …sending each scan as JSON: <span style={code}>{'{"status":"SCANNING","device_id":"…","epc":"…","rssi":-50,"count":1,"battery":100}'}</span>
            </p>
            <p className="mt-3" style={muted}>
              <b>What goes in each <span style={code}>&lt;…&gt;</span>:</b>
            </p>
            <ul className="list-disc ml-4 space-y-1" style={sub}>
              <li><span style={code}>&lt;relay-host&gt;</span> — the relay&apos;s address, the same host as the
                <b> Relay URL</b> above (here <span style={code}>ws.nimitrlog.com</span>).</li>
              <li><span style={code}>&lt;pusher-key&gt;</span> — the relay&apos;s <b>pusher key</b>, a secret set on
                the relay server (in <span style={code}>relay.config.json</span>, the field named <span style={code}>ingestKey</span>).
                It is <b>not</b> the <b>Subscriber key</b> field above — the relay has <b>two different keys</b>:
                the <b>pusher key</b> lets a reader send scans <i>in</i>; the <b>Subscriber key</b> lets this app read scans <i>out</i>.
                Put the pusher key here, the Subscriber key in the field above.</li>
              <li><span style={code}>&lt;device-tag&gt;</span> — a short label you invent for this one reader
                (e.g. <span style={code}>table-1</span>). Use the <b>exact same text</b> here and in the reader&apos;s
                <b> Device tag</b> field above — that match is what routes this reader&apos;s scans to the right screen.</li>
            </ul>
          </div>

          {/* Direct LAN reader */}
          <div>
            <p className="font-medium mb-1" style={h}>B. Direct LAN reader</p>
            <p style={muted}>
              Put the reader/middleware&apos;s full WebSocket address in the reader&apos;s <b>URL / IP</b> field
              (leave Device tag blank), e.g. <span style={code}>ws://192.168.1.104:8080</span>.
            </p>
            <p className="mt-1" style={sub}>
              When the app is served over <b>HTTPS</b>, a plain <span style={code}>ws://</span> is blocked by the
              browser — use <span style={code}>wss://</span> (e.g. an ngrok/tunnel or a TLS relay) instead.
            </p>
          </div>

          {/* Gotchas */}
          <div>
            <p className="font-medium mb-1" style={h}>Gotchas</p>
            <ul className="list-disc ml-4 space-y-1" style={muted}>
              <li>The <b>Subscriber key</b> here must match the relay&apos;s config, or the socket opens then closes (code 1008).</li>
              <li>If a firewall/WAF sits in front of the relay: reader middlewares send <b>no User-Agent</b> — allow that (OWASP CRS rules 920320 / 920330 off for the relay host) or handshakes get 403&apos;d.</li>
              <li>Reader picks made on a TV&apos;s ⚙ panel are that device&apos;s local override; the registry here is the shared default.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
