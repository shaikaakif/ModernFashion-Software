import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
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

  async function receiptData(saleId, duplicate, widthMm = null) {
    requireSaleAccess(saleId);
    const data = saleService.receiptData(saleId);
    const settings = settingsSnapshot();
    return {
      data,
      settings,
      html: receiptHtml({
        ...data,
        logoDataUrl: logoFrom(settings),
        widthMm: Number(widthMm || settings.hardware.receiptWidthMm || 77) === 58 ? 58 : 77,
        duplicate,
      }),
    };
  }

  async function printReceipt(saleId, { duplicate = false, widthMm = null } = {}) {
    requirePrintPermission('sales.print');
    const id = requireInt(saleId, 'Invoice', { min: 1 });
    const settings = settingsSnapshot();
    const printerName = settings.hardware.receiptPrinter;
    const { data, html } = await receiptData(id, duplicate, widthMm);
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

  async function previewSale(saleId, { widthMm = 77, a4 = false } = {}) {
    requirePrintPermission('sales.print');
    const id = requireInt(saleId, 'Invoice', { min: 1 });
    requireSaleAccess(id);
    const data = saleService.receiptData(id);
    const settings = settingsSnapshot();
    const paperWidth = Number(widthMm) === 58 ? 58 : 77;
    return {
      format: a4 ? 'a4' : 'receipt',
      widthMm: a4 ? 210 : paperWidth,
      html: a4
        ? invoiceHtml({ ...data, logoDataUrl: logoFrom(settings) })
        : receiptHtml({ ...data, logoDataUrl: logoFrom(settings), widthMm: paperWidth }),
    };
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

  function labelSelection(input = {}) {
    const source = Array.isArray(input.items)
      ? input.items
      : (Array.isArray(input.variantIds) ? input.variantIds : []).map((variantId) => ({ variantId, copies: 1 }));
    const merged = new Map();
    for (const item of source) {
      const variantId = requireInt(item.variantId ?? item, 'Variant', { min: 1 });
      const copies = Math.min(100, Math.max(1, Number(item.copies || 1)));
      merged.set(variantId, Math.min(100, (merged.get(variantId) || 0) + copies));
    }
    if (!merged.size) fail('Choose at least one variant to print.');
    if (merged.size > 500) fail('Choose at most 500 variants at a time.');
    return [...merged].map(([variantId, copies]) => ({ variantId, copies }));
  }

  function labelOptions(settings, input = {}) {
    const width = Math.min(110, Math.max(20, Number(input.labelWidthMm ?? settings.hardware.labelWidthMm ?? 50)));
    const height = Math.min(80, Math.max(15, Number(input.labelHeightMm ?? settings.hardware.labelHeightMm ?? 25)));
    return {
      ...settings.hardware,
      labelWidthMm: width,
      labelHeightMm: height,
      labelShowPrice: input.labelShowPrice ?? settings.hardware.labelShowPrice,
      labelShowName: input.labelShowName ?? settings.hardware.labelShowName,
      labelShowSku: input.labelShowSku ?? settings.hardware.labelShowSku,
      labelShowSize: input.labelShowSize ?? settings.hardware.labelShowSize,
    };
  }

  function buildLabels(input, settings, options, preview = false) {
    const items = labelSelection(input);
    const labelData = catalogService.labelData(items.map((item) => item.variantId));
    const copies = new Map(items.map((item) => [item.variantId, item.copies]));
    const labels = labelData.labels.flatMap((label) =>
      Array.from({ length: copies.get(label.variantId) || 1 }, () => label)
    );
    if (labels.length > 500) fail('Print at most 500 labels at a time.');
    return {
      labels,
      count: labels.length,
      html: labelsHtml({ labels, business: publicBusinessFromSettings(settings), options, preview }),
    };
  }

  async function printLabels(input = {}) {
    requirePrintPermission('products.manage');
    const settings = settingsSnapshot();
    const options = labelOptions(settings, input);
    const built = buildLabels(input, settings, options);
    const result = await printHtml({
      html: built.html,
      printerName: input.labelPrinter || settings.hardware.labelPrinter,
      widthMm: options.labelWidthMm,
      heightMm: options.labelHeightMm,
    });
    logger.info('Barcode labels sent to Windows print driver', {
      count: built.count,
      printerName: input.labelPrinter || settings.hardware.labelPrinter,
      widthMm: options.labelWidthMm,
      heightMm: options.labelHeightMm,
    });
    return {
      ...result,
      count: built.count,
      widthMm: options.labelWidthMm,
      heightMm: options.labelHeightMm,
    };
  }

  function previewLabels(input = {}) {
    requirePrintPermission('products.manage');
    const settings = settingsSnapshot();
    const options = labelOptions(settings, input);
    const built = buildLabels(input, settings, options, true);
    return {
      html: built.html,
      count: built.count,
      widthMm: options.labelWidthMm,
      heightMm: options.labelHeightMm,
    };
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
      widthMm: Number(settings.hardware.receiptWidthMm || 77),
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
    const widthMm = Number(preview.hardware.receiptWidthMm || 77);
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

  function whatsappDesktopRunning() {
    return new Promise((resolve) => {
      execFile(
        'tasklist.exe',
        ['/FI', 'IMAGENAME eq WhatsApp.Root.exe', '/NH'],
        { windowsHide: true, timeout: 5000 },
        (error, stdout) => resolve(!error && /WhatsApp\.Root/i.test(String(stdout || '')))
      );
    });
  }

  async function whatsappHandoff(saleId) {
    requirePrintPermission('sales.print');
    const { path: pdfPath, filename } = await saveInvoicePdf(saleId);
    const sale = saleService.getSale(saleId);
    const phone = String(sale.customerPhone || '').replace(/\D/g, '').slice(-10);
    const customer = sale.customerName || 'Walk-in customer';
    const settings = settingsSnapshot();
    const template =
      settings.receipt?.whatsappCaption ||
      'Hello {customer}, thank you for shopping at {shop}. Invoice {invoice} for {amount} is attached.';
    const messageText = template
      .replaceAll('{customer}', sale.customerName || '')
      .replaceAll('{invoice}', sale.invoiceNo || '')
      .replaceAll('{amount}', `₹${(sale.totalPaise / 100).toFixed(2)}`)
      .replaceAll('{shop}', settings.business?.name || 'Modern Fashion');
    const message = encodeURIComponent(messageText);

    // Show the generated PDF first so Explorer selects it, then bring WhatsApp
    // Desktop to the front with the correct chat and a pre-filled message.
    // Attachment remains manual: WhatsApp's WebView content is not exposed to
    // Windows UI Automation on the installed build, and file-drop paste is
    // rejected. Never press Send from this application.
    clipboard.writeText(pdfPath);
    shell.showItemInFolder(pdfPath);

    const wasRunning = await whatsappDesktopRunning();
    let opened = false;
    let reason = '';
    if (!phone) {
      reason = 'no-phone';
    } else {
      try {
        await shell.openExternal(`whatsapp://send?phone=91${phone}&text=${message}`);
        opened = true;
      } catch (error) {
        reason = 'whatsapp-unavailable';
        logger?.warn('WhatsApp Desktop could not be opened', { message: error?.message });
      }
    }

    const instructions = opened
      ? `WhatsApp Desktop was ${wasRunning ? 'brought to the front' : 'started'} for ${customer} (${phone}). The message is pre-filled. The PDF is selected in the folder that just opened — drag it into WhatsApp, verify the recipient, then press Send yourself.`
      : phone
        ? `WhatsApp Desktop could not be opened automatically. The PDF is selected in the folder. Attach it manually in WhatsApp, verify the recipient, then press Send.`
        : 'This invoice has no saved mobile number. The PDF folder is open; choose the customer manually in WhatsApp and attach the PDF.';

    return {
      path: pdfPath,
      filename,
      whatsappOpened: opened,
      whatsappRunning: wasRunning,
      customerName: customer,
      customerPhone: phone,
      reason,
      instructions,
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
    previewLabels,
    printTestReceipt,
    printTestLabel,
    previewReceipt,
    saveInvoicePdf,
    previewSale,
    whatsappHandoff,
    openPath,
    openFolder,
    renderPdf,
    printerHint,
  };
}
