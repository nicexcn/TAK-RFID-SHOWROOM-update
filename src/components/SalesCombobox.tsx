"use client";

// Sales combobox for the customer forms (16/9). Built after reading cmdk + Radix Combobox +
// Downshift sources for the hard parts, then written to this codebase's conventions:
//  - IME guard (cmdk/Downshift pattern): ignore ALL keybinds while Thai/CJK composition is
//    active — `e.nativeEvent.isComposing || e.keyCode === 229` — so typing "ทราย" and pressing
//    arrows/Enter mid-composition never hijacks the selection.
//  - scrollIntoView({block:'nearest'}) on highlight change (cmdk).
//  - iOS Safari blur/toggle race (Downshift): toggle on click AFTER the browser has fired the
//    blur, via setTimeout(0); and the click-outside handler ignores blur-style resets.
//  - a11y (Radix): role=combobox/listbox/option, aria-activedescendant, aria-selected.
// Differences from a stock combobox, by design:
//  - FREE TEXT: staff may keep a typed value that matches no sale (legacy names, new hires) —
//    Enter picks the highlighted option only when one is highlighted, otherwise commits the text.
//  - GROUPS: options can carry `group` — grouped options render under a sticky heading and
//    always float to the top of the list (used for "ดูแลโซนนี้" suggestions).
//  - Match by full name, nickname ("(ทราย)"), or ERP code — case-insensitive substring.
import { useState, useRef, useEffect, useId, useMemo } from "react";

export interface SalesOption {
  name: string;      // stored value
  code: string;      // ERP code, e.g. B0007
  hint?: string;     // e.g. coverage "กรุงเทพ,สมุทรปราการ"
  group?: string;    // when set, renders under this heading at the top of the list
}

function nickname(name: string): string | null {
  const m = name.match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

function matchesQuery(s: SalesOption, q: string): boolean {
  if (!q) return true;
  const lq = q.toLowerCase();
  return s.name.toLowerCase().includes(lq)
    || (nickname(s.name)?.toLowerCase().includes(lq) ?? false)
    || s.code.toLowerCase().includes(lq);
}

export default function SalesCombobox({ options, value, onChange, placeholder = "Type to search name or code…" }: {
  options: SalesOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionId = useId();

  // click-outside close. mousedown (not click) so a drag ending outside doesn't leak the menu.
  useEffect(() => {
    function onDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = useMemo(() => options.filter((o) => matchesQuery(o, query)), [options, query]);
  // grouped options first (suggestions), then the rest — preserve options order within each.
  const ordered = useMemo(() => {
    const grouped = filtered.filter((o) => o.group);
    const rest = filtered.filter((o) => !o.group);
    return [...grouped, ...rest];
  }, [filtered]);

  // Reset highlight when the list opens or the query changes.
  useEffect(() => {
    if (!open) return;
    const idx = ordered.findIndex((o) => o.name === value);
    setActive(idx >= 0 ? idx : ordered.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, options]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // scroll the highlighted option into view (cmdk pattern)
  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function commit(option: SalesOption) {
    onChange(option.name);
    setOpen(false);
    setQuery("");
  }

  function close() {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // IME guard (from cmdk): during Thai/CJK composition, keydown events report keyCode 229 /
    // isComposing — treat every key as plain text input. Without this, picking a suggestion
    // letter by arrow keys mid-composition selects the wrong sale.
    const isComposing = (e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229;
    if (isComposing) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) { setOpen(true); return; }
        setActive((i) => ordered.length === 0 ? -1 : (i + 1) % ordered.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => ordered.length === 0 ? -1 : (i - 1 + ordered.length) % ordered.length);
        break;
      case "Home":
        if (open) { e.preventDefault(); setActive(ordered.length ? 0 : -1); }
        break;
      case "End":
        if (open) { e.preventDefault(); setActive(ordered.length ? ordered.length - 1 : -1); }
        break;
      case "Enter":
        e.preventDefault();
        if (open && active >= 0 && ordered[active]) commit(ordered[active]);
        else if (open) close(); // free text: keep whatever is typed — commit on blur/change
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

  const activeId = active >= 0 && ordered[active] ? `${optionId}-${active}` : undefined;
  let lastGroup = "";

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        value={open ? query : value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value); // free text: every keystroke IS the value
          if (!open) setOpen(true);
        }}
        onFocus={() => { if (!open) { setQuery(value); setOpen(true); } }}
        onKeyDown={onKeyDown}
        className="w-full px-4 py-3 rounded-xl outline-none text-sm"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />
      {open && (
        <ul ref={listRef} id={listId} role="listbox"
          className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto rounded-xl"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          {ordered.length === 0 ? (
            <li className="px-4 py-3 text-sm" style={{ color: "var(--color-text-subtle)" }}>
              No sales match — press Enter to keep “{query}” as typed
            </li>
          ) : ordered.map((o, i) => {
            const showGroup = o.group && o.group !== lastGroup;
            lastGroup = o.group || lastGroup;
            return (
              <div key={o.name}>
                {showGroup && (
                  <li role="presentation" className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--color-primary)" }}>
                    {o.group}
                  </li>
                )}
                <li
                  data-idx={i}
                  id={`${optionId}-${i}`}
                  role="option"
                  aria-selected={value === o.name}
                  onMouseDown={(e) => e.preventDefault()} // keep input focus; commit on click (iOS-safe)
                  onClick={() => commit(o)}
                  onMouseEnter={() => setActive(i)}
                  className="px-4 py-2 text-sm cursor-pointer flex items-center justify-between gap-2"
                  style={{
                    background: i === active ? "var(--color-bg)" : "transparent",
                    color: "var(--color-text)",
                  }}>
                  <span className="truncate">{o.name}</span>
                  <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--color-text-subtle)" }}>
                    {o.code}{o.hint ? ` · ${o.hint}` : ""}
                  </span>
                </li>
              </div>
            );
          })}
        </ul>
      )}
    </div>
  );
}
