"use client";

// Styled, promise-based confirm dialog to replace native window.confirm()/alert()
// for destructive actions — matches the app's token styling and is accessible
// (role=dialog, aria-modal, Esc to cancel, focus moved to the primary button).
//
// Usage:
//   const confirm = useConfirm();
//   const ok = await confirm({ title: "Delete customer?", message: "This can't be undone.", danger: true });
//   if (!ok) return;
// Mounted once via <ConfirmProvider> in the admin layout.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
type PromptFn = (opts: PromptOptions) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);
const PromptContext = createContext<PromptFn>(async () => null);

/** Returns an async confirm(opts) => Promise<boolean>. Resolves true on confirm, false on cancel/Esc/backdrop. */
export const useConfirm = (): ConfirmFn => useContext(ConfirmContext);
/** Returns an async prompt(opts) => Promise<string|null>. Resolves the trimmed text on confirm, null on cancel/Esc/backdrop/empty. */
export const usePrompt = (): PromptFn => useContext(PromptContext);

// One shared modal shell drives both confirm (boolean) and prompt (text) so there's a
// single styled/accessible dialog instead of native window.confirm()/window.prompt().
type DialogState =
  | { kind: "confirm"; opts: ConfirmOptions }
  | { kind: "prompt"; opts: PromptOptions };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const resolverRef = useRef<((v: boolean | string | null) => void) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve as (v: boolean | string | null) => void;
      setState({ kind: "confirm", opts: o });
    });
  }, []);

  const prompt = useCallback<PromptFn>((o) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve as (v: boolean | string | null) => void;
      setInputValue(o.defaultValue ?? "");
      setState({ kind: "prompt", opts: o });
    });
  }, []);

  const settle = useCallback((value: boolean | string | null) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState(null);
  }, []);

  // Confirm resolves false on cancel; prompt resolves the trimmed text (or null if empty/cancelled).
  const cancel = useCallback(() => settle(state?.kind === "prompt" ? null : false), [settle, state]);
  const accept = useCallback(() => {
    if (state?.kind === "prompt") { const v = inputValue.trim(); settle(v ? v : null); }
    else settle(true);
  }, [settle, state, inputValue]);

  // Esc cancels; focus the input (prompt) or the confirm button when the dialog opens.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      if (state.kind === "prompt") inputRef.current?.select();
      else confirmBtnRef.current?.focus();
    }, 0);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [state, cancel]);

  const opts = state?.opts;
  const danger = state?.kind === "confirm" && state.opts.danger;

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={prompt}>
        {children}
        {state && opts && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
            onClick={cancel}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 shadow-xl"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <h2 id="confirm-title" className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>
                {opts.title}
              </h2>
              {opts.message && (
                <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>{opts.message}</p>
              )}
              {state.kind === "prompt" && (
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") accept(); }}
                  placeholder={state.opts.placeholder}
                  className="w-full px-3 py-2 rounded-xl text-sm mb-5 outline-none"
                  style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
                >
                  {opts.cancelLabel ?? "Cancel"}
                </button>
                <button
                  ref={confirmBtnRef}
                  type="button"
                  onClick={accept}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={
                    danger
                      ? { background: "var(--color-danger)", color: "#ffffff", border: "1px solid var(--color-danger)" }
                      : { background: "var(--color-primary)", color: "var(--color-surface)", border: "1px solid var(--color-primary)" }
                  }
                >
                  {opts.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  );
}
