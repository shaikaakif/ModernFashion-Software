import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { fail } from '../core/errors.js';
import { writeAudit } from '../core/audit.js';
import { currentFinancialYear, nowIso } from '../core/validation.js';
import { transaction } from '../core/database.js';
import { getSetting } from '../core/settings.js';
import { recordStockMovement, getStock } from '../core/inventory.js';
import { allocateSequence } from '../core/sequences.js';
import { nextBarcode, buildSku } from './catalogService.js';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 10000;
const PREVIEW_ROWS = 300;

const FIELDS = [
  {
    key: 'productName',
    label: 'Product name',
    required: true,
    hint: 'Item Name, Product, Description',
    aliases: ['productname', 'product', 'itemname', 'item', 'name', 'description', 'particular', 'itemdescription'],
  },
  {
    key: 'sellingPrice',
    label: 'Selling price',
    required: true,
    hint: 'Sale Price, Selling Price, Rate',
    aliases: ['sellingprice', 'saleprice', 'price', 'rate', 'retailprice', 'sellingrate', 'sp', 'mop'],
  },
  {
    key: 'mrp',
    label: 'MRP',
    required: false,
    hint: 'MRP, List Price',
    aliases: ['mrp', 'maximumretailprice', 'listprice', 'tagprice'],
  },
  {
    key: 'cost',
    label: 'Purchase cost',
    required: false,
    hint: 'Cost Price, Purchase Price',
    aliases: ['cost', 'costprice', 'purchaseprice', 'buyingprice', 'purchaserate', 'landedcost', 'cp'],
  },
  {
    key: 'category',
    label: 'Category',
    required: false,
    hint: 'Category, Group, Department',
    aliases: ['category', 'categoryname', 'group', 'department', 'itemcategory', 'productcategory'],
  },
  {
    key: 'brand',
    label: 'Brand',
    required: false,
    hint: 'Brand, Company',
    aliases: ['brand', 'brandname', 'company', 'manufacturer'],
  },
  {
    key: 'colour',
    label: 'Colour',
    required: false,
    hint: 'Colour, Color, Variant',
    aliases: ['colour', 'color', 'colourname', 'colorname', 'variant'],
  },
  {
    key: 'size',
    label: 'Size',
    required: false,
    hint: 'Size, Size Name',
    aliases: ['size', 'sizename'],
  },
  {
    key: 'sku',
    label: 'SKU / item code',
    required: false,
    hint: 'SKU, Item Code, Style Code',
    aliases: ['sku', 'itemcode', 'code', 'productcode', 'itemid', 'stylecode', 'styleno', 'articleno', 'skucode'],
  },
  {
    key: 'barcode',
    label: 'Barcode',
    required: false,
    hint: 'Barcode, EAN, UPC',
    aliases: ['barcode', 'barcodeno', 'barcodenumber', 'ean', 'upc', 'item barcode'.replace(/\s/g, '')],
  },
  {
    key: 'stock',
    label: 'Stock',
    required: false,
    hint: 'Current Stock, Quantity, Opening Stock',
    aliases: ['stock', 'quantity', 'qty', 'currentstock', 'openingstock', 'balance', 'stockqty', 'available stock'.replace(/\s/g, '')],
  },
  {
    key: 'taxRate',
    label: 'GST %',
    required: false,
    hint: 'GST Rate, Tax %',
    aliases: ['tax', 'gst', 'gstrate', 'taxrate', 'gstpercent', 'taxpercent'],
  },
  {
    key: 'hsn',
    label: 'HSN code',
    required: false,
    hint: 'HSN, HSN/SAC',
    aliases: ['hsn', 'hsncode', 'hsnsac', 'sac'],
  },
  {
    key: 'lowStock',
    label: 'Low-stock level',
    required: false,
    hint: 'Reorder Level, Minimum Stock',
    aliases: ['lowstock', 'lowstockthreshold', 'reorderlevel', 'minimumstock', 'minstock', 'alertqty'],
  },
  {
    key: 'status',
    label: 'Status',
    required: false,
    hint: 'Active, Inactive',
    aliases: ['status', 'itemstatus', 'productstatus'],
  },
];

function normalizeKey(value) {  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const FIELD_ALIASES = FIELDS.map((field) => ({
  key: field.key,
  aliases: field.aliases.map(normalizeKey).filter(Boolean),
}));

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u00a0/g, ' ').trim();
}

function parseAmount(value) {
  let raw = text(value);
  if (!raw) return null;
  raw = raw.replace(/[₹$€£\s]/g, '');
  raw = raw.replace(/^rs\.?/i, '').replace(/^inr/i, '');
  raw = raw.replace(/,/g, '');
  const negative = raw.startsWith('-');
  raw = raw.replace(/[^0-9.]/g, '');
  if (!raw || raw === '.') return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) return NaN;
  return Math.round((negative ? -number : number) * 100);
}

function parsePercentBp(value) {
  let raw = text(value);
  if (!raw) return null;
  const wasPercentText = raw.includes('%');
  raw = raw.replace(/%/g, '').replace(/[^0-9.-]/g, '');
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 28) return NaN;
  // Excel stores a percentage-formatted cell as a fraction (5% -> 0.05).
  if (!wasPercentText && typeof value === 'number' && number > 0 && number < 1) {
    return Math.round(number * 10000);
  }
  return Math.round(number * 100);
}

function parseQuantity(value) {
  let raw = text(value).replace(/,/g, '');
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || !Number.isInteger(number)) return NaN;
  return number;
}

function detectDelimiter(line) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (!quoted && character in counts) counts[character] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCsv(source, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = '';
    } else if (character === '\r') {
      if (source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function decodeBuffer(buffer) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function uniqueHeaders(values) {
  const seen = new Map();
  return values.map((value, index) => {
    const base = text(value) || `Column ${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

function suggestMapping(headers) {
  const normalized = headers.map(normalizeKey);
  const candidates = [];
  for (const field of FIELD_ALIASES) {
    normalized.forEach((header, index) => {
      if (!header) return;
      let score = 0;
      for (const alias of field.aliases) {
        if (header === alias) score = Math.max(score, 100 + alias.length);
        else if (header.startsWith(alias) || header.endsWith(alias)) score = Math.max(score, 60 + alias.length);
        else if (alias.length >= 5 && header.includes(alias)) score = Math.max(score, 40 + alias.length);
      }
      if (score) candidates.push({ key: field.key, index, score });
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const mapping = {};
  const usedHeaders = new Set();
  const usedFields = new Set();
  for (const candidate of candidates) {
    if (usedFields.has(candidate.key) || usedHeaders.has(candidate.index)) continue;
    mapping[candidate.key] = headers[candidate.index];
    usedFields.add(candidate.key);
    usedHeaders.add(candidate.index);
  }
  // Prefer a live stock column over an opening-stock column when both exist.
  if (mapping.stock && /opening/.test(normalizeKey(mapping.stock))) {
    const current = headers.find(
      (header) =>
        /current/.test(normalizeKey(header)) &&
        !Object.entries(mapping).some(([key, value]) => key !== 'stock' && value === header)
    );
    if (current) mapping.stock = current;
  }
  return mapping;
}

function extractTable(matrix) {
  const rows = matrix
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((value) => text(value)));
  const trimmed = rows.filter((row) => row.some((value) => value !== ''));
  if (!trimmed.length) fail('The file is empty. Add a header row and at least one product row.');

  let headerIndex = 0;
  let bestScore = -1;
  const scanLimit = Math.min(trimmed.length, 20);
  for (let index = 0; index < scanLimit; index += 1) {
    const row = trimmed[index];
    const nonEmpty = row.filter(Boolean).length;
    if (!nonEmpty) continue;
    const score = Object.keys(suggestMapping(row)).length * 10 + nonEmpty;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  }

  const headers = uniqueHeaders(trimmed[headerIndex]);
  const dataRows = trimmed
    .slice(headerIndex + 1)
    .map((row) => headers.map((_, index) => row[index] ?? ''))
    .filter((row) => row.some((value) => value !== ''));
  if (!dataRows.length) fail('The file has a header row but no product rows.');
  if (dataRows.length > MAX_ROWS) {
    fail(`This file has ${dataRows.length} rows. Import at most ${MAX_ROWS} rows at a time.`);
  }
  return { headers, rows: dataRows, headerIndex };
}

function readTable(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (!resolved) fail('Choose a CSV or Excel file to import.');
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    fail('The chosen file could not be found. Choose it again.');
  }
  if (!stat.isFile()) fail('Choose a single CSV or Excel file.');
  if (stat.size > MAX_BYTES) fail('The file is larger than 20 MB. Split it into smaller files.');
  if (!stat.size) fail('The chosen file is empty.');

  const extension = path.extname(resolved).toLowerCase();
  if (extension === '.vyb') {
    fail(
      'Vyapar .VYB files are a proprietary backup container and cannot be decoded reliably here. In Vyapar, export Items to Excel/CSV, then import that file.'
    );
  }
  if (['.csv', '.txt', '.tsv'].includes(extension)) {
    const buffer = fs.readFileSync(resolved);
    const source = decodeBuffer(buffer);
    const firstLine = source.split(/\r?\n/, 1)[0] || '';
    const delimiter = extension === '.tsv' ? '\t' : detectDelimiter(firstLine);
    const matrix = parseCsv(source, delimiter);
    return { ...extractTable(matrix), sheetName: path.basename(resolved) };
  }
  if (!['.xlsx', '.xlsm', '.xls'].includes(extension)) {
    fail('Choose a .csv, .xlsx or .xls file.');
  }

  let workbook;
  try {
    workbook = XLSX.readFile(resolved, { cellDates: false, cellText: true });
  } catch (error) {
    fail(`The Excel file could not be read: ${error?.message || 'unknown error'}`);
  }
  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name];
    return sheet && sheet['!ref'];
  });
  if (!sheetName) fail('The Excel workbook has no worksheet with data.');
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    blankrows: false,
  });
  return { ...extractTable(matrix), sheetName };
}

function resolveMapping(headers, requested) {
  const normalizedHeaders = new Map(headers.map((header, index) => [header, index]));
  const suggested = suggestMapping(headers);
  const mapping = {};
  if (requested && typeof requested === 'object' && Object.keys(requested).length) {
    for (const field of FIELDS) {
      const header = requested[field.key];
      if (header && normalizedHeaders.has(header)) mapping[field.key] = header;
    }
  } else {
    Object.assign(mapping, suggested);
  }
  if (!mapping.productName) mapping.productName = suggested.productName;
  if (!mapping.sellingPrice) mapping.sellingPrice = suggested.sellingPrice;
  const usedHeaders = new Set();
  for (const header of Object.values(mapping)) {
    if (usedHeaders.has(header)) fail(`The column "${header}" is mapped to more than one field.`);
    usedHeaders.add(header);
  }
  if (!mapping.productName) fail('Map a Product name column before importing.');
  if (!mapping.sellingPrice) fail('Map a Selling price column before importing.');
  return mapping;
}

function normalizeOptions(db, input = {}) {
  const tax = getSetting(db, 'tax');
  const pos = getSetting(db, 'pos');
  const stockMode = ['set', 'add', 'ignore'].includes(input.stockMode) ? input.stockMode : 'set';
  const existing = ['update', 'skip'].includes(input.existing) ? input.existing : 'update';
  const defaultCategoryId = Number(input.defaultCategoryId) || null;
  if (defaultCategoryId) {
    const category = db.prepare("SELECT id FROM categories WHERE id = ? AND status = 'active'").get(defaultCategoryId);
    if (!category) fail('Choose an active default category.');
  }
  const defaultTaxRateBp =
    input.defaultTaxRateBp === null || input.defaultTaxRateBp === undefined
      ? tax.enabled
        ? Number(tax.defaultRateBp || 0)
        : 0
      : Math.max(0, Math.min(2800, Math.round(Number(input.defaultTaxRateBp) || 0)));
  const defaultLowStock = Math.max(
    0,
    Math.min(100000, Math.round(Number(input.defaultLowStock ?? pos.lowStockThreshold ?? 5) || 0))
  );
  return {
    stockMode,
    existing,
    defaultCategoryId,
    defaultTaxRateBp,
    defaultLowStock,
    createCategories: input.createCategories !== false,
    createBrands: input.createBrands !== false,
    skipInvalid: Boolean(input.skipInvalid),
    defaultColour: text(input.defaultColour) || 'Default',
    defaultSize: text(input.defaultSize) || 'Free',
  };
}

function categoryCode(db, name) {
  const base = String(name).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3) || 'GEN';
  let candidate = base;
  let suffix = 0;
  while (db.prepare('SELECT id FROM categories WHERE code = ? COLLATE NOCASE').get(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 8);
    if (suffix > 99) fail('Could not generate a unique category code.');
  }
  return candidate;
}

function ensureCategory(db, user, name, cache) {
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
  writeAudit(db, {
    userId: user.user.id,
    userName: user.user.name,
    action: 'category.created',
    entityType: 'category',
    entityId: id,
    details: { name, code, source: 'import' },
  });
  cache.set(key, id);
  return id;
}

function ensureBrand(db, user, name, cache) {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const existing = db.prepare('SELECT id FROM brands WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const result = db.prepare("INSERT INTO brands (name, status, created_at) VALUES (?, 'active', ?)").run(name, nowIso());
  const id = Number(result.lastInsertRowid);
  writeAudit(db, {
    userId: user.user.id,
    userName: user.user.name,
    action: 'brand.created',
    entityType: 'brand',
    entityId: id,
    details: { name, source: 'import' },
  });
  cache.set(key, id);
  return id;
}

function lookupVariant(db, { barcode, sku }) {
  if (barcode) {
    const row = db
      .prepare(
        `SELECT v.*, p.name AS product_name, p.category_id, COALESCE(ib.quantity, 0) AS stock
         FROM product_variants v JOIN products p ON p.id = v.product_id
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         WHERE v.barcode = ?`
      )
      .get(barcode);
    if (row) return row;
  }
  if (sku) {
    return db
      .prepare(
        `SELECT v.*, p.name AS product_name, p.category_id, COALESCE(ib.quantity, 0) AS stock
         FROM product_variants v JOIN products p ON p.id = v.product_id
         LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
         WHERE v.sku = ? COLLATE NOCASE`
      )
      .get(sku);
  }
  return null;
}

function buildPlan(db, { filePath, mapping: requestedMapping, options: rawOptions }) {
  const table = readTable(filePath);
  const mapping = resolveMapping(table.headers, requestedMapping);
  const options = normalizeOptions(db, rawOptions);
  const indexByKey = {};
  for (const [key, header] of Object.entries(mapping)) indexByKey[key] = table.headers.indexOf(header);

  const value = (row, key) => {
    const index = indexByKey[key];
    return index === undefined || index < 0 ? '' : row[index] ?? '';
  };

  const defaultCategory = options.defaultCategoryId
    ? db.prepare('SELECT id, name FROM categories WHERE id = ?').get(options.defaultCategoryId)
    : null;

  const productCache = new Map();
  const variantCache = new Map();
  const skuSeen = new Map();
  const barcodeSeen = new Map();
  const missingCategories = new Set();
  const missingBrands = new Set();
  const rows = [];
  const firstDataRow = (table.headerIndex ?? 0) + 2;

  function productKey(name, categoryId) {
    return `${name.toLowerCase()}|${categoryId ?? 'none'}`;
  }

  function findProduct(name, categoryId) {
    const row = db
      .prepare(
        `SELECT id, name, category_id FROM products
         WHERE name = ? COLLATE NOCASE AND category_id = ? ORDER BY id LIMIT 1`
      )
      .get(name, categoryId);
    if (row) return row;
    const others = db
      .prepare('SELECT id FROM products WHERE name = ? COLLATE NOCASE LIMIT 2')
      .all(name);
    return others.length ? { ambiguous: true } : null;
  }

  for (let offset = 0; offset < table.rows.length; offset += 1) {
    const row = table.rows[offset];
    const rowNumber = offset + firstDataRow;
    const messages = [];
    const errors = [];
    const name = text(value(row, 'productName')).slice(0, 160);
    const categoryText = text(value(row, 'category')).slice(0, 80);
    const brandText = text(value(row, 'brand')).slice(0, 80);
    const colour = text(value(row, 'colour')).slice(0, 60) || options.defaultColour;
    const size = text(value(row, 'size')).slice(0, 60) || options.defaultSize;
    const sku = text(value(row, 'sku')).slice(0, 64);
    const barcode = text(value(row, 'barcode')).slice(0, 64);
    const hsn = text(value(row, 'hsn')).slice(0, 20);
    const rawStatus = text(value(row, 'status')).toLowerCase();
    const status = ['inactive', 'archived', 'disabled', 'removed'].includes(rawStatus) ? 'inactive' : 'active';
    const pricePaise = parseAmount(value(row, 'sellingPrice'));
    const mrpPaise = parseAmount(value(row, 'mrp'));
    const costPaise = parseAmount(value(row, 'cost'));
    const stock = parseQuantity(value(row, 'stock'));
    const taxRateBp = parsePercentBp(value(row, 'taxRate'));
    const lowStock = parseQuantity(value(row, 'lowStock'));

    if (!name) errors.push('Product name is missing.');
    if (pricePaise === null) errors.push('Selling price is missing.');
    else if (Number.isNaN(pricePaise)) errors.push('Selling price is not a valid amount.');
    else if (pricePaise <= 0) errors.push('Selling price must be greater than zero.');
    if (mrpPaise !== null && Number.isNaN(mrpPaise)) errors.push('MRP is not a valid amount.');
    if (costPaise !== null && Number.isNaN(costPaise)) errors.push('Purchase cost is not a valid amount.');
    if (stock !== null && Number.isNaN(stock)) errors.push('Stock must be a whole number.');
    if (taxRateBp !== null && Number.isNaN(taxRateBp)) errors.push('GST rate must be between 0 and 28.');
    if (lowStock !== null && (Number.isNaN(lowStock) || lowStock < 0)) errors.push('Low-stock level must be zero or more.');
    if (mrpPaise && pricePaise && mrpPaise > 0 && mrpPaise < pricePaise) errors.push('MRP is lower than the selling price.');

    let categoryId = defaultCategory?.id || null;
    let categoryName = defaultCategory?.name || '';
    if (categoryText) {
      const found = db.prepare('SELECT id, name FROM categories WHERE name = ? COLLATE NOCASE').get(categoryText);
      if (found) {
        categoryId = found.id;
        categoryName = found.name;
      } else if (options.createCategories) {
        categoryId = null;
        categoryName = categoryText;
        missingCategories.add(categoryText);
      } else {
        errors.push(`Category "${categoryText}" does not exist.`);
      }
    } else if (!categoryId) {
      errors.push('Category is missing. Map a Category column or choose a default category.');
    }

    let brandName = brandText;
    if (brandText && !db.prepare('SELECT id FROM brands WHERE name = ? COLLATE NOCASE').get(brandText)) {
      if (options.createBrands) missingBrands.add(brandText);
      else messages.push(`Brand "${brandText}" does not exist and will be left empty.`);
    }

    const key = productKey(name || '(missing)', categoryId);
    let product = productCache.get(key) || null;
    if (!product && name) {
      const found = findProduct(name, categoryId);
      if (found?.ambiguous) errors.push('Another product with this name exists in a different category.');
      else if (found) {
        product = { id: found.id, name, categoryId };
        productCache.set(key, product);
      }
    }
    if (!product && name) {
      product = { id: null, name, categoryId };
      productCache.set(key, product);
    }

    let existingVariant = null;
    if (barcode || sku) {
      const byBarcode = barcode ? lookupVariant(db, { barcode }) : null;
      const bySku = sku ? lookupVariant(db, { sku }) : null;
      if (byBarcode && bySku && byBarcode.id !== bySku.id) {
        errors.push('The barcode and SKU belong to two different existing variants.');
      } else {
        existingVariant = byBarcode || bySku;
      }
      if (existingVariant && (!product || existingVariant.product_id !== product.id)) {
        messages.push(`Matched existing ${byBarcode ? 'barcode' : 'SKU'} under another product name.`);
        product = {
          id: existingVariant.product_id,
          name: existingVariant.product_name,
          categoryId: existingVariant.category_id,
        };
        productCache.set(key, product);
        productCache.set(productKey(product.name, product.categoryId), product);
      }
    }
    if (!existingVariant && product?.id && name) {
      existingVariant = db
        .prepare(
          `SELECT v.*, p.name AS product_name, p.category_id, COALESCE(ib.quantity, 0) AS stock
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           LEFT JOIN inventory_balances ib ON ib.variant_id = v.id
           WHERE v.product_id = ? AND v.color = ? COLLATE NOCASE AND v.size = ? COLLATE NOCASE
           LIMIT 1`
        )
        .get(product.id, colour, size);
    }

    if (barcode) {
      const seenAt = barcodeSeen.get(barcode.toLowerCase());
      if (seenAt) errors.push(`Barcode ${barcode} is repeated in row ${seenAt}.`);
      else barcodeSeen.set(barcode.toLowerCase(), rowNumber);
    }
    if (sku) {
      const seenAt = skuSeen.get(sku.toLowerCase());
      if (seenAt) errors.push(`SKU ${sku} is repeated in row ${seenAt}.`);
      else skuSeen.set(sku.toLowerCase(), rowNumber);
    }
    if (product) {
      const variantKey = `${key}|${colour.toLowerCase()}|${size.toLowerCase()}`;
      const seenAt = variantCache.get(variantKey);
      if (seenAt) errors.push(`The same product, colour and size already appears in row ${seenAt}.`);
      else variantCache.set(variantKey, rowNumber);
    }

    const action = errors.length
      ? 'error'
      : existingVariant && options.existing === 'skip'
        ? 'skip'
        : existingVariant
          ? 'update'
          : 'create';

    rows.push({
      rowNumber,
      action,
      errors,
      messages,
      productName: name,
      categoryName,
      categoryId,
      brandName,
      colour,
      size,
      sku,
      barcode,
      pricePaise: pricePaise === null || Number.isNaN(pricePaise) ? null : pricePaise,
      mrpPaise: mrpPaise === null || Number.isNaN(mrpPaise) ? null : mrpPaise,
      costPaise: costPaise === null || Number.isNaN(costPaise) ? null : costPaise,
      stock: stock === null || Number.isNaN(stock) ? null : stock,
      taxRateBp: taxRateBp === null || Number.isNaN(taxRateBp) ? null : taxRateBp,
      hsn,
      lowStock: lowStock === null || Number.isNaN(lowStock) ? null : lowStock,
      status,
      productKey: key,
      productId: product?.id || null,
      existingVariantId: existingVariant?.id || null,
      existingStock: existingVariant ? Number(existingVariant.stock ?? 0) : null,
      existingPricePaise: existingVariant ? Number(existingVariant.price_paise) : null,
      existingMrpPaise: existingVariant ? Number(existingVariant.mrp_paise) : null,
      existingCostPaise: existingVariant ? Number(existingVariant.cost_paise) : null,
      existingLowStock: existingVariant ? Number(existingVariant.low_stock_threshold) : null,
    });
  }

  const newProductKeys = new Set(
    rows.filter((row) => row.action === 'create' && !row.productId).map((row) => row.productKey)
  );
  const summary = {
    totalRows: rows.length,
    createProducts: newProductKeys.size,
    createVariants: rows.filter((row) => row.action === 'create').length,
    updateVariants: rows.filter((row) => row.action === 'update').length,
    skipped: rows.filter((row) => row.action === 'skip').length,
    errors: rows.filter((row) => row.action === 'error').length,
    createCategories: [...missingCategories],
    createBrands: [...missingBrands],
  };

  return {
    headers: table.headers,
    sheetName: table.sheetName,
    mapping,
    suggested: suggestMapping(table.headers),
    options,
    rows,
    summary,
  };
}

function previewRow(row) {
  return {
    rowNumber: row.rowNumber,
    action: row.action,
    errors: row.errors,
    messages: row.messages,
    productName: row.productName,
    categoryName: row.categoryName,
    brandName: row.brandName,
    colour: row.colour,
    size: row.size,
    sku: row.sku,
    barcode: row.barcode,
    pricePaise: row.pricePaise,
    mrpPaise: row.mrpPaise,
    stock: row.stock,
    taxRateBp: row.taxRateBp,
    existingStock: row.existingStock,
  };
}

export function createImportService({ db, auth, logger }) {
  function preview(input = {}) {
    auth.requirePermission('products.manage');
    const plan = buildPlan(db, input);
    return {
      fileName: path.basename(String(input.filePath || '')),
      sheetName: plan.sheetName,
      headers: plan.headers,
      mapping: plan.mapping,
      suggested: plan.suggested,
      fields: FIELDS.map(({ key, label, required, hint }) => ({ key, label, required, hint })),
      options: plan.options,
      summary: plan.summary,
      rows: plan.rows.slice(0, PREVIEW_ROWS).map(previewRow),
      previewLimit: PREVIEW_ROWS,
    };
  }

  function commit(input = {}) {
    const user = auth.requirePermission('products.manage');
    const plan = buildPlan(db, input);
    const options = plan.options;
    if (options.stockMode !== 'ignore') auth.requirePermission('inventory.adjust');

    const invalid = plan.rows.filter((row) => row.action === 'error');
    if (invalid.length && !options.skipInvalid) {
      const details = invalid
        .slice(0, 8)
        .map((row) => `Row ${row.rowNumber}: ${row.errors[0]}`)
        .join(' ');
      fail(
        `${invalid.length} row${invalid.length === 1 ? ' needs' : 's need'} attention. ${details}`,
        'IMPORT_INVALID_ROWS',
        { rows: invalid.slice(0, 50).map((row) => ({ rowNumber: row.rowNumber, errors: row.errors })) }
      );
    }
    const actionable = plan.rows.filter((row) => row.action === 'create' || row.action === 'update');
    if (!actionable.length) fail('There are no valid rows to import.');

    const fileName = path.basename(String(input.filePath || ''));
    const now = nowIso();
    const reference = `IMP/${currentFinancialYear()}/${String(
      allocateSequence(db, 'import', currentFinancialYear())
    ).padStart(4, '0')}`;
    const categoryCache = new Map();
    const brandCache = new Map();
    const createdProducts = new Map();
    let createdProductCount = 0;
    let createdVariantCount = 0;
    let updatedVariantCount = 0;
    let stockChanges = 0;

    transaction(db, () => {
      for (const row of actionable) {
        let productId = row.productId || createdProducts.get(row.productKey) || null;
        if (!productId) {
          let categoryId = row.categoryId;
          if (!categoryId && row.categoryName) {
            if (!options.createCategories) fail(`Category "${row.categoryName}" does not exist.`);
            categoryId = ensureCategory(db, user, row.categoryName, categoryCache);
          }
          if (!categoryId) fail(`Row ${row.rowNumber}: category is missing.`);
          let brandId = null;
          if (row.brandName) {
            if (options.createBrands) brandId = ensureBrand(db, user, row.brandName, brandCache);
            else brandId = db.prepare('SELECT id FROM brands WHERE name = ? COLLATE NOCASE').get(row.brandName)?.id || null;
          }
          const result = db
            .prepare(
              `INSERT INTO products (name, description, category_id, brand_id, supplier_id, hsn_code, tax_rate_bp,
                 status, created_at, updated_at, created_by, updated_by)
               VALUES (?, '', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              row.productName,
              categoryId,
              brandId,
              row.hsn || '',
              row.taxRateBp ?? options.defaultTaxRateBp,
              row.status,
              now,
              now,
              user.user.id,
              user.user.id
            );
          productId = Number(result.lastInsertRowid);
          createdProducts.set(row.productKey, productId);
          createdProductCount += 1;
        }

        let variantId = row.existingVariantId;
        if (row.action === 'update' && variantId) {
          db.prepare(
            `UPDATE product_variants SET price_paise = ?, mrp_paise = ?, cost_paise = ?,
               low_stock_threshold = ?, updated_at = ? WHERE id = ?`
          ).run(
            row.pricePaise,
            row.mrpPaise ?? row.existingMrpPaise ?? 0,
            row.costPaise ?? row.existingCostPaise ?? 0,
            row.lowStock ?? row.existingLowStock ?? options.defaultLowStock,
            now,
            variantId
          );
          updatedVariantCount += 1;
        } else if (row.action === 'create') {
          const product = db
            .prepare(
              `SELECT p.id, p.name, c.code AS category_code FROM products p
               JOIN categories c ON c.id = p.category_id WHERE p.id = ?`
            )
            .get(productId);
          if (!product) fail(`Row ${row.rowNumber}: the product could not be created.`);
          let barcode = row.barcode;
          if (!barcode) barcode = nextBarcode(db);
          const conflict = db.prepare('SELECT id FROM product_variants WHERE barcode = ?').get(barcode);
          if (conflict && conflict.id !== row.existingVariantId) {
            fail(`Row ${row.rowNumber}: barcode ${barcode} is already used by another product.`);
          }
          let sku = row.sku;
          if (!sku) sku = buildSku(db, product.category_code, productId, row.colour, row.size);
          const skuConflict = db
            .prepare('SELECT id FROM product_variants WHERE sku = ? COLLATE NOCASE')
            .get(sku);
          if (skuConflict) fail(`Row ${row.rowNumber}: SKU ${sku} is already used by another product.`);
          const inserted = db
            .prepare(
              `INSERT INTO product_variants (product_id, sku, barcode, color, size, cost_paise, price_paise, mrp_paise,
                 low_stock_threshold, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              productId,
              sku,
              barcode,
              row.colour,
              row.size,
              row.costPaise ?? 0,
              row.pricePaise,
              row.mrpPaise ?? row.pricePaise,
              row.lowStock ?? options.defaultLowStock,
              row.status,
              now,
              now
            );
          variantId = Number(inserted.lastInsertRowid);
          db.prepare('INSERT INTO inventory_balances (variant_id, quantity, updated_at) VALUES (?, 0, ?)').run(
            variantId,
            now
          );
          createdVariantCount += 1;
          const opening = options.stockMode === 'ignore' ? 0 : row.stock ?? 0;
          if (opening !== 0) {
            recordStockMovement(db, {
              variantId,
              productId,
              quantityChange: opening,
              movementType: 'opening',
              unitCostPaise: row.costPaise ?? 0,
              referenceType: 'import',
              referenceNo: reference,
              reason: 'Opening stock from import',
              note: fileName,
              userId: user.user.id,
            });
            stockChanges += 1;
          }
        }

        if (row.action === 'update' && variantId && row.stock !== null && options.stockMode !== 'ignore') {
          const current = getStock(db, variantId);
          const target = options.stockMode === 'add' ? current + row.stock : row.stock;
          const change = target - current;
          if (change !== 0) {
            recordStockMovement(db, {
              variantId,
              productId,
              quantityChange: change,
              movementType: change > 0 ? 'adjustment_in' : 'adjustment_out',
              unitCostPaise: row.costPaise ?? row.existingCostPaise ?? 0,
              referenceType: 'import',
              referenceNo: reference,
              reason: 'Stock updated from import',
              note: fileName,
              userId: user.user.id,
            });
            stockChanges += 1;
          }
        }
      }

      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'products.imported',
        entityType: 'catalog',
        entityId: null,
        details: {
          file: fileName,
          reference,
          rows: actionable.length,
          createdProducts: createdProductCount,
          createdVariants: createdVariantCount,
          updatedVariants: updatedVariantCount,
          skipped: plan.summary.skipped,
          errors: plan.summary.errors,
          stockChanges,
        },
      });
    });

    logger?.info('Product import completed', {
      file: fileName,
      reference,
      createdProducts: createdProductCount,
      createdVariants: createdVariantCount,
      updatedVariants: updatedVariantCount,
      stockChanges,
      skipped: plan.summary.skipped,
      errors: plan.summary.errors,
    });

    return {
      reference,
      fileName,
      createdProducts: createdProductCount,
      createdVariants: createdVariantCount,
      updatedVariants: updatedVariantCount,
      stockChanges,
      skipped: plan.summary.skipped,
      errors: plan.summary.errors,
    };
  }

  return { preview, commit };
}
