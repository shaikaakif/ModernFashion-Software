# Vyapar migration notes

**Status:** `.VYB` restore is **not supported**. The supported route is a Vyapar
item export (Excel/CSV) through **Import data**.

## 1. What a `.VYB` file is

Vyapar desktop backups use the `.VYB` extension. The file is Vyapar's own backup
container, not a spreadsheet, plain SQLite database or a ZIP that can simply be
renamed. Public documentation does not describe the container layout, and
community restore attempts report that it is not a stable public format. Vyapar
itself is the supported restoration tool. Changing a file's extension does not
create a compatible backup.

No `.VYB` sample was available in this project, so the internal container could
not be decoded or verified. Without a verified decoder, Modern Fashion POS does
not attempt to restore the file. A restore that guesses at an encrypted or
undocumented format risks corrupting live shop data, so it is deliberately not
implemented.

## 2. Supported migration route

1. Open Vyapar on the shop computer.
2. Go to **Items** and use **Export to Excel** (or CSV).
3. Save the file. Keep the header row.
4. In Modern Fashion POS open **Import data** (sidebar) or **Inventory → Import products**.
5. Choose the exported file and review the automatic column matching.
6. Check the preview, then import.

The importer recognises common Vyapar columns:

| Vyapar column | Modern Fashion POS field |
|---|---|
| Item Name | Product name |
| Category | Category |
| Brand | Brand |
| Item Code / SKU | SKU |
| Barcode | Barcode |
| Sale Price | Selling price |
| Purchase Price | Purchase cost |
| MRP | MRP |
| Current Stock | Stock |
| GST Rate | GST % |
| HSN / SAC | HSN code |
| Reorder Level | Low-stock level |

These names do not have to match exactly. Any column can be mapped manually in
step 2 of the importer.

## 3. What is not migrated

The item export covers the catalogue and stock. It does **not** migrate:

- old sales and invoices
- purchase bills
- customers
- suppliers
- expenses

Those records remain in Vyapar unless a separate, verified export and importer
is built for each record type.

## 4. Safety rules

- The importer previews every row before writing anything.
- The import runs in one database transaction; a failed commit leaves no partial
  catalogue.
- Existing barcodes and SKUs are matched, not regenerated.
- Stock changes are written to the stock ledger.
- Take a **Back up now** snapshot before a large import.

## 5. If a `.VYB` sample becomes available

Inspect it before promising support:

1. Check the header bytes and whether it is SQLite, ZIP, encrypted or custom.
2. Check whether Vyapar documents the container or provides a supported export
   API.
3. Only then build a preview-first restore workflow with a mandatory backup.

Until that happens, the item export route above is the documented alternative.
