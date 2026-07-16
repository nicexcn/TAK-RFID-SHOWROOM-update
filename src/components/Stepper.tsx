// Numeric +/- stepper primitive. Consolidates the duplicated w-12/w-7 stepper markup
// (Takeaway limit, Borrow period, per-scan takeaway qty). Buttons carry aria-labels.
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  size = "md",
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  ariaLabel: string;
}) {
  const btn = size === "sm" ? "w-7 h-7 text-sm" : "w-12 h-12 text-lg";
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1);
  const btnStyle = { background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" };
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={dec} disabled={value <= min} aria-label={`Decrease ${ariaLabel}`}
        className={`${btn} rounded-lg flex items-center justify-center disabled:opacity-40`} style={btnStyle}>−</button>
      <span className={`${size === "sm" ? "w-7" : "w-10"} text-center font-medium`} style={{ color: "var(--color-text)" }}>{value}</span>
      <button type="button" onClick={inc} disabled={max !== undefined && value >= max} aria-label={`Increase ${ariaLabel}`}
        className={`${btn} rounded-lg flex items-center justify-center disabled:opacity-40`} style={btnStyle}>+</button>
    </div>
  );
}
