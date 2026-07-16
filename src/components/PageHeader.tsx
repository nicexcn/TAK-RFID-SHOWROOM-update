import Breadcrumb from "@/components/Breadcrumb";

// Canonical page header (h1 + Breadcrumb + optional right-aligned actions). Replaces the
// copy-pasted header markup that had drifted in spacing/stacking across admin pages.
// `flex-wrap` so action clusters don't overflow on tablet.
export function PageHeader({
  title,
  crumbs,
  actions,
}: {
  title: string;
  crumbs: { label: string; href?: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>{title}</h1>
        <Breadcrumb items={crumbs} />
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
