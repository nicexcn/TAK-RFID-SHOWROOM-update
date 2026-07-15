"use client";

import { useState, useRef, useEffect } from "react";

interface Option {
  id: string;
  value: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
}

export default function SearchableSelect({ options, value, onChange, placeholder = "Select...", searchable = false }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((o) =>
    o.value.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 rounded-xl text-sm cursor-pointer flex items-center justify-between"
        style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: value ? "var(--color-text)" : "var(--color-text-muted)" }}>
        <span>{value || placeholder}</span>
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "0.2s" }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          {searchable && (
            <div className="p-2 border-b" style={{ borderColor: "var(--color-border)" }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm" style={{ color: "var(--color-text-subtle)" }}>No options found</p>
            ) : (
              filtered.map((option) => (
                <div
                  key={option.id}
                  onClick={() => { onChange(option.value); setOpen(false); setSearch(""); }}
                  className="px-4 py-2 text-sm cursor-pointer"
                  style={{
                    background: value === option.value ? "var(--color-bg)" : "transparent",
                    color: "var(--color-text)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--color-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = value === option.value ? "var(--color-bg)" : "transparent")}>
                  {option.value}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}