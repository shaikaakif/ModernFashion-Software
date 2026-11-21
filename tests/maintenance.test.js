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
} from './helpers.js';

test('an owner can delete inventory and bills after entering their password', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 2 });
  completeSale(app, product.variants[0].id, { idempotencyKey: 'wipe-inventory-1' });
  assert.equal(saleCount(app), 1);

  assert.throws(
    () => app.services.maintenance.wipe({ scope: 'inventory', password: 'not-my-password' }),
    { code: 'INVALID_CREDENTIALS' }
  );
  assert.equal(saleCount(app), 1, 'a wrong password must not delete anything');

  const result = app.services.maintenance.wipe({ scope: 'inventory', password: 'secret123' });
  assert.equal(result.scope, 'inventory');
  assert.equal(saleCount(app), 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM products').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM product_variants').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM stock_movements').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM users').get().c, 1, 'staff logins survive');
  assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM app_settings WHERE key = 'pos'").get().c, 1);
  assert.equal(
    app.db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'data.wiped'").get().c,
    1,
    'the wipe itself is audited'
  );
});

test('the full wipe removes customers and expenses but keeps staff and settings', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 2 });
  completeSale(app, product.variants[0].id, { idempotencyKey: 'wipe-all-1' });
  app.services.customers.create({ name: 'Walk-in Regular', phone: '9111111111' });
  const category = app.db.prepare('SELECT id FROM expense_categories ORDER BY id LIMIT 1').get();
  app.services.expenses.create({
    title: 'Shop rent',
    description: 'Shop rent',
    amountPaise: 100000,
    expenseDate: '2026-11-20',
    categoryId: category.id,
  });

  app.services.maintenance.wipe({ scope: 'all', password: 'secret123' });
  assert.equal(saleCount(app), 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM customers').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM users').get().c, 1);
});

test('a cashier cannot delete shop records', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  const product = createProduct(app, { openingStock: 2 });
  completeSale(app, product.variants[0].id, { idempotencyKey: 'wipe-cashier-1' });

  logout(app);
  login(app, '9000000002');
  assert.throws(
    () => app.services.maintenance.wipe({ scope: 'inventory', password: 'secret123' }),
    { code: 'FORBIDDEN' }
  );
  assert.equal(saleCount(app), 1);
});
