"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useState, useEffect } from "react";

// #3: aggregated satisfaction-survey results. GET /api/survey is role-gated (Sales/basic blocked → 403).
interface ScaleResult { key: string; type: "scale"; title: string; scale: number; count: number; avg: number; dist: Record<string, number>; }
interface ChoiceResult { key: string; type: "radio" | "checkbox"; title: string; options: string[]; counts: Record<string, number>; }
interface TextResult { key: string; type: "text"; title: string; comments: string[]; }
type Result = ScaleResult | ChoiceResult | TextResult;

export default function SurveyResultsPage() {
  const [data, setData] = useState<{ total: number; results: Result[] } | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "error">("loading");
  const [surveyUrl, setSurveyUrl] = useState("");

  useEffect(() => {
    setSurveyUrl(`${window.location.origin}/survey`);
    fetch("/api/survey")
      .then((r) => { if (r.status === 403) { setState("forbidden"); return null; } if (!r.ok) { setState("error"); return null; } return r.json(); })
      .then((d) => { if (d) { setData(d); setState("ok"); } })
      .catch(() => setState("error"));
  }, []);

  if (state === "loading") return <p style={{ color: "#6f5f48" }}>Loading…</p>;
  if (state === "forbidden") return (
    <div>
      <h1 className="text-2xl font-semibold mb-2" style={{ color: "#4c4847" }}>Survey Results</h1>
      <p className="text-sm" style={{ color: "#9f4a4a" }}>You don’t have access to survey results.</p>
    </div>
  );
  if (state === "error" || !data) return <p style={{ color: "#9f4a4a" }}>Failed to load results.</p>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Survey Results</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Survey Results" }]} />
          <p className="text-sm mt-1" style={{ color: "#6f5f48" }}>{data.total} response{data.total === 1 ? "" : "s"}</p>
        </div>
        <a href="/survey" target="_blank" rel="noopener noreferrer"
          className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }}>
          Open survey ↗
        </a>
      </div>

      {data.total === 0 ? (
        <div className="p-8 rounded-xl text-center" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
          <p className="text-sm mb-2" style={{ color: "#6f5f48" }}>No responses yet.</p>
          <p className="text-xs" style={{ color: "#71654c" }}>Share the survey link: <span style={{ fontFamily: "monospace" }}>{surveyUrl}</span></p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.results.map((r) => (
            <div key={r.key} className="p-5 rounded-xl" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
              <p className="text-sm font-medium mb-3" style={{ color: "#4c4847" }}>{r.title}</p>

              {r.type === "scale" && <ScaleView r={r} />}
              {(r.type === "radio" || r.type === "checkbox") && <ChoiceView r={r} total={data.total} />}
              {r.type === "text" && <TextView r={r} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScaleView({ r }: { r: ScaleResult }) {
  const max = Math.max(1, ...Object.values(r.dist));
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-3xl font-semibold" style={{ color: "#726c5a" }}>{r.avg.toFixed(2)}</span>
        <span className="text-xs" style={{ color: "#6f5f48" }}>avg / {r.scale} · {r.count} rated</span>
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: r.scale }, (_, i) => r.scale - i).map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className="text-xs w-3 text-right" style={{ color: "#6f5f48" }}>{n}</span>
            <div className="flex-1 h-2 rounded-full" style={{ background: "#f5f2ee" }}>
              <div className="h-full rounded-full" style={{ background: "#726c5a", width: `${((r.dist[n] || 0) / max) * 100}%` }} />
            </div>
            <span className="text-xs w-6 text-right" style={{ color: "#6f5f48" }}>{r.dist[n] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChoiceView({ r, total }: { r: ChoiceResult; total: number }) {
  const rows = r.options.map((o) => ({ name: o, count: r.counts[o] || 0 })).sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map((x) => x.count));
  return (
    <div className="space-y-1.5">
      {rows.map((x) => (
        <div key={x.name} className="flex items-center gap-2">
          <span className="text-xs flex-1 truncate" style={{ color: "#4c4847" }} title={x.name}>{x.name}</span>
          <div className="w-28 h-2 rounded-full flex-shrink-0" style={{ background: "#f5f2ee" }}>
            <div className="h-full rounded-full" style={{ background: "#9f886c", width: `${(x.count / max) * 100}%` }} />
          </div>
          <span className="text-xs w-8 text-right" style={{ color: "#6f5f48" }}>{x.count}</span>
        </div>
      ))}
      <p className="text-[11px] pt-1" style={{ color: "#71654c" }}>{r.type === "checkbox" ? "multiple choice" : "single choice"} · {total} responses</p>
    </div>
  );
}

function TextView({ r }: { r: TextResult }) {
  if (r.comments.length === 0) return <p className="text-sm" style={{ color: "#71654c" }}>No comments</p>;
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {r.comments.map((c, i) => (
        <p key={i} className="text-sm p-2.5 rounded-lg" style={{ background: "#f5f2ee", color: "#4c4847" }}>“{c}”</p>
      ))}
    </div>
  );
}
