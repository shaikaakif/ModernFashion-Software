# Modern Fashion --- Production POS Project Context

**Document purpose:** Authoritative project brief for OpenCode and the
engineering agent.\
**Client:** Modern Fashion (MF)\
**Developer:** Meninges Labs\
**Project type:** Single-counter, offline-first Windows retail POS and
business-management application\
**Target workstation:** One Windows 10 computer\
**Delivery target:** Three focused development days, with a one-week
commitment window communicated to the client\
**Status:** Version 1 implementation complete in code; physical hardware
models have been supplied but must be verified against the physical
devices and installed drivers. See `Docs/HARDWARE_VALIDATION.md` and
`PROJECT_MEMORY.md` for the current verified state. Do not describe
hardware or statutory tax handling as verified before those checks pass.

------------------------------------------------------------------------

## 1. Mission and outcome

Build a dependable, professional retail POS for Modern Fashion. It must
support day-to-day clothing-store operations on one Windows computer and
continue working without an internet connection.

The system is not a demo. Remove placeholder/demo records from the
operational database and deliver real workflows backed by a persistent
local database. Do not describe the result as production-ready until the
acceptance tests in this document have passed on the client's actual
computer and printers.

The primary cashier workflow must be fast:

1.  Cashier signs in.
2.  Opens a new sale.
3.  Scans a product barcode using the wired scanner.
4.  The matching product variant is added to the cart automatically.
5.  Scanning the same barcode again increments its quantity.
6.  Applicable offers/discounts are calculated.
7.  An authorised user can apply permitted manual adjustments.
8.  Cashier selects payment method and completes the sale.
9.  Sale is committed once, stock is reduced once, and the receipt is
    sent to the assigned thermal receipt printer.
10. The transaction remains available for reports, cashier totals,
    returns/voids and reprinting according to permissions.

The application must be usable with no internet. Do not make
authentication, billing, stock, printing, reports or database access
depend on a cloud service.

## 2. Client identity and details

Use the following details as supplied by the client and visible on the
provided sample receipt:

-   Business name: **MODERN FASHION**
-   Logo: client-supplied MF logo; use the original asset, do not invent
    or redraw it.
-   Address lines as printed:
    -   `13-431/C/48`
    -   `MOGHAL KA NALA`
    -   `PILLAR NO 101 ATTAPUR RING ROAD`
    -   `HYD 48`
-   State: `36 - Telangana`
-   Phone: `7093230999`
-   Return/exchange statement shown on sample:
    `NO RETURN / EXCHANGE WITHIN 3 DAY` (the wording is
    ambiguous/grammatically unusual; preserve only after client confirms
    exact intended policy text).
-   Receipt heading shown: `Tax Invoice`.

Do not invent a GSTIN, email address, legal entity name, tax
registration, HSN/SAC values, tax rates, bank details or payment QR
details. Capture missing statutory/business information from the client
before enabling tax invoice claims. Make store details editable in owner
settings.

### Supplied printer hardware (verify exact labels)

-   Barcode/label printer: **TVS LP 46 NEO**
-   Receipt/bill printer: user reports **TVS RP32 Double Zero Star**.
    This model string may be a spoken/typed approximation. Inspect the
    printer label, Windows printer name, driver and manual before
    selecting a protocol or assuming ESC/POS compatibility.
-   Barcode scanner: wired scanner; exact make/model and configuration
    not yet supplied.

Do not assume both printers use the same command language. Identify each
printer independently. Verify connection type (USB/LAN), installed
driver, paper/label dimensions, print density, cutter support, supported
printer language and status reporting.

## 3. Evidence from the client's sample receipt

The supplied physical receipt is the visual reference for the new
receipt design. It shows:

-   MF logo and Modern Fashion store header.
-   Address, Telangana state code and phone number.
-   Return/exchange policy statement.
-   `Tax Invoice` heading.
-   Customer name and phone.
-   Date and invoice number.
-   Item name, quantity, unit price and amount.
-   Per-item discount percentage and discount amount.
-   Per-item final amount after discount.
-   Total quantity.
-   Round-off.
-   Final total.
-   Amount received and balance.
-   `You Saved` aggregate discount/savings line.
-   Terms & Conditions and thank-you message.

The photographed example includes sample transaction values and a
customer phone number. These are reference-only. **Never seed them as
real customer or sales data.** The sample receipt's transaction
date/number/items must not be treated as current live records.

Create a configurable receipt template that can reproduce the structure
while improving spacing, alignment, legibility and consistency. The
receipt must be generated from the saved transaction, not from hardcoded
text.

## 4. Scope and modules

Build a coherent application with shared domain logic, permissions,
database records and audit history. Avoid disconnected screens that only
look functional.

### 4.1 Dashboard

Owner/manager dashboard should show date-filtered and clearly defined
figures:

-   Gross sales
-   Discounts
-   Net sales
-   Returns/refunds
-   Cost of goods sold (only when purchase cost data is reliable)
-   Gross profit (only when cost basis is valid)
-   Operating expenses
-   Net operating result, with an explicit calculation definition
-   Number of invoices
-   Average bill value
-   Low-stock alerts
-   Top-selling products
-   Cashier-wise sales totals

Do not label revenue as profit. Do not calculate profit from selling
price alone. Explain and document the cost basis used (prefer weighted
average or another deliberately selected method, consistently applied).
Exclude unpaid/voided transactions as appropriate and document treatment
of returns, taxes, discounts and round-off.

### 4.2 Products and variants

Product master data describes what the store sells:

-   Product name and description
-   Category/brand (if used)
-   Product code/SKU
-   Barcode mapping
-   Cost price and selling price
-   Tax classification/rate only when confirmed
-   Active/inactive state
-   Variant dimensions such as size and colour
-   Optional supplier and product image

A clothing style can have multiple variants. Each independently
stock-tracked variant should have a unique internal SKU and barcode. Do
not assume the style-level barcode identifies every size/colour.

### 4.3 Inventory

Inventory answers **how many units of each product variant are available
and where they went**. It is not the same as the product catalogue.

Include:

-   Current on-hand stock by variant
-   Stock movement ledger
-   Opening stock
-   Purchase/stock receipt
-   Sale deduction
-   Customer return/restock
-   Damaged/expired/lost stock adjustment
-   Manual correction with mandatory reason and authorised user
-   Reorder/low-stock threshold
-   Stock count/reconciliation
-   Stock valuation only where cost data is trustworthy

Never silently overwrite quantity. Every stock change must create an
immutable movement record linked to its source transaction or
adjustment. Negative stock is a legitimate state: preserve and display it,
allow correction by physical count, and show it distinctly in filters and
reports. Do not clamp negative quantities to zero.

### 4.4 Barcode-driven billing / POS

This is the highest-priority module.

-   Keep the barcode scan input continuously ready/focused during an
    active sale.
-   Support keyboard-wedge USB HID scanners: scanner characters arrive
    as keyboard input, commonly followed by Enter. Make suffix behaviour
    configurable after testing.
-   Resolve scanned barcode to the exact product variant.
-   Add it automatically to cart; repeated scan increments quantity.
-   Unknown barcode: show a clear non-blocking error; do not add an
    arbitrary item.
-   Display item, variant, quantity, unit price, discount, line total
    and stock.
-   Support product search/manual selection as fallback.
-   Support quantity edits, line removal and cart clearing with
    confirmation where appropriate.
-   Show subtotal, item discounts, bill discount, tax (only when
    configured), round-off, amount payable, amount received and
    balance/change.
-   Support payment methods such as cash and UPI/card as payment
    records; do not claim to verify digital payment unless a real
    integration exists.
-   Save sale, payment and stock movements in one database transaction.
-   Protect against double submission and duplicate invoices.
-   Provide receipt preview, print, reprint and print-failure recovery.
-   Record cashier ID on every sale.
-   No cashier can alter product master data, inventory, tax settings,
    reports, expenses or permissions unless explicitly authorised.

### 4.5 Discounts and offers

Support configurable rules:

-   Percentage discount
-   Fixed-amount discount
-   Product/variant discount
-   Category discount
-   Quantity-based offer
-   Bill-value threshold offer
-   Start/end date
-   Minimum quantity/value
-   Maximum discount cap
-   Priority and stacking/exclusivity rules
-   Enable/disable state

Show which rule caused each discount. Define deterministic precedence
when multiple rules match. Never apply two incompatible offers
accidentally. Manual discounts and price overrides must be
permission-controlled, have a reason where appropriate, and be recorded
in the audit log. Preserve original price, discount and final price on
the invoice.

### 4.6 Purchases and suppliers

-   Supplier master
-   Purchase entry and purchase invoice reference
-   Item/variant quantities, cost and confirmed taxes
-   Payment status and amount paid/balance
-   Purchase receipt posts stock movements
-   Purchase return and supplier credit/debit records as required
-   Purchase-related transport/other charges must be distinguishable
    from operating expenses and included in inventory cost only under an
    explicitly chosen accounting policy.

Do not count a purchase payment and its purchase invoice as two separate
expenses in profit reporting. Purchases of stock affect inventory/COGS
accounting; they are not automatically equivalent to operating expenses.

### 4.7 Expenses

Create a dedicated business-expense module for non-inventory operating
costs, for example:

-   Staff salaries
-   Rent
-   Electricity
-   Internet/telephone
-   Repairs and maintenance
-   Travel/delivery
-   Packaging/stationery
-   Other approved business expenses

Each entry should include date, category, amount, description, payment
method/account, reference/attachment if supported, created-by user and
optional approval. Support recurring salary entries as controlled
monthly records, not silently generated duplicates.

**Important accounting distinction:** inventory purchases,
purchase-related landed costs, operating expenses, owner
investment/capital introduced, loan proceeds, loan principal repayment
and interest are different transaction types. Do not put all cash
outflows into one undifferentiated "expense" total. Owner investment is
not an expense; loan principal is not an operating expense. Keep
categories distinct so reports are meaningful.

### 4.8 Cashier and worker access

There are three people accessing the system. Build named user accounts
rather than a shared generic login.

Roles:

-   **Owner/Admin:** full access, user management, configuration,
    financial reports, tax/export settings, adjustments and audit logs.
-   **Manager (if client confirms):** configurable limited management
    permissions.
-   **Cashier/Worker:** sign in, scan/search products, view permitted
    availability/price, create sales, accept/record payment,
    print/reprint only as permitted, view own shift/sales summary.

Worker login concept requested by client: - Worker enters mobile number
and a simple memorable password/PIN. - Mobile number must be registered
by an owner/admin first. - Do not use mobile number alone as
authentication. - Store passwords using a modern password hash; never
store plaintext passwords. - Apply rate limiting/lockout and an
owner-controlled reset process. - Do not expose owner reports, cost
price, inventory adjustments, product editing, tax settings or expenses
to workers. - Every transaction records the authenticated cashier
identity. - Provide cashier-wise invoice count and sales totals, with
date/shift filters. - Provide logout, session lock and audit trail.

Because this is one local computer, explain that local accounts are not
a substitute for Windows account security and physical access control.

### 4.9 GST / accounting exports

Client wants month-wise GST-related reports in Excel format to send to
their Chartered Accountant.

Implement this as **accounting data preparation and export**, not as
automatic GST filing or a guarantee of statutory compliance.

-   Month and financial-year filters.
-   Sales invoice register.
-   Sales return/credit note register if applicable.
-   Purchase register.
-   Taxable value and tax breakup by rate/type only when valid tax
    configuration and required invoice data exist.
-   HSN summary only when HSN data is supplied/validated.
-   Export .xlsx with clear sheet names, totals, date range, generated
    timestamp and source record references.
-   Include validation warnings for missing GSTIN, HSN, tax
    classification, place of supply or other required data.
-   Reconcile export totals to the underlying invoice/purchase
    registers.
-   Make report format configurable to the CA's required template.

Do not invent GST rates or legal rules. Do not label an export as a
filed return. Have the client's CA validate the required format and tax
treatment before production use.

### 4.10 WhatsApp invoice sharing

Client wants a PDF invoice to be shared through WhatsApp.

Implement an honest semi-automated workflow: 1. Generate invoice PDF
locally from the saved invoice. 2. Save it to a predictable local
export/download location and offer an explicit Open/Share action. 3.
Open WhatsApp Web/Desktop or a supported share flow with a prefilled
message and customer number, if available. 4. User attaches/selects the
generated PDF and presses Send.

Do not claim a normal `wa.me` link can automatically attach a local PDF
or send a message. Do not automate WhatsApp UI in a brittle or
policy-violating way. Fully automatic document sending requires an
approved WhatsApp Business Platform integration, internet and business
setup; it is outside the offline-first core.

### 4.11 Thermal receipt printing

Receipt printer reported as TVS **RP32 Double Zero Star** (exact model
string must be verified from physical label/driver; do not silently
assume). Requirements:

-   Branded receipt using original MF logo asset.
-   Configurable paper width (determine actual supported width).
-   Receipt fields matching the supplied sample structure.
-   Item-level discount and final amount.
-   Subtotal, total quantity, round-off, final total, received, balance
    and total savings.
-   Customer details where supplied.
-   Configurable terms/return policy.
-   Reprint and duplicate-copy marking.
-   Test print and print-job status/failure handling.
-   Avoid duplicate sale creation when retrying a print job.

Thermal logo should be converted to a suitable monochrome raster or use
printer-stored logo only if the verified printer supports it. Confirm
printer driver, interface, paper width, cutter and command language
before using direct commands.

### 4.12 Barcode label printing

Label printer reported as **TVS LP 46 NEO**. Verify actual label size,
DPI, driver, connection and supported printer language.

-   Generate internal SKU/barcode IDs; never invent registered EAN/GTIN
    identifiers. Internally generated EAN-13/UPC-A numbers use the GS1
    restricted-circulation range (prefix 20–29) and are not GS1-registered.
-   Generate EAN-13 by default, with UPC-A and legacy Code 128 available;
    calculate and validate the check digit.
-   Never rewrite existing stored barcode values when the format changes.
-   Print product name, variant/size, selling price and barcode as
    configured.
-   Support label dimensions, margins, gap/black-mark calibration,
    copies and test label.
-   Allow reprint by product/variant.
-   Ensure barcode printed is exactly the barcode stored against the
    variant.

### 4.13 Settings, backup and audit

-   Store identity and receipt configuration.
-   Printer assignments and test-print actions.
-   Barcode/label settings.
-   Discount policies.
-   Tax settings controlled by owner and validated with CA.
-   User and role management.
-   Database backup/restore with clear confirmation and verification.
-   Export data to CSV/XLSX where appropriate.
-   Audit log for sensitive actions: discounts, price overrides, stock
    changes, voids, returns, expense edits, user changes, settings and
    backups.

Offline backups must be copied to a separate drive or other chosen safe
location. A backup stored only beside the live database is not
sufficient.

## 5. Product vs inventory --- domain distinction

-   **Products:** catalogue/master data --- what an item is, its SKU,
    barcode, size, colour, selling price, cost and category.
-   **Inventory:** quantity and movement --- how many units of each
    variant are available, received, sold, returned, damaged or
    adjusted.

A product can exist with zero stock. Stock movements change inventory;
editing a product name does not.

## 6. Architecture principles

The final stack must be selected after repository and hardware
inspection. Do not assume a stack solely because it was used in an
earlier demo.

Required architectural properties:

-   Windows desktop application suitable for one shop computer.
-   Fully local operation for all core workflows.
-   Embedded/local database (SQLite is a strong candidate for this
    single-computer scope).
-   Transactional writes for sale + payment + stock movement.
-   Local hardware integration layer for Windows printers/scanner.
-   Clear separation between UI, domain/business rules, persistence,
    reporting and hardware adapters.
-   Versioned database migrations.
-   Local authentication and role-based authorisation.
-   No required cloud API, remote database, online licence check or
    internet-dependent login.
-   Optional internet functions must fail gracefully without affecting
    core POS.
-   Secrets must not be committed.
-   Structured logs with sensitive data minimised.
-   Tested database backup/restore.
-   Idempotent sale completion and print retry.

A browser-only web app is not sufficient for reliable printer
enumeration, silent printing and low-level hardware control. Evaluate a
Windows desktop shell (e.g. Electron or .NET) plus a local hardware
adapter. Do not choose Electron or .NET until inspecting the existing
repository, developer capability, printer driver support and packaging
needs.

### Hardware integration constraints

-   USB HID barcode scanners commonly act like keyboards; verify the
    actual scanner and suffix behaviour.
-   Windows printer drivers should be tested first.
-   Receipt and label printers are separate devices and may use
    different protocols.
-   Do not assume ESC/POS, TSPL or ZPL compatibility without
    model/driver documentation or a physical test.
-   Print queue status must distinguish "job submitted to Windows" from
    "paper physically printed"; do not claim physical success if the
    driver cannot confirm it.
-   Do not allow a print failure to create another sale.

## 7. Data integrity and security rules

Non-negotiable:

-   No fake live business records. Remove seeded demo
    products/customers/sales from the operational database.
-   Development/test fixtures must be isolated from production data and
    clearly labelled.
-   Never use the photographed sample customer's phone or sample sale as
    a live record.
-   Never hardcode credentials or PINs.
-   Use database transactions for multi-record business operations.
-   Use decimal-safe money arithmetic (integer paise or a suitable
    decimal type; never binary floating-point for financial
    calculations).
-   Store timestamps consistently and display in Asia/Kolkata.
-   Use unique invoice numbers and unique barcode/SKU constraints.
-   Preserve completed invoices; corrections should use
    void/return/credit-note workflows with audit records, not
    destructive edits.
-   Prevent unauthorised access to owner-only data and operations.
-   Validate inputs on both UI and domain/service layers.
-   Do not silently swallow errors.
-   Do not claim GST/legal/accounting compliance without client CA
    validation.
-   Never claim a feature works until it has been tested.

## 8. Three-day delivery strategy

The three-day goal is a focused delivery target, not permission to skip
verification. Prioritise a reliable vertical slice over a huge
collection of unfinished modules.

### Day 1 --- Foundation and core retail workflow

1.  Inspect repository, current demo, dependencies, existing UI, build
    scripts and licence.
2.  Create/verify Git checkpoint before destructive cleanup.
3.  Decide desktop packaging and local database architecture.
4.  Remove demo data safely; preserve reusable components only after
    inspecting dependencies.
5.  Establish schema/migrations, local authentication and roles.
6.  Implement products, variants, barcode mapping and stock ledger.
7.  Implement barcode-first cart and transactional sale completion.
8.  Verify restart persistence and no-internet operation.

**Day 1 gate:** create a product/variant, scan/add it, complete a test
sale, verify stock decreases exactly once and data survives restart.

### Day 2 --- Real operations and hardware

1.  Implement receipt template using the supplied sample as reference.
2.  Integrate and test TVS receipt printer after confirming exact
    model/driver/paper.
3.  Integrate TVS LP 46 NEO label printer after confirming label
    dimensions/protocol.
4.  Implement discounts/offers and permission-controlled overrides.
5.  Implement purchases, suppliers and stock receipt.
6.  Implement expenses and cashier-wise reporting.
7.  Test scanner repeated scans, unknown barcode, printer unavailable,
    out-of-paper and retry scenarios where hardware allows.

**Day 2 gate:** real scanner input, correct receipt output, correct
barcode label output, discounts and stock ledger verified on the actual
devices.

### Day 3 --- Controls, exports, polish and acceptance

1.  Implement owner/cashier permissions and cashier totals.
2.  Implement month-wise sales/purchase/tax-data export after
    CA-required fields are clarified.
3.  Implement invoice PDF generation and semi-automated WhatsApp
    handoff.
4.  Implement backup/restore and audit logs.
5.  Polish dashboard and POS screen; keep cashier flow fast and
    uncluttered.
6.  Run full regression, build, packaging and offline tests.
7.  Test with the client and prepare concise user instructions.

**Day 3 gate:** packaged app launches on target Windows 10 machine; core
billing works offline; backups can be restored; all critical workflows
pass.

### Scope control

If a feature cannot be safely completed in three days, do not fake it.
Prioritise: 1. Authentication/roles 2. Product variants/barcodes 3.
Billing and stock integrity 4. Receipt/label printing 5. Discounts 6.
Purchases and expenses 7. Reliable core reports 8. Backup/restore 9.
CA-validated GST export 10. WhatsApp PDF handoff

A production release must not be declared complete if the core data
integrity, printer, backup or security gates fail. Communicate a tested
milestone and remaining work honestly.

## 9. OpenCode operating instructions

OpenCode is the engineering agent. It must operate autonomously within
the guardrails below.

### Mandatory initial actions

1.  Read this file and `BRAND_KIT.md`, the repository's AI Engineering
    Constitution and Master AI Engineering SOP v2.0, plus existing
    project instructions.
2.  Inspect the full repository before editing: package manifests,
    source tree, app entry points, routing, state management,
    persistence, tests, build, environment, assets, licence and existing
    features.
3.  Report current architecture and identify which existing code is
    reusable, obsolete or unsafe to remove.
4.  Produce a concise phased implementation plan and explicit data
    model/workflow plan.
5.  Identify blocking unknowns: exact receipt-printer model string,
    driver, paper width; label size/DPI/protocol; scanner model/suffix;
    GSTIN and tax configuration; CA export template; final return
    policy; staff names/mobile numbers/roles; logo source file.
6.  Do not wait for non-blocking details. Build abstractions and
    settings for unknowns, then ask the user only for details that
    materially block a safe implementation.

### Autonomous execution

-   After inspection and plan, proceed through approved phases without
    asking for confirmation at every small step.
-   Make minimal, coherent, reversible changes.
-   Do not delete files simply because they look unrelated. Trace
    imports, scripts, runtime use and build references first.
-   Keep project root clean; do not create a nested duplicate project.
-   Maintain a task checklist and update it as work progresses.
-   Run relevant tests after each phase; fix failures before moving on.
-   Review changed files and Git diff.
-   Create meaningful Git checkpoints. Never force-push, deploy,
    publish, overwrite client data or perform irreversible operations
    without explicit authorisation.
-   If a decision affects accounting correctness, legal/tax treatment,
    security, destructive migration or real customer data, stop and ask.
-   Never invent APIs, printer commands, tax rules, client data or
    successful test results.
-   At completion, provide changed files, architecture decisions,
    commands run, actual test results, unresolved issues and exact
    client inputs still needed.

## 10. Engineering Constitution and Master SOP alignment

Follow the user's AI Engineering Constitution and Master AI Engineering
SOP v2.0. If their original files are present, read and obey the exact
source; this section is a project-specific reminder, not a replacement
for those documents.

Required sequence:

**Understand → Plan → Implement → Test → Checkpoint**

-   Inspect before code.
-   Evidence-based engineering; no hallucinated files/APIs.
-   Prefer minimal targeted edits over uncontrolled rewrites.
-   Analyse options and choose the simplest reliable architecture.
-   Preserve existing working functionality unless removal is justified.
-   Maintain modularity and clear ownership of business logic.
-   Protect secrets and customer data.
-   Consider security, performance, accessibility, usability and failure
    states.
-   Test happy paths, empty states, errors, edge cases, persistence,
    permissions and offline behaviour.
-   Self-review code and UI before declaring done.
-   Document decisions and checkpoint reports.
-   Ask the human only for direction, security-sensitive decisions,
    irreversible actions or material ambiguity.

Required verification where applicable: - TypeScript:
`npx tsc --noEmit` - Lint: `npm run lint` - Production build:
`npm run build` - Run all project tests. - Verify database migrations,
constraints and transactional workflows. - Verify app startup, packaging
and launch on Windows 10. - Verify no-internet operation. - Verify
scanner and both printers on actual hardware. - Verify backup and
restore.

Do not run a command that is not present in the project scripts without
first inspecting the package manifest. Report unavailable checks
honestly.

## 11. Acceptance checklist

### Critical

-   [ ] App launches on the target Windows 10 computer.
-   [ ] Core billing works with internet disconnected.
-   [ ] No demo records appear in the live operational database.
-   [ ] Three named users can sign in with role-based permissions.
-   [ ] Cashier cannot edit products, stock, expenses or tax
    configuration.
-   [ ] Barcode scan resolves exact variant and adds it to cart.
-   [ ] Repeated scan increments quantity correctly.
-   [ ] Unknown barcode is handled safely.
-   [ ] Discounts calculate correctly and are auditable.
-   [ ] Sale, payment and stock movement commit atomically.
-   [ ] Duplicate click/retry does not create duplicate sale.
-   [ ] Receipt prints correctly on actual receipt printer.
-   [ ] Barcode label prints correctly on TVS LP 46 NEO.
-   [ ] Printer failure does not corrupt the sale or duplicate it.
-   [ ] Database persists after restart.
-   [ ] Backup can be restored and verified.

### Business operations

-   [ ] Purchases update stock and supplier records.
-   [ ] Expenses are distinct from stock purchases and capital/loan
    transactions.
-   [ ] Cashier-wise invoice count and sales totals reconcile.
-   [ ] Sales, returns and purchase reports reconcile to source records.
-   [ ] Month-wise export totals reconcile to underlying records.
-   [ ] CA validates tax/export structure before statutory use.
-   [ ] PDF invoice can be generated and manually attached in WhatsApp.
-   [ ] Audit trail records sensitive changes.

## 12. First response expected from OpenCode

Before implementation, return: 1. Repository audit and current stack. 2.
Relevant Constitution/SOP files found and read. 3. Reusable vs obsolete
components. 4. Proposed production architecture with rationale. 5.
Database entities and key relationships. 6. Hardware verification plan
for both TVS printers and scanner. 7. Three-day phase plan with risks
and dependencies. 8. Blocking questions for the user/client.

Then begin implementation autonomously, respecting the gates above.
