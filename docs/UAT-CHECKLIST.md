# TAK RFID Showroom — Acceptance Checklist (UAT)

**For the client to verify each meeting request works, on the live system.**
Run top-to-bottom, tick each box, note anything that doesn't match "Expected". Every item below maps to a numbered request from the 24-6-26 meeting doc.

- **Where:** `https://app.nimitrlog.com` (or `https://tak-rfid-showroom.vercel.app`)
- **Login:** your assigned account. Super-Admin steps (⚙) need a Super Admin login.
- **Labels below are the exact on-screen text** (English UI).
- This checklist doubles as the **regression list** — re-run it before each release.

---

## A. Login & menu (Req #6 — role access)
1. [ ] Open the site → you land on the **Login** page. Sign in.
   - **Expected:** you reach the app; the **left sidebar** shows only the menus your role allows.
2. [ ] Confirm your role's menu matches the table:

   | Role | Should see in sidebar |
   |---|---|
   | Super Admin | Everything incl. **Settings** |
   | Admin (Showroom Manager) | Everything **except Settings** |
   | Management (Sales Director) | Dashboard, Reports, Survey Results, Customer Management, Notifications, Borrow / Return |
   | Basic (Presenter) | Customer Management, Surface Scan, Manual Scan, Notifications, Borrow / Return — **no Dashboard, no Reports, no Survey Results** |
   | Prep staff | **Notifications + Borrow / Return only** |
3. [ ] (Basic/Prep only) Try opening `/admin/reports` by typing it in the address bar.
   - **Expected:** you are blocked/redirected — not allowed. *(This is per your spec: Basic cannot view analytics/reports.)*

## B. Customer types & codes (Req #1)
4. [ ] **Customer Management → Add** a new customer. Pick a **Type** (Architect / Interior Designer / Turnkey / Contractor / Home Owner / Developer / Other).
   - **Expected:** the customer is saved with a **type-prefixed code**: Architect→`Ar…`, Interior Designer→`ID…`, Turnkey→`TK…`, Contractor→`Ct…`, Home Owner→`Ho…`, Developer→`DP…`, Other→`Ot…` (5-digit number, e.g. `Ar00001`).

## C. Register split + Sales + Walk-in (Req #2)
5. [ ] On the Add-customer form, confirm there is a separate **"For staff use / สำหรับเจ้าหน้าที่"** section.
   - **Expected:** it has a **Sales** picker (managed list or typed name) and a **Project** field, visually separate from the customer's own fields.
6. [ ] Set **Source = Walk-in** and leave Sales blank, save.
   - **Expected:** the managing **Sales defaults to you** (the logged-in staff). You can edit it later.

## D. Multiple contacts (Req #8)
7. [ ] Open a customer → **Contacts** → add 2+ contacts (e.g. Contact A, Contact B).
8. [ ] Start a scan (Surface Scan or Manual Scan) for that customer.
   - **Expected:** after selecting the customer you can **choose which contact** the visit is for; the chosen name shows in the active-session bar.

## E. Manual Scan — no reader (Req #5)
9. [ ] **Manual Scan** → **Select customer** (or **"…without a customer (Walk-in)"**) → **Start**.
10. [ ] Search products, click to add, set take-home quantity → **Done / Save**.
    - **Expected:** items are recorded exactly like an RFID scan, no reader needed. Good for souvenirs / back-office give-outs.

## F. Surface Scan (RFID) + prepare flow (Req #5 sibling)
11. [ ] **Surface Scan** → select a customer/contact → scan (or **Demo scan** to simulate).
    - **Expected:** scanned items appear in the live list.
12. [ ] Click **Prepare all** → open **Notifications**.
    - **Expected:** a prepare task appears. Prep staff can **Start preparing** → **Mark done**. *(Give-away products correctly raise no prepare task.)*

## G. Display pause / next (Req #10)
13. [ ] Open the TV **`/display`**. While images auto-rotate, press **Space** (or the **Pause** button).
    - **Expected:** the slideshow **stops** on the current product so a viewer can read details.
14. [ ] Press **→** / **←** (or **Next / Prev**).
    - **Expected:** you step to the next/previous image manually.

## H. Sticker print (Req #9)
15. [ ] Open a customer → **Print Sticker**.
    - **Expected:** a **"Product Sample"** sticker renders with Company / Contact / Project / ผู้เบิก, editable requester. Print dialog set to **8×5 cm**, margins None. *(0.5 cm bleed toggle available for a die-cut print house.)*

## I. Reports (Req #4) & ERP export (Req #11) — Management+ only
16. [ ] **Reports** → switch period **Daily / Weekly / Monthly / Yearly**; search by customer code / Project / Sale.
    - **Expected:** visits, customers, items scanned, pieces taken; **brand & category interest**; **customer source** and **visitor type** breakdowns; **satisfaction summary**; and the scanned / taken-home lists. *(Matches the "Report List" sheet you sent.)*
17. [ ] Click **Export CSV**, then **Export for ERP**.
    - **Expected:** CSV downloads. ERP export has **one line per taken-home item** (Bangkok date, customer code, product code, qty, sale, project) for cutting stock.

## J. Satisfaction survey (Req #3)
18. [ ] Open **`/survey`** in a private/incognito window (no login).
    - **Expected:** the public survey (11 questions) loads and submits — this is the customer-facing form.
19. [ ] As **Management/Admin** → **Survey Results**.
    - **Expected:** ratings averages, distributions, comments are visible.
20. [ ] As **Basic/Sales** → confirm **Survey Results is NOT in your menu** and `/admin/survey` is blocked.
    - **Expected:** Sales/Basic **cannot see** survey results. *(Per your spec.)*

---

## Not covered here — hardware / IT (client + TAK)
- **Req #7** — purchase a **sticker printer** (the app produces the artwork; a label printer prints it).
- **Req #12** — provide **device dimensions** for the table installation.

---

### Sign-off
- Tester: ____________________  Date: __________
- Result: ☐ Accepted   ☐ Accepted with notes   ☐ Changes requested
- Notes:
