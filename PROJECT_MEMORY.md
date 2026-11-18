# Modern Fashion POS — Project Memory

**Last updated:** 2026-11-18
**Implementation checkpoint:** v1.3.0 public release, code commit `03e5db13`
**Verification record:** v1.3.0 GitHub Release `449970817` published and publicly verified
**Current public release:** 1.3.0 - Vyapar migration, negative stock, user lifecycle, full-width billing terminal, EAN-13 labels and receipt typography.
**Previous public releases:** 1.2.4, 1.2.3, 1.2.2, 1.2.1, 1.2.0 and 1.1.0 - remain available for rollback.
**Unreleased branch work:** label legibility (Code 128-C numeric compression, larger bars, brand/price/barcode text) and faster scanner Enter handling. No new installer built.
**Developer:** Meninges Labs
**Working branch:** `v1.3.0` (package version 1.3.0; public release tag points to `03e5db13`, branch has post-release commits)
**Authoritative scope:** `Docs/PROJECT_CONTEXT.md`
**Visual rules:** `Docs/BRAND_KIT.md`
**Release procedure:** `Docs/RELEASES.md`

## 1. Current state

Version 1 is implemented as an offline-first Windows desktop POS:

- Electron 45.3.3 main process, CommonJS preload, React 18 + Vite 5 renderer, Ant Design 5.
- Local SQLite through the built-in `node:sqlite` `DatabaseSync`; no server, cloud database, API account or internet dependency.
- Business data is local; no demo users, products, customers, sales, purchases or expenses are seeded.
- All money is integer paise. Tax rates are basis points. Business dates are `YYYY-MM-DD` in Asia/Kolkata.
- Sale completion is transactional. Idempotency keys prevent duplicate invoices. Stock is deducted exactly once. Negative stock is legitimate and displayed; overselling is allowed and writes a negative balance to the immutable ledger.
- Weighted-average costing is used. Purchase landed cost updates stock cost. Purchases are not operating expenses.
- Permissions are enforced in main-process services, not only by navigation.
- Backups use `VACUUM INTO`, SQLite integrity check, SHA-256 and a guarded restore with an automatic pre-restore backup.
- Printing uses hidden Electron windows through the installed Windows driver; raw ESC/POS is not assumed.
- Barcodes are generated internally as EAN-13 by default (in-store prefix 20–29), with UPC-A and legacy Code 128 available. The check digit is calculated, existing barcode values are never rewritten, and generated numbers are not GS1-registered retail identifiers. Labels detect the symbology per stored value.
- **Label legibility:** Code 128 uses Code C for long numeric runs, reducing bar count by roughly a third while preserving the scanned value. Labels show the shop name, product name, selling price, MRP, a taller barcode, the human-readable barcode number and colour/size. SKU is shown only on labels 30 mm or taller. A per-variant **UPC-A** action regenerates an existing Code 128 label code after an explicit warning; the old label stops scanning and purchase/invoice history is unchanged.
- **Scanner Enter:** the billing scanner field submits the live DOM value rather than waiting for React state to flush, so a fast keyboard-wedge scan cannot produce a stale "not found" lookup.
- **Vyapar import** (`/vyapar-import`, owner/manager) reads `.vyp` or `.vyb.zip` read-only, checks SQLite integrity, previews counts/warnings, creates a verified backup, and imports products, categories, customers, suppliers, sales, payments, purchases and expenses in one transaction. The source hash blocks duplicate imports. Negative stock, zero prices, invoice numbers, dates, discounts and balances are preserved. Services, estimates, payment-outs, opening balances and zero-amount expenses are reported as skipped.
- **Negative stock** is stored as a real inventory state with a migration that removes the non-negative table constraints. `inventory_balances` and `stock_movements` allow negative balances; sales, corrections, filters, dashboard counts and valuation show the signed value. A correction records previous quantity, new quantity, difference, user, reason and timestamp.
- **User lifecycle** supports owner-only removal and restoration. Removed users are disabled, cannot sign in or start shifts, and remain in **Users & shifts → Removed Users** with role, removal date/actor, invoice count and shift history. Historical invoices keep their cashier. Vyapar legacy cashiers become disabled legacy users, not the importing owner.
- **Sales terminal** (`/pos`) auto-collapses the sidebar, restores the previous preference on exit, uses a full-width customer/invoice header, a spacious scanner-first item table and a fixed summary/action footer. Cash/Credit, customer search, discounts, payment, thermal/A4/PDF save actions and F2/F8 keyboard shortcuts are retained.
- The print layout is owner-editable: logo visibility/size, header fields, receipt sections, notes, terms, paper width and font scale, with a live sample preview that records nothing.
- **Receipt composition:** centred logo/brand/address/GSTIN and invoice title; left-aligned invoice labels with right-aligned values; left-aligned item descriptions with right-aligned qty/rate/amount; left totals labels with right monetary values and a prominent Grand Total; centred exact closing message and powered-by line. Custom footer notes are preserved under the closing message.
- GitHub Releases and `electron-updater` are wired for the installed build. A successful update starts from **Releases**, creates a verified SQLite backup first, and replaces program files only.
- Graphify graph and Ponytail skills are installed in the project. Knowledge graph output is under `graphify-out/`.

## 2. Verified status

| Check | Status |
|---|---|
| `npm test` | **51/51 passing** on the `v1.2.1` development branch (adds Vyapar `.vyp`/`.vyb.zip`, negative stock, user removal/restore, EAN-13/UPC-A, barcode-studio, CSV/Excel import and receipt-alignment coverage) |
| `npm run build` | Passing (one large-chunk warning; acceptable for a local desktop app) |
| `npm run lint` | Passing |
| Packaged NSIS EXE v1.1.0 | Published: `release/ModernFashionPOS-Setup-1.1.0.exe` (128,286,994 bytes) plus blockmap and `latest.yml` |
| Packaged NSIS EXE v1.3.0 | Published GitHub Release `v1.3.0` (ID `449970817`): EXE 123,805,117 bytes, blockmap 130,938 bytes, `latest.yml` 361 bytes; SHA-256 and installer SHA-512 verified |
| Packaged NSIS EXE v1.2.4 | Published GitHub Release `v1.2.4` (ID `449602732`): EXE 123,788,602 bytes, blockmap 130,799 bytes, `latest.yml` 361 bytes; public URLs, SHA-256 and installer SHA-512 verified |
| Packaged NSIS EXE v1.2.0 | Published: GitHub Release `v1.2.0`; local artifact `release-final/ModernFashionPOS-Setup-1.2.0.exe` (122,311,889 bytes); `app.asar` reduced from 46.7 MB to 3.18 MB by excluding Vite-bundled renderer dependencies |
| Packaged 1.2.0 startup | Verified with isolated `MF_DATA_DIR`: main process started, database/folders created, version 1.2.0 logged |
| MF application icon | Multi-resolution `build/icon.ico` generated from the supplied monogram; EXE icon verified by extraction |
| Business logo branding | Automated test verifies configured logo data URL, no local path leak, backup sidecar and restore |
| Auto-update download/install | v1.2.0 is the latest release; published `latest.yml` and public asset URLs verified. The installed 1.1.0 → 1.2.0 update path still needs a workstation test. |
| Installed-build login/sale/print | Not yet exercised on the client workstation |
| Physical printers/scanner | **NOT VERIFIED** |
| GSTIN / tax invoice | Disabled until the client supplies a verified GSTIN |
| Code signing | Not configured; SmartScreen may warn on first install |

Do not upgrade "implemented" to "production-ready" until the hardware checklist passes on the client's actual computer. See `Docs/HARDWARE_VALIDATION.md`.

## 3. Architecture decisions

### Runtime

- ESM main process (`"type": "module"`), CommonJS preload (`electron/preload.cjs`).
- Renderer uses hash routing (`HashRouter`) because the packaged app loads over `file://`.
- Vite `base: './'` is mandatory for packaged assets. Do not change it to `/`.
- `dist/`, `electron/` and `shared/` must be included in the electron-builder `files` list. `shared/` is imported by the main process (`money.js`, `permissions.js`) and is not bundled into the renderer chunk.
- `scripts/dev.mjs` starts Vite then Electron with `MF_DEV_SERVER_URL`.
- `MF_DATA_DIR` / `MF_DB_PATH` isolate test/preview data.

### Branding and identity

- `electron/services/brandingService.js` is the single public branding source (`branding.get`). It returns the shop name, business details and a data URL for the configured logo; it never exposes the local file path.
- The owner manages the logo in **Settings → Business → Logo**. Uploads are decoded with Electron `nativeImage`, resized to a maximum of 1024 px, saved as `assets/store-logo.png`, and included in database backups through a `.assets` sidecar folder. Restore copies the sidecar back and repoints the logo path for the current machine.
- `src/app/BrandMark.jsx` is the shared renderer mark. It shows the business logo in the sidebar, login, setup, dashboard and reports, and falls back to the MF initials when no logo exists.
- The Modern Fashion POS application icon is separate: `build/icon.ico` (multi-resolution PNG ICO) is used by electron-builder, the installer, shortcuts, the Start Menu, the taskbar identity and the BrowserWindow. Changing the business logo never changes this icon.

### Inventory and catalogue

- Products and Inventory are one navigation destination. `/products` redirects to `/inventory`; the Inventory tabs are Products, Stock, Stock history, Categories, Archived, Valuation and Reconciliation.
- Archive means `products.status = 'inactive'`. Archived products leave active stock lists and POS search but remain on historical invoices, movements and reports.
- **Import data** (`/import`, owner/manager only) reads CSV/XLSX/XLS product lists, auto-maps common headers (including Vyapar item exports), previews every row with new/update/skip/error status, creates missing categories/brands, and commits in one transaction. Rows match by barcode, SKU, or product + colour + size. Stock becomes an `opening` movement for new variants and an `adjustment_in`/`adjustment_out` movement for existing ones, under one `IMP/<FY>/<seq>` reference. Re-import is idempotent when stock is set to the same count. Full Vyapar backups are handled by the dedicated `/vyapar-import` workflow.
- Delete is allowed only when the product has no sale, purchase or stock-movement history. Products with history must be archived.
- Stock updates are `add`, `correct` (set the actual counted quantity) and `remove`; every operation writes an immutable `stock_movements` row and an audit entry.

### Data and money

- SQLite schema and migrations live in `electron/core/database.js`; settings defaults and structural category seeds are there too.
- Mutations that affect sales, stock or audit history run inside `transaction()`.
- Sale line cost is captured at sale time, so later cost/price edits do not rewrite history.
- Invoice numbers use a per-financial-year sequence; purchase references use their own sequence.
- Tax is disabled by default. `settings.updateTax` refuses to enable it without a 15-character GSTIN. The app never claims GST return filing.
- Offers: best eligible automatic offer wins; a larger manual discount replaces it. They are not stacked.

### Permissions

| Role | Access |
|---|---|
| Owner | Everything |
| Manager | POS, catalogue, stock, purchases, customers, expenses, sales/profit reports and exports. No staff, settings, backup or audit. |
| Cashier | POS, own invoices, receipt printing, customers. No catalogue edits, stock, costs, expenses, profit, settings, staff or permissions. |

- Cost and profit fields are removed in the service response, not merely hidden in React.
- `settings.getPublic()` requires `settings.manage`.
- `settings.getSnapshot()` is trusted main-process-only and is used by printing; it is **not** mapped to IPC.
- `backup.autoNow` was removed from IPC because scheduled backups already run in `main.js` and a renderer-triggered backup did not need to be exposed.

### Printing

- Receipts, A4 invoices and labels are HTML rendered in a hidden `BrowserWindow` and submitted to a named Windows printer.
- Owner-editable layout lives in **Settings → Print & barcodes**. It controls paper width, logo visibility/height, header fields, receipt section toggles, header/footer notes, terms, closing line and font scale. The live preview is a sample document, not a sale.
- `shared/barcode.js` normalizes the prefix/digit width; `electron/services/catalogService.js` uses it only for newly generated barcodes. Changing the format never rewrites existing product barcode values.
- A successful driver callback means the driver accepted the job, not that paper physically emerged. The UI and docs must keep the `physicalVerification: "unverified"` distinction.
- `print.open` / `print.showFolder` are restricted to app-managed data folders.
- Printer test pages explicitly state that no sale, stock or accounting record is created.

### Releases and updates

- Public update feed: `shaikaakif/ModernFashion-Software` on GitHub Releases. Provider metadata is generated by electron-builder into `resources/app-update.yml`.
- `electron/services/updateService.js` owns status, check, download and install. IPC handlers require `settings.manage`; the renderer cannot bypass the service.
- **Restart & install** calls `backup.createManual` first. If the backup fails, the install does not start.
- Updates are checked about 15 seconds after startup, on the renderer's `online` event, and manually from **Releases**. Development builds report `supported: false` and do not contact GitHub.
- The installer is not code-signed. Do not describe it as signed or trusted-publisher verified until a certificate is configured.
- Never publish a release without explicit owner approval and a scoped `GH_TOKEN`. See `Docs/RELEASES.md`.

## 4. Important files

| Path | Purpose |
|---|---|
| `electron/main.js` | App bootstrap, window, menu, automatic backups, restore relaunch |
| `electron/ipc/registerIpc.js` | Complete IPC action map and trusted file dialogs |
| `electron/core/database.js` | Schema, migrations, structural seeds, transactions |
| `electron/core/inventory.js` | Stock availability and immutable movement ledger |
| `electron/services/saleService.js` | POS bootstrap, totals, idempotent checkout, void, receipt data |
| `electron/services/importService.js` | CSV/XLSX parsing, column mapping, row validation, duplicate matching and transactional product/stock import |
| `electron/services/vyaparService.js` | Read-only Vyapar `.vyp`/`.vyb.zip` inspection, mapping, preview, backup-first transactional import and source-hash duplicate blocking |
| `electron/services/zipReader.js` | Minimal read-only ZIP extractor for Vyapar `.vyb.zip` archives |
| `src/pages/VyaparImportPage.jsx` | Guided Vyapar preview, warnings, import confirmation and restart |
| `src/pages/ImportPage.jsx` | Import workspace: file, mapping, rules, preview and commit |
| `electron/services/reportService.js` | Dashboard, sales/profit/product/tax/purchase/expense/inventory reports |
| `electron/services/settingsService.js` | Settings, offers, logo data, print normalization/preview, trusted print snapshot |
| `electron/services/updateService.js` | GitHub Releases status, check, download and backup-first install |
| `electron/core/logo.js` | Shared logo file reader with 5 MB guard and MIME allow-list |
| `electron/hardware/printService.js` | Printer list, receipt/A4/label/PDF/WhatsApp, sample receipt preview |
| `electron/hardware/documents.js` | Receipt, invoice, label and test HTML honoring print settings |
| `electron/hardware/ean.js` | EAN-13 / UPC-A SVG renderer with check digits, quiet zones and per-value symbology detection |
| `shared/barcode.js` | Barcode prefix/digit validation and formatting shared by main and renderer |
| `src/app/AppShell.jsx` | Permission-aware navigation and routes, update badge and notifications |
| `src/app/SessionContext.jsx` | Session bootstrap, idle lock, login/logout |
| `src/pages/PosPage.jsx` | Barcode-first billing workflow |
| `src/pages/SettingsPage.jsx` | Business, print/barcode configuration and live preview |
| `src/pages/ReleasesPage.jsx` | Owner release status, download, install and safety guidance |
| `src/style/app.css` | Single production stylesheet |
| `tests/` | Critical workflow, money, permission, backup and print tests |
| `Docs/RELEASES.md` | Build, publish, rollback and acceptance procedure |
| `PROJECT_MEMORY.md` | This handover memory |

## 5. Commands

```powershell
npm run dev        # Vite + Electron live preview
npm run build      # production renderer bundle
npm start          # Electron against dist/
npm test           # critical tests
npm run lint
npm run verify     # test + build + lint
npm run dist       # release/ModernFashionPOS-Setup-1.1.0.exe + latest.yml + blockmap
npm run dist:dir   # unpacked build under release/win-unpacked
npm run dist:publish  # build and publish to GitHub Releases (requires approval and GH_TOKEN)
```

Packaging preference: **electron-builder + NSIS EXE**. MSI is intentionally not configured; add it only if the client's IT requires Wi-Fi/WiX deployment.

## 6. Data locations

Default Windows user-data folder (under `%APPDATA%\Modern Fashion POS`):

```text
modern-fashion.db
backups/
documents/
exports/
logs/
assets/
```

`deleteAppDataOnUninstall` is false, so uninstalling does not remove shop data. Backups must still be taken before any restore or workstation change.

## 7. Open client inputs

1. Original MF logo asset. Do not redraw or substitute it. Load through **Settings → Business → Choose logo**; the preview shows it immediately and the owner is prompted to restart.
2. Verified GSTIN, legal name and tax rates if tax invoices are required.
3. Final return/exchange wording (the sample receipt wording is ambiguous).
4. Real staff names, mobile numbers and role assignments.
5. Actual catalogue, variants, opening stock, cost and selling prices.
6. Exact printer model labels, Windows driver names, paper width, label dimensions and scanner suffix behaviour.
7. CA-confirmed HSN values and export format.
8. Whether WhatsApp PDF handoff is acceptable as a manual attach-and-send flow.
9. Scoped `GH_TOKEN` on the build machine for future releases. `v1.2.0` is published; follow `Docs/RELEASES.md` for each new version.
10. Decision on code signing. Without a certificate, SmartScreen will warn on first install.

## 8. Immediate next steps

1. Review the `v1.2.1` development branch diff; run `npm run verify`.
2. Exercise the candidate on the workstation: Vyapar import preview and restart, negative-stock display/correction, removed-user restore, and the full-width New Sale screen at 1920/1440/1366/1280 widths.
3. Build the next installer only after review; do not publish without explicit owner approval. v1.2.4 remains the public release.
4. Deferred master-prompt work: full structured invoice designer and the complete single-folder backup export.

## 9. Session continuation protocol

When starting a new session:

1. Read this file and `Docs/PROJECT_CONTEXT.md`.
2. For codebase questions, run `graphify query "<question>"` before raw search. If the graph is stale, run `graphify update .`.
3. Run `git status --short` and `git log --oneline -5` to see the checkpoint.
4. Run `npm run verify` before changing code so the baseline is known.
5. Keep business data untouched. Never perform destructive data operations without explicit approval.
6. Do not push to the configured remote; it is not the Modern Fashion repository.
7. Update this memory after milestones, and re-run `graphify update .` after code changes.
