# Hardware Validation Checklist

**Status: NOT VERIFIED.** The application can submit jobs to a Windows printer driver, but no physical output has been tested on the client's devices. Do not describe printing as "working", "verified" or "compatible" until every relevant item below passes on the client's workstation.

## Reported devices

| Device | Reported model | Notes |
|---|---|---|
| Receipt printer | TVS RP32 "Double Zero Star" | Spoken/typed model may be approximate. Confirm from the label, Windows printer name and driver. |
| Label printer | TVS LP 46 NEO | Confirm USB/LAN, driver, label size and language. |
| Scanner | Wired USB barcode scanner | HID keyboard-wedge assumed, not yet confirmed. |

Do not assume ESC/POS compatibility for either printer. The app currently prints HTML through the installed Windows driver, which is the safest driver-level baseline. Raw ESC/POS can be added only after identifying each printer's command set and testing it.

## 1. Windows printer setup

- [ ] Connect the receipt printer, install the vendor Windows driver, print the Windows test page.
- [ ] Record the exact Windows printer name and driver version.
- [ ] Connect the label printer, install its driver, print the Windows test page.
- [ ] Record the exact Windows printer name and driver version.
- [ ] Confirm paper width: 58 mm or 80 mm for receipts.
- [ ] Measure the actual label: width and height in mm, gap and orientation.
- [ ] Confirm auto-cut support and whether it is enabled in the driver.
- [ ] Confirm the printers appear in **Settings → Hardware** printer list.
- [ ] Assign the receipt printer and label printer, then save.

## 2. Receipt printing

- [ ] **Settings → Print & barcodes** saves paper width, layout, header/footer text and font scale.
- [ ] The live sample receipt shows the same layout as the printed receipt.
- [ ] **Settings → Hardware → Test receipt** produces readable text.
- [ ] Header, address, phone and invoice title match the enabled header toggles.
- [ ] Header, business details, customer details, invoice details, terms and footer are left-aligned.
- [ ] Item descriptions are left-aligned; quantity/rate/amount and totals values are right-aligned for readability.
- [ ] Section spacing is comfortable, not cramped; totals are clearly separated from item rows.
- [ ] Logo appears at the configured height after choosing the client logo and restarting the application.
- [ ] Hiding the logo, title, address, phone, state, GSTIN or any receipt section really removes it from the print.
- [ ] Item rows, quantity, price and totals align.
- [ ] Long product names wrap without clipping.
- [ ] Round-off, total, amount received and change are legible.
- [ ] Terms, header note and footer note print inside the paper width.
- [ ] Auto-cut (if supported) cuts after the receipt, not through content.
- [ ] Reprints are labelled as duplicate copies.
- [ ] A job submitted while the printer is offline fails visibly and does not create a second sale or stock movement.
- [ ] The UI does not claim "printed" when the driver only accepted the job. Physical paper must be checked.

## 3. A4 invoice / PDF

- [ ] **Print A4 invoice** prints on the default A4 printer with no clipped columns.
- [ ] Save PDF from a completed sale; open the PDF and inspect every page.
- [ ] WhatsApp handoff copies the PDF path, opens the folder and opens WhatsApp; the user attaches the PDF manually.
- [ ] No message claims the invoice was sent automatically.

## 4. Negative stock and billing workspace

- [ ] Import a product with negative stock; inventory shows `-5 Pcs`, not zero.
- [ ] Filter **Negative stock**; only negative variants appear.
- [ ] Correct a negative item to a positive physical count; movement records old, new and difference.
- [ ] Sell more than available stock; sale succeeds, stock becomes negative, invoice and ledger remain correct.
- [ ] Dashboard and valuation show negative values without clamping.
- [ ] Entering **New Sale** collapses the sidebar; leaving restores the previous preference.
- [ ] Expanding the sidebar manually inside New Sale does not overwrite the saved preference.
- [ ] Barcode scanner, F2, Enter and F8 work with the full-width table.
- [ ] 1920×1080, 1440×900, 1366×768 and 1280×800 show no page-level horizontal overflow and keep Save/Print visible.

## 5. Barcode labels
- [ ] **Settings → Print & barcodes** shows a valid EAN-13 preview for the chosen in-store prefix.
- [ ] A newly created product uses the configured symbology and in-store prefix; the check digit is valid.
- [ ] Existing product barcodes are unchanged after the format is edited; legacy Code 128 labels still print.
- [ ] **Settings → Hardware → Test label** prints on the correct label stock.
- [ ] Label width/height in settings match the physical stock.
- [ ] Barcode has a clear quiet zone, is sharp, complete and scannable.
- [ ] Product name, MRP/selling price, colour/size and SKU fit without overlap.
- [ ] Test a short name and a two-line long name at 50 × 25 mm and at 20–25 mm roll height.
- [ ] Printing 1, 5 and 20 labels produces the right count without drift.
- [ ] The label barcode matches the variant's stored barcode exactly; do not claim GS1 registration for generated numbers.

## 6. Scanner

- [ ] Scan a known internal barcode into a new sale; the exact variant is added.
- [ ] Scan the same barcode again; quantity increments instead of adding a duplicate line.
- [ ] Scan while the search field or quantity field is focused; behaviour is predictable.
- [ ] Unknown barcode shows a non-blocking error and does not add an item.
- [ ] Scanner suffix (Enter/Tab/none) is tested and configured in **Settings → Billing & security**.
- [ ] Rapid repeated scans do not double-submit a sale.
- [ ] Test all variants of one style; each colour/size has its own barcode.

## 7. Failure and recovery

- [ ] Print with the printer powered off; the UI reports a driver failure.
- [ ] Reconnect and reprint the same invoice; stock and sales totals are unchanged.
- [ ] Close the app during an idle sale; reopening does not create a phantom invoice.
- [ ] Complete a sale, then verify the receipt, sale record, stock balance and movement ledger all agree.
- [ ] Void the sale as owner/manager; stock returns exactly once.
- [ ] Create a backup, verify it, restore it on a test database, and confirm data integrity.
- [ ] Restore the live database and confirm the app relaunches once without data loss.

## Sign-off

| Check | Tester | Date | Result / evidence |
|---|---|---|---|
| Receipt printer | | | |
| Label printer | | | |
| Print layout & barcode format | | | |
| Scanner | | | |
| A4/PDF | | | |
| Failure recovery | | | |
| Backup/restore on client PC | | | |

Record the exact Windows printer names, driver versions, paper/label sizes and any workaround in `PROJECT_MEMORY.md` after testing.
