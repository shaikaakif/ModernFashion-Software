import { buildSku } from '../utils/catalog.js';
import { findVariant, nextBarcode, nextInvoiceNumber, nextPurchaseReference } from '../utils/metrics.js';

function fail(message) {
  throw new Error(message);
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function safeIso(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) fail('Please choose a valid date.');
  return date.toISOString();
}

function requireText(value, label) {
  if (!String(value || '').trim()) fail(`${label} is required.`);
  return String(value).trim();
}

function requirePositiveInt(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) fail(`${label} must be a whole number greater than zero.`);
  return number;
}

function requireMoney(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail(`${label} must be zero or more.`);
  return round2(number);
}

function variantSnapshot(product, variant) {
  return {
    variantId: variant.id,
    productId: product.id,
    productName: product.name,
    category: product.category,
    color: variant.color,
    size: variant.size,
    sku: variant.sku,
    barcode: variant.barcode,
  };
}

function uniqueVariantItems(db, items) {
  const seen = new Set();
  return (items || []).map((item, index) => {
    if (!item?.variantId) fail(`Choose a product and variant for item ${index + 1}.`);
    if (seen.has(item.variantId)) fail('The same product variant cannot be added twice.');
    seen.add(item.variantId);
    const found = findVariant(db, item.variantId);
    if (!found) fail(`Product variant ${index + 1} could not be found.`);
    return { ...item, ...found };
  });
}

export function createInvoiceOperation(db, input) {
  const work = clone(db);
  const customer = work.customers.find((item) => item.id === input.customerId);
  if (!customer) fail('Select a customer for this invoice.');
  const rawItems = input.items || [];
  if (!rawItems.length) fail('Add at least one product to the invoice.');

  const items = uniqueVariantItems(work, rawItems).map((item) => {
    const { variant, product } = item;
    const qty = requirePositiveInt(item.qty, `Quantity for ${product.name}`);
    if (qty > variant.stock) {
      fail(`Only ${variant.stock} units of ${product.name} (${variant.color} / ${variant.size}) are in stock.`);
    }
    const unitPrice = requireMoney(item.unitPrice ?? variant.sellingPrice, 'Unit price');
    variant.stock -= qty;
    const snapshot = variantSnapshot(product, variant);
    return {
      ...snapshot,
      qty,
      unitPrice,
      lineTotal: round2(unitPrice * qty),
    };
  });

  const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const discount = Math.min(requireMoney(input.discount || 0, 'Discount'), subtotal);
  const taxPercent = Math.min(Math.max(Number(input.taxPercent ?? work.business.taxPercent ?? 5) || 0, 0), 50);
  const taxAmount = round2(((subtotal - discount) * taxPercent) / 100);
  const total = round2(subtotal - discount + taxAmount);
  const paymentStatus = ['Paid', 'Partial', 'Unpaid'].includes(input.paymentStatus) ? input.paymentStatus : 'Paid';

  let amountPaid = 0;
  if (paymentStatus === 'Paid') amountPaid = total;
  if (paymentStatus === 'Partial') {
    amountPaid = requireMoney(input.amountPaid, 'Amount paid');
    if (amountPaid <= 0 || amountPaid >= total) fail('For a partial payment, enter an amount between zero and the grand total.');
  }
  const invoiceNumber = nextInvoiceNumber(work);
  work.meta.invoiceSeq = Number(work.meta.invoiceSeq || 1000) + 1;
  const createdAt = safeIso(input.date);
  const invoice = {
    id: uid('inv'),
    number: invoiceNumber,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    date: createdAt,
    items,
    subtotal,
    discount,
    taxPercent,
    taxAmount,
    total,
    amountPaid: round2(amountPaid),
    balance: round2(total - amountPaid),
    paymentStatus,
    paymentMethod: input.paymentMethod || 'Cash',
    notes: String(input.notes || '').trim(),
    createdAt,
  };

  items.forEach((item, index) => {
    const variant = findVariant(work, item.variantId)?.variant;
    work.movements.unshift({
      id: `mov_${invoice.id}_${index}`,
      date: createdAt,
      type: 'sale',
      variantId: item.variantId,
      productId: item.productId,
      productName: item.productName,
      variantLabel: `${item.color} / ${item.size}`,
      sku: item.sku,
      qtyChange: -item.qty,
      balanceAfter: variant?.stock ?? null,
      reference: invoice.number,
      note: `Sold to ${invoice.customerName}`,
    });
  });

  work.invoices.unshift(invoice);
  return { db: work, invoice };
}

export function createPurchaseOperation(db, input) {
  const work = clone(db);
  const supplier = work.suppliers.find((item) => item.id === input.supplierId);
  if (!supplier) fail('Select a supplier for this purchase.');
  const rawItems = input.items || [];
  if (!rawItems.length) fail('Add at least one product to the purchase.');

  const items = uniqueVariantItems(work, rawItems).map((item) => {
    const { variant, product } = item;
    const qty = requirePositiveInt(item.qty, `Quantity for ${product.name}`);
    const unitCost = requireMoney(item.unitCost ?? variant.purchasePrice, 'Purchase price');
    variant.stock += qty;
    return {
      ...variantSnapshot(product, variant),
      qty,
      unitCost,
      lineTotal: round2(unitCost * qty),
    };
  });

  const total = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const reference = nextPurchaseReference(work);
  work.meta.purchaseSeq = Number(work.meta.purchaseSeq || 2000) + 1;
  const createdAt = safeIso(input.date);
  const purchase = {
    id: uid('pur'),
    reference,
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierPhone: supplier.phone,
    date: createdAt,
    items,
    total,
    status: 'Received',
    notes: String(input.notes || '').trim(),
    createdAt,
  };

  items.forEach((item, index) => {
    const variant = findVariant(work, item.variantId)?.variant;
    work.movements.unshift({
      id: `mov_${purchase.id}_${index}`,
      date: createdAt,
      type: 'purchase',
      variantId: item.variantId,
      productId: item.productId,
      productName: item.productName,
      variantLabel: `${item.color} / ${item.size}`,
      sku: item.sku,
      qtyChange: item.qty,
      balanceAfter: variant?.stock ?? null,
      reference: purchase.reference,
      note: `Stock received from ${purchase.supplierName}`,
    });
  });

  work.purchases.unshift(purchase);
  return { db: work, purchase };
}

export function adjustStockOperation(db, input) {
  const work = clone(db);
  const found = findVariant(work, input.variantId);
  if (!found) fail('Select a product variant to adjust.');
  const quantity = requirePositiveInt(input.quantity, 'Adjustment quantity');
  if (!['in', 'out'].includes(input.direction)) fail('Choose stock in or stock out.');
  if (input.direction === 'out' && quantity > found.variant.stock) {
    fail(`Cannot remove ${quantity} units. Only ${found.variant.stock} units are in stock.`);
  }
  const change = input.direction === 'in' ? quantity : -quantity;
  found.variant.stock += change;
  const note = String(input.reason || '').trim() || (input.direction === 'in' ? 'Manual stock in' : 'Manual stock out');
  const movement = {
    id: uid('mov'),
    date: new Date().toISOString(),
    type: 'adjustment',
    direction: input.direction,
    variantId: found.variant.id,
    productId: found.product.id,
    productName: found.product.name,
    variantLabel: `${found.variant.color} / ${found.variant.size}`,
    sku: found.variant.sku,
    qtyChange: change,
    balanceAfter: found.variant.stock,
    reference: `ADJ-${String(Date.now()).slice(-6)}`,
    note,
  };
  work.movements.unshift(movement);
  return { db: work, movement };
}

function productComboKey(color, size) {
  return `${color}|||${size}`;
}

function nextCategorySequence(products, category) {
  return products.filter((product) => product.category === category).length + 1;
}

export function createProductOperation(db, input) {
  const work = clone(db);
  const name = requireText(input.name, 'Product name');
  const category = requireText(input.category, 'Category');
  const colors = [...new Set((input.colors || []).map((color) => String(color).trim()).filter(Boolean))];
  const sizes = [...new Set((input.sizes || []).map((size) => String(size).trim()).filter(Boolean))];
  if (!colors.length) fail('Add at least one colour.');
  if (!sizes.length) fail('Add at least one size.');
  const purchasePrice = requireMoney(input.purchasePrice, 'Purchase price');
  const sellingPrice = requireMoney(input.sellingPrice, 'Selling price');
  const openingStock = Math.max(0, Math.floor(Number(input.openingStock) || 0));
  const lowStockThreshold = Math.max(0, Math.floor(Number(input.lowStockThreshold) || 5));
  const productId = uid('prd');
  let sequence = nextCategorySequence(work.products, category);
  let variants = [];
  let barcodeSeq = Number(work.meta.barcodeSeq) || 0;

  const buildVariants = () => {
    variants = [];
    let variantNumber = 0;
    colors.forEach((color) => {
      sizes.forEach((size) => {
        variantNumber += 1;
        barcodeSeq += 1;
        variants.push({
          id: `${productId}_v${String(variantNumber).padStart(2, '0')}`,
          sku: buildSku(category, sequence, color, size),
          barcode: `MF${String(barcodeSeq).padStart(7, '0')}`,
          color,
          size,
          purchasePrice,
          sellingPrice,
          stock: openingStock,
          lowStockThreshold,
        });
      });
    });
  };

  buildVariants();
  const allSkus = new Set(work.products.flatMap((product) => product.variants.map((variant) => variant.sku)));
  while (variants.some((variant) => allSkus.has(variant.sku))) {
    sequence += 1;
    barcodeSeq -= variants.length;
    buildVariants();
  }
  work.meta.barcodeSeq = barcodeSeq;

  const product = {
    id: productId,
    name,
    category,
    description: String(input.description || '').trim() || `${name} from the Modern Fashion Brand Hub collection.`,
    colors,
    sizes,
    purchasePrice,
    sellingPrice,
    status: 'Active',
    createdAt: new Date().toISOString(),
    variants,
  };
  work.products.unshift(product);

  if (openingStock > 0) {
    product.variants.forEach((variant, index) => {
      work.movements.unshift({
        id: `mov_${product.id}_open_${index}`,
        date: product.createdAt,
        type: 'adjustment',
        direction: 'in',
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        variantLabel: `${variant.color} / ${variant.size}`,
        sku: variant.sku,
        qtyChange: openingStock,
        balanceAfter: openingStock,
        reference: 'OPENING-STOCK',
        note: 'Opening stock recorded when the product was created',
      });
    });
  }

  return { db: work, product };
}

export function updateProductOperation(db, productId, input) {
  const work = clone(db);
  const index = work.products.findIndex((product) => product.id === productId);
  if (index === -1) fail('Product not found.');
  const current = work.products[index];
  const colors = [...new Set((input.colors || current.colors).map((color) => String(color).trim()).filter(Boolean))];
  const sizes = [...new Set((input.sizes || current.sizes).map((size) => String(size).trim()).filter(Boolean))];
  if (!colors.length || !sizes.length) fail('A product needs at least one colour and one size.');
  const purchasePrice = requireMoney(input.purchasePrice ?? current.purchasePrice, 'Purchase price');
  const sellingPrice = requireMoney(input.sellingPrice ?? current.sellingPrice, 'Selling price');
  const lowStockThreshold = Math.max(0, Math.floor(Number(input.lowStockThreshold ?? 5) || 0));

  const targetKeys = new Set();
  colors.forEach((color) => sizes.forEach((size) => targetKeys.add(productComboKey(color, size))));
  const existing = new Map(current.variants.map((variant) => [productComboKey(variant.color, variant.size), variant]));
  const removed = current.variants.filter((variant) => !targetKeys.has(productComboKey(variant.color, variant.size)));
  const blocked = removed.filter((variant) => variant.stock > 0);
  if (blocked.length) {
    fail(
      `Cannot remove ${blocked.length} variant${blocked.length > 1 ? 's' : ''} with stock on hand. Adjust stock to zero first.`
    );
  }

  let barcodeSeq = Number(work.meta.barcodeSeq) || 0;
  let variantNumber = current.variants.reduce(
    (max, variant) => Math.max(max, Number(variant.id.split('_v').pop()) || 0),
    0
  );
  const sequence = nextCategorySequence(
    work.products.filter((product) => product.id !== current.id),
    input.category || current.category
  );
  const nextVariants = [];
  colors.forEach((color) => {
    sizes.forEach((size) => {
      const key = productComboKey(color, size);
      const found = existing.get(key);
      if (found) {
        nextVariants.push({
          ...found,
          purchasePrice,
          sellingPrice,
          lowStockThreshold,
        });
      } else {
        variantNumber += 1;
        barcodeSeq += 1;
        nextVariants.push({
          id: `${current.id}_v${String(variantNumber).padStart(2, '0')}`,
          sku: buildSku(input.category || current.category, sequence, color, size),
          barcode: `MF${String(barcodeSeq).padStart(7, '0')}`,
          color,
          size,
          purchasePrice,
          sellingPrice,
          stock: 0,
          lowStockThreshold,
        });
      }
    });
  });
  work.meta.barcodeSeq = barcodeSeq;

  const updated = {
    ...current,
    name: requireText(input.name ?? current.name, 'Product name'),
    category: requireText(input.category ?? current.category, 'Category'),
    description: String(input.description ?? current.description).trim(),
    colors,
    sizes,
    purchasePrice,
    sellingPrice,
    lowStockThreshold,
    variants: nextVariants,
  };
  work.products[index] = updated;
  return { db: work, product: updated };
}

export function deleteProductOperation(db, productId) {
  const work = clone(db);
  const exists = work.products.some((product) => product.id === productId);
  if (!exists) fail('Product not found.');
  work.products = work.products.filter((product) => product.id !== productId);
  return { db: work };
}

export function createCustomerOperation(db, input) {
  const work = clone(db);
  const name = requireText(input.name, 'Customer name');
  const phone = requireText(input.phone, 'Phone number');
  if (work.customers.some((customer) => customer.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))) {
    fail('A customer with this phone number already exists.');
  }
  const customer = {
    id: uid('cus'),
    name,
    phone,
    email: String(input.email || '').trim(),
    address: String(input.address || '').trim(),
    createdAt: new Date().toISOString(),
  };
  work.customers.unshift(customer);
  return { db: work, customer };
}

export function updateCustomerOperation(db, customerId, input) {
  const work = clone(db);
  const index = work.customers.findIndex((customer) => customer.id === customerId);
  if (index === -1) fail('Customer not found.');
  const phone = requireText(input.phone ?? work.customers[index].phone, 'Phone number');
  const duplicate = work.customers.some(
    (customer) => customer.id !== customerId && customer.phone.replace(/\D/g, '') === phone.replace(/\D/g, '')
  );
  if (duplicate) fail('A customer with this phone number already exists.');
  work.customers[index] = {
    ...work.customers[index],
    name: requireText(input.name ?? work.customers[index].name, 'Customer name'),
    phone,
    email: String(input.email ?? work.customers[index].email).trim(),
    address: String(input.address ?? work.customers[index].address).trim(),
  };
  return { db: work, customer: work.customers[index] };
}

export function updateBusinessOperation(db, input) {
  const work = clone(db);
  const phones = (input.phones || []).map((phone) => String(phone).trim()).filter(Boolean);
  work.business = {
    ...work.business,
    name: requireText(input.name ?? work.business.name, 'Business name'),
    address: requireText(input.address ?? work.business.address, 'Business address'),
    phones,
    instagram: String(input.instagram ?? work.business.instagram).trim(),
    website: String(input.website ?? work.business.website).trim(),
    taxPercent: Math.min(Math.max(Number(input.taxPercent ?? work.business.taxPercent) || 0, 0), 50),
  };
  return { db: work, business: work.business };
}

export function assignBarcodeOperation(db, variantId) {
  const work = clone(db);
  const found = findVariant(work, variantId);
  if (!found) fail('Product variant not found.');
  if (found.variant.barcode) return { db, variant: found.variant, assigned: false };
  const next = nextBarcode(work);
  found.variant.barcode = next.value;
  work.meta.barcodeSeq = next.seq;
  return { db: work, variant: found.variant, assigned: true };
}
