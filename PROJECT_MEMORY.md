# Modern Fashion POS — Project Memory

**Last updated:** 2026-11-17
**Developer:** Meninges Labs
**Working branch:** `master` (local only; remote is unrelated and must not be pushed to)
**Authoritative scope:** `Docs/PROJECT_CONTEXT.md`
**Visual rules:** `Docs/BRAND_KIT.md`

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
- Code128 labels are generated internally. Internal barcodes are `MF` + 10 digits; no fabricated EAN/GTIN.
- Graphify graph and Ponytail skills are installed in the project. Knowledge graph output is under `graphify-out/`.

## 2. Verified status

| Check | Status |
|---|---|
| `npm test` | 18/18 passing |
| `npm run build` | Passing (one large-chunk warning; acceptable for a local desktop app) |
| `npm run lint` | Passing |
| Electron development startup | Verified in earlier session |
| Packaged NSIS EXE | Built: `release/ModernFashionPOS-Setup-1.0.0.exe` |
| Packaged renderer startup | Verified: loads `app.asar/dist/index.html` and renders the first-run owner setup screen |
| Installed-build workflow (login, sale, print) | Not yet exercised on the client workstation |
| Physical printers/scanner | **NOT VERIFIED** |
| Client logo | Not supplied; logo slot is implemented |
| GSTIN / tax invoice | Disabled until client supplies a verified GSTIN |

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
- A successful driver callback means the driver accepted the job, not that paper physically emerged. The UI and docs must keep the `physicalVerification: "unverified"` distinction.
- `print.open` / `print.showFolder` are restricted to app-managed data folders.
- Printer test pages explicitly state that no sale, stock or accounting record is created.

## 4. Important files

| Path | Purpose |
|---|---|
| `electron/main.js` | App bootstrap, window, menu, automatic backups, restore relaunch |
| `electron/ipc/registerIpc.js` | Complete IPC action map and trusted file dialogs |
| `electron/core/database.js` | Schema, migrations, structural seeds, transactions |
| `electron/core/inventory.js` | Stock availability and immutable movement ledger |
| `electron/services/saleService.js` | POS bootstrap, totals, idempotent checkout, void, receipt data |
| `electron/services/reportService.js` | Dashboard, sales/profit/product/tax/purchase/expense/inventory reports |
| `electron/services/settingsService.js` | Settings, offers, logo, trusted print snapshot |
| `electron/hardware/printService.js` | Printer list, receipt/A4/label/PDF/WhatsApp |
| `electron/hardware/documents.js` | Receipt, invoice, label and test HTML |
| `src/app/AppShell.jsx` | Permission-aware navigation and routes |
| `src/app/SessionContext.jsx` | Session bootstrap, idle lock, login/logout |
| `src/pages/PosPage.jsx` | Barcode-first billing workflow |
| `src/style/app.css` | Single production stylesheet |
| `tests/` | Critical workflow tests and fixture helpers |
| `PROJECT_MEMORY.md` | This handover memory |

## 5. Commands

```powershell
npm run dev        # Vite + Electron live preview
npm run build      # production renderer bundle
npm start          # Electron against dist/
npm test           # critical tests
npm run lint
npm run verify     # test + build + lint
npm run dist       # release/ModernFashionPOS-Setup-1.0.0.exe
npm run dist:dir   # unpacked build under release/win-unpacked
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

1. Original MF logo asset. Do not redraw or substitute it. Load through **Settings → Business → Choose logo**.
2. Verified GSTIN, legal name and tax rates if tax invoices are required.
3. Final return/exchange wording (the sample receipt wording is ambiguous).
4. Real staff names, mobile numbers and role assignments.
5. Actual catalogue, variants, opening stock, cost and selling prices.
6. Exact printer model labels, Windows driver names, paper width, label dimensions and scanner suffix behaviour.
7. CA-confirmed HSN values and export format.
8. Whether WhatsApp PDF handoff is acceptable as a manual attach-and-send flow.

## 8. Immediate next steps

1. Run `npm run verify` after any code change.
2. Complete a workstation acceptance pass on the installed build: create owner, add a product, make a sale, print, back up, restore a test copy. Then run `graphify update .`.
3. Complete `Docs/HARDWARE_VALIDATION.md` on the client workstation.
4. Update this file after any milestone; never claim hardware verification without physical evidence.

## 9. Session continuation protocol

When starting a new session:

1. Read this file and `Docs/PROJECT_CONTEXT.md`.
2. For codebase questions, run `graphify query "<question>"` before raw search. If the graph is stale, run `graphify update .`.
3. Run `git status --short` and `git log --oneline -5` to see the checkpoint.
4. Run `npm run verify` before changing code so the baseline is known.
5. Keep business data untouched. Never perform destructive data operations without explicit approval.
6. Do not push to the configured remote; it is not the Modern Fashion repository.
7. Update this memory after milestones, and re-run `graphify update .` after code changes.
