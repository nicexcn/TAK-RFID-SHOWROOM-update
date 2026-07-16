// Customer types (occupation) + their code prefixes.
// The stored `Customer.title` keeps the short `value` (no data migration needed);
// `label`/`labelTh` are display-only, `prefix` drives the customerCode (e.g. "Ar00001").
export const CUSTOMER_TYPES = [
  { value: "Architect",  prefix: "Ar", label: "Architect",         labelTh: "สถาปนิก",                color: "#6f5f48" },
  { value: "Interior",   prefix: "ID", label: "Interior Designer", labelTh: "มัณฑนากร",               color: "#6f5f48" },
  { value: "Turnkey",    prefix: "TK", label: "Turnkey",           labelTh: "รับเหมาแบบครบวงจร",       color: "#4a6fa5" },
  { value: "Contractor", prefix: "Ct", label: "Contractor",        labelTh: "ผู้รับเหมา",              color: "#4c4847" },
  { value: "Homeowner",  prefix: "Ho", label: "Home Owner",        labelTh: "เจ้าของบ้านหรือโครงการ", color: "#4a7c59" },
  { value: "Developer",  prefix: "DP", label: "Developer",         labelTh: "ผู้พัฒนาโครงการ",         color: "#b26a00" },
  { value: "Other",      prefix: "Ot", label: "Other",             labelTh: "อื่นๆ",                  color: "#6b6560" },
] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number]["value"];

// #2/#4: how a customer came in (the "customer source" report category). value = stored, label = shown.
export const CUSTOMER_SOURCES = [
  { value: "Sales invite", label: "Sales invite / เซลล์เชิญ" },
  { value: "Walk-in", label: "Walk-in / เดินเข้ามาเอง" },
  { value: "Event", label: "Event / งานอีเวนต์" },
  { value: "Online", label: "Online / ออนไลน์" },
  { value: "Referral", label: "Referral / แนะนำต่อ" },
] as const;

const byValue = new Map(CUSTOMER_TYPES.map((t) => [t.value, t]));

/** Code prefix for a stored title value (falls back to "Ot"). */
export const customerTypePrefix = (value: string): string => byValue.get(value as CustomerType)?.prefix ?? "Ot";

/** English display label for a stored title value (falls back to the raw value). */
export const customerTypeLabel = (value: string): string => byValue.get(value as CustomerType)?.label ?? value;

/** Colour for a stored title value (falls back to grey). */
export const customerTypeColor = (value: string): string => byValue.get(value as CustomerType)?.color ?? "#6b6560";
