"use client";
import Breadcrumb from "@/components/Breadcrumb";
import { Skeleton, SkeletonCard } from "@/components/Skeleton";

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
  // Date-window filter (slide 25): inclusive Bangkok-day range; empty = all time.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterTick, setFilterTick] = useState(0);

  useEffect(() => {
    setSurveyUrl(`${window.location.origin}/survey`);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/survey?${params}`)
      .then((r) => { if (r.status === 403) { setState("forbidden"); return null; } if (!r.ok) { setState("error"); return null; } return r.json(); })
      .then((d) => { if (d) { setData(d); setState("ok"); } })
      .catch(() => setState("error"));
  }, [filterTick]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilter() {
    if (from && to && from > to) return; // inverted range — do nothing rather than show an empty result
    setState("loading");
    setFilterTick((t) => t + 1);
  }

  return (
    <div>
      {/* Static header renders immediately — title / breadcrumb / open-survey aren't data;
          only the response count + result cards below depend on the fetch. */}
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>Survey Results</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Survey Results" }]} />
          {data
            ? <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{data.total} response{data.total === 1 ? "" : "s"}</p>
            : state === "loading" ? <Skeleton className="h-3 mt-2" style={{ width: "7rem" }} /> : null}
        </div>
        <a href="/survey" target="_blank" rel="noopener noreferrer"
          className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
          Open survey ↗
        </a>
      </div>

      {/* Date-window filter (slide 25): inclusive Bangkok-day range, empty = all time */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <label className="text-sm" style={{ color: "var(--color-text-muted)" }}>From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
        <label className="text-sm" style={{ color: "var(--color-text-muted)" }}>to</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
        <button onClick={applyFilter}
          className="px-4 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
          Apply
        </button>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); setState("loading"); setFilterTick((t) => t + 1); }}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
            Clear
          </button>
        )}
      </div>

      {state === "loading" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={5} />)}
        </div>
      ) : state === "forbidden" ? (
        <p className="text-sm" style={{ color: "var(--color-danger-soft)" }}>You don’t have access to survey results.</p>
      ) : state === "error" || !data ? (
        <p className="text-sm" style={{ color: "var(--color-danger-soft)" }}>Failed to load results.</p>
      ) : data.total === 0 ? (
        <div className="p-8 rounded-xl text-center" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <p className="text-sm mb-2" style={{ color: "var(--color-text-muted)" }}>No responses yet.</p>
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Share the survey link: <span style={{ fontFamily: "monospace" }}>{surveyUrl}</span></p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.results.map((r) => (
            <div key={r.key} className="p-5 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <p className="text-sm font-medium mb-3" style={{ color: "var(--color-text)" }}>{r.title}</p>

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
        <span className="text-3xl font-semibold" style={{ color: "var(--color-text-muted)" }}>{r.avg.toFixed(2)}</span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>avg / {r.scale} · {r.count} rated</span>
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: r.scale }, (_, i) => r.scale - i).map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className="text-xs w-3 text-right" style={{ color: "var(--color-text-muted)" }}>{n}</span>
            <div className="flex-1 h-2 rounded-full" style={{ background: "var(--color-bg)" }}>
              <div className="h-full rounded-full" style={{ background: "var(--color-primary)", width: `${((r.dist[n] || 0) / max) * 100}%` }} />
            </div>
            <span className="text-xs w-6 text-right" style={{ color: "var(--color-text-muted)" }}>{r.dist[n] || 0}</span>
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
          <span className="text-xs flex-1 truncate" style={{ color: "var(--color-text)" }} title={x.name}>{x.name}</span>
          <div className="w-28 h-2 rounded-full flex-shrink-0" style={{ background: "var(--color-bg)" }}>
            <div className="h-full rounded-full" style={{ background: "#9f886c", width: `${(x.count / max) * 100}%` }} />
          </div>
          <span className="text-xs w-8 text-right" style={{ color: "var(--color-text-muted)" }}>{x.count}</span>
        </div>
      ))}
      <p className="text-[11px] pt-1" style={{ color: "var(--color-text-subtle)" }}>{r.type === "checkbox" ? "multiple choice" : "single choice"} · {total} responses</p>
    </div>
  );
}

function TextView({ r }: { r: TextResult }) {
  if (r.comments.length === 0) return <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No comments</p>;
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {r.comments.map((c, i) => (
        <p key={i} className="text-sm p-2.5 rounded-lg" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>“{c}”</p>
      ))}
    </div>
  );
}
