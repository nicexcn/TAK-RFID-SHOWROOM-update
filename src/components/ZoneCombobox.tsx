"use client";

// 15/10 (rev 2): two-part Zone picker, restored — searchable จังหวัด combobox on the left
// (same interaction conventions as SalesCombobox: IME-guarded keybinds, scrollIntoView,
// a11y roles) + dependent เขต/อำเภอ select on the right. Stored value format unchanged:
// "จังหวัด / เขต-อำเภอ" (province-only = "จังหวัด / "). Legacy free-text zones (no separator
// or unknown district) stay editable as plain text, with a switch back to the picker.
import { useState, useRef, useEffect, useId, useMemo } from "react";
import { THAI_GEO, parseZone } from "@/lib/thaiGeo";

const boxStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
} as const;

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

  const parsed = useMemo(() => parseZone(value), [value]);
  const districts = useMemo(
    () => (parsed ? THAI_GEO.find((g) => g.p === parsed.p)?.d ?? [] : []),
    [parsed],
  );

  // click-outside close (mousedown, like SalesCombobox, so a drag ending outside doesn't leak).
  useEffect(() => {
    function onDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const provinces = useMemo(() => THAI_GEO.map((g) => g.p), []);
  const filtered = useMemo(() => {
    if (!query) return provinces;
    const lq = query.toLowerCase();
    return provinces.filter((p) => p.toLowerCase().includes(lq));
  }, [provinces, query]);

  // Reset highlight when the list opens or the query changes.
  useEffect(() => {
    if (!open) return;
    const idx = filtered.indexOf(parsed?.p ?? "");
    setActive(idx >= 0 ? idx : filtered.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  // scroll the highlighted option into view (cmdk pattern)
  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    listRef.current.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function commit(province: string) {
    onChange(province ? `${province} / ` : ""); // district resets on province change (cascade)
    setOpen(false);
    setQuery("");
  }

  function close() {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // IME guard (cmdk/Downshift): during Thai composition every key is plain text input.
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

  // Legacy free-text zone (no separator, unknown province, or unknown district): keep it
  // editable, offer the picker.
  if (value && !parsed) {
    return (
      <div>
        <div className="flex gap-2">
          <input id={`${idPrefix}-zone`} value={value} onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. กรุงเทพฯ ตะวันออก"
            className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={boxStyle} />
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

  const activeId = active >= 0 && filtered[active] ? `${optionId}-${active}` : undefined;

  return (
    <div className="grid grid-cols-2 gap-2">
      {/* Part 1: searchable จังหวัด combobox (was a plain <select> in ZoneCascade). */}
      <div ref={rootRef} className="relative">
        <input
          id={`${idPrefix}-province`}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          value={open ? query : (parsed?.p ?? "")}
          placeholder="จังหวัด… เช่น กรุงเทพ"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => { if (!open) { setQuery(""); setOpen(true); } }}
          onKeyDown={onKeyDown}
          className="w-full px-3 py-3 rounded-xl outline-none text-sm"
          style={boxStyle}
        />
        {open && (
          <ul ref={listRef} id={listId} role="listbox"
            className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto rounded-xl"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm" style={{ color: "var(--color-text-subtle)" }}>
                ไม่พบจังหวัดที่ตรงกับ “{query}”
              </li>
            ) : filtered.map((p, i) => (
              <li
                key={p}
                data-idx={i}
                id={`${optionId}-${i}`}
                role="option"
                aria-selected={parsed?.p === p}
                onMouseDown={(e) => e.preventDefault()} // keep input focus; commit on click (iOS-safe)
                onClick={() => commit(p)}
                onMouseEnter={() => setActive(i)}
                className="px-4 py-2 text-sm cursor-pointer"
                style={{
                  background: i === active ? "var(--color-bg)" : "transparent",
                  color: "var(--color-text)",
                }}>
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Part 2: dependent เขต/อำเภอ select (unchanged from the old cascade). */}
      <select
        id={`${idPrefix}-district`}
        value={parsed?.d ?? ""}
        onChange={(e) => onChange(e.target.value && parsed ? `${parsed.p} / ${e.target.value}` : (parsed?.p ? `${parsed.p} / ` : ""))}
        disabled={!parsed}
        className="w-full px-3 py-3 rounded-xl outline-none text-sm disabled:opacity-50"
        style={boxStyle}>
        <option value="">เขต/อำเภอ…</option>
        {districts.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  );
}
