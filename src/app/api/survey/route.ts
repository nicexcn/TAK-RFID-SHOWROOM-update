import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/permissions";
import { canAccessPath } from "@/lib/roles";
import { SURVEY_QUESTIONS } from "@/lib/survey";

// #3 Satisfaction survey.
//  POST — PUBLIC: a customer submits a response (allow-listed in proxy.ts).
//  GET  — GATED: aggregated results; the basic "user"/Sales role is blocked ("Sales don't see results").

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const answers = body?.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return NextResponse.json({ error: "answers object required" }, { status: 400 });
    }
    // Store only known question keys (drop anything unexpected the client may send).
    const clean: Record<string, Prisma.InputJsonValue> = {};
    for (const q of SURVEY_QUESTIONS) if (q.key in answers && answers[q.key] != null) clean[q.key] = answers[q.key];
    // Don't store (or count) a blank submission — it would inflate the response total.
    if (Object.keys(clean).length === 0) return NextResponse.json({ error: "Please answer at least one question." }, { status: 400 });
    const resp = await prisma.surveyResponse.create({
      data: {
        answers: clean,
        customerId: typeof body.customerId === "string" && body.customerId ? body.customerId : null,
        sessionId: typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null,
      },
    });
    return NextResponse.json({ ok: true, id: resp.id }, { status: 201 });
  } catch (error) {
    console.error("SURVEY POST ERROR:", error);
    return NextResponse.json({ error: "Failed to submit survey" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // #3/#6: only roles with survey access (super_admin, admin, management) see results — Sales/prep can't.
    if (!canAccessPath(user.role, "/admin/survey")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rows = await prisma.surveyResponse.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
    const answersList = rows.map((r) => (r.answers && typeof r.answers === "object" ? (r.answers as Record<string, unknown>) : {}));

    const results = SURVEY_QUESTIONS.map((q) => {
      if (q.type === "scale") {
        const vals = answersList.map((a) => Number(a[q.key])).filter((n) => Number.isFinite(n) && n >= 1 && n <= q.scale);
        const dist: Record<number, number> = {};
        for (let i = 1; i <= q.scale; i++) dist[i] = 0;
        vals.forEach((v) => { if (dist[v] !== undefined) dist[v] += 1; });
        const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        return { key: q.key, type: "scale", title: q.title, scale: q.scale, count: vals.length, avg, dist };
      }
      if (q.type === "text") {
        const comments = answersList.map((a) => String(a[q.key] || "").trim()).filter(Boolean);
        return { key: q.key, type: "text", title: q.title, comments };
      }
      const counts: Record<string, number> = {};
      for (const opt of q.options) counts[opt] = 0;
      for (const a of answersList) {
        const v = a[q.key];
        const chosen = Array.isArray(v) ? v : v != null && v !== "" ? [v] : [];
        for (const c of chosen) { const s = String(c); counts[s] = (counts[s] || 0) + 1; }
      }
      return { key: q.key, type: q.type, title: q.title, options: q.options, counts };
    });

    return NextResponse.json({ total: rows.length, results });
  } catch (error) {
    console.error("SURVEY GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load results" }, { status: 500 });
  }
}
