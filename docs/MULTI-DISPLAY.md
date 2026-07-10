# Multiple TV displays (zoned screens)

The showroom can run **several TVs**, each its own **zone** — it shows only its own table's
live tiles and only the customer lists sent to *it*. One TV with no setup keeps working exactly
as before (a single "default" screen).

## How it works

Each `/display` screen has three inputs, arbitrated **table > sent-list > idle**:

- **Table presence** (a tile physically on the table) streams from **one reader**. This was
  always per-screen — each TV connects to its own reader.
- **Sent customer list** (staff press **Send to Display**) is now **addressed to a specific
  screen**, not broadcast to all of them.
- **Idle** — the logo / idle video + the survey QR.

A screen is identified by `?display=<id>` in its URL. A session sent to that screen is pinned to
it (`Session.displayId`); the TV only pulls the list pinned to its own id. No `?display=` → the
**default screen** (unpinned sends), i.e. the original single-TV behaviour.

## One-time setup (Settings → Display Settings)

1. **Readers** — add one reader per table (device tag or LAN URL), as before.
2. **Displays (TV screens)** — add one row per TV:
   - **Name** — e.g. `Table A` (this is what staff pick when sending).
   - **Reader** — the reader that screen shows live (its table presence).
   - **Rotation** — per-screen default (0/90/180/270). A `?rotate=` in the URL still overrides.
   - **URL** — open that physical TV at the shown address (`/display?display=<id>`). It
     auto-connects to the bound reader and applies the rotation — no per-TV ⚙ config needed.
3. **Save**.

## Daily use

- On **Surface Scan / Manual Scan**, after curating a customer's list press **Send to Display**.
  When more than one screen exists, a **screen picker** appears next to the button. It
  **auto-selects the screen bound to the reader you're serving on**, so usually you just press
  send. **Stop Display** takes that customer off their screen (never affects another screen).

## Design notes

- **Realtime** stays a single global "something changed" nudge; each screen re-fetches its own
  scoped list, so it only updates when *its* pinned session changes. Fine to dozens of screens;
  split into per-screen topics only if you scale much larger.
- **Back-compat** — `displayId = null` is the default screen. Sessions sent before this feature
  (and any single-TV deployment) resolve to it unchanged.
- Source of truth: `src/lib/displays.ts` (registry), `Session.displayId` (pin),
  `/api/sessions/display` (scoped GET/POST/DELETE), `AppSettings.displays` (registry storage).
