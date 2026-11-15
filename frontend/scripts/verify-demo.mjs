import assert from 'node:assert/strict';
import { createSeedData } from '../src/retail/data/seed.js';
import {
  adjustStockOperation,
  createCustomerOperation,
  createInvoiceOperation,
  createProductOperation,
  createPurchaseOperation,
  updateBusinessOperation,
} from '../src/retail/services/operations.js';
import { customerStats, getDashboardMetrics, findVariant } from '../src/retail/utils/metrics.js';

const db = createSeedData();

assert.ok(db.products.length >= 30, 'at least 30 products');
assert.ok(db.customers.length >= 10, 'at least 10 customers');
assert.ok(db.suppliers.length >= 5, 'at least 5 suppliers');
assert.ok(db.invoices.length >= 15, 'at least 15 invoices');
assert.ok(db.purchases.length >= 10, 'at least 10 purchases');

const allVariants = db.products.flatMap((product) => product.variants);
assert.ok(allVariants.length > 100, 'many variants');
assert.equal(new Set(allVariants.map((variant) => variant.sku)).size, allVariants.length, 'unique SKUs');
assert.equal(new Set(allVariants.map((variant) => variant.barcode)).size, allVariants.length, 'unique barcodes');
assert.ok(allVariants.some((variant) => variant.stock <= 5), 'low stock exists');
assert.ok(allVariants.some((variant) => variant.stock === 0), 'out of stock exists');

const shoes = db.products.find((product) => product.name === 'Everyday Sneakers');
assert.equal(shoes.sellingPrice, 799, 'supplied shoes price');
assert.ok(shoes.variants.every((variant) => variant.sellingPrice === 799), 'variant shoes price');

const metrics = getDashboardMetrics(db);
assert.ok(metrics.todaySales > 0, 'today sales from invoices');
assert.equal(metrics.totalProducts, db.products.length);
assert.equal(metrics.totalInvoices, db.invoices.length);
assert.ok(metrics.lowStockProductCount > 0);
assert.ok(metrics.topProducts.length > 0);
assert.equal(metrics.last7.length, 7);

const target = db.products[0].variants[0];
const startingStock = target.stock;
const purchase = createPurchaseOperation(db, {
  supplierId: db.suppliers[0].id,
  date: new Date().toISOString(),
  items: [{ variantId: target.id, qty: 5, unitCost: target.purchasePrice }],
});
assert.equal(findVariant(purchase.db, target.id).variant.stock, startingStock + 5, 'purchase increases stock');
assert.equal(purchase.db.movements[0].type, 'purchase');
assert.ok(purchase.purchase.reference.startsWith('PUR-'));

const invoiceResult = createInvoiceOperation(purchase.db, {
  customerId: db.customers[0].id,
  date: new Date().toISOString(),
  items: [{ variantId: target.id, qty: 3, unitPrice: target.sellingPrice }],
  discount: 50,
  taxPercent: 5,
  paymentStatus: 'Partial',
  amountPaid: 100,
  paymentMethod: 'UPI',
});
assert.equal(findVariant(invoiceResult.db, target.id).variant.stock, startingStock + 2, 'invoice reduces stock');
assert.equal(invoiceResult.invoice.paymentStatus, 'Partial');
assert.equal(invoiceResult.invoice.balance, invoiceResult.invoice.total - 100);
assert.equal(invoiceResult.db.movements[0].type, 'sale');
assert.equal(invoiceResult.invoice.taxPercent, 5);

assert.throws(
  () =>
    createInvoiceOperation(invoiceResult.db, {
      customerId: db.customers[0].id,
      items: [{ variantId: target.id, qty: findVariant(invoiceResult.db, target.id).variant.stock + 1 }],
      taxPercent: 0,
      paymentStatus: 'Paid',
    }),
  /Only .* units/,
  'overselling is blocked'
);

const adjusted = adjustStockOperation(invoiceResult.db, {
  variantId: target.id,
  direction: 'out',
  quantity: 1,
  reason: 'Damaged item',
});
assert.equal(findVariant(adjusted.db, target.id).variant.stock, startingStock + 1, 'manual stock out');
assert.equal(adjusted.db.movements[0].type, 'adjustment');

const newProduct = createProductOperation(adjusted.db, {
  name: 'Demo Test Hoodie',
  category: 'Hoodies',
  colors: ['Black', 'Sand'],
  sizes: ['M', 'L', 'XL'],
  purchasePrice: 800,
  sellingPrice: 1699,
  openingStock: 0,
});
assert.equal(newProduct.product.variants.length, 6, 'color x size variants');
assert.ok(newProduct.product.variants.every((variant) => variant.sku.startsWith('MF-HD-') && variant.barcode.startsWith('MF')));

const newVariant = newProduct.product.variants[0];
const newPurchase = createPurchaseOperation(newProduct.db, {
  supplierId: db.suppliers[1].id,
  items: [{ variantId: newVariant.id, qty: 6, unitCost: 800 }],
});
assert.equal(findVariant(newPurchase.db, newVariant.id).variant.stock, 6);

const newInvoice = createInvoiceOperation(newPurchase.db, {
  customerId: db.customers[1].id,
  items: [{ variantId: newVariant.id, qty: 2, unitPrice: 1699 }],
  taxPercent: 5,
  paymentStatus: 'Paid',
  discount: 0,
});
assert.equal(findVariant(newInvoice.db, newVariant.id).variant.stock, 4, 'new product flow stock');
assert.equal(newInvoice.invoice.total, Math.round((3398 + 169.9) * 100) / 100);

const customer = createCustomerOperation(newInvoice.db, {
  name: 'Test Customer',
  phone: '9000012345',
  email: 'test.customer@example.com',
  address: 'Attapur',
});
assert.ok(customer.customer.id);
assert.throws(
  () => createCustomerOperation(customer.db, { name: 'Duplicate', phone: '9000012345' }),
  /already exists/
);

const stats = customerStats(newInvoice.db, db.customers[1].id);
assert.ok(stats.invoiceCount >= 1);
assert.ok(stats.totalPurchases > 0);

const business = updateBusinessOperation(newInvoice.db, {
  ...newInvoice.db.business,
  taxPercent: 12,
});
assert.equal(business.business.taxPercent, 12);

console.log('DEMO VERIFICATION PASSED');
console.log({
  products: db.products.length,
  variants: allVariants.length,
  customers: db.customers.length,
  suppliers: db.suppliers.length,
  invoices: db.invoices.length,
  purchases: db.purchases.length,
  movements: db.movements.length,
  lowStockVariants: metrics.lowStockVariantCount,
  todaySales: metrics.todaySales,
});
