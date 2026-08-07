# TAK RFID Showroom — Delivery Status

**One-page snapshot of every client requirement vs. what is built and verified.**
Source of truth for "where are we." Update the status + commit as the last step of each feature.

- **Spec:** `ข้อมูล Update หลังประชุม 24-6-26/` (docx = 13 items · Showroom Report.xlsx · font zip), dated 2026-06-29 — the latest client input.
- **Code:** branch `feat/meeting-followup-2606`, HEAD `5fba545` (update on each change).
- **Live:** Vercel `tak-rfid-showroom.vercel.app` + on-prem `nimitrlog.com` (apex is primary; `app.nimitrlog.com` → 301 redirect) — both `/login` = 200 (last checked 2026-08-07).
- **Legend:** 🟢 done & verified · 🟡 partial · 🔴 missing · ⚪ not-software (hardware/IT/procurement).

---

## Requirements (client post-demo doc)

| # | Requirement | Status | Where (evidence) | Verified how |
|---|---|:---:|---|---|
| 1 | Customer types + prefix codes (Ar/ID/TK/Ct/Ho/DP/Ot) | 🟢 | `src/lib/customerTypes.ts`; code auto-gen in `api/customers/route.ts:64` | Code audit + spec match |
| 2 | Register split (customer vs staff), Sales dropdown, walk-in default | 🟢 | `admin/customers/add/page.tsx:292` (staff section), `:65` (walk-in default) | Code audit |
| 3 | Satisfaction survey; **Sales/Basic cannot see results** | 🟢 | `/survey`, `/admin/survey`; gated in `roles.ts:22-27`, `api/survey/route.ts:43`, `proxy.ts:46` | Code audit (3-layer gate) |
| 4 | Reports per Excel ("Report to" = management) | 🟢 | `admin/reports/page.tsx`, `api/reports/route.ts`; matches Report List sheet | Code audit + xlsx parse |
| 5 | Manual Scan page (no reader) | 🟢 | `admin/manual-scan/page.tsx`; reuses Session/Scan API | Code audit |
| 6 | Per-role menu access (5 roles + prep isolation) | 🟢 | `src/lib/roles.ts:22-27` (ACCESS matrix); enforced in `proxy.ts` + API guards | Code audit vs client role table |
| 7 | Buy sticker printer | ⚪ | Artwork side done (`/print/sticker`); purchase = IT | N/A (procurement) |
| 8 | Multi-contact per customer; pick contact at scan | 🟢 | Customer detail → Contacts; picker on both scan flows | Code audit |
| 9 | Print sticker 8×5 cm, client fonts | 🟢 | `app/print/sticker/page.tsx`; fonts = Archer Semibold + DB Heavent Li (match client zip) | Code audit + font-zip match |
| 10 | Slideshow pause + next | 🟢 | `app/display/page.tsx:273` (step), `:296` (Space/←/→ keys) | Code audit + live keyboard drive |
| 11 | Sample CSV/Excel for ERP stock-cut | 🟢 | Reports → "Export for ERP" (`reports/page.tsx:81`); per-takeaway lines, Bangkok dates | Code audit |
| 12 | Device dimensions for table | ⚪ | Info request for TAK/IT | N/A (hardware) |

**Score: 10/10 software requirements done · 0 functional gaps · 2 non-code items pending TAK/IT.**

> **R6 note (corrected 2026-07-23):** The client role table says Basic (Presenter) *"cannot view analytics."* The code correctly excludes the Dashboard from the Basic role (`roles.ts:26`). An earlier internal doc wrongly listed "Dashboard" for Basic — now fixed. **The code matches the client spec; do not add the Dashboard to Basic.**

---

## Engineering hardening (NOT client-requested — track, decide, don't block)

These came out of the internal audit. They are robustness items the client never asked for; log them so they aren't forgotten, but they don't gate delivery.

| Item | Risk | Status |
|---|---|---|
| Batch-scan route (`api/sessions/[id]/scans/batch`) has no in-file role guard | Authenticated by proxy, but not role-authorized | Open — decide if self-guard needed |
| Per-reader EPC dedup (SESSION-ARCH F6) not built — one global `seenEpcsRef` | Table-then-handheld reads of same tile silently deduped | Open |
| No DB migrations (`db push` only); F2 one-active-session index not enforced | Race window on concurrent session start | Open |

---

## Open decisions for the client / owner
- None blocking. All 10 software requirements match the current spec.
- Awaiting TAK/IT: sticker printer purchase (#7), table device dimensions (#12).

---

## Doc health (internal)
Audited 2026-07-23. Current & trusted: `MEETING-FOLLOWUP.md` (just corrected), `ONPREM-DEPLOYMENT.md`, `TESTER-GUIDE.md`*, `DEMO-GUIDE.md`, `LOCAL.md`, `README.md`, `MULTI-DISPLAY.md`, `FIXES-APPLIED.md`.
Needs refresh (internal only, non-blocking): `AUDIT-REPORT.md`, `SESSION-ARCHITECTURE-DECISION.md`, `IMPLEMENTATION-SPEC.md`, `DESIGN-CHOICES.md`, `DRIFT-LOG.md`, `SYSTEM-DESIGN.md`.
*`TESTER-GUIDE.md` documents some Thai button labels; UI shipped in English — see `UAT-CHECKLIST.md` for the current labels.
