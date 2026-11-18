import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDate } from '../electron/core/validation.js';
import { createProduct, createTestApp, setupOwner, completeSale } from './helpers.js';

test('GST monthly report separates B2B, B2C and tax rows from real sales', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 3 });
  completeSale(app, product.variants[0].id, {
    quantity: 1,
    customerName: 'Business Buyer',
    customerPhone: '9000000003',
    customerGstin: '36ABCDE1234F1Z5',
  });
  const report = app.services.reports.gstMonthly({ month: businessDate().slice(0, 7) });
  assert.equal(report.totals.invoiceCount, 1);
  assert.equal(report.totals.b2bCount, 1);
  assert.equal(report.totals.b2cCount, 0);
  assert.equal(report.register[0].customerGstin, '36ABCDE1234F1Z5');
  assert.equal(report.register.length, 1);
});

test('customer mobile is required and GSTIN format is validated', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 2 });
  const base = {
    items: [{ variantId: product.variants[0].id, quantity: 1 }],
    paymentMethod: 'cash',
    customerName: 'No Phone',
  };
  assert.throws(
    () => app.services.sales.complete({ ...base, idempotencyKey: 'no-phone-001' }),
    { code: 'CUSTOMER_PHONE_REQUIRED' }
  );
  assert.throws(
    () =>
      app.services.sales.complete({
        ...base,
        idempotencyKey: 'bad-gstin-001',
        customerPhone: '9000000004',
        customerGstin: 'BADGSTIN',
      }),
    /GSTIN/
  );
});
