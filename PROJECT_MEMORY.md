# Modern Fashion POS — Project Memory

**Last updated:** 2026-11-17
**Implementation checkpoint:** `593c1571` — Add print customization, logo preview and safe GitHub updates (pushed to `main`)
**Verification record:** `97d6d259` — packaging verification checkpoint
**Current release:** 1.1.0 — print/barcode customization, logo preview, GitHub Releases and safe auto-update. Published as GitHub Release `v1.1.0` with the EXE, blockmap and `latest.yml`.
**Developer:** Meninges Labs
**Working branch:** `main` (tracks `origin/main` at `shaikaakif/ModernFashion-Software`)
**Authoritative scope:** `Docs/PROJECT_CONTEXT.md`
**Visual rules:** `Docs/BRAND_KIT.md`
**Release procedure:** `Docs/RELEASES.md`

## 1. Current state

Version 1 is implemented as an offline-first Windows desktop POS:

- Electron 45.3.3 main process, CommonJS preload, React 18 + Vite 5 renderer, Ant Design 5.
- Local SQLite through the built-in `node:sqlite` `DatabaseSync`; no server, cloud database, API account or internet dependency.
- Business data is local; no demo users, products, customers, sales, purchases or expenses are seeded.
- All money is integer paise. Tax rates are basis points. Business dates are `YYYY-MM-DD` in Asia/Kolkata.
- Sale completion is transactional. Idempotency keys prevent duplicate invoices. Stock is deducted exactly once. Negative stock is rejected.
- Weighted-average costing is used. Purchase landed cost updates stock cost. Purchases are not operating expenses.
- Permissions are enforced in main-process services, not only by navigation.
- Backups use `VACUUM INTO`, SQLite integrity check, SHA-256 and a guarded restore with an automatic pre-restore backup.
- Printing uses hidden Electron windows through the installed Windows driver; raw ESC/POS is not assumed.
- Code128 labels are generated internally. New barcodes use the owner-configured prefix and digit width (default `MF` + 10 digits); existing barcodes are never rewritten. No fabricated EAN/GTIN.
- The print layout is owner-editable: logo visibility/size, header fields, receipt sections, notes, terms, paper width and font scale, with a live sample preview that records nothing.
- GitHub Releases and `electron-updater` are wired for the installed build. A successful update starts from **Releases**, creates a verified SQLite backup first, and replaces program files only.
- Graphify graph and Ponytail skills are installed in the project. Knowledge graph output is under `graphify-out/`.

## 2. Verified status

| Check | Status |
|---|---|
| `npm test` | 22/22 passing |
| `npm run build` | Passing (one large-chunk warning; acceptable for a local desktop app) |
| `npm run lint` | Passing |
| Electron development startup | Verified in earlier session |
| Packaged NSIS EXE | Built and published: `release/ModernFashionPOS-Setup-1.1.0.exe` (128,286,994 bytes) plus blockmap and `latest.yml` |
| Packaged 1.1.0 startup | Verified with isolated `MF_DATA_DIR`: main process started, database and folders created, and the published GitHub feed was read without error |
| Auto-update check | Works: the packaged app reads the public `v1.1.0` release feed; public asset downloads return HTTP 200 |
| Auto-update download/install | **Not yet exercised end-to-end.** Needs a test PC on 1.0.0 → check → download → backup → install → reopen. |
| Graphify | Refreshed to 1,007 nodes, 2,955 edges, 55 communities |
| Installed-build workflow (login, sale, print) | Not yet exercised on the client workstation |
| Physical printers/scanner | **NOT VERIFIED** |
| Client logo | Not supplied; owner can now choose, preview and remove it |
| GSTIN / tax invoice | Disabled until client supplies a verified GSTIN |
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
| `electron/services/reportService.js` | Dashboard, sales/profit/product/tax/purchase/expense/inventory reports |
| `electron/services/settingsService.js` | Settings, offers, logo data, print normalization/preview, trusted print snapshot |
| `electron/services/updateService.js` | GitHub Releases status, check, download and backup-first install |
| `electron/core/logo.js` | Shared logo file reader with 5 MB guard and MIME allow-list |
| `electron/hardware/printService.js` | Printer list, receipt/A4/label/PDF/WhatsApp, sample receipt preview |
| `electron/hardware/documents.js` | Receipt, invoice, label and test HTML honoring print settings |
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
9. Scoped `GH_TOKEN` on the build machine for future releases. `v1.1.0` is already published; follow `Docs/RELEASES.md` for each new version.
10. Decision on code signing. Without a certificate, SmartScreen will warn on first install.

## 8. Immediate next steps

1. Run `npm run verify` after any code change.
2. Exercise the published update path on a test PC: install 1.0.0, open the app, check **Releases**, download `v1.1.0`, confirm the pre-update backup, install, reopen and verify that products, sales, customers, settings and the logo are unchanged.
3. Complete a workstation acceptance pass on the installed build: create owner, add a product, make a sale, preview/save print settings, print, back up, restore a test copy. Then run `graphify update .`.
4. Complete `Docs/HARDWARE_VALIDATION.md` on the client workstation.
5. Update this file after any milestone; never claim hardware or update acceptance without evidence.

## 9. Session continuation protocol

When starting a new session:

1. Read this file and `Docs/PROJECT_CONTEXT.md`.
2. For codebase questions, run `graphify query "<question>"` before raw search. If the graph is stale, run `graphify update .`.
3. Run `git status --short` and `git log --oneline -5` to see the checkpoint.
4. Run `npm run verify` before changing code so the baseline is known.
5. Keep business data untouched. Never perform destructive data operations without explicit approval.
6. Do not push to the configured remote; it is not the Modern Fashion repository.
7. Update this memory after milestones, and re-run `graphify update .` after code changes.
