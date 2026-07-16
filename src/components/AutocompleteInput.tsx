"use client";

import { useState, useRef, useEffect, useId } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fetchUrl: string;
}

export default function AutocompleteInput({ value, onChange, placeholder = "Type to search...", fetchUrl }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionIdPrefix = useId();

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
    setActiveIndex(-1);
    if (val.length < 1) { setSuggestions([]); setShowList(false); return; }
    const res = await fetch(`${fetchUrl}?search=${val}&limit=8`);
    const data = await res.json();
    setSuggestions(data);
    setShowList(data.length > 0);
  }

  function selectAt(index: number) {
    const s = suggestions[index];
    if (s === undefined) return;
    onChange(s);
    setShowList(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList || suggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        e.preventDefault();
        setShowList(true);
        setActiveIndex(0);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        break;
      case "Enter":
        if (activeIndex >= 0) {
          e.preventDefault();
          selectAt(activeIndex);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowList(false);
        setActiveIndex(-1);
        break;
    }
  }

  const activeOptionId = showList && activeIndex >= 0
    ? `${optionIdPrefix}-${activeIndex}`
    : undefined;

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setShowList(true)}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        className="w-full px-4 py-3 rounded-xl outline-none text-sm"
        style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />
      {showList && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          <ul id={listId} role="listbox" className="max-h-48 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li key={i}
                id={`${optionIdPrefix}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => selectAt(i)}
                onMouseEnter={() => setActiveIndex(i)}
                className="px-4 py-2 text-sm cursor-pointer"
                style={{ color: "var(--color-text)", background: i === activeIndex ? "var(--color-bg)" : "transparent" }}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
