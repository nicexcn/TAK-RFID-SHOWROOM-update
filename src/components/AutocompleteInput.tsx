"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fetchUrl: string;
}

export default function AutocompleteInput({ value, onChange, placeholder = "Type to search...", fetchUrl }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowList(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    onChange(val);
    if (val.length < 1) { setSuggestions([]); setShowList(false); return; }
    const res = await fetch(`${fetchUrl}?search=${val}&limit=8`);
    const data = await res.json();
    setSuggestions(data);
    setShowList(data.length > 0);
  }

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setShowList(true)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl outline-none text-sm"
        style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />
      {showList && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          <div className="max-h-48 overflow-y-auto">
            {suggestions.map((s, i) => (
              <div key={i}
                onClick={() => { onChange(s); setShowList(false); }}
                className="px-4 py-2 text-sm cursor-pointer"
                style={{ color: "var(--color-text)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-bg)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}