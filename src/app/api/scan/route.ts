import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastDisplayChanged } from "@/lib/realtime";
import { idleCutoff } from "@/lib/sessionConfig";

// Server-side scan ingest (the "confident path"). The relay (or any RFID middleware)
// POSTs scans here instead of the browser persisting them. Attribution is server-side:
// each scan carries the reader's device_id; we map device_id → the active Session whose
// readerId matches (bound when staff start serving with that reader). This keeps
// persistence alive even if the browser closes/reloads, and means a fixed reader can
// save without any browser in the loop.
//
// Auth: a shared secret (SCAN_INGEST_KEY) presented as the `x-ingest-key` header — NOT
// the login cookie (the relay/middleware has no user session). The endpoint is on the
// proxy public allow-list and self-authenticates here.
const INGEST_KEY = process.env.SCAN_INGEST_KEY;

interface IngestScan {
  deviceId?: string | number;
  rfidTag?: string;
  epc?: string; // readers emit `epc`; accept it as an alias for rfidTag
}

export async function POST(req: NextRequest) {
  if (!INGEST_KEY) {
    // Fail closed: never accept unauthenticated writes when the gate isn't configured.
    return NextResponse.json({ error: "Ingest not configured" }, { status: 503 });
  }
  if (req.headers.get("x-ingest-key") !== INGEST_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    // Accept a batch ({ scans: [...] }) or a single scan ({ deviceId, rfidTag|epc }).
    const raw: IngestScan[] = Array.isArray(body?.scans)
      ? body.scans
      : body?.rfidTag || body?.epc
        ? [body]
        : [];
    if (raw.length === 0) {
      return NextResponse.json({ error: "scans required" }, { status: 400 });
    }
    if (raw.length > 500) {
      return NextResponse.json({ error: "Max 500 scans per batch" }, { status: 400 });
    }

    // Normalize: tag = rfidTag||epc, device = deviceId. Drop rows missing either —
    // without a device_id we can't attribute, and without a tag there's nothing to save.
    const scans = raw
      .map((s) => ({
        device: s.deviceId != null ? String(s.deviceId).trim() : "",
        tag: String(s.rfidTag ?? s.epc ?? "").trim(),
      }))
      .filter((s) => s.device && s.tag);
    if (scans.length === 0) {
      return NextResponse.json({ error: "each scan needs deviceId + rfidTag/epc" }, { status: 400 });
    }

    // Resolve all referenced products in ONE query (no N+1).
    const tags = [...new Set(scans.map((s) => s.tag))];
    const products = await prisma.product.findMany({
      where: { isActive: true, rfidTag: { in: tags } },
      select: { id: true, rfidTag: true },
    });
    const tagToId = new Map(products.map((p) => [p.rfidTag, p.id]));

    // Resolve the active (non-idle) session for each reader in ONE query. A reader maps
    // to at most one active session in practice; if several exist, the newest wins.
    const devices = [...new Set(scans.map((s) => s.device))];
    const cutoff = await idleCutoff();
    const sessions = await prisma.session.findMany({
      where: { isActive: true, readerId: { in: devices }, lastSeenAt: { gte: cutoff } },
      orderBy: { createdAt: "desc" },
      select: { id: true, readerId: true },
    });
    const deviceToSession = new Map<string, string>();
    for (const s of sessions) {
      if (s.readerId && !deviceToSession.has(s.readerId)) deviceToSession.set(s.readerId, s.id);
    }

    // Build dedup'd insert rows keyed by (session, product) — the same uniqueness as the
    // DB constraint — and track readers that had no active session (e.g. an ambient fixed
    // reader, or staff who haven't started a session yet).
    const rows = new Map<string, { sessionId: string; productId: string; deviceId: string }>();
    const noSession = new Set<string>();
    const touchedSessions = new Set<string>();
    let unknownTag = 0;
    for (const s of scans) {
      const sessionId = deviceToSession.get(s.device);
      if (!sessionId) { noSession.add(s.device); continue; }
      const productId = tagToId.get(s.tag);
      if (!productId) { unknownTag++; continue; }
      rows.set(`${sessionId}:${productId}`, { sessionId, productId, deviceId: s.device });
      touchedSessions.add(sessionId);
    }

    let persisted = 0;
    if (rows.size > 0) {
      // Race-proof: @@unique([sessionId, productId]) backstops concurrent ingests;
      // skipDuplicates makes a re-scanned tag a no-op instead of an error.
      const result = await prisma.scan.createMany({ data: [...rows.values()], skipDuplicates: true });
      persisted = result.count;
      // Heartbeat the sessions we wrote to so they aren't reaped as idle mid-scan.
      await prisma.session.updateMany({
        where: { id: { in: [...touchedSessions] } },
        data: { lastSeenAt: new Date() },
      });
      if (persisted > 0) await broadcastDisplayChanged();
    }

    return NextResponse.json({
      persisted,
      existing: rows.size - persisted, // already scanned in this session (idempotent)
      unknownTag,
      noSession: [...noSession],
      total: scans.length,
    });
  } catch (error) {
    console.error("INGEST /api/scan ERROR:", error);
    return NextResponse.json({ error: "Failed to ingest scans" }, { status: 500 });
  }
}
