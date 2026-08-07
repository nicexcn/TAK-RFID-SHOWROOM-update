"use client";

import { useId, useState } from "react";

// A masked text input with a show/hide eye toggle — for secrets (passwords, API/relay
// keys) that shouldn't sit in plaintext on a screen an admin might screen-share or
// screenshot. Masked by default; the button reveals to verify/copy. One source of truth
// for the toggle so login, Settings, etc. can't drift apart. Uncontrolled visibility.
interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;         // classes for the <input> (caller owns sizing/theme)
  style?: React.CSSProperties; // inline style for the <input>
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  secretLabel?: string;        // used in the toggle's aria-label, e.g. "Show password"
  disabled?: boolean;
}

export default function SecretInput({
  value, onChange, id, placeholder, autoComplete = "off",
  className = "", style, onKeyDown, secretLabel = "password", disabled,
}: Props) {
  const [show, setShow] = useState(false);
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="relative">
      <input
        id={inputId}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`pr-12 ${className}`}
        style={style}
      />
      <button
        type="button"
        aria-label={show ? `Hide ${secretLabel}` : `Show ${secretLabel}`}
        onClick={() => setShow((s) => !s)}
        className="absolute right-4 top-1/2 -translate-y-1/2"
        style={{ color: "var(--color-text-muted)" }}
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
