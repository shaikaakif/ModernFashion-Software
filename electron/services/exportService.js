import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from '../core/validation.js';

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(',')).join('\r\n');
  return `\uFEFF${header}\r\n${body}\r\n`;
}

function rupees(paise) {
  return (Number(paise || 0) / 100).toFixed(2);
}

export function createExportService({ auth, reportService, inventoryService, customerService, catalogService, dialog, paths, logger }) {
  function saveCsv(defaultFilename, columns, rows, metaLines = []) {
    const target = dialog.showSaveDialogSync({
      title: 'Save CSV export',
      defaultPath: path.join(paths.exports, defaultFilename),
      filters: [{ name: 'CSV for Excel', extensions: ['csv'] }],
    });
    if (!target) return null;
    const meta = metaLines.length ? `${metaLines.map((line) => csvCell(line)).join('\r\n')}\r\n\r\n` : '';
    // Keep the UTF-8 BOM at the start so Excel opens rupee text correctly.
    const csv = toCsv(columns, rows);
    fs.writeFileSync(target, meta ? csv.replace('\uFEFF', `\uFEFF${meta}`) : csv, 'utf8');
    logger.info('CSV exported', { target, rows: rows.length });
    return { path: target, filename: path.basename(target), rows: rows.length };
  }

  function exportSalesRegister(input = {}) {
    auth.requirePermission('reports.export');
    const report = reportService.salesRegister(input);
    const columns = [
      { label: 'Invoice No', value: (row) => row.invoiceNo },
      { label: 'Business Date', value: (row) => row.businessDate },
      { label: 'Completed At', value: (row) => row.completedAt },
      { label: 'Customer', value: (row) => row.customerName },
      { label: 'Phone', value: (row) => row.customerPhone },
      { label: 'Cashier', value: (row) => row.cashierName },
      { label: 'Status', value: (row) => row.status },
      { label: 'Payment Method', value: (row) => row.paymentMethod },
      { label: 'Payment Status', value: (row) => row.paymentStatus },
      { label: 'Gross Sales (INR)', value: (row) => rupees(row.grossSalesPaise) },
      { label: 'Discount (INR)', value: (row) => rupees(row.discountPaise) },
      { label: 'Taxable Value (INR)', value: (row) => rupees(row.taxableValuePaise) },
      { label: 'Tax (INR)', value: (row) => rupees(row.taxPaise) },
      { label: 'Round Off (INR)', value: (row) => rupees(row.roundOffPaise) },
      { label: 'Invoice Total (INR)', value: (row) => rupees(row.invoiceTotalPaise) },
      { label: 'Amount Paid (INR)', value: (row) => rupees(row.amountPaidPaise) },
      { label: 'Balance (INR)', value: (row) => rupees(row.balancePaise) },
    ];
    return saveCsv(
      `sales-register-${report.from}-to-${report.to}.csv`,
      columns,
      report.rows,
      [`Modern Fashion sales register`, `Period: ${report.from} to ${report.to}`, `Generated: ${nowIso()}`]
    );
  }

  function exportPurchases(input = {}) {
    auth.requirePermission('reports.export');
    const report = reportService.purchaseReport(input);
    const columns = [
      { label: 'Reference', value: (row) => row.reference },
      { label: 'Business Date', value: (row) => row.purchaseDate },
      { label: 'Supplier', value: (row) => row.supplierName },
      { label: 'Supplier Invoice', value: (row) => row.supplierInvoiceRef },
      { label: 'Subtotal (INR)', value: (row) => rupees(row.subtotalPaise) },
      { label: 'Discount (INR)', value: (row) => rupees(row.discountPaise) },
      { label: 'Additional Cost (INR)', value: (row) => rupees(row.additionalCostPaise) },
      { label: 'Tax (INR)', value: (row) => rupees(row.taxPaise) },
      { label: 'Total (INR)', value: (row) => rupees(row.totalPaise) },
      { label: 'Paid (INR)', value: (row) => rupees(row.amountPaidPaise) },
      { label: 'Balance (INR)', value: (row) => rupees(row.balancePaise) },
      { label: 'Payment Status', value: (row) => row.paymentStatus },
      { label: 'Status', value: (row) => row.status },
    ];
    return saveCsv(
      `purchases-${report.from}-to-${report.to}.csv`,
      columns,
      report.rows,
      [`Modern Fashion purchase register`, `Period: ${report.from} to ${report.to}`, `Generated: ${nowIso()}`]
    );
  }

  function exportExpenses(input = {}) {
    auth.requirePermission('reports.export');
    const report = reportService.expenseReport(input);
    const columns = [
      { label: 'Date', value: (row) => row.expenseDate },
      { label: 'Category', value: (row) => row.categoryName },
      { label: 'Amount (INR)', value: (row) => rupees(row.amountPaise) },
      { label: 'Payment Method', value: (row) => row.paymentMethod },
      { label: 'Description', value: (row) => row.description },
      { label: 'Reference', value: (row) => row.reference },
      { label: 'Vendor', value: (row) => row.vendor },
      { label: 'Created By', value: (row) => row.createdByName },
    ];
    return saveCsv(
      `expenses-${report.from}-to-${report.to}.csv`,
      columns,
      report.rows,
      [`Modern Fashion operating expenses`, `Period: ${report.from} to ${report.to}`, `Generated: ${nowIso()}`]
    );
  }

  function exportInventory({ query = '', categoryId = null } = {}) {
    auth.requirePermission('reports.export');
    const rows = inventoryService.list({ query, categoryId, limit: 2000 });
    const columns = [
      { label: 'Product', value: (row) => row.productName },
      { label: 'Category', value: (row) => row.categoryName },
      { label: 'SKU', value: (row) => row.sku },
      { label: 'Barcode', value: (row) => row.barcode },
      { label: 'Colour', value: (row) => row.color },
      { label: 'Size', value: (row) => row.size },
      { label: 'Stock', value: (row) => row.stock },
      { label: 'Cost (INR)', value: (row) => rupees(row.costPaise) },
      { label: 'Selling Price (INR)', value: (row) => rupees(row.pricePaise) },
      { label: 'Stock Value at Cost (INR)', value: (row) => rupees(row.stockValuePaise) },
      { label: 'Retail Value (INR)', value: (row) => rupees(row.retailValuePaise) },
      { label: 'Low Stock Threshold', value: (row) => row.threshold },
    ];
    return saveCsv(`stock-valuation-${nowIso().slice(0, 10)}.csv`, columns, rows, [
      `Modern Fashion stock valuation`,
      `Costing method: weighted average`,
      `Generated: ${nowIso()}`,
    ]);
  }

  function exportCustomers() {
    auth.requirePermission('reports.export');
    const rows = customerService.list({ limit: 2000 });
    const columns = [
      { label: 'Name', value: (row) => row.name },
      { label: 'Phone', value: (row) => row.phone },
      { label: 'Email', value: (row) => row.email },
      { label: 'Address', value: (row) => row.address },
      { label: 'Purchases', value: (row) => row.purchaseCount },
      { label: 'Total Spent (INR)', value: (row) => rupees(row.totalSpentPaise) },
      { label: 'Outstanding (INR)', value: (row) => rupees(row.outstandingPaise) },
      { label: 'Last Purchase', value: (row) => row.lastPurchaseDate },
    ];
    return saveCsv(`customers-${nowIso().slice(0, 10)}.csv`, columns, rows, [
      `Modern Fashion customer list`,
      `Generated: ${nowIso()}`,
    ]);
  }

  function exportCatalogue() {
    auth.requirePermission('reports.export');
    const products = catalogService.listProducts({ limit: 1000 });
    const rows = [];
    for (const product of products) {
      const detail = catalogService.getProduct(product.id);
      for (const variant of detail.variants || []) {
        rows.push({ product: detail, variant });
      }
    }
    const columns = [
      { label: 'Product', value: (row) => row.product.name },
      { label: 'Category', value: (row) => row.product.categoryName },
      { label: 'Brand', value: (row) => row.product.brandName },
      { label: 'SKU', value: (row) => row.variant.sku },
      { label: 'Barcode', value: (row) => row.variant.barcode },
      { label: 'Colour', value: (row) => row.variant.color },
      { label: 'Size', value: (row) => row.variant.size },
      { label: 'Selling Price (INR)', value: (row) => rupees(row.variant.pricePaise) },
      { label: 'MRP (INR)', value: (row) => rupees(row.variant.mrpPaise) },
      { label: 'Status', value: (row) => row.variant.status },
      { label: 'Stock', value: (row) => row.variant.stock },
    ];
    return saveCsv(`product-catalogue-${nowIso().slice(0, 10)}.csv`, columns, rows, [
      `Modern Fashion product catalogue`,
      `Generated: ${nowIso()}`,
    ]);
  }

  function exportAccountingPack({ month } = {}) {
    auth.requirePermission('reports.export');
    const pack = reportService.accountingPack(month);
    const folder = dialog.showOpenDialogSync({
      title: 'Choose a folder for the accounting pack',
      defaultPath: paths.exports,
      properties: ['openDirectory', 'createDirectory'],
    })?.[0];
    if (!folder) return null;

    const salesCsv = toCsv(
      [
        { label: 'Invoice No', value: (row) => row.invoiceNo },
        { label: 'Business Date', value: (row) => row.businessDate },
        { label: 'Customer', value: (row) => row.customerName },
        { label: 'Cashier', value: (row) => row.cashierName },
        { label: 'Status', value: (row) => row.status },
        { label: 'Payment Method', value: (row) => row.paymentMethod },
        { label: 'Gross Sales (INR)', value: (row) => rupees(row.grossSalesPaise) },
        { label: 'Discount (INR)', value: (row) => rupees(row.discountPaise) },
        { label: 'Taxable Value (INR)', value: (row) => rupees(row.taxableValuePaise) },
        { label: 'Tax (INR)', value: (row) => rupees(row.taxPaise) },
        { label: 'Invoice Total (INR)', value: (row) => rupees(row.invoiceTotalPaise) },
        { label: 'Amount Paid (INR)', value: (row) => rupees(row.amountPaidPaise) },
        { label: 'Balance (INR)', value: (row) => rupees(row.balancePaise) },
      ],
      pack.salesRegister.rows
    );
    const purchasesCsv = toCsv(
      [
        { label: 'Reference', value: (row) => row.reference },
        { label: 'Date', value: (row) => row.purchaseDate },
        { label: 'Supplier', value: (row) => row.supplierName },
        { label: 'Supplier Invoice', value: (row) => row.supplierInvoiceRef },
        { label: 'Subtotal (INR)', value: (row) => rupees(row.subtotalPaise) },
        { label: 'Discount (INR)', value: (row) => rupees(row.discountPaise) },
        { label: 'Tax (INR)', value: (row) => rupees(row.taxPaise) },
        { label: 'Total (INR)', value: (row) => rupees(row.totalPaise) },
        { label: 'Paid (INR)', value: (row) => rupees(row.amountPaidPaise) },
        { label: 'Balance (INR)', value: (row) => rupees(row.balancePaise) },
      ],
      pack.purchaseRegister.rows
    );
    const expensesCsv = toCsv(
      [
        { label: 'Date', value: (row) => row.expenseDate },
        { label: 'Category', value: (row) => row.categoryName },
        { label: 'Amount (INR)', value: (row) => rupees(row.amountPaise) },
        { label: 'Payment Method', value: (row) => row.paymentMethod },
        { label: 'Description', value: (row) => row.description },
        { label: 'Vendor', value: (row) => row.vendor },
      ],
      pack.expenses.rows
    );
    const taxCsv = toCsv(
      [
        { label: 'Rate %', value: (row) => row.ratePercent },
        { label: 'Invoices', value: (row) => row.invoiceCount },
        { label: 'Units', value: (row) => row.units },
        { label: 'Taxable Value (INR)', value: (row) => rupees(row.taxablePaise) },
        { label: 'Tax (INR)', value: (row) => rupees(row.taxPaise) },
        { label: 'Gross (INR)', value: (row) => rupees(row.grossPaise) },
      ],
      pack.taxSummary.sales
    );
    const readme = [
      'MODERN FASHION POS — ACCOUNTING DATA PACK',
      `Month: ${pack.month}`,
      `Period: ${pack.from} to ${pack.to}`,
      `Generated: ${pack.generatedAt}`,
      '',
      'IMPORTANT',
      ...pack.notes.map((note) => `- ${note}`),
      '',
      'Files in this folder:',
      '- sales-register.csv',
      '- purchase-register.csv',
      '- operating-expenses.csv',
      '- tax-summary.csv',
      '- accounting-pack.json (full structured data)',
      '',
      'Tax is reported only from configured rates. Confirm GSTIN, HSN, place of supply',
      'and the CA-required format before statutory use.',
      '',
    ].join('\r\n');
    const target = path.join(folder, `modern-fashion-accounting-${pack.month}`);
    fs.mkdirSync(target, { recursive: true });
    const files = [
      ['sales-register.csv', salesCsv],
      ['purchase-register.csv', purchasesCsv],
      ['operating-expenses.csv', expensesCsv],
      ['tax-summary.csv', taxCsv],
      ['accounting-pack.json', JSON.stringify(pack, null, 2)],
      ['README.txt', readme],
    ];
    for (const [name, content] of files) fs.writeFileSync(path.join(target, name), content, 'utf8');
    logger.info('Accounting pack exported', { target, month: pack.month });
    return { folder: target, files: files.map(([name]) => name), month: pack.month };
  }

  return {
    exportSalesRegister,
    exportPurchases,
    exportExpenses,
    exportInventory,
    exportCustomers,
    exportCatalogue,
    exportAccountingPack,
  };
}
