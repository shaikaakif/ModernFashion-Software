import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { completeSale, createProduct, createTestApp, setupOwner, stockMovementCount } from './helpers.js';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7u8AAAAASUVORK5CYII=',
  'base64'
);

test('product-level opening stock is applied to generated variants', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const category = app.db.prepare('SELECT id FROM categories ORDER BY id LIMIT 1').get();
  const product = app.services.catalog.createProduct({
    name: 'Opening Stock Product',
    categoryId: category.id,
    costPaise: 10000,
    pricePaise: 20000,
    mrpPaise: 24900,
    lowStockThreshold: 5,
    openingStock: 8,
    variants: [{ color: 'Black', size: 'M' }],
  });
  assert.equal(product.variants[0].stock, 8);
  assert.equal(app.services.inventory.list({ query: 'Opening Stock Product' })[0].stock, 8);
});

test('product sales report joins variants and returns real sold rows', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 5 });
  completeSale(app, product.variants[0].id, { quantity: 2 });

  const report = app.services.reports.productSales({});
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].productId, product.id);
  assert.equal(report.rows[0].units, 2);
  assert.equal(report.rows[0].netSalesPaise, 40000);
});

test('archived products leave the active catalogue, keep history and can be restored', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 5 });

  app.services.catalog.archiveProduct(product.id);
  assert.equal(app.services.inventory.list({}).length, 0);
  assert.equal(app.services.inventory.list({ status: 'archived' }).length, 1);
  assert.equal(app.services.catalog.posSearch('Everyday').length, 0);
  const removed = app.services.catalog.deleteProduct(product.id);
  assert.equal(removed.archived, true, 'History is preserved by removing the product from active inventory.');
  assert.equal(app.services.inventory.list({}).length, 0);

  app.services.catalog.restoreProduct(product.id);
  assert.equal(app.services.inventory.list({}).length, 1);
  assert.equal(app.services.inventory.list({ status: 'archived' }).length, 0);

  const clean = createProduct(app, { name: 'No History Item', openingStock: 0 });
  assert.deepEqual(app.services.catalog.deleteProduct(clean.id), {
    deleted: true,
    archived: false,
    id: clean.id,
    name: 'No History Item',
  });
  assert.equal(app.services.catalog.listProducts({ query: 'No History Item' }).length, 0);
});

test('update stock supports add, correct and remove with audited movements', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const product = createProduct(app, { openingStock: 5 });
  const variantId = product.variants[0].id;

  const added = app.services.inventory.adjust({
    variantId,
    mode: 'add',
    quantity: 3,
    reason: 'New stock received',
  });
  assert.equal(added.balanceAfter, 8);

  const corrected = app.services.inventory.adjust({
    variantId,
    mode: 'correct',
    actualQuantity: 2,
    reason: 'Physical count',
  });
  assert.equal(corrected.balanceAfter, 2);
  assert.equal(corrected.quantityChange, -6);

  const removed = app.services.inventory.adjust({
    variantId,
    mode: 'remove',
    quantity: 1,
    reason: 'Damaged during handling',
    movementType: 'damage',
  });
  assert.equal(removed.balanceAfter, 1);
  assert.equal(stockMovementCount(app, 'damage'), 1);

  const oversold = app.services.inventory.adjust({
    variantId,
    mode: 'remove',
    quantity: 5,
    reason: 'Stock missing after count',
  });
  assert.equal(oversold.balanceAfter, -4);
  assert.equal(oversold.quantityChange, -5);
  assert.equal(app.services.inventory.list({ status: 'negative' }).some((row) => row.variantId === variantId), true);
  assert.equal(app.services.inventory.summary().negativeStock, 1);

  const correctedFromNegative = app.services.inventory.adjust({
    variantId,
    mode: 'correct',
    actualQuantity: 8,
    reason: 'Physical count after negative stock',
  });
  assert.equal(correctedFromNegative.quantityChange, 12);
  assert.equal(correctedFromNegative.balanceAfter, 8);

  assert.throws(
    () => app.services.inventory.adjust({ variantId, mode: 'correct', actualQuantity: 8, reason: 'Same count' }),
    /already matches/
  );
});

test('branding reads the configured logo without exposing its local path', (t) => {
  const app = createTestApp(t);
  setupOwner(app);
  const assets = path.join(app.directory, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  const logo = path.join(assets, 'store-logo.png');
  fs.writeFileSync(logo, PNG_1X1);

  app.services.settings.setLogoPath(logo);
  const brand = app.services.branding.get();
  assert.equal(brand.hasLogo, true);
  assert.match(brand.logoDataUrl, /^data:image\/png;base64,/);
  assert.equal(brand.logoPath, undefined);

  const backup = app.services.backup.createManual(app.services.auth.requireSession());
  assert.equal(backup.assetsCopied, true);
  assert.equal(
    fs.existsSync(`${backup.path.replace(/\.db$/i, '')}.assets/store-logo.png`),
    true
  );

  fs.unlinkSync(logo);
  const restored = app.services.backup.restore(backup.path, {
    confirm: 'RESTORE',
    user: app.services.auth.requireSession(),
  });
  assert.equal(restored.assetsRestored, true);
  assert.equal(fs.existsSync(logo), true);

  app.services.settings.setLogoPath('');
  const cleared = app.services.branding.get();
  assert.equal(cleared.hasLogo, false);
  assert.equal(cleared.logoDataUrl, '');
});
