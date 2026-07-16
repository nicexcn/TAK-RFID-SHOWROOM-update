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

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

/** Returns an async confirm(opts) => Promise<boolean>. Resolves true on confirm, false on cancel/Esc/backdrop. */
export const useConfirm = (): ConfirmFn => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(o);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  // Esc cancels; move focus to the confirm button when the dialog opens.
  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") settle(false); };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 0);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [opts, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
          onClick={() => settle(false)}
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
              <p className="text-sm mb-5" style={{ color: "var(--color-text-muted)" }}>{opts.message}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
              >
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => settle(true)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={
                  opts.danger
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
    </ConfirmContext.Provider>
  );
}
