import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, clipboard, shell } from 'electron';
import { AppError, fail } from '../core/errors.js';
import { nowIso, requireInt } from '../core/validation.js';
import { businessDate } from '../core/validation.js';
import { readLogoDataUrl } from '../core/logo.js';
import {
  invoiceHtml,
  labelsHtml,
  receiptHtml,
  testLabelHtml,
  testReceiptHtml,
} from './documents.js';

function waitForLoad(win) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new AppError('The print document took too long to load.', 'PRINT_TIMEOUT')), 20000);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolve();
    });
    win.webContents.once('did-fail-load', (_event, code, description) => {
      clearTimeout(timeout);
      reject(new AppError(`The print document could not be rendered (${description || code}).`, 'PRINT_RENDER_FAILED'));
    });
  });
}

function loadHtml(win, html) {
  const waiting = waitForLoad(win);
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return waiting;
}

/**
 * Printing goes through the Windows printer driver. A successful callback means
 * the job was accepted by the driver, not that paper physically came out. The
 * caller must keep that distinction in the UI and in acceptance testing.
 */
export function createPrintService({ auth, saleService, catalogService, settingsService, logger, paths }) {
  function requirePrintPermission(permission = 'sales.print') {
    return auth.requirePermission(permission);
  }

  function settingsSnapshot() {
    return settingsService.getSnapshot();
  }

  function logoFrom(settings) {
    return readLogoDataUrl(settings?.business?.logoPath);
  }

  function createWindow() {
    const parent = BrowserWindow.getFocusedWindow();
    return new BrowserWindow({
      show: false,
      parent: parent || undefined,
      width: 900,
      height: 1200,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: false,
      },
    });
  }

  async function renderPdf(html) {
    const win = createWindow();
    try {
      await loadHtml(win, html);
      return await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: true,
        margins: { marginType: 'default' },
      });
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }

  async function printHtml({ html, printerName, widthMm = 80, heightMm = null, landscape = false }) {
    if (!printerName) {
      throw new AppError('No printer is assigned. Open Settings → Hardware and select the Windows printer first.', 'PRINTER_NOT_CONFIGURED');
    }
    const win = createWindow();
    try {
      await loadHtml(win, html);
      const pageSize =
        widthMm && heightMm
          ? { width: Math.round(widthMm * 1000), height: Math.round(heightMm * 1000) }
          : undefined;
      const driverAccepted = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve({ success: false, reason: 'The printer driver did not respond in time.' }), 45000);
        win.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: printerName,
            margins: { marginType: 'none' },
            scaleFactor: 100,
            landscape,
            ...(pageSize ? { pageSize } : {}),
          },
          (success, failureReason) => {
            clearTimeout(timeout);
            resolve({ success, reason: failureReason || '' });
          }
        );
      });
      if (!driverAccepted.success) {
        throw new AppError(
          `The Windows print driver rejected or could not complete the job${
            driverAccepted.reason ? `: ${driverAccepted.reason}` : '.'
          }`,
          'PRINT_FAILED'
        );
      }
      return { success: true, printer: printerName, driverAccepted: true, physicalVerification: 'unverified' };
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }

  async function listPrinters() {
    requirePrintPermission('settings.manage');
    const win = createWindow();
    try {
      const printers = await win.webContents.getPrintersAsync();
      return printers.map((printer) => ({
        name: printer.name,
        displayName: printer.displayName || printer.name,
        description: printer.description || '',
        status: printer.status,
        isDefault: Boolean(printer.isDefault),
        options: printer.options || {},
      }));
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }

  function requireSaleAccess(saleId) {
    return saleService.getSale(saleId);
  }

  async function receiptData(saleId, duplicate) {
    requireSaleAccess(saleId);
    const data = saleService.receiptData(saleId);
    const settings = settingsSnapshot();
    return {
      data,
      settings,
      html: receiptHtml({
        ...data,
        logoDataUrl: logoFrom(settings),
        widthMm: Number(settings.hardware.receiptWidthMm || 80),
        duplicate,
      }),
    };
  }

  async function printReceipt(saleId, { duplicate = false } = {}) {
    requirePrintPermission('sales.print');
    const id = requireInt(saleId, 'Invoice', { min: 1 });
    const settings = settingsSnapshot();
    const printerName = settings.hardware.receiptPrinter;
    const { data, html } = await receiptData(id, duplicate);
    const result = await printHtml({
      html,
      printerName,
      widthMm: 0,
    });
    const printed = saleService.markPrinted(id, { duplicate });
    logger.info('Receipt sent to Windows print driver', {
      saleId: id,
      invoiceNo: data.sale.invoiceNo,
      printerName,
      duplicate,
    });
    return { ...result, ...printed, invoiceNo: data.sale.invoiceNo, physicalVerification: 'unverified' };
  }

  async function printA4Invoice(saleId, { printerName = null } = {}) {
    requirePrintPermission('sales.print');
    const id = requireInt(saleId, 'Invoice', { min: 1 });
    requireSaleAccess(id);
    const data = saleService.receiptData(id);
    const settings = settingsSnapshot();
    const target = printerName || settings.hardware.receiptPrinter;
    const html = invoiceHtml({ ...data, logoDataUrl: logoFrom(settings) });
    const result = await printHtml({ html, printerName: target, widthMm: 210, heightMm: 297 });
    logger.info('A4 invoice sent to Windows print driver', { saleId: id, printerName: target });
    return result;
  }

  async function printLabels(variantIds) {
    requirePrintPermission('products.manage');
    const settings = settingsSnapshot();
    const labelData = catalogService.labelData(variantIds);
    const options = settings.hardware;
    const html = labelsHtml({
      labels: labelData.labels.flatMap((label) => Array.from({ length: Number(options.labelCopies || 1) }, () => label)),
      business: publicBusinessFromSettings(settings),
      options,
    });
    const result = await printHtml({
      html,
      printerName: settings.hardware.labelPrinter,
      widthMm: Number(options.labelWidthMm || 50),
      heightMm: Number(options.labelHeightMm || 25),
    });
    logger.info('Barcode labels sent to Windows print driver', {
      count: labelData.labels.length,
      printerName: settings.hardware.labelPrinter,
    });
    return { ...result, count: labelData.labels.length };
  }

  async function printTestReceipt() {
    requirePrintPermission('settings.manage');
    const settings = settingsSnapshot();
    const html = testReceiptHtml({
      business: publicBusinessFromSettings(settings),
      invoice: settings.invoice,
      receipt: settings.receipt,
      tax: settings.tax,
      logoDataUrl: logoFrom(settings),
      widthMm: Number(settings.hardware.receiptWidthMm || 80),
    });
    return printHtml({ html, printerName: settings.hardware.receiptPrinter });
  }

  function sampleSale() {
    const items = [
      {
        productName: 'Cotton Anarkali Kurti',
        variantLabel: 'Blue / M',
        sku: 'KUR-0001-BLU-M',
        quantity: 1,
        unitPricePaise: 149900,
        discountPaise: 15000,
        lineTotalPaise: 134900,
      },
      {
        productName: 'Everyday Cotton Tee',
        variantLabel: 'Black / L',
        sku: 'TEE-0002-BLK-L',
        quantity: 2,
        unitPricePaise: 49950,
        discountPaise: 5000,
        lineTotalPaise: 94900,
      },
    ];
    const subtotalPaise = items.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0);
    const discountTotalPaise = items.reduce((sum, item) => sum + item.discountPaise, 0);
    const totalPaise = subtotalPaise - discountTotalPaise;
    return {
      invoiceNo: 'SAMPLE-PREVIEW',
      completedAt: new Date().toISOString(),
      cashierName: 'Owner',
      customerName: 'Sample customer',
      customerPhone: '9000000000',
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      pricesIncludeTax: false,
      items,
      subtotalPaise,
      discountTotalPaise,
      taxPaise: 0,
      roundOffPaise: 0,
      totalPaise,
      amountPaidPaise: totalPaise + 200,
      balancePaise: 0,
      changePaise: 200,
    };
  }

  function previewReceipt(input = {}) {
    requirePrintPermission('settings.manage');
    const preview = settingsService.previewPrint(input);
    const widthMm = Number(preview.hardware.receiptWidthMm || 80);
    return {
      html: receiptHtml({
        sale: sampleSale(),
        business: preview.business,
        invoice: preview.invoice,
        receipt: preview.receipt,
        tax: preview.tax,
        logoDataUrl: preview.logoDataUrl,
        widthMm,
        sample: true,
      }),
      widthMm,
      barcode: preview.barcode,
    };
  }

  async function printTestLabel() {
    requirePrintPermission('settings.manage');
    const settings = settingsSnapshot();
    const html = testLabelHtml({
      business: publicBusinessFromSettings(settings),
      options: settings.hardware,
    });
    return printHtml({
      html,
      printerName: settings.hardware.labelPrinter,
      widthMm: Number(settings.hardware.labelWidthMm || 50),
      heightMm: Number(settings.hardware.labelHeightMm || 25),
    });
  }

  function publicBusinessFromSettings(settings) {
    const business = settings.businessPublic || settings.business;
    return {
      ...business,
      invoiceTitle: business.taxEnabled ? 'Tax Invoice' : 'Invoice',
    };
  }

  async function saveInvoicePdf(saleId) {
    requirePrintPermission('sales.print');
    const id = requireInt(saleId, 'Invoice', { min: 1 });
    requireSaleAccess(id);
    const data = saleService.receiptData(id);
    const settings = settingsSnapshot();
    const html = invoiceHtml({ ...data, logoDataUrl: logoFrom(settings) });
    const buffer = await renderPdf(html);
    const filename = `${String(data.sale.invoiceNo).replace(/[^a-zA-Z0-9._-]/g, '-')}-${businessDate()}.pdf`;
    const target = path.join(paths.documents, filename);
    fs.writeFileSync(target, buffer);
    saleService.setPdfPath(id, target);
    logger.info('Invoice PDF generated', { saleId: id, target });
    return { path: target, filename };
  }

  async function whatsappHandoff(saleId) {
    requirePrintPermission('sales.print');
    const { path: pdfPath, filename } = await saveInvoicePdf(saleId);
    clipboard.writeText(pdfPath);
    const sale = saleService.getSale(saleId);
    const phone = String(sale.customerPhone || '').replace(/\D/g, '').slice(-10);
    const message = encodeURIComponent(
      `Hello ${sale.customerName || ''}, thank you for shopping at Modern Fashion. Invoice ${sale.invoiceNo} for ${(
        sale.totalPaise / 100
      ).toFixed(2)} is attached.`
    );
    const url = phone ? `https://wa.me/91${phone}?text=${message}` : `https://web.whatsapp.com/`;
    await shell.openExternal(url);
    shell.showItemInFolder(pdfPath);
    return {
      path: pdfPath,
      filename,
      whatsappOpened: true,
      instructions:
        'The PDF path is copied to the clipboard and its folder is open. Attach the PDF in WhatsApp manually, then press Send.',
    };
  }

  function assertManagedPath(target) {
    const resolved = path.resolve(String(target || ''));
    const allowed = [paths.base, paths.documents, paths.exports].some(
      (directory) => resolved === path.resolve(directory) || resolved.startsWith(`${path.resolve(directory)}${path.sep}`)
    );
    if (!allowed) fail('Only files generated by this application can be opened from here.');
    return resolved;
  }

  async function openPath(target) {
    requirePrintPermission('sales.print');
    const value = assertManagedPath(target);
    if (!fs.existsSync(value)) fail('The file no longer exists.');
    await shell.openPath(value);
    return { opened: true };
  }

  async function openFolder(target) {
    requirePrintPermission('sales.print');
    const value = assertManagedPath(target);
    if (!fs.existsSync(value)) fail('The folder no longer exists.');
    shell.showItemInFolder(value);
    return { opened: true };
  }

  function printerHint() {
    return nowIso();
  }

  return {
    listPrinters,
    printReceipt,
    printA4Invoice,
    printLabels,
    printTestReceipt,
    printTestLabel,
    previewReceipt,
    saveInvoicePdf,
    whatsappHandoff,
    openPath,
    openFolder,
    renderPdf,
    printerHint,
  };
}
