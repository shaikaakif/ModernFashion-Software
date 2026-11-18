import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fail } from '../core/errors.js';
import { writeAudit } from '../core/audit.js';
import { nowIso } from '../core/validation.js';
import { transaction } from '../core/database.js';
import { getSetting, saveSetting } from '../core/settings.js';
import { generatedBarcode, normalizeBarcodeConfig } from '../../shared/barcode.js';
import { extractVypFromZip } from './zipReader.js';

const REQUIRED_TABLES = [
  'kb_items',
  'kb_item_categories',
  'kb_item_categories_mapping',
  'kb_names',
  'kb_transactions',
  'kb_lineitems',
  'kb_tax_code',
  'kb_paymentTypes',
  'txn_payment_mapping',
  'kb_item_adjustments',
];

const sessions = new Map();

function rupeePaise(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function intValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function textValue(value) {
  return String(value ?? '').trim();
}

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const last = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last) ? last : '';
}

function sourceDate(dateText) {
  return String(dateText || '').slice(0, 10);
}

function sourceDateTime(dateText, seconds) {
  const day = sourceDate(dateText);
  const total = Math.max(0, intValue(seconds));
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  const secs = total % 60;
  return `${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(
    2,
    '0'
  )}+05:30`;
}

function sha256File(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function cleanup(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // A leftover temp copy is harmless and never contains the original path.
  }
}

function prepareSource(sourcePath) {
  const resolved = path.resolve(String(sourcePath || ''));
  if (!resolved) fail('Choose a Vyapar .vyp or .vyb.zip file.');
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    fail('The chosen Vyapar backup could not be found.');
  }
  if (!stat.isFile()) fail('Choose a single Vyapar backup file.');
  if (stat.size > 500 * 1024 * 1024) fail('The Vyapar backup is larger than 500 MB.');
  const extension = path.extname(resolved).toLowerCase();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-vyapar-'));
  const dbPath = path.join(directory, 'source.vyp');
  try {
    if (extension === '.vyp') {
      fs.copyFileSync(resolved, dbPath);
    } else if (extension === '.zip') {
      const extracted = extractVypFromZip(fs.readFileSync(resolved));
      fs.writeFileSync(dbPath, extracted.buffer);
    } else {
      fail('Choose a .vyp database or a .vyb.zip archive.');
    }
  } catch (error) {
    cleanup(directory);
    throw error;
  }
  const hash = sha256File(dbPath);
  let source;
  try {
    source = new DatabaseSync(dbPath);
    source.exec('PRAGMA query_only = ON');
    const integrity = source.prepare('PRAGMA integrity_check').all();
    const message = integrity.map((row) => Object.values(row)[0]).join('; ');
    if (message !== 'ok') fail(`The Vyapar database failed its integrity check: ${message}`);
    for (const table of REQUIRED_TABLES) {
      const row = source
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      if (!row) fail(`The Vyapar database is missing the required table ${table}.`);
    }
  } catch (error) {
    cleanup(directory);
    try {
      source?.close();
    } catch {
      // Ignore close failure while reporting the real error.
    }
    throw error;
  }
  return { directory, dbPath, hash, fileName: path.basename(resolved), kind: extension === '.zip' ? 'vyb.zip' : 'vyp', source };
}

function categoryCode(db, name) {
  const base = String(name).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3) || 'VYP';
  let candidate = base;
  let suffix = 0;
  while (db.prepare('SELECT id FROM categories WHERE code = ? COLLATE NOCASE').get(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 8);
    if (suffix > 99) fail('Could not generate a category code.');
  }
  return candidate;
}

function barcodeForItem(item, db, used) {
  const code = textValue(item.item_code);
  if (code.length >= 6 && code.length <= 64 && /^[0-9A-Za-z._-]+$/.test(code) && !used.has(code)) {
    return code;
  }
  const config = normalizeBarcodeConfig(getSetting(db, 'barcode'));
  for (let offset = 0; offset < 1000; offset += 1) {
    const candidate = generatedBarcode(config, 700000000 + Number(item.item_id) + offset);
    if (!used.has(candidate) && !db.prepare('SELECT id FROM product_variants WHERE barcode = ?').get(candidate)) {
      return candidate;
    }
  }
  fail(`Could not generate a barcode for ${item.item_name}.`);
}

function buildPlan(source, db, options = {}, sourceHash = '') {
  const warnings = [];
  const warning = (code, message, count, samples = []) => {
    if (count > 0) warnings.push({ code, message, count, samples: samples.slice(0, 8) });
  };

  const items = source.prepare('SELECT * FROM kb_items ORDER BY item_id').all();
  const categoryRows = source.prepare('SELECT * FROM kb_item_categories').all();
  const mappingRows = source.prepare('SELECT item_id, category_id FROM kb_item_categories_mapping').all();
  const categoryById = new Map(categoryRows.map((row) => [row.item_category_id, row.item_category_name]));
  const categoryByItem = new Map();
  for (const row of mappingRows) {
    if (!categoryByItem.has(row.item_id)) categoryByItem.set(row.item_id, categoryById.get(row.category_id) || '');
  }
  const categoryByName = new Map(
    db.prepare('SELECT id, name FROM categories').all().map((row) => [row.name.toLowerCase(), row.id])
  );
  const categoryPlan = new Map();
  const categoryFor = (name) => {
    const clean = textValue(name) || 'Other';
    const key = clean.toLowerCase();
    if (categoryByName.has(key)) return { id: categoryByName.get(key), name: clean };
    if (!categoryPlan.has(key)) {
      categoryPlan.set(key, { name: clean, code: categoryCode(db, clean) });
    }
    return { id: null, name: clean };
  };

  const existingVariants = db
    .prepare(
      `SELECT v.id, v.product_id, v.sku, v.barcode, v.price_paise, v.mrp_paise, v.cost_paise,
              v.low_stock_threshold, COALESCE(ib.quantity, 0) AS stock
       FROM product_variants v LEFT JOIN inventory_balances ib ON ib.variant_id = v.id`
    )
    .all();
  const variantByBarcode = new Map(existingVariants.map((row) => [row.barcode, row]));
  const variantBySku = new Map(existingVariants.map((row) => [row.sku.toLowerCase(), row]));
  const targetProducts = db
    .prepare('SELECT id, name, category_id FROM products')
    .all();
  const productByName = new Map();
  for (const row of targetProducts) {
    const key = `${row.name.toLowerCase()}|${row.category_id}`;
    if (!productByName.has(key)) productByName.set(key, row);
  }
  const usedBarcodes = new Set(existingVariants.map((row) => row.barcode));
  const usedSkus = new Set(existingVariants.map((row) => row.sku.toLowerCase()));

  const productPlan = [];
  const variantByItemId = new Map();
  const productCounts = {
    products: 0,
    services: 0,
    negative: 0,
    zeroPrice: 0,
    zeroPriceServices: 0,
    zeroCost: 0,
    uncategorised: 0,
  };
  for (const item of items) {
    if (intValue(item.item_type) === 2) {
      productCounts.services += 1;
      if (rupeePaise(item.item_sale_unit_price) <= 0) productCounts.zeroPriceServices += 1;
      continue;
    }
    const salePrice = rupeePaise(item.item_sale_unit_price);
    const purchasePrice = rupeePaise(item.item_purchase_unit_price);
    const mrp = rupeePaise(item.item_mrp);
    const stock = intValue(item.item_stock_quantity);
    if (stock < 0) productCounts.negative += 1;
    if (salePrice <= 0) productCounts.zeroPrice += 1;
    if (purchasePrice <= 0) productCounts.zeroCost += 1;
    const category = categoryFor(categoryByItem.get(item.item_id));
    if (category.name.toLowerCase() === 'other' && !categoryByItem.get(item.item_id)) productCounts.uncategorised += 1;
    const code = textValue(item.item_code);
    let sku = code || `VYP-${item.item_id}`;
    if (usedSkus.has(sku.toLowerCase())) sku = `VYP-${item.item_id}`;
    usedSkus.add(sku.toLowerCase());
    let barcode = barcodeForItem(item, db, usedBarcodes);
    usedBarcodes.add(barcode);
    const existing = (code && variantByBarcode.get(code)) || variantBySku.get(sku.toLowerCase()) || null;
    const productKey = `${textValue(item.item_name).toLowerCase()}|${category.id || `new:${category.name.toLowerCase()}`}`;
    const existingProduct = existing ? { id: existing.product_id } : productByName.get(productKey) || null;
    const plan = {
      sourceId: item.item_id,
      name: textValue(item.item_name),
      description: textValue(item.item_description),
      hsn: textValue(item.item_hsn_sac_code),
      categoryName: category.name,
      categoryId: category.id,
      sku,
      barcode,
      pricePaise: salePrice,
      mrpPaise: mrp > 0 && mrp >= salePrice ? mrp : 0,
      costPaise: purchasePrice,
      lowStock: Math.max(0, intValue(item.item_min_stock_quantity)),
      stock,
      status: intValue(item.item_is_active) === 1 ? 'active' : 'inactive',
      unitId: item.base_unit_id,
      existingVariantId: existing?.id || null,
      existingProductId: existingProduct?.id || null,
      action: existing ? (options.updateExisting ? 'update' : 'skip') : 'create',
    };
    productPlan.push(plan);
    variantByItemId.set(item.item_id, plan);
  }
  warning('services', 'Vyapar services are not supported by the POS and were skipped.', productCounts.services);
  warning(
    'negative-stock',
    'Negative stock is preserved exactly. These items need a physical count.',
    productCounts.negative,
    productPlan.filter((row) => row.stock < 0).map((row) => `${row.name}: ${row.stock}`)
  );
  warning(
    'zero-price',
    'Zero-price products are imported active with their original ₹0 selling price.',
    productCounts.zeroPrice,
    productPlan.filter((row) => row.pricePaise <= 0).map((row) => row.name)
  );
  warning(
    'zero-price-services',
    'Zero-price Vyapar records that are services are skipped; only products are imported.',
    productCounts.zeroPriceServices
  );
  warning(
    'zero-cost',
    'Zero purchase-cost products are imported with cost ₹0; profit will be overstated until corrected.',
    productCounts.zeroCost,
    productPlan.filter((row) => row.costPaise <= 0).map((row) => row.name)
  );
  warning(
    'uncategorised',
    'Items with no Vyapar category are placed in "Other".',
    productCounts.uncategorised
  );

  const names = source.prepare('SELECT * FROM kb_names WHERE name_type = 1').all();
  const nameById = new Map(names.map((row) => [row.name_id, row]));
  const salesCountByParty = new Map(
    source
      .prepare("SELECT txn_name_id, COUNT(*) AS c FROM kb_transactions WHERE txn_type = 1 AND txn_name_id IS NOT NULL GROUP BY txn_name_id")
      .all()
      .map((row) => [row.txn_name_id, Number(row.c)])
  );
  const usedNames = source
    .prepare('SELECT DISTINCT txn_name_id FROM kb_transactions WHERE txn_name_id IS NOT NULL')
    .all()
    .map((row) => row.txn_name_id);
  const supplierNames = new Set(
    source
      .prepare('SELECT DISTINCT txn_name_id FROM kb_transactions WHERE txn_type IN (2,4) AND txn_name_id IS NOT NULL')
      .all()
      .map((row) => row.txn_name_id)
  );
  const customers = db.prepare('SELECT id, name, phone FROM customers').all();
  const customerByPhone = new Map(customers.map((row) => [row.phone, row]));
  const customerPlan = [];
  const duplicatePhones = new Map();
  for (const nameId of usedNames) {
    const name = nameById.get(nameId);
    if (!name) continue;
    if (!(salesCountByParty.get(nameId) > 0)) continue;
    if (name.full_name.trim().toUpperCase() === 'CASH') {
      continue;
    }
    const phone = normalizePhone(name.phone_number);
    if (!phone) {
      continue;
    }
    if (duplicatePhones.has(phone)) {
      duplicatePhones.get(phone).push(name.full_name);
      continue;
    }
    const existing = customerByPhone.get(phone);
    const entry = {
      sourceId: nameId,
      name: textValue(name.full_name) || 'Customer',
      billingName: textValue(name.party_billing_name),
      phone,
      email: textValue(name.email),
      address: textValue(name.address),
      notes: textValue(name.party_billing_name && name.party_billing_name !== name.full_name ? `Billing name: ${name.party_billing_name}` : ''),
      existingId: existing?.id || null,
      action: existing ? 'skip' : 'create',
      sales: salesCountByParty.get(nameId) || 0,
    };
    if (!existing) customerPlan.push(entry);
    customerByPhone.set(phone, { id: existing?.id || null, name: entry.name, phone });
    duplicatePhones.set(phone, []);
  }
  const duplicateCount = [...duplicatePhones.values()].reduce((sum, list) => sum + list.length, 0);
  warning(
    'duplicate-phones',
    'Records sharing a phone were merged into one customer. Original names are listed.',
    duplicateCount,
    [...duplicatePhones.entries()].filter(([, list]) => list.length).map(([phone, list]) => `${phone}: ${list.join(', ')}`)
  );
  const blankPhone = usedNames.filter((id) => {
    const name = nameById.get(id);
    return name && name.full_name.trim().toUpperCase() !== 'CASH' && !normalizePhone(name.phone_number);
  }).length;
  warning(
    'missing-phones',
    'Customers without a valid phone are not created; their invoice names are preserved.',
    blankPhone
  );

  const suppliers = db.prepare('SELECT id, name FROM suppliers').all();
  const supplierByName = new Map(suppliers.map((row) => [row.name.toLowerCase(), row.id]));
  const supplierPlan = [];
  const supplierBySourceId = new Map();
  for (const nameId of supplierNames) {
    const name = nameById.get(nameId);
    if (!name) continue;
    const existing = supplierByName.get(name.full_name.toLowerCase());
    const entry = {
      sourceId: nameId,
      name: textValue(name.full_name) || 'Supplier',
      phone: normalizePhone(name.phone_number),
      address: textValue(name.address),
      gstin: textValue(name.name_gstin_number),
      existingId: existing || null,
      action: existing ? 'skip' : 'create',
    };
    if (!existing) supplierPlan.push(entry);
    supplierBySourceId.set(nameId, existing || null);
  }

  const users = source.prepare('SELECT user_id, user_name FROM urp_users').all();
  const userById = new Map(users.map((row) => [row.user_id, textValue(row.user_name)]));
  const legacyUsers = users.map((row) => ({
    sourceId: row.user_id,
    name: textValue(row.user_name) || `Vyapar user ${row.user_id}`,
    mobile: `VYP-LEGACY-${row.user_id}`,
  }));
  const salesRows = source.prepare('SELECT * FROM kb_transactions WHERE txn_type = 1 ORDER BY txn_id').all();
  const saleLines = source
    .prepare('SELECT * FROM kb_lineitems WHERE lineitem_txn_id IN (SELECT txn_id FROM kb_transactions WHERE txn_type = 1) ORDER BY lineitem_id')
    .all();
  const linesByTxn = new Map();
  for (const line of saleLines) {
    if (!linesByTxn.has(line.lineitem_txn_id)) linesByTxn.set(line.lineitem_txn_id, []);
    linesByTxn.get(line.lineitem_txn_id).push(line);
  }
  const paymentRows = source.prepare('SELECT * FROM txn_payment_mapping').all();
  const paymentByTxn = new Map();
  for (const row of paymentRows) {
    if (!paymentByTxn.has(row.txn_id)) paymentByTxn.set(row.txn_id, []);
    paymentByTxn.get(row.txn_id).push(row);
  }
  const paymentTypes = source.prepare('SELECT * FROM kb_paymentTypes').all();
  const paymentTypeById = new Map(paymentTypes.map((row) => [row.paymentType_id, row]));
  const existingInvoiceRows = db.prepare('SELECT invoice_no FROM sales').all();
  const existingInvoices = new Set(existingInvoiceRows.map((row) => row.invoice_no));
  const salePlan = [];
  const saleCounts = { sales: 0, skippedNoLines: 0, skippedMissingItem: 0, lines: 0, unpaid: 0, partial: 0, paid: 0 };
  for (const sale of salesRows) {
    const lines = linesByTxn.get(sale.txn_id) || [];
    if (!lines.length) {
      saleCounts.skippedNoLines += 1;
      continue;
    }
    const mappedLines = [];
    let missing = false;
    for (const line of lines) {
      const variant = variantByItemId.get(line.item_id);
      if (!variant) {
        missing = true;
        break;
      }
      mappedLines.push({
        variant,
        itemId: line.item_id,
        quantity: Math.max(1, intValue(line.quantity)),
        unitPricePaise: rupeePaise(line.priceperunit),
        lineTotalPaise: rupeePaise(line.total_amount),
        lineDiscountPaise: rupeePaise(line.lineitem_discount_amount),
        mrpPaise: rupeePaise(line.lineitem_mrp) || variant.mrpPaise,
        hsnCode: textValue(line.lineitem_description).slice(0, 20) || variant.hsn,
        size: textValue(line.lineitem_size),
      });
    }
    if (missing) {
      saleCounts.skippedMissingItem += 1;
      continue;
    }
    const name = nameById.get(sale.txn_name_id);
    const customerPhone = name ? normalizePhone(name.phone_number) : '';
    const customer = customerPhone ? customerByPhone.get(customerPhone) : null;
    const sourceInvoice = textValue(sale.txn_ref_number_char);
    let invoiceNo = sourceInvoice || `VYP-SALE-${sale.txn_id}`;
    if (existingInvoices.has(invoiceNo)) {
      invoiceNo = `VYP-${invoiceNo}`;
    }
    existingInvoices.add(invoiceNo);
    const cash = rupeePaise(sale.txn_cash_amount);
    const due = rupeePaise(sale.txn_balance_amount);
    const lineGross = mappedLines.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0);
    const lineDiscount = mappedLines.reduce((sum, line) => sum + line.lineDiscountPaise, 0);
    const netLines = mappedLines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
    const billDiscount = rupeePaise(sale.txn_discount_amount);
    const roundOff = rupeePaise(sale.txn_round_off_amount);
    const total = cash + due;
    const computed = netLines - billDiscount + roundOff;
    const payment = paymentByTxn.get(sale.txn_id) || [];
    const methodName = payment
      .map((row) => paymentTypeById.get(row.payment_id)?.paymentType_name || '')
      .join(' ')
      .toLowerCase();
    const method = methodName.includes('cash')
      ? 'cash'
      : methodName.includes('paytm') || methodName.includes('upi')
        ? 'upi'
        : methodName.includes('cheque')
          ? 'bank_transfer'
          : 'card';
    const status = intValue(sale.txn_payment_status) === 3 ? 'paid' : intValue(sale.txn_payment_status) === 2 ? 'partial' : 'unpaid';
    if (status === 'paid') saleCounts.paid += 1;
    else if (status === 'partial') saleCounts.partial += 1;
    else saleCounts.unpaid += 1;
    saleCounts.sales += 1;
    saleCounts.lines += mappedLines.length;
    const cashierName = userById.get(sale.created_by) || 'Vyapar user';
    salePlan.push({
      sourceId: sale.txn_id,
      invoiceNo,
      idempotencyKey: `vyapar:${sourceHash.slice(0, 16)}:${sale.txn_id}`,
      customerId: customer?.id || null,
      customerName: name?.full_name?.trim() || 'Walk-in customer',
      customerPhone,
      date: sourceDate(sale.txn_date),
      completedAt: sourceDateTime(sale.txn_date, sale.txn_time),
      subtotalPaise: lineGross,
      lineDiscountPaise: lineDiscount,
      billDiscountPaise: billDiscount,
      discountTotalPaise: lineDiscount + billDiscount,
      taxPaise: 0,
      roundOffPaise: roundOff,
      totalPaise: total,
      amountPaidPaise: cash,
      changePaise: Math.max(0, cash - total),
      paymentStatus: status,
      paymentMethod: method,
      notes: `Vyapar import · transaction ${sale.txn_id} · original cashier: ${cashierName}`,
      sourceCashierId: sale.created_by,
      lines: mappedLines,
      expectedTotalPaise: computed,
      totalMismatch: Math.abs(computed - total) > 1,
    });
  }
  warning(
    'sales-no-lines',
    'Sales without line items cannot be reconstructed and were skipped.',
    saleCounts.skippedNoLines
  );
  warning(
    'sales-missing-items',
    'Sales containing an unsupported or missing item were skipped.',
    saleCounts.skippedMissingItem
  );
  warning(
    'sales-total-mismatch',
    'Some imported invoices have a line-total mismatch. Stored Vyapar totals are preserved.',
    salePlan.filter((row) => row.totalMismatch).length,
    salePlan.filter((row) => row.totalMismatch).map((row) => row.invoiceNo)
  );

  const purchaseRows = source.prepare('SELECT * FROM kb_transactions WHERE txn_type = 2 ORDER BY txn_id').all();
  const purchaseLines = source
    .prepare('SELECT * FROM kb_lineitems WHERE lineitem_txn_id IN (SELECT txn_id FROM kb_transactions WHERE txn_type = 2)')
    .all();
  const purchaseLinesByTxn = new Map();
  for (const line of purchaseLines) {
    if (!purchaseLinesByTxn.has(line.lineitem_txn_id)) purchaseLinesByTxn.set(line.lineitem_txn_id, []);
    purchaseLinesByTxn.get(line.lineitem_txn_id).push(line);
  }
  const purchasePlan = [];
  for (const purchase of purchaseRows) {
    const lines = purchaseLinesByTxn.get(purchase.txn_id) || [];
    const mapped = lines
      .map((line) => {
        const variant = variantByItemId.get(line.item_id);
        if (!variant) return null;
        return {
          variant,
          quantity: Math.max(1, intValue(line.quantity)),
          unitCostPaise: rupeePaise(line.priceperunit),
          lineTotalPaise: rupeePaise(line.total_amount),
        };
      })
      .filter(Boolean);
    if (!mapped.length) continue;
    const subtotal = mapped.reduce((sum, line) => sum + line.unitCostPaise * line.quantity, 0);
    const total = rupeePaise(purchase.txn_cash_amount) + rupeePaise(purchase.txn_balance_amount);
    purchasePlan.push({
      sourceId: purchase.txn_id,
      reference: `VYP-PUR-${purchase.txn_id}`,
      supplierName: textValue(nameById.get(purchase.txn_name_id)?.full_name) || 'Vyapar supplier',
      supplierId: supplierBySourceId.get(purchase.txn_name_id) || null,
      supplierInvoiceRef: textValue(purchase.txn_ref_number_char),
      date: sourceDate(purchase.txn_date),
      completedAt: sourceDateTime(purchase.txn_date, purchase.txn_time),
      subtotalPaise: subtotal,
      totalPaise: total,
      amountPaidPaise: rupeePaise(purchase.txn_cash_amount),
      balancePaise: rupeePaise(purchase.txn_balance_amount),
      lines: mapped,
    });
  }

  const expenseRows = source.prepare('SELECT * FROM kb_transactions WHERE txn_type = 7 ORDER BY txn_id').all();
  const expenseCategories = db.prepare('SELECT id, name FROM expense_categories').all();
  const expenseCategoryByName = new Map(expenseCategories.map((row) => [row.name.toLowerCase(), row.id]));
  const expensePlan = [];
  let skippedZeroExpenses = 0;
  for (const expense of expenseRows) {
    const amount = rupeePaise(expense.txn_cash_amount);
    if (amount <= 0) {
      skippedZeroExpenses += 1;
      continue;
    }
    const category = nameById.get(expense.txn_category_id);
    const categoryName = textValue(category?.full_name) || 'Other';
    expensePlan.push({
      sourceId: expense.txn_id,
      categoryName,
      categoryId: expenseCategoryByName.get(categoryName.toLowerCase()) || null,
      amountPaise: amount,
      date: sourceDate(expense.txn_date),
      completedAt: sourceDateTime(expense.txn_date, expense.txn_time),
      method: 'cash',
      description: `Vyapar expense · transaction ${expense.txn_id}`,
    });
  }

  warning(
    'zero-expenses',
    'Expenses with a zero amount cannot be represented and were skipped.',
    skippedZeroExpenses
  );

  const txnTypeCounts = new Map(
    source
      .prepare('SELECT txn_type, COUNT(*) AS c FROM kb_transactions GROUP BY txn_type')
      .all()
      .map((row) => [Number(row.txn_type), Number(row.c)])
  );

  const counts = {
    source: {
      items: items.length,
      products: items.length - productCounts.services,
      services: productCounts.services,
      categories: categoryRows.length,
      parties: names.length,
      customers: customerPlan.length,
      suppliers: supplierPlan.length,
      sales: salesRows.length,
      salesImported: salePlan.length,
      salesSkipped: saleCounts.skippedNoLines + saleCounts.skippedMissingItem,
      saleLines: saleCounts.lines,
      purchases: purchasePlan.length,
      expenses: expenseRows.length,
      estimates: txnTypeCounts.get(65) || 0,
      openingBalances: (txnTypeCounts.get(5) || 0) + (txnTypeCounts.get(6) || 0),
      paymentOuts: txnTypeCounts.get(4) || 0,
      creditNotes: txnTypeCounts.get(24) || 0,
      dateFrom: source.prepare('SELECT MIN(txn_date) AS d FROM kb_transactions WHERE txn_type = 1').get()?.d || '',
      dateTo: source.prepare('SELECT MAX(txn_date) AS d FROM kb_transactions WHERE txn_type = 1').get()?.d || '',
    },
    plan: {
      products: productPlan.filter((row) => row.action === 'create').length,
      variants: productPlan.filter((row) => row.action === 'create').length,
      updates: productPlan.filter((row) => row.action === 'update').length,
      categories: categoryPlan.size,
      customers: customerPlan.length,
      suppliers: supplierPlan.length,
      sales: salePlan.length,
      saleItems: saleCounts.lines,
      payments: salePlan.filter((row) => row.amountPaidPaise > 0).length,
      purchases: purchasePlan.length,
      purchaseItems: purchasePlan.reduce((sum, row) => sum + row.lines.length, 0),
      expenses: expensePlan.length,
    },
  };

  return {
    items,
    productPlan,
    categoryPlan: [...categoryPlan.values()],
    customerPlan,
    supplierPlan,
    salePlan,
    purchasePlan,
    expensePlan,
    legacyUsers,
    warnings,
    counts,
    previews: {
      products: productPlan.slice(0, 25).map((row) => ({
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        pricePaise: row.pricePaise,
        stock: row.stock,
        category: row.categoryName,
        action: row.action,
      })),
      customers: customerPlan.slice(0, 20).map((row) => ({
        name: row.name,
        phone: row.phone,
        sales: row.sales,
        action: row.action,
      })),
      sales: salePlan.slice(0, 20).map((row) => ({
        invoiceNo: row.invoiceNo,
        date: row.date,
        customer: row.customerName,
        totalPaise: row.totalPaise,
        paymentStatus: row.paymentStatus,
      })),
    },
  };
}

function ensureCategory(db, name, cache) {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const existing = db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const code = categoryCode(db, name);
  const result = db
    .prepare("INSERT INTO categories (name, code, status, created_at) VALUES (?, ?, 'active', ?)")
    .run(name, code, nowIso());
  const id = Number(result.lastInsertRowid);
  cache.set(key, id);
  return id;
}

function ensureExpenseCategory(db, name, cache) {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const existing = db.prepare('SELECT id FROM expense_categories WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const result = db
    .prepare("INSERT INTO expense_categories (name, status, created_at) VALUES (?, 'active', ?)")
    .run(name, nowIso());
  const id = Number(result.lastInsertRowid);
  cache.set(key, id);
  return id;
}

function insertSale(db, sale, variantIds, cashierId) {
  const result = db
    .prepare(
      `INSERT INTO sales (invoice_no, idempotency_key, customer_id, customer_name, customer_phone, customer_gstin,
         sale_date, business_date, subtotal_paise, line_discount_paise, bill_discount_paise, discount_total_paise,
         tax_paise, round_off_paise, total_paise, amount_paid_paise, change_paise, payment_status, payment_method,
         cashier_id, shift_id, status, notes, offer_id, offer_name, tax_enabled, tax_rate_bp, prices_include_tax,
         created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'completed', ?, NULL, '', 0, 0, 0, ?, ?)`
    )
    .run(
      sale.invoiceNo,
      sale.idempotencyKey,
      sale.customerId,
      sale.customerName,
      sale.customerPhone,
      sale.completedAt,
      sale.date,
      sale.subtotalPaise,
      sale.lineDiscountPaise,
      sale.billDiscountPaise,
      sale.discountTotalPaise,
      sale.taxPaise,
      sale.roundOffPaise,
      sale.totalPaise,
      sale.amountPaidPaise,
      sale.changePaise,
      sale.paymentStatus,
      sale.paymentMethod,
      cashierId,
      sale.notes,
      sale.completedAt,
      sale.completedAt
    );
  const saleId = Number(result.lastInsertRowid);
  for (const line of sale.lines) {
    const variantId = line.variant.existingVariantId || variantIds.get(line.variant.sourceId);
    if (!variantId) fail(`Sale ${sale.invoiceNo} refers to an unimported variant.`);
    db.prepare(
      `INSERT INTO sale_items (sale_id, variant_id, product_name, variant_label, sku, barcode, quantity,
         unit_price_paise, mrp_paise, unit_cost_paise, line_discount_paise, tax_rate_bp, tax_paise, hsn_code, line_total_paise)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
    ).run(
      saleId,
      variantId,
      line.variant.name,
      line.size || 'Default / Free',
      line.variant.sku,
      line.variant.barcode,
      line.quantity,
      line.unitPricePaise,
      line.mrpPaise,
      line.variant.costPaise,
      line.lineDiscountPaise,
      line.hsnCode,
      line.lineTotalPaise
    );
  }
  if (sale.amountPaidPaise > 0) {
    db.prepare('INSERT INTO payments (sale_id, method, amount_paise, reference, created_at) VALUES (?, ?, ?, ?, ?)').run(
      saleId,
      sale.paymentMethod,
      sale.amountPaidPaise,
      'vyapar',
      sale.completedAt
    );
  }
  return saleId;
}

export function createVyaparService({ db, auth, backupService, logger }) {
  function inspect(sourcePath, options = {}) {
    auth.requirePermission('products.manage');
    const prepared = prepareSource(sourcePath);
    try {
      const plan = buildPlan(prepared.source, db, options, prepared.hash);
      const token = crypto.randomUUID();
      sessions.set(token, { ...prepared, createdAt: Date.now() });
      return {
        token,
        fileName: prepared.fileName,
        sourceHash: prepared.hash,
        sourceKind: prepared.kind,
        counts: plan.counts,
        warnings: plan.warnings,
        previews: plan.previews,
        fields: [],
      };
    } finally {
      try {
        prepared.source.close();
      } catch {
        // Ignore close failure.
      }
    }
  }

  function commit(token, options = {}) {
    const user = auth.requirePermission('products.manage');
    auth.requirePermission('inventory.adjust');
    auth.requirePermission('pos.use');
    const session = sessions.get(String(token || ''));
    if (!session) fail('The Vyapar preview has expired. Choose the backup again.');
    const prepared = prepareSourceFromSession(session);
    try {
      const plan = buildPlan(prepared.source, db, options, prepared.hash);
      const previous = getSetting(db, 'vyaparImport');
      if (previous?.lastImport?.sourceHash === prepared.hash && !options.allowRepeat) {
        fail('This exact Vyapar backup was already imported. Choose a newer backup or confirm a repeat import.');
      }
      if (!plan.salePlan.length && !plan.productPlan.length) fail('There is nothing to import from this backup.');

      const backup = backupService.createManual(user);
      if (!backup?.path || backup.integrity !== 'ok') fail('The pre-import database backup failed. Import cancelled.');

      const summary = transaction(db, () => {
        const categoryCache = new Map();
        const categoryIds = new Map();
        for (const category of plan.categoryPlan) {
          categoryIds.set(category.name.toLowerCase(), ensureCategory(db, category.name, categoryCache));
        }
        const variantIds = new Map();
        for (const product of plan.productPlan) {
          if (product.action === 'skip') {
            if (product.existingVariantId) variantIds.set(product.sourceId, product.existingVariantId);
            continue;
          }
          if (product.action === 'update' && product.existingVariantId) {
            db.prepare(
              `UPDATE product_variants SET price_paise = ?, mrp_paise = ?, cost_paise = ?,
                 low_stock_threshold = ?, updated_at = ? WHERE id = ?`
            ).run(
              product.pricePaise,
              product.mrpPaise,
              product.costPaise,
              product.lowStock,
              nowIso(),
              product.existingVariantId
            );
            variantIds.set(product.sourceId, product.existingVariantId);
            continue;
          }
          let productId = product.existingProductId;
          if (!productId) {
            const categoryId = product.categoryId || categoryIds.get(product.categoryName.toLowerCase());
            if (!categoryId) fail(`Category ${product.categoryName} could not be created.`);
            const result = db
              .prepare(
                `INSERT INTO products (name, description, category_id, brand_id, supplier_id, hsn_code, tax_rate_bp,
                   status, created_at, updated_at, created_by, updated_by)
                 VALUES (?, ?, ?, NULL, NULL, ?, 0, ?, ?, ?, ?, ?)`
              )
              .run(
                product.name,
                product.description,
                categoryId,
                product.hsn,
                product.status,
                nowIso(),
                nowIso(),
                user.user.id,
                user.user.id
              );
            productId = Number(result.lastInsertRowid);
          }
          const inserted = db
            .prepare(
              `INSERT INTO product_variants (product_id, sku, barcode, color, size, cost_paise, price_paise, mrp_paise,
                 low_stock_threshold, status, created_at, updated_at)
               VALUES (?, ?, ?, 'Default', 'Free', ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              productId,
              product.sku,
              product.barcode,
              product.costPaise,
              product.pricePaise,
              product.mrpPaise,
              product.lowStock,
              product.status,
              nowIso(),
              nowIso()
            );
          const variantId = Number(inserted.lastInsertRowid);
          variantIds.set(product.sourceId, variantId);
          db.prepare('INSERT INTO inventory_balances (variant_id, quantity, updated_at) VALUES (?, ?, ?)').run(
            variantId,
            product.stock,
            nowIso()
          );
          if (product.stock !== 0) {
            db.prepare(
              `INSERT INTO stock_movements (variant_id, product_id, movement_type, quantity_change, balance_after,
                 unit_cost_paise, reference_type, reference_id, reference_no, reason, note, created_by, created_at)
               VALUES (?, ?, 'opening', ?, ?, ?, 'vyapar_import', NULL, ?, 'Vyapar migration opening balance', ?, ?, ?)`
            ).run(
              variantId,
              productId,
              product.stock,
              product.stock,
              product.costPaise,
              prepared.hash.slice(0, 16),
              prepared.fileName,
              user.user.id,
              nowIso()
            );
          }
        }

        for (const customer of plan.customerPlan) {
          if (customer.existingId) continue;
          const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(customer.phone);
          if (existing) continue;
          db.prepare(
            `INSERT INTO customers (name, phone, email, address, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(customer.name, customer.phone, customer.email, customer.address, customer.notes, nowIso(), nowIso());
        }
        for (const supplier of plan.supplierPlan) {
          if (supplier.existingId) continue;
          const existing = db.prepare('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE').get(supplier.name);
          if (existing) continue;
          db.prepare(
            `INSERT INTO suppliers (name, contact_person, phone, email, address, gstin, notes, status, created_at, updated_at)
             VALUES (?, '', ?, '', ?, ?, '', 'active', ?, ?)`
          ).run(supplier.name, supplier.phone, supplier.address, supplier.gstin, nowIso(), nowIso());
        }

        const legacyUserIds = new Map();
        for (const legacy of plan.legacyUsers) {
          const existing = db.prepare('SELECT id FROM users WHERE mobile = ?').get(legacy.mobile);
          if (existing) {
            legacyUserIds.set(legacy.sourceId, existing.id);
            continue;
          }
          const inserted = db
            .prepare(
              `INSERT INTO users (name, mobile, password_hash, role_code, status, created_at, updated_at,
                 removed_at, removed_by, removal_reason)
               VALUES (?, ?, '!', 'cashier', 'disabled', ?, ?, ?, ?, 'Imported legacy Vyapar user')`
            )
            .run(legacy.name, legacy.mobile, nowIso(), nowIso(), nowIso(), user.user.id);
          legacyUserIds.set(legacy.sourceId, Number(inserted.lastInsertRowid));
        }

        for (const sale of plan.salePlan) {
          const customer = sale.customerPhone
            ? db.prepare('SELECT id FROM customers WHERE phone = ?').get(sale.customerPhone)
            : null;
          insertSale(
            db,
            { ...sale, customerId: customer?.id || sale.customerId },
            variantIds,
            legacyUserIds.get(sale.sourceCashierId) || user.user.id
          );
        }

        for (const purchase of plan.purchasePlan) {
          let supplierId = purchase.supplierId;
          if (!supplierId) {
            const supplier = db.prepare('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE').get(purchase.supplierName);
            if (supplier) supplierId = supplier.id;
          }
          if (!supplierId) fail(`Supplier ${purchase.supplierName} could not be resolved.`);
          const purchaseResult = db
            .prepare(
              `INSERT INTO purchases (reference, supplier_id, supplier_invoice_ref, purchase_date, business_date, subtotal_paise,
                 discount_paise, additional_cost_paise, tax_paise, total_paise, amount_paid_paise, balance_paise,
                 payment_status, notes, status, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, 'posted', ?, ?, ?)`
            )
            .run(
              purchase.reference,
              supplierId,
              purchase.supplierInvoiceRef,
              purchase.completedAt,
              purchase.date,
              purchase.subtotalPaise,
              purchase.totalPaise,
              purchase.amountPaidPaise,
              purchase.balancePaise,
              purchase.balancePaise > 0 ? 'partial' : 'paid',
              `Vyapar import · transaction ${purchase.sourceId}`,
              user.user.id,
              nowIso(),
              nowIso()
            );
          const purchaseId = Number(purchaseResult.lastInsertRowid);
          for (const line of purchase.lines) {
            db.prepare(
              `INSERT INTO purchase_items (purchase_id, variant_id, product_name, variant_label, sku, quantity,
                 unit_cost_paise, discount_paise, additional_cost_paise, tax_rate_bp, tax_paise, hsn_code, line_total_paise)
               VALUES (?, ?, ?, 'Default / Free', ?, ?, ?, 0, 0, 0, 0, ?, ?)`
            ).run(
              purchaseId,
              variantIds.get(line.variant.sourceId) || line.variant.existingVariantId,
              line.variant.name,
              line.variant.sku,
              line.quantity,
              line.unitCostPaise,
              line.variant.hsn,
              line.lineTotalPaise
            );
          }
          if (purchase.amountPaidPaise > 0) {
            db.prepare(
              `INSERT INTO purchase_payments (purchase_id, amount_paise, method, reference, paid_at, created_by)
               VALUES (?, ?, 'cash', 'vyapar', ?, ?)`
            ).run(purchaseId, purchase.amountPaidPaise, nowIso(), user.user.id);
          }
        }

        const expenseCache = new Map();
        for (const expense of plan.expensePlan) {
          const categoryId =
            expense.categoryId || ensureExpenseCategory(db, expense.categoryName, expenseCache);
          db.prepare(
            `INSERT INTO expenses (expense_date, business_date, category_id, amount_paise, payment_method,
               description, reference, vendor, status, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, '', 'active', ?, ?, ?)`
          ).run(
            expense.completedAt,
            expense.date,
            categoryId,
            expense.amountPaise,
            expense.method,
            expense.description,
            `VYP-EXP-${expense.sourceId}`,
            user.user.id,
            nowIso(),
            nowIso()
          );
        }

        saveSetting(
          db,
          'vyaparImport',
          {
            lastImport: {
              sourceHash: prepared.hash,
              fileName: prepared.fileName,
              importedAt: nowIso(),
              importedBy: user.user.name,
              summary: plan.counts,
            },
          },
          user.user.id
        );
        writeAudit(db, {
          userId: user.user.id,
          userName: user.user.name,
          action: 'vyapar.imported',
          entityType: 'catalog',
          entityId: prepared.hash.slice(0, 16),
          details: { fileName: prepared.fileName, sourceHash: prepared.hash, ...plan.counts.plan },
        });
        return plan.counts;
      });

      sessions.delete(String(token));
      cleanup(prepared.directory);
      logger?.info('Vyapar import completed', {
        file: prepared.fileName,
        sourceHash: prepared.hash,
        summary,
      });
      return {
        sourceHash: prepared.hash,
        backupPath: backup.path,
        summary,
        warnings: plan.warnings,
        restartRequired: true,
      };
    } finally {
      try {
        prepared.source.close();
      } catch {
        // Ignore close failure.
      }
    }
  }

  function prepareSourceFromSession(session) {
    const source = new DatabaseSync(session.dbPath);
    source.exec('PRAGMA query_only = ON');
    return { ...session, source };
  }

  return { inspect, commit };
}
