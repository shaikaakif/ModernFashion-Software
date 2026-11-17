import test from 'node:test';
import assert from 'node:assert/strict';
import { addStaff, completeSale, createProduct, createTestApp, login, setupOwner } from './helpers.js';

test('dashboard returns real shop totals, stock counts and backup status for the owner', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 3 });
  completeSale(app, product.variants[0].id, { quantity: 1 });

  const dashboard = app.services.reports.dashboard({});
  assert.equal(dashboard.scope, 'shop');
  assert.equal(dashboard.sales.invoiceCount, 1);
  assert.equal(dashboard.sales.netSalesPaise, 20000);
  assert.equal(dashboard.stockCounts.out, 0);
  assert.equal(dashboard.stockCounts.low, 1);
  assert.equal(dashboard.recentSales.length, 1);
  assert.equal(dashboard.topProducts.length, 1);

  const before = app.services.backup.status();
  assert.equal(before.lastBackup, null);
  const created = app.services.backup.createManual(app.services.auth.requireSession());
  const after = app.services.backup.status();
  assert.equal(after.lastBackup.path, created.path);
  assert.equal(after.lastBackup.exists, true);
});

test('cashier dashboard hides shop-wide financial and backup data', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 2 });
  completeSale(app, product.variants[0].id, { quantity: 1 });
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });

  login(app, '9000000002');
  const dashboard = app.services.reports.dashboard({});
  assert.equal(dashboard.scope, 'own');
  assert.equal(dashboard.purchases, null);
  assert.equal(dashboard.expenses, null);
  assert.equal(dashboard.lowStock.length, 0);
  assert.equal(dashboard.sales.grossProfitPaise, undefined);
  assert.equal(dashboard.monthToDate.grossProfitPaise, undefined);
  assert.throws(() => app.services.backup.status(), { code: 'FORBIDDEN' });
});
