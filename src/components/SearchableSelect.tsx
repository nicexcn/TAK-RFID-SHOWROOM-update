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
        style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: value ? "#4c4847" : "#9f886c" }}>
        <span>{value || placeholder}</span>
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "0.2s" }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
          style={{ background: "#fff", border: "1px solid #e6e5d8", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          {searchable && (
            <div className="p-2 border-b" style={{ borderColor: "#e6e5d8" }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                style={{ background: "#f5f2ee", color: "#4c4847" }}
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm" style={{ color: "#cdc3ad" }}>No options found</p>
            ) : (
              filtered.map((option) => (
                <div
                  key={option.id}
                  onClick={() => { onChange(option.value); setOpen(false); setSearch(""); }}
                  className="px-4 py-2 text-sm cursor-pointer"
                  style={{
                    background: value === option.value ? "#f5f2ee" : "transparent",
                    color: "#4c4847",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f5f2ee")}
                  onMouseLeave={e => (e.currentTarget.style.background = value === option.value ? "#f5f2ee" : "transparent")}>
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