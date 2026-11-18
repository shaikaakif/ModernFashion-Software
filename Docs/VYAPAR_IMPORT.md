# Vyapar backup import

**Status:** supported for direct `.vyp` SQLite databases and `.vyb.zip` archives.
Available at **Settings → Storage → Import from Vyapar** and **Import data → Open Vyapar import**.

## 1. Source verification

The importer copies the chosen backup to temporary storage, computes SHA-256,
opens the copy read-only and runs `PRAGMA integrity_check`. The original file is
never modified. Required tables are checked before any preview is shown.

Verified source counts from the supplied backup:

| Item | Count |
|---|---:|
| Products | 895 |
| Services | 33 |
| Sales | 5,746 (5,742 usable) |
| Sale lines | 13,126 |
| Customers imported | 2,542 |
| Suppliers | 11 |
| Purchases | 3 |
| Expenses | 7 (6 non-zero) |
| Opening-stock adjustments | 843 |
| Estimates / quotations | 48 |
| Negative-stock products | 112 |
| Zero-price products | 13 (46 zero-price records include 33 services) |

## 2. Field mapping

### Products

| Vyapar | Modern Fashion POS |
|---|---|
| `kb_items.item_name` | Product name |
| `kb_items.item_code` | SKU; barcode when usable |
| `item_sale_unit_price` | Selling price |
| `item_purchase_unit_price` | Cost |
| `item_mrp` | MRP when valid, else 0 |
| `item_stock_quantity` | Exact current stock (negative allowed) |
| `item_min_stock_quantity` | Low-stock threshold |
| `item_hsn_sac_code` | HSN |
| `item_description` | Description |
| Category mapping | Category; missing → Other |
| `item_type = 2` | Skipped service |

One item becomes one product with one `Default / Free` variant. Short or blank
item codes receive a generated internal EAN-13 barcode. Existing item codes are
preserved as SKUs and barcodes where they are long enough to scan.

### Parties

| Vyapar | POS |
|---|---|
| `kb_names.full_name` | Customer or supplier name |
| `phone_number` | Phone; normalised to 10 digits |
| `party_billing_name` | Billing name |
| `address` | Address |
| `name_gstin_number` | GSTIN when present |
| Purchase/payment-out party | Supplier |

- Names with no valid phone keep their invoice name but are not created as
  customer records.
- Duplicate phones are merged into one customer; alternate names are reported.
- Customers and suppliers are separate records when a party is used for both.

### Sales

| Vyapar | POS |
|---|---|
| `txn_ref_number_char` | Invoice number |
| `txn_date` + `txn_time` | Sale date/time (Asia/Kolkata) |
| `txn_name_id` | Customer |
| `txn_cash_amount` | Amount paid |
| `txn_balance_amount` | Balance due |
| `txn_discount_amount` | Bill discount |
| `txn_round_off_amount` | Round-off |
| `txn_payment_status` 1/2/3 | unpaid / partial / paid |
| `txn_payment_mapping` | Payment method |
| `lineitems` | Sale items, quantities, prices, discounts, MRP |

Payment methods: Cash → cash, Paytm/IDBI/UPI → UPI, Cheque → bank transfer.
Line and bill discounts are preserved. Stored Vyapar totals are used; any
line-total mismatch is reported.

### Stock

The importer writes the **exact current stock** as a single opening movement per
item. This is required because Vyapar permits negative stock and replaying every
old sale would break on those negative items. Historical sales stay as invoice
records; the stock ledger starts at the migration snapshot.

Negative stock is not clamped. Zero prices are not changed. Zero-cost items keep
cost ₹0.

### Historical cashier

Four disabled legacy users are created from `urp_users` (`Admin`, `MOHI UDDIN`,
`ANSAR`, `AYATH ULLAH`) with internal mobile IDs `VYP-LEGACY-*`. They cannot log
in, but historical invoices keep their original cashier attribution. The
original cashier name is also written into each imported sale note.

## 3. Transaction types

| `txn_type` | Meaning | Action |
|---:|---|---|
| 1 | Sale | Import |
| 2 | Purchase | Import |
| 4 | Payment Out | Skip; reported |
| 5/6 | Party opening balance | Skip; reported |
| 7 | Expense | Import non-zero |
| 24 | Cancelled/credit-note-type record | Skip; reported |
| 65 | Estimate / quotation | Skip; never treated as a sale |

## 4. Safety

1. Copy source to temporary storage.
2. SHA-256 + read-only open + integrity check.
3. Build a preview with counts and warnings.
4. Create a verified Modern Fashion POS backup. If it fails, import is blocked.
5. Import through one database transaction.
6. Roll back on any failure.
7. Record source hash in settings and audit the import.
8. Refuse to import the same source hash twice unless explicitly confirmed.
9. Remove the temporary copy after success.

Existing products are matched by barcode/SKU; customers by phone; invoices by
invoice number. Default behaviour is **skip**, never overwrite. The original
Vyapar backup is never written to.

## 5. Not imported

- Services
- Estimates / quotations
- Standalone payment-outs
- Party opening balances
- Credit-note/cancelled record
- Sales with no line items
- Zero-amount expenses
- Per-invoice Vyapar terms (global POS terms are used; invoice notes are kept)

## 6. Negative stock

The inventory schema and ledger now allow negative quantities. The UI displays
`+25 Pcs`, `0 Pcs` and `-5 Pcs`, offers a Negative stock filter and records a
correction movement with the previous quantity, new quantity, difference, reason,
user and timestamp.
