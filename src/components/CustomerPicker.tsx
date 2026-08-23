// Shared customer search + select UI for the two scan entry points (Surface Scan / Manual
// Scan), which had near-duplicate but drifting flows. This is a PRESENTATIONAL component:
// each page keeps its own search/start LOGIC and state and passes it in, so behavior is
// unchanged — only the markup is unified.
//
// Two start layouts via `startMode`:
//   "card"   — Start button lives inside the result card (needs a selected customer). Manual Scan.
//   "footer" — full-width Start button below, enabled on a typed query OR a selected customer,
//              so staff can type an ID and start without a separate search step. Surface Scan.
//
// #5: search returns an ARRAY (a name/company can match several customers). When >1 match,
// the list shows and staff click one to select (onPick). When exactly one, the caller
// auto-selects it so the single-result card UX is preserved.

export interface PickerCustomer {
  id: string;
  customerCode: string;
  fullName: string;
  company?: string | null;
  phone?: string | null;
}
export interface PickerContact { id: string; name: string }
export type CustomerSearchType = "code" | "name" | "phone" | "company";

const TABS: { key: CustomerSearchType; label: string }[] = [
  { key: "code", label: "ID" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
];

export function CustomerPicker({
  searchType, onSearchTypeChange,
  query, onQueryChange, onSearch, searching, searchError,
  customers, onPick,
  selected, contacts, contactName, onContactChange,
  onStart, starting, startLabel = "Start", startMode = "card",
  allowWalkIn = false, onWalkIn,
}: {
  searchType: CustomerSearchType;
  onSearchTypeChange: (t: CustomerSearchType) => void;
  query: string;
  onQueryChange: (v: string) => void;
  onSearch: () => void;
  searching: boolean;
  searchError?: string;
  customers: PickerCustomer[];            // #5: all matches (was `customer: single | null`)
  onPick: (c: PickerCustomer) => void;    // #5: staff picks one from the list
  selected: PickerCustomer | null;        // the chosen customer (was `customer`)
  contacts: PickerContact[];
  contactName: string;
  onContactChange: (v: string) => void;
  onStart: () => void;
  starting: boolean;
  startLabel?: string;
  startMode?: "card" | "footer";
  allowWalkIn?: boolean;
  onWalkIn?: () => void;
}) {
  const inputStyle = { background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" };
  const placeholder =
    searchType === "code" ? "Customer ID, e.g. Ar00001"
    : searchType === "name" ? "Customer name"
    : searchType === "company" ? "Company name"
    : "Phone number";

  // Result card: the selected customer, with optional contact dropdown + Start.
  const selectedCard = selected && (
    <div className="mt-4 p-4 rounded-xl" style={{ background: "var(--color-bg)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>{selected.customerCode} · {selected.fullName}</p>
          {(selected.company || selected.phone) && (
            <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{[selected.company, selected.phone].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        {startMode === "card" && (
          <button type="button" onClick={onStart} disabled={starting}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 flex-shrink-0" style={{ background: "var(--color-primary)" }}>
            {starting ? "..." : startLabel}
          </button>
        )}
      </div>
      {contacts.length > 0 && (
        <div className="mt-3">
          <label className="block text-[11px] mb-1" style={{ color: "var(--color-text-muted)" }}>Contact</label>
          <select aria-label="Contact" value={contactName} onChange={(e) => onContactChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
            <option value="">{selected.fullName} (primary)</option>
            {contacts.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );

  // #5: when more than one match, list them so staff can pick. (A code search returns
  // one, so this only shows for name/company/phone that hit multiple.) The selected
  // card renders below the list once picked.
  const matchList = customers.length > 1 && (
    <div className="mt-4 space-y-2">
      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{customers.length} customers match — pick one</p>
      {customers.map((c) => (
        <button key={c.id} type="button" onClick={() => onPick(c)}
          className="w-full text-left p-3 rounded-lg flex items-center justify-between gap-3 transition-colors"
          style={{ background: selected?.id === c.id ? "var(--color-primary-soft, #efe6d8)" : "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>{c.fullName} <span style={{ color: "var(--color-text-muted)" }}>· {c.customerCode}</span></p>
            {(c.company || c.phone) && (
              <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{[c.company, c.phone].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}>Select</span>
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => onSearchTypeChange(t.key)}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ background: searchType === t.key ? "var(--color-primary)" : "var(--color-bg)", color: searchType === t.key ? "var(--color-surface)" : "var(--color-text-muted)" }}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={query} onChange={(e) => onQueryChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={placeholder}
          className="flex-1 px-4 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
        <button type="button" onClick={onSearch} disabled={searching || !query.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--color-primary)" }}>
          {searching ? "..." : "Search"}
        </button>
      </div>
      {searchError && <p className="text-sm mt-3" style={{ color: "var(--color-danger)" }}>{searchError}</p>}

      {matchList}
      {selectedCard}

      {startMode === "footer" && (
        <button type="button" onClick={onStart} disabled={starting || (!query.trim() && !selected)}
          className="w-full mt-4 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--color-primary)" }}>
          {starting ? "Starting…" : startLabel}
        </button>
      )}

      {allowWalkIn && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button type="button" onClick={onWalkIn} disabled={starting}
            className="text-sm underline disabled:opacity-50" style={{ color: "var(--color-text-muted)" }}>
            Or start without a customer (Walk-in)
          </button>
        </div>
      )}
    </div>
  );
}
