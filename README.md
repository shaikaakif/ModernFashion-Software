# Modern Fashion (Brand Hub) — Retail Demo

A frontend-only, interactive retail ERP demonstration for **Modern Fashion (Brand Hub)**, Attapur, Hyderabad.

All data is sample data. There is no backend, database, API, production authentication, or external service dependency. Demo changes are stored in the browser's `localStorage` and can be reset from the app header or Business settings.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:3000/.

From the repository root you can also run:

```bash
npm run dev
```

### Production build

```bash
cd frontend
npm run build
npm run preview
```

## Modules

- **Dashboard** — today's sales, receivables, low stock and recent activity
- **Products** — catalogue with variants, SKUs, barcodes and pricing
- **Inventory** — stock levels, low-stock filter, adjustments and movement history
- **Purchases** — supplier receipts that increase stock
- **Invoices** — sales that reduce stock, printable invoices, PDF and WhatsApp share
- **Customers** — profiles, purchase history and lifetime value
- **Barcode** — scanner simulation, Code 128 preview and label printing
- **Business settings** — editable business profile and demo tax rate

## Sample data

34 products, 330 variants, 12 customers, 5 suppliers, 15 invoices, 10 purchases and 46 stock movements. The seed is deterministic and regenerated when demo data is reset.

## Tech stack

React 18, Vite 5, Ant Design 5, React Router 6, Redux Toolkit, React Redux and JsBarcode.

## Notes

- The business details shown are the supplied details for Modern Fashion (Brand Hub). No GSTIN, email address or owner name is invented.
- Invoices use a clearly labelled demo tax rate (default 5%).
- Barcodes are internal demo identifiers, not manufacturer barcodes.
- WhatsApp sharing only opens a prefilled chat; it never sends automatically.
- The repository is a cleaned, frontend-only derivative of IDURAR ERP/CRM. See `LICENSE`.
