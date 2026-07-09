# Meeting follow-up — implemented (24-6-26)

All **11 code items** from *"สรุปสิ่งที่ต้องดำเนินการ หลังประชุม Demo โปรแกรม NimitrLog"* are done, reviewed, and deployed to production (`tak-rfid-showroom.vercel.app`). This is the operator-facing summary: what each item does, where it is, and how to use it.

> Branch: `feat/meeting-followup-2606` · each item was adversarially reviewed and the confirmed findings fixed.

---

## Customer & registration

### #1 — Customer types + prefix codes
- Types: **Architect, Interior Designer, Turnkey, Contractor, Home Owner, Developer, Other**.
- New customers get a **type-prefixed code**: `Ar00001` (Architect), `ID…` (Interior), `TK…`, `Ct…`, `Ho…`, `DP…` (Developer), `Ot…`. Existing `C####` customers keep their codes.
- Where: Register form + shown everywhere (list, detail, dashboard, CSV). Source of truth: `src/lib/customerTypes.ts`.

### #2 — Register split + Sales
- The register form now has a distinct **"For staff use / สำหรับเจ้าหน้าที่"** section (separate from customer-filled fields).
- **Sales** field: pick from a managed list or type a name (walk-ins). Manage the list at **Settings → Product Management → Salesperson**.

### #8 — Multiple contacts per customer
- A customer (company) can have **several contacts**. Add/remove them on the **customer detail page → Contacts**.
- When scanning (Surface Scan or Manual Scan), after finding the customer you can **select which contact** the visit is for — it's saved on that session and shown in the active-session bar.

### #4 (field) — Project
- New **Project** field per customer (staff section of the register form). Searchable in Reports and printed on the sticker.

---

## Scanning & takeaway

### #5 — Manual Scan
- New page **Manual Scan** (sidebar): record items **without RFID** — for back-office give-outs / souvenirs (ของชำร่วย).
- Flow: pick a customer (or **Walk-in**) → search + click products → set take-home qty → Finish. Feeds the same records as RFID scanning.

### Notification rule (image3) — give-away vs must-return
- Each product has a **Return policy** toggle (Add/Edit Product): **ต้องคืน (must be returned)** vs **ให้ไปเลย (give-away)**.
- **Give-away** items: **no** "prepare" notification, and they are **not** tracked in Borrow/Return. **Must-return** items behave as before (notification + return tracking).
- Loan status is snapshotted when the item is taken, so changing a product's policy later never orphans an outstanding loan.

---

## Reporting & export

### #4 — Reports
- New **Reports** page (sidebar). Period tabs **Daily / Weekly / Monthly / Yearly** (Bangkok calendar) + **search by customer code / Project / Sale**.
- Shows: visits / customers / items scanned / pieces taken; **brand & category interest**; and the two lists — **all scanned** and **taken-home** products. **Export CSV**.

### #3 — Satisfaction survey
- Public survey at **`/survey`** (no login) — mirrors the Google Form (11 questions). Share this URL / print a QR code for customers.
  - Optionally link a response to a customer: `/survey?customer=<id>`.
- **Results**: sidebar → **Survey Results** (ratings averages + distributions, choice breakdowns, comments). **Sales/basic staff do not see results** (enforced server-side).

### #11 — ERP stock-cut export
- On the **Reports** page: **"Export for ERP"** → a CSV of **each taken-home line** (Bangkok date, customer, **product code/SKU**, brand, qty taken, sale, project) for the current period/search. Feed it into the ERP to cut stock per day.

---

## Display, sticker, access

### #10 — Display pause / next
- On the TV `/display`: **Pause/Play + Prev/Next** controls (and keyboard: **Space / ← / →**) so a viewer can stop on a product to read its details. Auto-resumes when the shown items change.

### #9 — Print sample sticker (8 × 5 cm)
- Customer detail page → **🖨 Print Sticker**. Renders the **"Product Sample"** sticker (image2 design: Company / Contact / Project / ผู้เบิก), editable requester, then Print.
- Fonts (Archer Semibold + DB Heavent Light) are bundled. In the print dialog set paper to **8×5 cm**, margins **None**. For a professional die-cut print house, add 0.5 cm bleed.

### #6 — Role-based menu
- Five roles, each with its own menu (enforced server-side — not just hidden links):

| Role | Sees |
|---|---|
| **Super Admin** | Everything |
| **Management** (Sales Director) | Dashboard, Reports, Survey Results, Customers, Notifications, Borrow/Return |
| **Admin** (Showroom Manager) | Everything |
| **Basic** (Presenter / Sales) | Dashboard, Customers, Surface Scan, Manual Scan, Notifications, Borrow/Return |
| **Prep** (takeaway-prep staff) | Notifications + Borrow/Return only (a focused prep menu) |

- Assign roles at **Settings → Account** (Super Admin only). Basic/Prep can't open Reports or Survey Results, even by direct link.

---

## Not code — for TAK / IT

- **#7** — buy a **sticker printer** (the app produces the 8×5 cm artwork; a label printer prints it).
- **#12** — provide the **device dimensions** to embed in the table (hardware/fit-out).

## Post-audit refinements (closing the "partial" gaps)
A compliance audit against the meeting doc + Excel found four items partially covered; all are now closed:
- **#2/#4 — Customer source.** New **Source** field on the register form (Sales invite / Walk-in / Event / Online / Referral) — distinguishes a TWC-invited customer from a walk-in, and drives a **"Customer source"** breakdown in Reports.
- **#3 — Survey reachable by customers.** A **QR code** now shows on the **TV display whenever it's idle** (over the idle video or the logo) → customers scan it to open the survey. Plus a per-customer **📋 Survey** link on the customer page (pre-attributed).
- **#4 — Excel report categories.** Reports now also show **Visitor types**, **First-time vs Returning**, and a **Satisfaction summary** (survey averages) alongside the scanned/taken-home lists.
- **#9 — Sticker bleed.** A **"0.5 cm bleed"** toggle renders a 9×6 cm artwork with a trim guide for a die-cut print house (the default stays 8×5 cm for label printers).

## Notes
- Schema changes are on the **shared Supabase DB** (via `prisma db push`) and the app is deployed to Vercel production.
- The survey's "Sales" gating currently maps to the **Basic** role; role definitions live in `src/lib/roles.ts`.
