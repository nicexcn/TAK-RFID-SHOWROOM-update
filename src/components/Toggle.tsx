// Accessible switch primitive (role=switch + aria-checked, Space/Enter operable since it's
// a <button>). Consolidates the sliding-toggle markup that was duplicated inline.
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
      style={{ background: checked ? "var(--color-primary)" : "var(--color-sidebar)" }}
    >
      <span
        className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
        style={{ left: checked ? "22px" : "4px" }}
      />
    </button>
  );
}
