"use client";

import { useState } from "react";
import { THAI_GEO } from "@/lib/thaiGeo";

// 16/9: soft two-way suggestions between the Sales picker and the Zone cascade.
// Neither direction is forced — they are hints staff may click or ignore.
//  - <SalesCoverageHint/>  : under the Sales field — the picked sale's coverage + whether
//                            it covers the customer's zone (already shown since 2f54c27,
//                            now shared here so both forms render it identically).
//  - <ZoneSalesHint/>      : under the Zone field — chips of every sale covering the picked
//                            zone; click a chip to fill the Sales field.
// Matching is loose on purpose: sale coverage strings come from TWC's Excel with composite
// entries like "พระราม5(ฝั่งเมืองนนท์)" or "คลองเตย(สุขุมวิท 16-48)", so we compare by
// substring either way (zone ⊂ coverage part or coverage part ⊂ zone).
export type SaleOption = { name: string; code: string; province?: string | null; zone?: string | null };

function coverageParts(s: SaleOption): string[] {
  return (s.province || "").split(",").concat((s.zone || "").split(","))
    .map((c) => c.trim()).filter(Boolean);
}

function zoneParts(zone: string): string[] {
  return zone.split("/").map((z) => z.trim()).filter(Boolean);
}

function matches(zone: string, parts: string[]): boolean {
  const zp = zoneParts(zone);
  if (zp.length === 0) return false;
  return parts.some((c) => zp.some((z) => z.includes(c) || c.includes(z)));
}

/** Sales covering the given zone (province or district part), ordered by name. */
export function salesCoveringZone(zone: string, sales: SaleOption[]): SaleOption[] {
  if (!zone.trim()) return [];
  return sales.filter((s) => matches(zone, coverageParts(s)));
}

export function SalesCoverageHint({ salesPerson, zone, sales, onPickZone }: {
  salesPerson: string; zone: string; sales: SaleOption[];
  /** 16/9: when the picked sale covers zones and the customer's zone is unset (or being
   *  changed), quick-pick chips of the sale's districts set the zone directly from here. */
  onPickZone?: (zone: string) => void;
}) {
  const picked = sales.find((s) => s.name === salesPerson.trim());
  if (!picked) return null;
  const coverage = picked.province || picked.zone;
  if (!coverage) return null;
  const covers = matches(zone, coverageParts(picked));
  const zp = zoneParts(zone);
  // District quick-picks from this sale's เขต list. Show up to 8 (the full set for most
  // sales — e.g. ทราย has 8), then a "+N" chip expanding the rest.
  const allDistricts = (picked.zone || "").split(",").map((d) => d.trim()).filter(Boolean);
  const [showAll, setShowAll] = useState(false);
  const districts = showAll ? allDistricts : allDistricts.slice(0, 8);
  const hidden = allDistricts.length - districts.length;
  // The TWC sheet lists a sale's districts across ALL their provinces in one flat list
  // (ทราย: พระโขนง…พระนคร are กทม, บางพลี is สมุทรปราการ). Look each district up in
  // THAI_GEO for its REAL province instead of assuming the sale's first province —
  // otherwise the chip produces "กรุงเทพมหานคร / บางพลี", which the cascade rejects.
  const fallbackProvince = normalizeProvince((picked.province || "").split(",")[0].trim());
  const provinceOf = (district: string): string => {
    const found = THAI_GEO.find((g) => g.d.includes(district));
    return found ? found.p : fallbackProvince;
  };
  return (
    <div className="mt-1">
      <p className="text-[11px]" style={{ color: zp.length > 0 && !covers ? "var(--color-danger-soft)" : "var(--color-text-subtle)" }}>
        ดูแล: {coverage}
        {zp.length > 0 && (covers ? " · ✓ รวมโซนที่เลือก" : " · โซนที่เลือกอยู่นอกเขตที่ดูแล")}
      </p>
      {onPickZone && allDistricts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{zp.length ? "เปลี่ยนโซนเป็นเขตของ sale นี้:" : "ตั้งโซนจากเขตที่ดูแล:"}</span>
          {districts.map((d) => {
            const p = provinceOf(d);
            return (
              <button key={d} type="button" onClick={() => onPickZone(`${p} / ${d}`)}
                title={`ตั้งโซน ${p} / ${d}`}
                className="px-2 py-0.5 rounded-lg text-[11px] transition-colors hover:opacity-80"
                style={{ background: "rgba(114,108,90,0.12)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                {d}
              </button>
            );
          })}
          {hidden > 0 && (
            <button type="button" onClick={() => setShowAll(true)}
              className="px-2 py-0.5 rounded-lg text-[11px]"
              style={{ color: "var(--color-primary)" }}>
              +{hidden} เพิ่มเติม
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ZoneSalesHint({ zone, sales, onPick }: {
  zone: string; sales: SaleOption[]; onPick: (name: string) => void;
}) {
  const covering = salesCoveringZone(zone, sales);
  if (covering.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>คนดูแลโซนนี้:</span>
      {covering.map((s) => (
        <button key={s.code} type="button" onClick={() => onPick(s.name)}
          title={`${s.name} (${s.code})${s.province ? ` · ${s.province}` : ""}`}
          className="px-2 py-0.5 rounded-lg text-[11px] transition-colors hover:opacity-80"
          style={{ background: "rgba(114,108,90,0.12)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
          {nicknameOf(s.name) || s.name}
        </button>
      ))}
    </div>
  );
}

// "(ทราย)" inside "ชัญญา สุทธิวรรณ (ทราย)" — the short name staff actually use.
function nicknameOf(name: string): string | null {
  const m = name.match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

// The TWC sheet abbreviates provinces ("กรุงเทพ" for กรุงเทพมหานคร); the Zone cascade matches
// THAI_GEO names exactly, so normalize the common short forms before building a zone value.
const PROVINCE_ALIASES: Record<string, string> = {
  "กรุงเทพ": "กรุงเทพมหานคร",
  "กทม": "กรุงเทพมหานคร",
  "ธนบุรี": "กรุงเทพมหานคร",
};
function normalizeProvince(p: string): string {
  return PROVINCE_ALIASES[p.trim()] ?? p.trim();
}
