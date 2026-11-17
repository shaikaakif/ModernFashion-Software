import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import { initPaths } from './core/paths.js';
import { createLogger } from './core/logger.js';
import { integrityCheck, openDatabase } from './core/database.js';
import { createAuthService } from './services/authService.js';
import { createSettingsService } from './services/settingsService.js';
import { createCatalogService } from './services/catalogService.js';
import { createInventoryService } from './services/inventoryService.js';
import { createSupplierService } from './services/supplierService.js';
import { createPurchaseService } from './services/purchaseService.js';
import { createSaleService } from './services/saleService.js';
import { createCustomerService } from './services/customerService.js';
import { createExpenseService } from './services/expenseService.js';
import { createReportService } from './services/reportService.js';
import { createUserService } from './services/userService.js';
import { createAuditService } from './services/auditService.js';
import { createBackupService } from './services/backupService.js';
import { createExportService } from './services/exportService.js';
import { createPrintService } from './hardware/printService.js';
import { createUpdateService } from './services/updateService.js';
import { registerIpc } from './ipc/registerIpc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devServerUrl = process.env.MF_DEV_SERVER_URL || '';

let mainWindow = null;
let db = null;
let dbClosed = false;
let logger = null;
let paths = null;
let backupTimer = null;
let services = null;
let updateService = null;

app.setName('Modern Fashion POS');
app.setAppUserModelId('com.meningeslabs.modernfashion.pos');

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(bootstrap).catch((error) => {
    try {
      logger?.error('Application startup failed', { message: error?.message, stack: error?.stack });
    } catch {
      // Nothing else to do.
    }
    dialog.showErrorBox(
      'Modern Fashion POS could not start',
      `${error?.message || 'Unknown startup error'}\n\nIf this continues, restore a verified backup or contact the developer.`
    );
    app.quit();
  });
}

function scheduleRestore({ source, safetyBackup }) {
  setTimeout(() => {
    let fallbackUsed = false;
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
      if (db && !dbClosed) {
        db.close();
        dbClosed = true;
      }
      for (const suffix of ['-wal', '-shm']) {
        try {
          fs.unlinkSync(`${paths.databasePath}${suffix}`);
        } catch {
          // WAL files may already be gone after close.
        }
      }
      const temp = `${paths.databasePath}.restore-tmp`;
      fs.copyFileSync(source, temp);
      try {
        fs.renameSync(paths.databasePath, `${paths.databasePath}.pre-restore-${Date.now()}`);
      } catch {
        // The verified pre-restore backup remains the authoritative fallback.
      }
      fs.renameSync(temp, paths.databasePath);
      logger?.info('Database restored; relaunching', { source, safetyBackup });
    } catch (error) {
      fallbackUsed = true;
      logger?.error('Restore copy failed; attempting safety backup', { message: error?.message, safetyBackup });
      try {
        if (safetyBackup && fs.existsSync(safetyBackup)) {
          fs.copyFileSync(safetyBackup, paths.databasePath);
          logger?.warn('Safety backup copied back after a failed restore', { safetyBackup });
        }
      } catch (fallbackError) {
        logger?.error('Safety backup fallback also failed', { message: fallbackError?.message });
      }
      dialog.showErrorBox(
        'Restore could not be completed',
        `${error?.message || 'Unknown restore error'}\n\nThe app will relaunch. ${
          fallbackUsed ? 'A verified pre-restore backup was kept.' : ''
        }`
      );
    }
    app.relaunch();
    app.exit(0);
  }, 500);
}

function broadcastUpdateStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('mf:update-status', status);
}

async function bootstrap() {
  paths = initPaths(app);
  logger = createLogger({ directory: paths.logs });
  logger.info('Application starting', { version: app.getVersion(), packaged: app.isPackaged });

  db = openDatabase(paths.databasePath);
  const integrity = integrityCheck(db);
  if (!integrity.ok) {
    dialog.showErrorBox(
      'Database integrity check failed',
      `The local database did not pass its integrity check:\n\n${integrity.messages.join('\n').slice(0, 1000)}\n\nDo not continue billing. Restore a verified backup or contact the developer.`
    );
    app.quit();
    return;
  }

  const auth = createAuthService({ db, logger });
  const settings = createSettingsService({ db, auth });
  const catalog = createCatalogService({ db, auth });
  const inventory = createInventoryService({ db, auth });
  const suppliers = createSupplierService({ db, auth });
  const purchases = createPurchaseService({ db, auth });
  const sales = createSaleService({ db, auth });
  const customers = createCustomerService({ db, auth });
  const expenses = createExpenseService({ db, auth });
  const reports = createReportService({ db, auth, catalog });
  const users = createUserService({ db, auth });
  const audit = createAuditService({ db, auth });
  const backup = createBackupService({
    db,
    dbPath: paths.databasePath,
    defaultBackupDir: paths.backups,
    auth,
    logger,
    onRestore: scheduleRestore,
  });
  services = {
    app,
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
  };

  const printService = createPrintService({
    auth,
    saleService: sales,
    catalogService: catalog,
    settingsService: settings,
    logger,
    paths,
  });
  const exportService = createExportService({
    auth,
    reportService: reports,
    inventoryService: inventory,
    customerService: customers,
    catalogService: catalog,
    dialog,
    paths,
    logger,
  });

  updateService = createUpdateService({ app, logger, broadcast: broadcastUpdateStatus });
  updateService.init();

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  registerIpc({
    ipcMain,
    logger,
    services,
    paths,
    printService,
    exportService,
    updateService,
    dialog,
    shell,
    app,
  });

  createMainWindow();
  createMenu();
  startAutomaticBackups(backup);
  setTimeout(() => {
    updateService?.check({ automatic: true }).catch((error) => {
      logger?.warn('Automatic update check failed', { message: error?.message });
    });
  }, 15000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f6f5f2',
    title: 'Modern Fashion POS',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() || '';
    if (url !== current) event.preventDefault();
  });

  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open data folder',
          click: () => {
            if (paths) shell.openPath(paths.base);
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'resetZoom', label: 'Actual size' },
        { role: 'zoomIn', label: 'Zoom in' },
        { role: 'zoomOut', label: 'Zoom out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Full screen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Developer tools' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Modern Fashion POS',
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              title: 'Modern Fashion POS',
              message: 'Modern Fashion POS',
              detail: `Offline retail POS and inventory\nVersion ${app.getVersion()}\nEngineered by Meninges Labs\n\nAll business data is stored on this computer.`,
              buttons: ['OK'],
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startAutomaticBackups(backup) {
  const run = async () => {
    try {
      const result = await backup.autoBackupIfDue();
      if (result?.path) logger?.info('Automatic backup completed', { path: result.path });
      if (result?.error) logger?.warn('Automatic backup not completed', { error: result.error });
    } catch (error) {
      logger?.warn('Automatic backup check failed', { message: error?.message });
    }
  };
  setTimeout(run, 20000);
  backupTimer = setInterval(run, 30 * 60 * 1000);
  backupTimer.unref?.();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
  if (db && !dbClosed) {
    try {
      db.close();
      dbClosed = true;
      logger?.info('Application stopped cleanly');
    } catch (error) {
      logger?.error('Database close failed', { message: error?.message });
    }
  }
});
