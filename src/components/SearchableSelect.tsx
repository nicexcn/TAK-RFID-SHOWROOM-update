"use client";

import { useState, useRef, useEffect, useId } from "react";

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
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionIdPrefix = useId();

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

  // Reset the highlight to the currently-selected option (or the first) whenever the
  // list opens or the filter changes.
  useEffect(() => {
    if (!open) return;
    const selectedIdx = filtered.findIndex((o) => o.value === value);
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : filtered.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search]);

  // When the search box is present, focus it on open so typing filters immediately;
  // otherwise keep focus on the trigger for keyboard navigation.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  function openList() {
    setOpen(true);
  }

  function closeList(returnFocus = true) {
    setOpen(false);
    setSearch("");
    if (returnFocus) triggerRef.current?.focus();
  }

  function selectAt(index: number) {
    const option = filtered[index];
    if (!option) return;
    onChange(option.value);
    closeList();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (filtered.length === 0 ? -1 : (i + 1) % filtered.length));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (filtered.length === 0 ? -1 : (i - 1 + filtered.length) % filtered.length));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0) selectAt(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        closeList();
        break;
      case "Tab":
        setOpen(false);
        setSearch("");
        break;
    }
  }

  const activeOptionId = activeIndex >= 0 && filtered[activeIndex]
    ? `${optionIdPrefix}-${filtered[activeIndex].id}`
    : undefined;

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? activeOptionId : undefined}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={searchable ? undefined : handleKeyDown}
        className="w-full px-4 py-3 rounded-xl text-sm cursor-pointer flex items-center justify-between text-left"
        style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: value ? "var(--color-text)" : "var(--color-text-muted)" }}>
        <span>{value || placeholder}</span>
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "0.2s" }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          {searchable && (
            <div className="p-2 border-b" style={{ borderColor: "var(--color-border)" }}>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
                placeholder="Search..."
                className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
              />
            </div>
          )}
          <ul id={listId} role="listbox" className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm" style={{ color: "var(--color-text-subtle)" }}>No options found</li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.id}
                  id={`${optionIdPrefix}-${option.id}`}
                  role="option"
                  aria-selected={value === option.value}
                  onClick={() => selectAt(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className="px-4 py-2 text-sm cursor-pointer"
                  style={{
                    background: index === activeIndex || value === option.value ? "var(--color-bg)" : "transparent",
                    color: "var(--color-text)",
                  }}>
                  {option.value}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
