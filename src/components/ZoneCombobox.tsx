"use client";

// 15/10: searchable Zone combobox — type a province (or district) name and pick from the
// filtered list, instead of scrolling 77 provinces. Same interaction conventions as
// SalesCombobox (IME-guarded keybinds, scrollIntoView, a11y roles, free text allowed for
// legacy zones). Replaces the two-select ZoneCascade on the customer forms while keeping the
// stored format identical: "จังหวัด / เขต-อำเภอ".
import { useState, useRef, useEffect, useId, useMemo } from "react";
import { THAI_GEO, parseZone } from "@/lib/thaiGeo";

interface ZoneOption {
  province: string;
  district: string; // "" = province-level entry (customer didn't specify a district)
}

function zoneValue(o: ZoneOption): string {
  return o.district ? `${o.province} / ${o.district}` : o.province;
}

function matchesQuery(o: ZoneOption, q: string): boolean {
  if (!q) return true;
  const lq = q.toLowerCase();
  return o.province.toLowerCase().includes(lq) || o.district.toLowerCase().includes(lq);
}

export default function ZoneCombobox({ value, onChange, idPrefix }: {
  value: string;
  onChange: (v: string) => void;
  idPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionId = useId();

  useEffect(() => {
    function onDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // All options: 77 provinces + every district (search "บางนา" lands directly on the pair).
  const allOptions = useMemo<ZoneOption[]>(() => {
    const out: ZoneOption[] = [];
    for (const g of THAI_GEO) {
      out.push({ province: g.p, district: "" });
      for (const d of g.d) out.push({ province: g.p, district: d });
    }
    return out;
  }, []);

  const filtered = useMemo(() => {
    // Empty query: provinces only (77 rows) — districts appear once you type.
    const pool = query ? allOptions : allOptions.filter((o) => !o.district);
    return pool.filter((o) => matchesQuery(o, query)).slice(0, 100);
  }, [allOptions, query]);

  useEffect(() => {
    if (!open) return;
    const cur = value; // exact match highlight
    const idx = filtered.findIndex((o) => zoneValue(o) === cur);
    setActive(idx >= 0 ? idx : filtered.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    listRef.current.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function commit(o: ZoneOption) {
    onChange(zoneValue(o));
    setOpen(false);
    setQuery("");
  }

  function close() {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const isComposing = (e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229;
    if (isComposing) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) { setOpen(true); return; }
        setActive((i) => filtered.length === 0 ? -1 : (i + 1) % filtered.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => filtered.length === 0 ? -1 : (i - 1 + filtered.length) % filtered.length);
        break;
      case "Enter":
        e.preventDefault();
        if (open && active >= 0 && filtered[active]) commit(filtered[active]);
        else if (open && query.trim()) { onChange(query.trim()); close(); } // free text (legacy zone)
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        setOpen(false);
        setQuery("");
        break;
    }
  }

  const activeId = active >= 0 && filtered[active] ? `${optionId}-${active}` : undefined;

  return (
    <div ref={rootRef} className="relative">
      <input
        id={`${idPrefix}-zone`}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        value={open ? query : value}
        placeholder="พิมพ์ชื่อจังหวัดหรือเขต/อำเภอ… เช่น กรุงเทพ, บางนา"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => { if (!open) { setQuery(""); setOpen(true); } }}
        onKeyDown={onKeyDown}
        className="w-full px-4 py-3 rounded-xl outline-none text-sm"
        style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />
      {open && (
        <ul ref={listRef} id={listId} role="listbox"
          className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto rounded-xl"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm" style={{ color: "var(--color-text-subtle)" }}>
              ไม่พบจังหวัด/อำเภอ — กด Enter เพื่อใช้ค่าที่พิมพ์ไว้ตรงๆ
            </li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={zoneValue(o)}
                data-idx={i}
                id={`${optionId}-${i}`}
                role="option"
                aria-selected={value === zoneValue(o)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(o)}
                onMouseEnter={() => setActive(i)}
                className="px-4 py-2 text-sm cursor-pointer flex items-center justify-between gap-2"
                style={{ background: i === active ? "var(--color-bg)" : "transparent", color: "var(--color-text)" }}>
                <span className="truncate">{o.district ? `${o.district}` : o.province}</span>
                <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--color-text-subtle)" }}>
                  {o.district ? o.province : "จังหวัด"}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
