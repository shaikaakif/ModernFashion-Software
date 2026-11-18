# Modern Fashion --- Brand Kit & POS Interface Design System

**Brand:** Modern Fashion\
**Short mark:** MF\
**Application:** Modern Fashion Retail POS\
**Developer credit (where appropriate):** Engineered by Meninges Labs\
**Purpose:** Visual and interaction rules for the Windows retail POS,
invoice/receipt templates and operational screens.

------------------------------------------------------------------------

## 1. Brand hierarchy

There are two separate identities:

1.  **Modern Fashion** is the client's retail brand. Its supplied MF
    logo and business details belong on the application identity where
    appropriate, receipts, labels and customer-facing documents.
2.  **Meninges Labs** is the software developer. It must not replace,
    dominate or be confused with the client's brand. Developer credit
    may appear subtly in an About screen, not on the customer receipt
    unless the client explicitly requests it.

Do not invent a new Modern Fashion logo. Use the client-supplied MF logo
asset. Preserve its proportions and recognisable shape. For thermal
printing, prepare a monochrome high-contrast version from the original
asset; do not redraw the mark.

## 2. Brand character

The interface should feel:

-   Professional and trustworthy
-   Retail-operational, not playful
-   Fast and efficient at a busy billing counter
-   Clear at a glance
-   Modern without fashionable effects that reduce legibility
-   Appropriate for a clothing and fashion store

Avoid childish styling, excessive gradients, glassmorphism, giant
rounded cards, decorative animations, oversized empty space and generic
AI-dashboard visuals.

## 3. Colour system

The client's supplied receipt uses a predominantly monochrome identity.
Keep customer-facing receipt and barcode outputs black on white for
thermal compatibility.

For the application UI, use a restrained neutral foundation with a warm
orange accent inspired by the developer's Meninges Labs visual
direction. This accent is an interface choice, not a claim that orange
is an established Modern Fashion corporate colour. Keep the client's own
logo unchanged.

Suggested initial tokens (validate visually against the existing UI and
client preference):

  Token                 Value       Use
  --------------------- ----------- -----------------------------------
  `--mf-bg`             `#F7F7F5`   Main application background
  `--mf-surface`        `#FFFFFF`   Panels, forms, tables
  `--mf-text`           `#202124`   Primary text
  `--mf-muted`          `#6B7280`   Secondary text
  `--mf-border`         `#E5E7EB`   Dividers and borders
  `--mf-accent`         `#E87532`   Primary action and selected state
  `--mf-accent-hover`   `#CF5F22`   Hover/pressed accent
  `--mf-success`        `#16834A`   Successful payment/stock state
  `--mf-warning`        `#B7791F`   Low stock / attention
  `--mf-danger`         `#C0392B`   Failed/void/danger actions
  `--mf-info`           `#2563A6`   Informational state

Use colour semantically and consistently. Do not rely on colour alone to
convey status. Check text contrast and visible focus states.

## 4. Typography

Use a clean, highly legible sans-serif family available locally or
bundled with the application. Prefer a consistent system font stack over
a dependency on remote font services.

-   Screen headings: medium/semibold, restrained.
-   Body and form labels: regular/medium.
-   Table content: compact but comfortably readable.
-   Prices and totals: tabular numerals where available.
-   POS totals: prominent, clear and easy to scan.
-   Receipt typography: printer-safe, high-contrast, no dependence on
    custom fonts.

Do not shrink important cashier text to fit. Wrap or truncate product
names carefully and preserve full details in the item view.

## 5. Layout and navigation

Design for one Windows desktop billing workstation first. Support common
desktop resolutions and sensible scaling. Do not assume a touchscreen,
but keep targets usable.

Suggested navigation:

-   Dashboard
-   POS / New Sale
-   Products
-   Inventory
-   Purchases
-   Suppliers
-   Customers
-   Expenses
-   Reports
-   Users & Cashiers
-   Settings
-   Audit Log (owner/manager only)

Role-based navigation must hide inaccessible modules, and the
backend/domain permission checks must still enforce access. Hiding a
menu item is not security.

### POS screen priority

The billing screen is the highest-priority screen.

-   Scan input must be visually obvious and remain ready for scanner
    input.
-   Cart/product lines should occupy the main working area.
-   Totals and payment controls should be prominent.
-   Manual product search is a fallback, not the primary workflow.
-   Keep cashier actions close to the cart.
-   Avoid modal dialogs for routine scanning and quantity changes.
-   Show clear feedback for unknown barcodes, out-of-stock variants and
    invalid quantities.
-   Do not move focus away from the scanner field after normal cart
    updates.
-   Provide keyboard-friendly navigation and shortcuts only when
    documented and non-conflicting.

### Dashboard

Use a restrained KPI grid with clear labels, date range and definitions.
Distinguish sales, discounts, returns, COGS, gross profit, operating
expenses and net result. Never use an attractive chart to disguise
undefined or unreliable calculations.

## 6. Components and interaction

-   Buttons: clear verb labels (`Complete Sale`, `Print Receipt`,
    `Add Product`, `Save Expense`).
-   Destructive actions: confirmation and reason where appropriate.
-   Forms: visible labels, validation close to the field, clear
    save/cancel states.
-   Tables: compact, sortable/filterable where useful, consistent
    alignment for quantities and currency.
-   Status: explicit text plus icon/colour.
-   Notifications: concise and actionable; no fake success.
-   Loading: use only where an operation genuinely takes time.
-   Empty states: explain what is missing and provide the next action.
-   Error states: explain recovery without exposing stack traces or
    sensitive information.
-   Motion: brief and functional; respect reduced-motion preferences.
    Never delay cashier operations with decorative animation.

## 7. Receipt design system

The physical sample receipt is the primary reference. Create a clean,
aligned version of its hierarchy.

### Header

-   Original MF logo, centred or aligned according to the verified paper
    width.
-   MODERN FASHION.
-   Address lines.
-   State code and phone.
-   Confirmed return/exchange policy.

### Invoice metadata

-   `Tax Invoice` only when the client's legal/tax configuration
    supports that designation.
-   Customer name and phone where supplied.
-   Date and time.
-   Unique invoice number.

### Item lines

-   Item name.
-   Quantity.
-   Unit price.
-   Amount.
-   Per-item discount percentage/amount where applicable.
-   Final amount after discount.

### Totals

-   Total quantity.
-   Subtotal.
-   Discount total.
-   Tax breakup only when configured and validated.
-   Round-off.
-   Grand total.
-   Received.
-   Balance/change.
-   `You Saved` total, calculated from actual discounts and clearly
    defined.

### Footer

-   Terms & Conditions.
-   Thank-you message.

Receipt constraints: - Black on white; thermal printers are monochrome
unless verified otherwise. - Use the exact paper width configured for
the printer. - Keep columns aligned with fixed-width layout or tested
printer-safe layout. - Avoid background fills and large images. -
Convert logo to a clean monochrome raster if needed. - Do not add
decorative colour, gradient or web-only styling. - Use the actual saved
invoice data. - Reprint should be marked as duplicate/copy if
appropriate. - Do not call a document a tax invoice until required
tax/business details are validated.

The provided sample includes a policy line that appears as
`NO RETURN / EXCHANGE WITHIN 3 DAY`. This wording is ambiguous. Ask the
client to confirm the intended policy before using it verbatim in
production.

## 8. Barcode label design system

The TVS LP 46 NEO is the reported label printer. Final label layout must
wait until physical label dimensions, DPI, gap/black-mark sensing and
driver/protocol are confirmed.

Possible label content: - MF or store name (optional) - Product name
(short) - Size and colour/variant - Selling price - Internal barcode -
SKU text

Keep the barcode large enough for reliable scanning. Do not place
decorative graphics near barcode quiet zones. Verify every printed label
by scanning it back into the POS.

Use internally generated EAN-13/UPC-A numbers in the GS1 restricted-circulation
range (prefix 20–29) where suitable. They are not GS1-registered retail
identifiers. Do not fabricate registered EAN/GTIN numbers. Legacy Code 128
values remain readable.

## 9. Accessibility and usability

-   Maintain readable contrast.
-   Provide visible keyboard focus.
-   Do not rely only on colour.
-   Keep labels explicit and controls predictable.
-   Ensure error messages are understandable.
-   Make cashier flows keyboard-friendly.
-   Use confirmation for destructive actions.
-   Respect reduced-motion settings.
-   Avoid tiny text, low-contrast grey and dense unstructured layouts.

## 10. Responsive behaviour

The first target is a Windows desktop monitor. Still ensure layouts
adapt to smaller windows without clipping critical controls.

-   POS cart and totals must remain usable.
-   Tables may scroll horizontally when necessary.
-   Dialogs must fit within the visible application window.
-   Do not hide payment or completion controls below inaccessible
    content.
-   Printing layout is separate from screen layout and must be tested
    independently.

## 11. Design QA

Before marking a screen complete:

1.  Inspect the screen at the target Windows resolution.
2.  Check alignment, spacing, hierarchy and text clipping.
3.  Test empty, loading, success and error states.
4.  Test keyboard navigation and focus.
5.  Test role-based visibility and access.
6.  Check currency formatting and long product names.
7.  Check dense tables with realistic data volumes.
8.  Test the actual receipt/label output on the target hardware.
9.  Fix severe usability issues before decorative polish.

## 12. Brand asset handling

-   Keep original client logo source unchanged.
-   Store source assets in a clearly named assets directory.
-   Create derived thermal bitmap assets separately.
-   Preserve aspect ratio and transparent/white background as
    appropriate.
-   Do not embed low-resolution screenshots as the production logo.
-   Do not use external font/image URLs at runtime; offline operation
    must not depend on remote assets.
-   Do not include Meninges Labs logo on customer-facing documents
    unless requested.

## 13. Design definition of done

A screen is complete only when:

-   It follows the token system.
-   It is consistent with adjacent modules.
-   It has clear hierarchy and readable typography.
-   It supports keyboard use and visible focus.
-   It handles empty/error/success states.
-   It works at target desktop dimensions.
-   It uses real application state, not hardcoded demo values.
-   Its critical actions are functional and permission-checked.
-   It has been visually reviewed.
-   It does not compromise offline use or cashier speed.
