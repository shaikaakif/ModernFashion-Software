import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addStaff,
  completeSale,
  createProduct,
  createTestApp,
  login,
  logout,
  setupOwner,
} from './helpers.js';

test('cashier role is denied costs, stock administration, staff, settings and reports', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  createProduct(app, { openingStock: 5 });

  logout(app);
  login(app, '9000000002');

  assert.throws(() => app.services.settings.getPublic(), { code: 'FORBIDDEN' });
  assert.throws(() => app.services.inventory.list({}), { code: 'FORBIDDEN' });
  assert.throws(() => app.services.inventory.adjust({ variantId: 1, direction: 'in', quantity: 1, reason: 'test' }), {
    code: 'FORBIDDEN',
  });
  assert.throws(() => app.services.reports.salesSummary({}), { code: 'FORBIDDEN' });
  assert.throws(() => app.services.reports.profitLoss({}), { code: 'FORBIDDEN' });
  assert.throws(() => app.services.reports.inventoryReport(), { code: 'FORBIDDEN' });
  assert.throws(() => app.services.expenses.list({}), { code: 'FORBIDDEN' });
  assert.throws(() => app.services.users.list(), { code: 'FORBIDDEN' });
  assert.throws(() => app.services.audit.list({}), { code: 'FORBIDDEN' });
  assert.throws(() => app.services.backup.createManual(app.services.auth.requireSession()), { code: 'FORBIDDEN' });
  assert.throws(() => app.services.settings.updateBusiness({ name: 'Hacked' }), { code: 'FORBIDDEN' });
  assert.throws(
    () =>
      app.services.catalog.createProduct({
        name: 'Forbidden product',
        categoryId: 1,
        pricePaise: 10000,
      }),
    { code: 'FORBIDDEN' }
  );
});

test('cashier can bill but sale responses exclude unit cost and profit fields', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  addStaff(app, { name: 'Manager One', mobile: '9000000004', roleCode: 'manager' });
  const product = createProduct(app, { openingStock: 5 });
  const variant = product.variants[0];

  logout(app);
  login(app, '9000000002');
  const lookup = app.services.catalog.posLookup(variant.barcode);
  assert.equal(Object.hasOwn(lookup, 'costPaise'), false);

  const { sale } = completeSale(app, variant.id, { idempotencyKey: 'permission-cost-001' });
  const cashierSale = app.services.sales.getSale(sale.id);
  assert.equal(Object.hasOwn(cashierSale, 'cogsPaise'), false);
  assert.equal(Object.hasOwn(cashierSale, 'grossProfitPaise'), false);
  assert.equal(Object.hasOwn(cashierSale.items[0], 'unitCostPaise'), false);
  assert.equal(Object.hasOwn(cashierSale.items[0], 'grossProfitPaise'), false);

  logout(app);
  login(app, '9000000004');
  const managerSale = app.services.sales.getSale(sale.id);
  assert.equal(managerSale.cogsPaise, 10000);
  assert.equal(managerSale.items[0].unitCostPaise, 10000);
  assert.equal(managerSale.grossProfitPaise, 10000);
});

test('cashier cannot view another cashier invoice', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });
  addStaff(app, { name: 'Cashier Two', mobile: '9000000003', roleCode: 'cashier' });
  const product = createProduct(app, { openingStock: 5 });
  const variant = product.variants[0];

  logout(app);
  login(app, '9000000002');
  const { sale } = completeSale(app, variant.id, { idempotencyKey: 'own-invoice-001' });
  logout(app);
  login(app, '9000000003');

  assert.throws(() => app.services.sales.getSale(sale.id), { code: 'FORBIDDEN' });
});

test('trusted settings snapshot used by printing is not exposed through the renderer method', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  addStaff(app, { name: 'Cashier One', mobile: '9000000002', roleCode: 'cashier' });

  const snapshot = app.services.settings.getSnapshot();
  assert.equal(snapshot.hardware.receiptWidthMm, 77);
  assert.ok(Array.isArray(snapshot.offers));
  assert.ok(Array.isArray(app.services.settings.getPublic().offers));

  logout(app);
  login(app, '9000000002');
  assert.throws(() => app.services.settings.getPublic(), { code: 'FORBIDDEN' });
});
