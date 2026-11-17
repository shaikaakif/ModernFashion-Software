import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../electron/core/database.js';
import { createAuthService } from '../electron/services/authService.js';
import { createSettingsService } from '../electron/services/settingsService.js';
import { createCatalogService } from '../electron/services/catalogService.js';
import { createInventoryService } from '../electron/services/inventoryService.js';
import { createSupplierService } from '../electron/services/supplierService.js';
import { createPurchaseService } from '../electron/services/purchaseService.js';
import { createSaleService } from '../electron/services/saleService.js';
import { createCustomerService } from '../electron/services/customerService.js';
import { createExpenseService } from '../electron/services/expenseService.js';
import { createReportService } from '../electron/services/reportService.js';
import { createUserService } from '../electron/services/userService.js';
import { createAuditService } from '../electron/services/auditService.js';
import { createBackupService } from '../electron/services/backupService.js';
import { createBrandingService } from '../electron/services/brandingService.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

export function createTestApp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modern-fashion-test-'));
  const dbPath = path.join(directory, 'modern-fashion.db');
  const restoreCalls = [];
  const db = openDatabase(dbPath);
  const auth = createAuthService({ db, logger: silentLogger });
  const catalog = createCatalogService({ db, auth });
  const services = {
    auth,
    settings: createSettingsService({ db, auth }),
    branding: createBrandingService({ db }),
    catalog,
    inventory: createInventoryService({ db, auth }),
    suppliers: createSupplierService({ db, auth }),
    purchases: createPurchaseService({ db, auth }),
    sales: createSaleService({ db, auth }),
    customers: createCustomerService({ db, auth }),
    expenses: createExpenseService({ db, auth }),
    reports: createReportService({ db, auth, catalog }),
    users: createUserService({ db, auth }),
    audit: createAuditService({ db, auth }),
  };
  services.backup = createBackupService({
    db,
    dbPath,
    defaultBackupDir: path.join(directory, 'backups'),
    assetsDir: path.join(directory, 'assets'),
    auth,
    logger: silentLogger,
    onRestore: (payload) => restoreCalls.push(payload),
  });

  t.after(() => {
    try {
      db.close();
    } catch {
      // Already closed by a restore test.
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { db, dbPath, directory, services, restoreCalls };
}

export function setupOwner(app, overrides = {}) {
  app.services.auth.setupOwner({
    name: overrides.name || 'Owner One',
    mobile: overrides.mobile || '9000000001',
    password: overrides.password || 'secret123',
  });
}

export function addStaff(app, { name, mobile, roleCode, password = 'secret123' }) {
  return app.services.users.create({ name, mobile, roleCode, password });
}

export function login(app, mobile, password = 'secret123') {
  return app.services.auth.login({ mobile, password });
}

export function logout(app, countedCashPaise = 0) {
  return app.services.auth.logout({ countedCashPaise });
}

export function createProduct(app, overrides = {}) {
  const category = app.db.prepare('SELECT id FROM categories ORDER BY id LIMIT 1').get();
  return app.services.catalog.createProduct({
    name: overrides.name || 'Everyday Tee',
    categoryId: category.id,
    costPaise: overrides.costPaise ?? 10000,
    pricePaise: overrides.pricePaise ?? 20000,
    mrpPaise: overrides.mrpPaise ?? 24900,
    taxRateBp: 0,
    variants: overrides.variants || [
      { color: 'Black', size: 'M', openingStock: overrides.openingStock ?? 5 },
    ],
  });
}

export function stockOf(app, variantId) {
  const row = app.db.prepare('SELECT quantity FROM inventory_balances WHERE variant_id = ?').get(variantId);
  return row ? Number(row.quantity) : 0;
}

export function saleCount(app) {
  return Number(app.db.prepare('SELECT COUNT(*) AS count FROM sales').get().count);
}

export function stockMovementCount(app, type = 'sale') {
  return Number(
    app.db.prepare('SELECT COUNT(*) AS count FROM stock_movements WHERE movement_type = ?').get(type).count
  );
}

export function completeSale(app, variantId, overrides = {}) {
  return app.services.sales.complete({
    idempotencyKey: overrides.idempotencyKey || `test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    items: overrides.items || [{ variantId, quantity: overrides.quantity ?? 1 }],
    paymentMethod: overrides.paymentMethod || 'cash',
    ...(overrides.amountPaidPaise === undefined ? {} : { amountPaidPaise: overrides.amountPaidPaise }),
  });
}
