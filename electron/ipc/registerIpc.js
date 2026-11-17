import fs from 'node:fs';
import path from 'node:path';
import { AppError, fail } from '../core/errors.js';

function copyFileSafely(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

export function createIpcHandlers({ services, paths, printService, exportService, dialog, shell, app }) {
  const {
    auth,
    settings,
    catalog,
    inventory,
    suppliers,
    purchases,
    sales,
    customers,
    expenses,
    reports,
    users,
    audit,
    backup,
  } = services;

  function chooseLogo() {
    auth.requirePermission('settings.manage');
    const file = dialog.showOpenDialogSync({
      title: 'Choose the Modern Fashion logo',
      defaultPath: paths.assets,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      properties: ['openFile'],
    })?.[0];
    if (!file) return { changed: false };
    const ext = path.extname(file).toLowerCase() || '.png';
    const target = path.join(paths.assets, `store-logo${ext}`);
    copyFileSafely(file, target);
    settings.setLogoPath(target);
    return { changed: true, logoPath: target, business: settings.getPublic() };
  }

  function clearLogo() {
    auth.requirePermission('settings.manage');
    const current = settings.getPublic().business;
    if (current.logoPath && path.resolve(current.logoPath).startsWith(path.resolve(paths.assets))) {
      try {
        fs.unlinkSync(current.logoPath);
      } catch {
        // The setting is cleared even if the old managed file is already gone.
      }
    }
    settings.setLogoPath('');
    return { changed: true };
  }

  function chooseBackupFile() {
    auth.requirePermission('backup.manage');
    const file = dialog.showOpenDialogSync({
      title: 'Choose a Modern Fashion database backup',
      defaultPath: paths.backups,
      filters: [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }],
      properties: ['openFile'],
    })?.[0];
    return file ? { path: file } : null;
  }

  function chooseBackupDirectory() {
    auth.requirePermission('backup.manage');
    const folder = dialog.showOpenDialogSync({
      title: 'Choose a backup folder (ideally a separate drive)',
      defaultPath: paths.backups,
      properties: ['openDirectory', 'createDirectory'],
    })?.[0];
    return folder ? { path: folder } : null;
  }

  function openDataFolder() {
    auth.requirePermission('backup.manage');
    shell.openPath(paths.base);
    return { opened: true };
  }

  function diagnostics() {
    auth.requirePermission('backup.manage');
    const databaseSize = fs.existsSync(paths.databasePath) ? fs.statSync(paths.databasePath).size : 0;
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      databasePath: paths.databasePath,
      databaseSizeBytes: databaseSize,
      dataFolder: paths.base,
      backupFolder: backup.destinationDirectory(),
      packaged: app.isPackaged,
    };
  }

  const handlers = {
    'app.info': () => ({
      version: app.getVersion(),
      packaged: app.isPackaged,
      platform: process.platform,
      electron: process.versions.electron,
    }),
    'app.diagnostics': diagnostics,
    'app.openDataFolder': openDataFolder,

    'auth.setupStatus': () => auth.setupStatus(),
    'auth.setupOwner': (payload) => auth.setupOwner(payload),
    'auth.login': (payload) => auth.login(payload),
    'auth.logout': (payload) => auth.logout(payload),
    'auth.session': () => auth.currentSession(),
    'auth.touch': () => auth.currentSession(),
    'auth.changePassword': (payload) => auth.changePassword(payload),
    'auth.lock': () => auth.lockCurrentSession(),
    'auth.closeShift': (payload) => auth.closeCurrentShift(payload),
    'auth.openShift': (payload) => auth.openNewShift(payload),

    'dashboard.get': (payload) => reports.dashboard(payload),

    'catalog.categories': (payload) => catalog.categories(payload),
    'catalog.createCategory': (payload) => catalog.createCategory(payload),
    'catalog.updateCategory': (payload) => catalog.updateCategory(payload?.id, payload),
    'catalog.brands': (payload) => catalog.brands(payload),
    'catalog.createBrand': (payload) => catalog.createBrand(payload),
    'catalog.list': (payload) => catalog.listProducts(payload),
    'catalog.get': (payload) => catalog.getProduct(payload?.id),
    'catalog.create': (payload) => catalog.createProduct(payload),
    'catalog.update': (payload) => catalog.updateProduct(payload?.id, payload),
    'catalog.addVariant': (payload) => catalog.addVariant(payload?.productId, payload),
    'catalog.updateVariant': (payload) => catalog.updateVariant(payload?.variantId, payload),
    'catalog.assignBarcode': (payload) => catalog.assignBarcode(payload?.variantId),
    'catalog.posLookup': (payload) => catalog.posLookup(payload?.code),
    'catalog.posSearch': (payload) => catalog.posSearch(payload?.query, payload),
    'catalog.lowStock': (payload) => catalog.lowStock(payload),
    'catalog.labels': (payload) => catalog.labelData(payload?.variantIds),

    'inventory.list': (payload) => inventory.list(payload),
    'inventory.summary': () => inventory.summary(),
    'inventory.valuation': () => inventory.valuationByCategory(),
    'inventory.movements': (payload) => inventory.movements(payload),
    'inventory.adjust': (payload) => inventory.adjust(payload),
    'inventory.reconciliation': (payload) => inventory.reconciliation(payload),

    'suppliers.list': (payload) => suppliers.list(payload),
    'suppliers.get': (payload) => suppliers.get(payload?.id),
    'suppliers.create': (payload) => suppliers.create(payload),
    'suppliers.update': (payload) => suppliers.update(payload?.id, payload),

    'purchases.list': (payload) => purchases.list(payload),
    'purchases.get': (payload) => purchases.get(payload?.id),
    'purchases.create': (payload) => purchases.create(payload),
    'purchases.payment': (payload) => purchases.recordPayment(payload?.id, payload),
    'purchases.outstanding': () => purchases.outstandingBySupplier(),

    'sales.bootstrap': () => sales.bootstrap(),
    'sales.complete': (payload) => sales.complete(payload),
    'sales.get': (payload) => sales.getSale(payload?.id),
    'sales.list': (payload) => sales.list(payload),
    'sales.void': (payload) => sales.voidSale(payload?.id, payload),
    'sales.receiptData': (payload) => sales.receiptData(payload?.id),

    'customers.list': (payload) => customers.list(payload),
    'customers.get': (payload) => customers.get(payload?.id),
    'customers.search': (payload) => customers.searchForPos(payload?.query),
    'customers.create': (payload) => customers.create(payload),
    'customers.update': (payload) => customers.update(payload?.id, payload),

    'expenses.categories': (payload) => expenses.categories(payload),
    'expenses.createCategory': (payload) => expenses.createCategory(payload),
    'expenses.list': (payload) => expenses.list(payload),
    'expenses.create': (payload) => expenses.create(payload),
    'expenses.update': (payload) => expenses.update(payload?.id, payload),
    'expenses.void': (payload) => expenses.voidExpense(payload?.id, payload),
    'expenses.summary': (payload) => expenses.summary(payload),

    'reports.salesSummary': (payload) => reports.salesSummary(payload),
    'reports.profitLoss': (payload) => reports.profitLoss(payload),
    'reports.productSales': (payload) => reports.productSales(payload),
    'reports.inventory': () => reports.inventoryReport(),
    'reports.tax': (payload) => reports.taxSummary(payload),
    'reports.purchases': (payload) => reports.purchaseReport(payload),
    'reports.expenses': (payload) => reports.expenseReport(payload),
    'reports.salesRegister': (payload) => reports.salesRegister(payload),
    'reports.accountingPack': (payload) => reports.accountingPack(payload?.month),

    'users.list': () => users.list(),
    'users.create': (payload) => users.create(payload),
    'users.update': (payload) => users.update(payload?.id, payload),
    'users.resetPassword': (payload) => users.resetPassword(payload?.id, payload),
    'users.shifts': (payload) => users.shifts(payload),
    'users.cashierActivity': (payload) => users.cashierActivity(payload),
    'users.activity': (payload) => users.activity(payload?.id, payload),

    'settings.get': () => settings.getPublic(),
    'settings.updateBusiness': (payload) => settings.updateBusiness(payload),
    'settings.updateInvoice': (payload) => settings.updateInvoice(payload),
    'settings.updateTax': (payload) => settings.updateTax(payload),
    'settings.updatePos': (payload) => settings.updatePos(payload),
    'settings.updateHardware': (payload) => settings.updateHardware(payload),
    'settings.updateReceipt': (payload) => settings.updateReceipt(payload),
    'settings.updateBackup': (payload) => settings.updateBackup(payload),
    'settings.chooseLogo': chooseLogo,
    'settings.clearLogo': clearLogo,
    'settings.offers': () => settings.listOffers(),
    'settings.saveOffer': (payload) => settings.saveOffer(payload, payload?.id || null),
    'settings.deleteOffer': (payload) => settings.deleteOffer(payload?.id),

    'audit.list': (payload) => audit.list(payload),
    'audit.actions': () => audit.actions(),

    'backup.list': (payload) => backup.list(payload),
    'backup.create': () => backup.createManual(auth.requireSession()),
    'backup.verify': (payload) => backup.verify(payload?.path),
    'backup.restore': (payload) =>
      backup.restore(payload?.path, { confirm: payload?.confirm, user: auth.requireSession() }),
    'backup.chooseFile': chooseBackupFile,
    'backup.chooseDirectory': chooseBackupDirectory,

    'print.printers': () => printService.listPrinters(),
    'print.receipt': (payload) => printService.printReceipt(payload?.saleId, { duplicate: Boolean(payload?.duplicate) }),
    'print.a4': (payload) => printService.printA4Invoice(payload?.saleId, payload),
    'print.labels': (payload) => printService.printLabels(payload?.variantIds),
    'print.testReceipt': () => printService.printTestReceipt(),
    'print.testLabel': () => printService.printTestLabel(),
    'print.savePdf': (payload) => printService.saveInvoicePdf(payload?.saleId),
    'print.whatsapp': (payload) => printService.whatsappHandoff(payload?.saleId),
    'print.open': (payload) => printService.openPath(payload?.path),
    'print.showFolder': (payload) => printService.openFolder(payload?.path),

    'export.sales': (payload) => exportService.exportSalesRegister(payload),
    'export.purchases': (payload) => exportService.exportPurchases(payload),
    'export.expenses': (payload) => exportService.exportExpenses(payload),
    'export.inventory': (payload) => exportService.exportInventory(payload),
    'export.customers': () => exportService.exportCustomers(),
    'export.catalogue': () => exportService.exportCatalogue(),
    'export.accountingPack': (payload) => exportService.exportAccountingPack(payload),
  };

  async function invoke(method, payload) {
    const handler = handlers[method];
    if (!handler) throw new AppError(`Unknown application action: ${method}`, 'UNKNOWN_METHOD');
    if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
      fail('Invalid request payload.');
    }
    return handler(payload || {});
  }

  return { handlers, invoke };
}

export function registerIpc({ ipcMain, logger, ...dependencies }) {
  const { invoke } = createIpcHandlers(dependencies);
  ipcMain.handle('mf:invoke', async (_event, method, payload) => {
    try {
      if (typeof method !== 'string') fail('Invalid application action.');
      const data = await invoke(method, payload);
      return { ok: true, data };
    } catch (error) {
      if (!(error instanceof AppError)) {
        logger?.error('Unhandled IPC error', { method, message: error?.message, stack: error?.stack });
      }
      return {
        ok: false,
        error: {
          message: error instanceof AppError ? error.message : 'The operation failed. See the application log for details.',
          code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
          details: error instanceof AppError ? error.details : null,
        },
      };
    }
  });
}

