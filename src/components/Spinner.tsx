// Shared loading spinner — replaces the ~10 inline `rounded-full border-2 animate-spin`
// divs that had drifted across 3+ sizes. Pass color="#fff" for spinners on dark buttons.

const SIZES: Record<string, string> = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
};

export function Spinner({
  size = "md",
  color = "var(--color-primary)",
  className = "",
}: {
  size?: "xs" | "sm" | "md" | "lg";
  color?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`${SIZES[size]} rounded-full border-2 animate-spin ${className}`}
      style={{ borderColor: color, borderTopColor: "transparent" }}
    />
  );
}
