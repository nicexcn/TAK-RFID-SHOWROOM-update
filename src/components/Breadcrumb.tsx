import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string; // omit (or it's the last item) → rendered as the current page, not a link
}

// Functional breadcrumb: every segment except the last (the current page) is a real link.
// Replaces the static "Home / X / Y" <p> subtitles that used to be plain text.
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs mt-1 flex flex-wrap items-center" style={{ color: "var(--color-text-muted)" }}>
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="inline-flex items-center">
            {c.href && !isLast ? (
              <Link href={c.href} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>{c.label}</Link>
            ) : (
              <span aria-current={isLast ? "page" : undefined}>{c.label}</span>
            )}
            {!isLast && <span className="mx-1.5" style={{ color: "var(--color-text-subtle)" }}>/</span>}
          </span>
        );
      })}
    </nav>
  );
}
