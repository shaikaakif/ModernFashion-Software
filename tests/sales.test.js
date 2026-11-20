import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addStaff,
  completeSale,
  createProduct,
  createTestApp,
  login,
  logout,
  saleCount,
  setupOwner,
  stockMovementCount,
  stockOf,
} from './helpers.js';

test('checkout is idempotent, deducts stock once and records one completed sale', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const cashier = addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  const product = createProduct(app, { openingStock: 5 });
  const variant = product.variants[0];
  assert.equal(stockOf(app, variant.id), 5);

  logout(app);
  login(app, '9000000002');

  const key = 'checkout-idempotency-001';
  const first = completeSale(app, variant.id, { idempotencyKey: key, quantity: 2 });
  const second = completeSale(app, variant.id, { idempotencyKey: key, quantity: 2 });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.sale.id, second.sale.id);
  assert.equal(saleCount(app), 1);
  assert.equal(stockOf(app, variant.id), 3);
  assert.equal(stockMovementCount(app, 'sale'), 1);
  assert.equal(first.sale.totalPaise, 40000);
  assert.equal(first.sale.cashierId, cashier.id);
});

test('a sale may exceed available stock and records a negative balance', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  const product = createProduct(app, { openingStock: 1 });
  const variant = product.variants[0];

  logout(app);
  login(app, '9000000002');

  const result = completeSale(app, variant.id, { quantity: 2, idempotencyKey: 'oversell-key-001' });
  assert.equal(result.sale.items[0].quantity, 2);
  assert.equal(saleCount(app), 1);
  assert.equal(stockOf(app, variant.id), -1);
  assert.equal(stockMovementCount(app, 'sale'), 1);
});

test('a failed cash payment leaves the sale and stock untouched', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  const product = createProduct(app, { openingStock: 3 });
  const variant = product.variants[0];

  logout(app);
  login(app, '9000000002');

  assert.throws(
    () =>
      completeSale(app, variant.id, {
        quantity: 1,
        amountPaidPaise: 10000,
        idempotencyKey: 'short-cash-001',
      }),
    /less than the payable total/
  );
  assert.equal(saleCount(app), 0);
  assert.equal(stockOf(app, variant.id), 3);

  const sale = completeSale(app, variant.id, {
    quantity: 1,
    amountPaidPaise: 50000,
    idempotencyKey: 'cash-change-001',
  });
  assert.equal(sale.sale.changePaise, 30000);
});

test('another cashier cannot reuse a checkout key', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  addStaff(app, { name: 'Cashier Two', mobile: '9000000003', roleCode: 'cashier' });
  const product = createProduct(app, { openingStock: 5 });
  const variant = product.variants[0];

  logout(app);
  login(app, '9000000002');
  completeSale(app, variant.id, { idempotencyKey: 'shared-key-001', quantity: 1 });
  logout(app);
  login(app, '9000000003');

  assert.throws(
    () => completeSale(app, variant.id, { idempotencyKey: 'shared-key-001', quantity: 1 }),
    { code: 'DUPLICATE_SALE' }
  );
  assert.equal(saleCount(app), 1);
  assert.equal(stockOf(app, variant.id), 4);
});

test('voiding restocks each item exactly once and preserves the audit trail', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  addStaff(app, { name: 'Manager One', mobile: '9000000004', roleCode: 'manager' });
  const product = createProduct(app, { openingStock: 5 });
  const variant = product.variants[0];

  logout(app);
  login(app, '9000000002');
  const { sale } = completeSale(app, variant.id, { quantity: 2, idempotencyKey: 'void-sale-001' });
  assert.equal(stockOf(app, variant.id), 3);

  logout(app);
  login(app, '9000000004');
  const voided = app.services.sales.voidSale(sale.id, { reason: 'Customer returned the item' });
  assert.equal(voided.status, 'void');
  assert.equal(stockOf(app, variant.id), 5);
  assert.equal(stockMovementCount(app, 'sale_return'), 1);

  assert.throws(() => app.services.sales.voidSale(sale.id, { reason: 'Again' }), /Only a completed invoice/);
  assert.equal(stockOf(app, variant.id), 5);
  assert.equal(stockMovementCount(app, 'sale_return'), 1);

  const auditActions = app.db
    .prepare('SELECT action FROM audit_logs WHERE entity_type = ? AND entity_id = ?')
    .all('sale', String(sale.id))
    .map((row) => row.action);
  assert.ok(auditActions.includes('sale.voided'));
});

test('voiding requires the sales.void permission', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  const product = createProduct(app, { openingStock: 5 });
  const variant = product.variants[0];

  logout(app);
  login(app, '9000000002');
  const { sale } = completeSale(app, variant.id, { idempotencyKey: 'cashier-void-001' });

  assert.throws(() => app.services.sales.voidSale(sale.id, { reason: 'Not allowed' }), { code: 'FORBIDDEN' });
  assert.equal(stockOf(app, variant.id), 4);
});

test('per-item percent and rupee discounts are priced, stored and applied once', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const first = createProduct(app, { name: 'First Tee', pricePaise: 20000, openingStock: 5 });
  const second = createProduct(app, { name: 'Second Tee', pricePaise: 10000, openingStock: 4 });

  const { sale } = completeSale(app, first.variants[0].id, {
    items: [
      { variantId: first.variants[0].id, quantity: 2, discountPercent: 10 },
      { variantId: second.variants[0].id, quantity: 1, discountPaise: 1500 },
    ],
    amountPaidPaise: 44500,
  });

  assert.equal(sale.subtotalPaise, 50000);
  assert.equal(sale.discountTotalPaise, 5500);
  assert.equal(sale.totalPaise, 44500);
  assert.equal(stockOf(app, first.variants[0].id), 3);
  assert.equal(stockOf(app, second.variants[0].id), 3);

  const stored = app.services.sales.getSale(sale.id);
  assert.equal(stored.items[0].discountPaise, 4000);
  assert.equal(stored.items[0].lineTotalPaise, 36000);
  assert.equal(stored.items[1].discountPaise, 1500);
  assert.equal(stored.items[1].lineTotalPaise, 8500);
  assert.equal(stored.discountTotalPaise, 5500);
  assert.equal(stored.totalPaise, 44500);
});

test('a fixed item discount wins over a percentage on the same line', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { pricePaise: 20000, openingStock: 2 });
  const { sale } = completeSale(app, product.variants[0].id, {
    items: [{ variantId: product.variants[0].id, quantity: 1, discountPercent: 50, discountPaise: 1000 }],
    amountPaidPaise: 19000,
  });
  assert.equal(sale.discountTotalPaise, 1000);
  assert.equal(sale.totalPaise, 19000);
});

test('item discounts require the discount permission', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  const product = createProduct(app, { pricePaise: 20000, openingStock: 2 });

  logout(app);
  login(app, '9000000002');
  assert.throws(
    () =>
      app.services.sales.complete({
        idempotencyKey: 'cashier-item-discount',
        items: [{ variantId: product.variants[0].id, quantity: 1, discountPercent: 10 }],
        paymentMethod: 'cash',
        amountPaidPaise: 18000,
      }),
    { code: 'FORBIDDEN' }
  );
  assert.equal(stockOf(app, product.variants[0].id), 2);
  assert.equal(saleCount(app), 0);
});
