# Modern Fashion POS

Offline-first Windows retail POS and inventory management for **Modern Fashion (Brand Hub)**, Attapur, Hyderabad.

The application runs on one Windows computer. Authentication, billing, stock, reports, printing and backups use the local SQLite database. There is no cloud database, API account or internet requirement.

> **Hardware status:** the application prints and renders labels through the installed Windows drivers, but physical output on the client's TVS LP 46 NEO label printer, TVS receipt printer and USB scanner has **not** been verified. See `Docs/HARDWARE_VALIDATION.md`.

## What is included

- Owner/cashier setup with local password hashing, three fixed roles and service-level permissions
- Dashboard with date-scoped sales, profit, stock and activity
- Barcode-driven POS with cart, offers/manual discounts, tax-inclusive support, split payment status, change, receipt preview and reprint
- Transactional checkout: one invoice, one stock deduction, idempotency protection and no negative stock
- Products with colour/size variants, unique SKU/barcode, opening stock and Code 128 labels
- Inventory balances, immutable movement ledger, adjustments and reconciliation
- Purchases, suppliers, landed cost and weighted-average costing
- Customers, operating expenses, users, shifts, audit log and settings
- Sales/profit/product/tax/purchase/expense/inventory reports
- CSV exports and a month accounting pack for the client CA
- Local backups with integrity + SHA-256 verification, scheduled backups and guarded restore
- Receipt, A4 invoice and label HTML printed through the Windows driver; PDF save and WhatsApp handoff
- Owner-editable print layout: logo size/visibility, header fields, receipt sections, header/footer notes, terms, paper width and font scale, with a live sample receipt preview
- Owner-editable Code 128 barcode prefix and digit width for newly generated product barcodes; existing barcode values are never rewritten
- GitHub Releases update page with check, download and backup-first install; business data stays in the user-data folder
- Logo preview in Settings with a restart prompt after the logo changes

No users, products, customers or sales are seeded. The database starts with structural defaults only (categories, expense categories, permissions, settings).

## Requirements

- Windows 10/11, 64-bit
- Node.js **24 or newer** for development (the app uses the built-in `node:sqlite`)
- npm
- The app is packaged with Electron 45 and electron-builder

## Preview locally

From the repository root:

```powershell
npm install
npm run dev
```

`npm run dev` starts Vite on `http://127.0.0.1:3000` and launches Electron against it. The first window asks you to create the owner account; there is no default login.

Other commands:

```powershell
npm run build      # production renderer bundle in dist/
npm start          # launch Electron against the built dist/
npm test           # critical service and money tests
npm run lint
npm run verify     # test + build + lint
```

`npm start` requires `npm run build` first. It opens the real app against the local database. To use an isolated test database without touching shop data:

```powershell
$env:MF_DATA_DIR = "$env:TEMP\modern-fashion-preview"
npm start
```

Remove `MF_DATA_DIR` from the session when finished.

## Build the Windows EXE installer

The preferred package is **electron-builder + NSIS**, producing a standard Windows `.exe` installer.

```powershell
npm run dist
```

Output:

```text
release/ModernFashionPOS-Setup-1.1.0.exe
release/ModernFashionPOS-Setup-1.1.0.exe.blockmap
release/latest.yml
```

The installer is per-user by default, allows choosing the install directory, creates Start Menu/Desktop shortcuts and includes an uninstaller. It does **not** delete business data on uninstall (`deleteAppDataOnUninstall: false`).

For a faster unpacked smoke test:

```powershell
npm run dist:dir
```

The unpacked application is written under `release/win-unpacked/`.

MSI is not configured. NSIS is preferred for one POS workstation because it avoids the WiX toolchain and supports the required shortcut/install-directory behaviour. Add an MSI target only if the client's IT policy explicitly requires one.

## Updates from GitHub Releases

The installed app reads the public repository `shaikaakif/ModernFashion-Software` through `electron-updater`. Owners see **Releases** in the navigation, can check the latest release, download it, and restart to install. An update creates a verified database backup first and replaces program files only; the database, backups, exports, documents and settings are not touched.

No release has been published yet, and the installer is not code-signed. Windows SmartScreen may warn on first install. The full build, publish, rollback and acceptance procedure is in `Docs/RELEASES.md`. Do not publish a release without the owner's approval.

## Where data lives

By default Electron writes to the app's Windows user-data directory (normally under `%APPDATA%\Modern Fashion POS`):

```text
modern-fashion.db        SQLite database
backups/                 automatic and manual backups
documents/               generated invoice PDFs
exports/                 CSV / accounting pack output
logs/                    application log
assets/                  copied business logo
```

`MF_DATA_DIR` and `MF_DB_PATH` override these locations for development and testing. Back up the database from **Settings → Backup & restore**; do not copy a live `-wal`/`-shm` database manually while the app is running.

## Permissions

Permissions are enforced in Electron main-process services, not only by hiding menu items.

- **Owner** — full access, including staff, settings, backups and audit log.
- **Manager** — operations, purchasing, stock, customers, expenses, sales reports and profit; no staff administration, store settings, backups or audit log.
- **Cashier** — POS, own invoices, receipt printing and customers. No product edits, stock adjustments, purchase costs, expenses, profit, settings, staff or permissions.

A cashier can print their own receipt even though the full settings screen is owner-only. The internal print snapshot is never exposed as an IPC action.

## Money and tax rules

- All amounts are stored as integer paise. No binary floating-point money.
- Tax rates are basis points (`500` = 5%).
- Business dates use `YYYY-MM-DD` in Asia/Kolkata.
- Selling prices are tax-exclusive by default; tax-inclusive pricing is a setting.
- Purchases are inventory acquisitions, not operating expenses.
- COGS uses weighted-average cost captured on each sold line.
- Tax is disabled until a verified GSTIN is entered. The app does not claim GST return filing, e-invoicing or statutory compliance.

## Project structure

```text
electron/       Electron main process, SQLite core, services, printing, IPC
shared/         Money math and permission catalogue shared with the renderer
src/            React renderer (app shell, hooks, pages, one stylesheet)
tests/          Node test suites and fixture helpers
scripts/        Vite + Electron development launcher
Docs/           Authoritative project brief, brand kit, hardware checklist
graphify-out/   Persistent code knowledge graph (query with `graphify query`)
```

## Verification status

- `npm test`: 22 tests passing (money, checkout idempotency, stock exactly once, oversell, payment failure, void/restock, permissions/cost hiding, duplicate checkout keys, backup/restore, barcode formatting, logo reading, print settings and receipt layout).
- `npm run build`: passing.
- `npm run lint`: passing.
- Packaged EXE: **built and startup-verified.** `release/ModernFashionPOS-Setup-1.1.0.exe` was built, and the unpacked packaged app was launched with an isolated data folder. It started on version 1.1.0, created its database and handled the empty GitHub release feed without crashing. Login, billing and printing inside the installed build still need a workstation acceptance pass; physical printing and scanner behaviour remain unverified.
- Updates: implemented and locally smoke-tested. The download/install path cannot be exercised until the first GitHub Release is published.
- Logo: no client logo asset is present yet. Add it in **Settings → Business**; the saved image is previewed immediately and used by the print engine after a restart.

## Client inputs still required

- Client logo asset (do not redraw or invent it)
- Confirmed GSTIN and tax treatment if tax invoices are to be enabled
- Final return/exchange policy wording
- Real staff names, mobile numbers and role assignments
- Actual catalogue, opening stock, costs and selling prices
- Physical printer models/drivers and paper/label sizes
- CA-confirmed export format, HSN values and tax rates

See `Docs/HARDWARE_VALIDATION.md` and `PROJECT_MEMORY.md` for the current handover state.
