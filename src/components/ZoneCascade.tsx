"use client";
// Slide 3: reactive จังหวัด → เขต/อำเภอ cascade for the customer Zone field.
// Stored value is the "จังหวัด / อำเภอ" string (see thaiGeo.encodeZone); legacy free-text
// zones (no separator) stay editable as plain text, with a switch to the cascade.
import { useMemo } from "react";
import { THAI_GEO, parseZone } from "@/lib/thaiGeo";

const selectStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
} as const;

export function ZoneCascade({ value, onChange, idPrefix }: {
  value: string;
  onChange: (next: string) => void;
  idPrefix: string;
}) {
  const parsed = useMemo(() => parseZone(value), [value]);
  const districts = useMemo(
    () => (parsed ? THAI_GEO.find((g) => g.p === parsed.p)?.d ?? [] : []),
    [parsed],
  );

  // Legacy free-text zone (or force-text mode): keep it editable, offer the cascade.
  if (value && !parsed) {
    return (
      <div>
        <div className="flex gap-2">
          <input id={`${idPrefix}-zone`} value={value} onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. กรุงเทพฯ ตะวันออก"
            className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={selectStyle} />
          <button type="button" onClick={() => onChange("")} title="Switch to the province/district picker"
            className="px-3 rounded-xl text-xs whitespace-nowrap"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
            เลือกจากรายการ
          </button>
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>
          Sales territory — helps identify the covering sale
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        id={`${idPrefix}-province`}
        value={parsed?.p ?? ""}
        onChange={(e) => onChange(e.target.value ? `${e.target.value} / ` : "")}
        className="w-full px-3 py-3 rounded-xl outline-none text-sm"
        style={selectStyle}>
        <option value="">จังหวัด…</option>
        {THAI_GEO.map((g) => <option key={g.p} value={g.p}>{g.p}</option>)}
      </select>
      <select
        id={`${idPrefix}-district`}
        value={parsed?.d ?? ""}
        onChange={(e) => onChange(e.target.value && parsed ? `${parsed.p} / ${e.target.value}` : (parsed?.p ? `${parsed.p} / ` : ""))}
        disabled={!parsed}
        className="w-full px-3 py-3 rounded-xl outline-none text-sm disabled:opacity-50"
        style={selectStyle}>
        <option value="">เขต/อำเภอ…</option>
        {districts.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  );
}
