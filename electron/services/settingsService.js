import { fail } from '../core/errors.js';
import { getSetting, getAllSettings, saveSetting, publicBusiness } from '../core/settings.js';
import {
  optionalText,
  requireBasisPoints,
  requireDateKey,
  requireInt,
  requireMoneyPaise,
  requireText,
  nowIso,
} from '../core/validation.js';
import { writeAudit } from '../core/audit.js';
import { transaction } from '../core/database.js';
import { readLogoDataUrl } from '../core/logo.js';
import { normalizeBarcodeConfig } from '../../shared/barcode.js';

export function createSettingsService({ db, auth }) {
  function requireManage() {
    return auth.requirePermission('settings.manage');
  }

  function boolOr(value, fallback) {
    return value === undefined ? Boolean(fallback) : Boolean(value);
  }

  function normalizePrint(input = {}) {
    const invoiceCurrent = getSetting(db, 'invoice');
    const receiptCurrent = getSetting(db, 'receipt');
    const hardwareCurrent = getSetting(db, 'hardware');
    const barcodeCurrent = getSetting(db, 'barcode');
    const width = Number(input.receiptWidthMm ?? input.paperWidthMm ?? hardwareCurrent.receiptWidthMm);
    const receiptWidthMm = [58, 80].includes(width) ? width : hardwareCurrent.receiptWidthMm;
    let barcode;
    try {
      barcode = normalizeBarcodeConfig({
        prefix: input.barcodePrefix ?? barcodeCurrent.prefix,
        digits: input.barcodeDigits ?? barcodeCurrent.digits,
      });
    } catch (error) {
      fail(error.message);
    }
    return {
      invoice: {
        ...invoiceCurrent,
        paperWidthMm: receiptWidthMm,
        duplicateLabel: optionalText(input.duplicateLabel ?? invoiceCurrent.duplicateLabel, { max: 40 }),
        showLogo: boolOr(input.showLogo, invoiceCurrent.showLogo),
        logoHeightMm: requireInt(input.logoHeightMm ?? invoiceCurrent.logoHeightMm, 'Logo height', {
          min: 8,
          max: 30,
        }),
        showAddress: boolOr(input.showAddress, invoiceCurrent.showAddress),
        showPhone: boolOr(input.showPhone, invoiceCurrent.showPhone),
        showState: boolOr(input.showState, invoiceCurrent.showState),
        showGstin: boolOr(input.showGstin, invoiceCurrent.showGstin),
        showTitle: boolOr(input.showTitle, invoiceCurrent.showTitle),
        terms: optionalText(input.terms ?? invoiceCurrent.terms, { max: 1000 }),
        thankYou: optionalText(input.thankYou ?? invoiceCurrent.thankYou, { max: 300 }),
      },
      receipt: {
        ...receiptCurrent,
        showCustomer: boolOr(input.showCustomer, receiptCurrent.showCustomer),
        showCashier: boolOr(input.showCashier, receiptCurrent.showCashier),
        showSavings: boolOr(input.showSavings, receiptCurrent.showSavings),
        showTax: boolOr(input.showTax, receiptCurrent.showTax),
        showSku: boolOr(input.showSku, receiptCurrent.showSku),
        showItemDiscounts: boolOr(input.showItemDiscounts, receiptCurrent.showItemDiscounts),
        showPayment: boolOr(input.showPayment, receiptCurrent.showPayment),
        showAmountReceived: boolOr(input.showAmountReceived, receiptCurrent.showAmountReceived),
        showPoweredBy: boolOr(input.showPoweredBy, receiptCurrent.showPoweredBy),
        headerNote: optionalText(input.headerNote ?? receiptCurrent.headerNote, { max: 300 }),
        fontScale: requireInt(input.fontScale ?? receiptCurrent.fontScale, 'Receipt font size', {
          min: 80,
          max: 130,
        }),
        footerNote: optionalText(input.footerNote ?? receiptCurrent.footerNote, { max: 500 }),
      },
      hardware: { receiptWidthMm },
      barcode,
    };
  }

  function offerRows() {
    return db
      .prepare('SELECT * FROM offers ORDER BY status, priority, id DESC')
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        discountType: row.discount_type,
        value: row.value,
        minBillPaise: row.min_bill_paise,
        maxDiscountPaise: row.max_discount_paise,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        priority: row.priority,
        status: row.status,
        createdAt: row.created_at,
      }));
  }

  function getSnapshot() {
    // Trusted main-process consumers (printing) need the full settings. This
    // method is never mapped to IPC and performs no renderer permission check.
    return {
      ...getAllSettings(db),
      businessPublic: publicBusiness(db),
      hasLogo: Boolean(getSetting(db, 'business').logoPath),
      offers: offerRows(),
    };
  }

  function getPublic() {
    // Full settings include business identity, tax configuration and hardware
    // paths. The POS receives the subset it needs through sales.bootstrap, so
    // this administrative view is restricted to settings managers.
    requireManage();
    return getSnapshot();
  }

  function getLogo() {
    requireManage();
    const business = getSetting(db, 'business');
    return {
      dataUrl: readLogoDataUrl(business.logoPath),
      filename: business.logoPath ? String(business.logoPath).split(/[\\/]/).pop() : '',
      exists: Boolean(business.logoPath),
    };
  }

  function previewPrint(input = {}) {
    requireManage();
    const normalized = normalizePrint(input);
    return {
      ...normalized,
      business: publicBusiness(db),
      tax: getSetting(db, 'tax'),
      logoDataUrl: readLogoDataUrl(getSetting(db, 'business').logoPath),
    };
  }

  function updatePrint(input = {}) {
    const user = requireManage();
    const normalized = normalizePrint(input);
    transaction(db, () => {
      saveSetting(db, 'invoice', normalized.invoice, user.user.id);
      saveSetting(db, 'receipt', normalized.receipt, user.user.id);
      saveSetting(db, 'hardware', { receiptWidthMm: normalized.hardware.receiptWidthMm }, user.user.id);
      saveSetting(db, 'barcode', normalized.barcode, user.user.id);
      writeAudit(db, {
        userId: user.user.id,
        userName: user.user.name,
        action: 'settings.print_updated',
        entityType: 'settings',
        entityId: 'print',
        details: {
          receiptWidthMm: normalized.hardware.receiptWidthMm,
          showLogo: normalized.invoice.showLogo,
          logoHeightMm: normalized.invoice.logoHeightMm,
          fontScale: normalized.receipt.fontScale,
          barcodePrefix: normalized.barcode.prefix,
          barcodeDigits: normalized.barcode.digits,
        },
      });
    });
    return getSnapshot();
  }

  function updateBusiness(input) {
    const user = requireManage();
    const current = getSetting(db, 'business');
    const addressLines = Array.isArray(input.addressLines)
      ? input.addressLines.map((line) => optionalText(line, { max: 160 })).filter(Boolean)
      : current.addressLines;
    if (!addressLines.length) fail('Add at least one address line.');
    const business = saveSetting(
      db,
      'business',
      {
        name: requireText(input.name ?? current.name, 'Business name', { max: 160 }),
        addressLines,
        city: optionalText(input.city ?? current.city, { max: 80 }),
        stateName: optionalText(input.stateName ?? current.stateName, { max: 80 }),
        stateCode: optionalText(input.stateCode ?? current.stateCode, { max: 8 }),
        phone: optionalText(input.phone ?? current.phone, { max: 30 }),
        altPhone: optionalText(input.altPhone ?? current.altPhone, { max: 30 }),
        email: optionalText(input.email ?? current.email, { max: 160 }),
        gstin: optionalText(input.gstin ?? current.gstin, { max: 20 }).toUpperCase(),
        legalName: optionalText(input.legalName ?? current.legalName, { max: 160 }),
      },
      user.user.id
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'settings.business_updated',
      entityType: 'settings',
      entityId: 'business',
      details: { name: business.name, phone: business.phone, stateCode: business.stateCode },
    });
    return business;
  }

  function updateInvoice(input) {
    const user = requireManage();
    const current = getSetting(db, 'invoice');
    const invoice = saveSetting(
      db,
      'invoice',
      {
        prefix: requireText(input.prefix ?? current.prefix, 'Invoice prefix', { max: 12 }).toUpperCase(),
        purchasePrefix: requireText(input.purchasePrefix ?? current.purchasePrefix, 'Purchase prefix', { max: 12 }).toUpperCase(),
        paperWidthMm: [58, 80].includes(Number(input.paperWidthMm ?? current.paperWidthMm))
          ? Number(input.paperWidthMm ?? current.paperWidthMm)
          : current.paperWidthMm,
        duplicateLabel: optionalText(input.duplicateLabel ?? current.duplicateLabel, { max: 40 }),
        showLogo: Boolean(input.showLogo ?? current.showLogo),
        terms: optionalText(input.terms ?? current.terms, { max: 1000 }),
        thankYou: optionalText(input.thankYou ?? current.thankYou, { max: 300 }),
      },
      user.user.id
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'settings.invoice_updated',
      entityType: 'settings',
      entityId: 'invoice',
      details: { prefix: invoice.prefix, paperWidthMm: invoice.paperWidthMm },
    });
    return invoice;
  }

  function updateTax(input) {
    const user = requireManage();
    const current = getSetting(db, 'tax');
    const enabled = Boolean(input.enabled ?? current.enabled);
    const gstin = optionalText(input.gstin ?? current.gstin, { max: 20 }).toUpperCase();
    if (enabled) {
      if (!gstin) fail('Enter the verified GSTIN before enabling tax invoices.');
      if (!/^[0-9A-Z]{15}$/.test(gstin)) fail('GSTIN must be 15 characters. Verify it with the client before enabling tax invoices.');
    }
    const tax = saveSetting(
      db,
      'tax',
      {
        enabled,
        defaultRateBp: requireBasisPoints(input.defaultRateBp ?? current.defaultRateBp, 'Default tax rate'),
        gstin,
        legalName: optionalText(input.legalName ?? current.legalName, { max: 160 }),
        placeOfSupply: optionalText(input.placeOfSupply ?? current.placeOfSupply, { max: 80 }),
        invoiceTitle: enabled ? 'Tax Invoice' : 'Invoice',
        pricesIncludeTax: Boolean(input.pricesIncludeTax ?? current.pricesIncludeTax),
      },
      user.user.id
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'settings.tax_updated',
      entityType: 'settings',
      entityId: 'tax',
      details: { enabled, gstinPresent: Boolean(gstin), defaultRateBp: tax.defaultRateBp },
    });
    return tax;
  }

  function updatePos(input) {
    const user = requireManage();
    const current = getSetting(db, 'pos');
    const pos = saveSetting(
      db,
      'pos',
      {
        manualDiscountMaxPercent: Math.min(100, Math.max(0, Number(input.manualDiscountMaxPercent ?? current.manualDiscountMaxPercent) || 0)),
        cashierManualDiscountMaxPercent: Math.min(
          100,
          Math.max(0, Number(input.cashierManualDiscountMaxPercent ?? current.cashierManualDiscountMaxPercent) || 0)
        ),
        defaultPaymentMethod: ['cash', 'upi', 'card', 'bank_transfer', 'credit'].includes(
          input.defaultPaymentMethod ?? current.defaultPaymentMethod
        )
          ? input.defaultPaymentMethod ?? current.defaultPaymentMethod
          : 'cash',
        lowStockThreshold: requireInt(input.lowStockThreshold ?? current.lowStockThreshold, 'Default low-stock threshold', {
          min: 0,
          max: 100000,
        }),
        allowWalkIn: Boolean(input.allowWalkIn ?? current.allowWalkIn),
        scannerMinLength: requireInt(input.scannerMinLength ?? current.scannerMinLength, 'Scanner minimum length', {
          min: 1,
          max: 64,
        }),
        scannerSuffix: ['enter', 'tab', 'none'].includes(input.scannerSuffix ?? current.scannerSuffix)
          ? input.scannerSuffix ?? current.scannerSuffix
          : 'enter',
        confirmClearCart: Boolean(input.confirmClearCart ?? current.confirmClearCart),
        sessionIdleMinutes: requireInt(input.sessionIdleMinutes ?? current.sessionIdleMinutes, 'Session idle minutes', {
          min: 5,
          max: 480,
        }),
        maxLoginAttempts: requireInt(input.maxLoginAttempts ?? current.maxLoginAttempts, 'Maximum login attempts', {
          min: 3,
          max: 20,
        }),
        lockMinutes: requireInt(input.lockMinutes ?? current.lockMinutes, 'Lock duration', { min: 1, max: 240 }),
      },
      user.user.id
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'settings.pos_updated',
      entityType: 'settings',
      entityId: 'pos',
      details: {
        manualDiscountMaxPercent: pos.manualDiscountMaxPercent,
        defaultPaymentMethod: pos.defaultPaymentMethod,
        scannerSuffix: pos.scannerSuffix,
      },
    });
    return pos;
  }

  function updateHardware(input) {
    const user = requireManage();
    const current = getSetting(db, 'hardware');
    const hardware = saveSetting(
      db,
      'hardware',
      {
        receiptPrinter: optionalText(input.receiptPrinter ?? current.receiptPrinter, { max: 200 }),
        labelPrinter: optionalText(input.labelPrinter ?? current.labelPrinter, { max: 200 }),
        autoPrintReceipt: Boolean(input.autoPrintReceipt ?? current.autoPrintReceipt),
        receiptWidthMm: [58, 80].includes(Number(input.receiptWidthMm ?? current.receiptWidthMm))
          ? Number(input.receiptWidthMm ?? current.receiptWidthMm)
          : current.receiptWidthMm,
        labelWidthMm: requireInt(input.labelWidthMm ?? current.labelWidthMm, 'Label width', { min: 20, max: 150 }),
        labelHeightMm: requireInt(input.labelHeightMm ?? current.labelHeightMm, 'Label height', { min: 10, max: 150 }),
        labelCopies: requireInt(input.labelCopies ?? current.labelCopies, 'Label copies', { min: 1, max: 100 }),
        labelShowPrice: Boolean(input.labelShowPrice ?? current.labelShowPrice),
        labelShowSku: Boolean(input.labelShowSku ?? current.labelShowSku),
        labelShowName: Boolean(input.labelShowName ?? current.labelShowName),
        labelShowSize: Boolean(input.labelShowSize ?? current.labelShowSize),
      },
      user.user.id
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'settings.hardware_updated',
      entityType: 'settings',
      entityId: 'hardware',
      details: {
        receiptPrinter: hardware.receiptPrinter,
        labelPrinter: hardware.labelPrinter,
        labelWidthMm: hardware.labelWidthMm,
        labelHeightMm: hardware.labelHeightMm,
      },
    });
    return hardware;
  }

  function updateReceipt(input) {
    const user = requireManage();
    const current = getSetting(db, 'receipt');
    const receipt = saveSetting(
      db,
      'receipt',
      {
        showCustomer: Boolean(input.showCustomer ?? current.showCustomer),
        showCashier: Boolean(input.showCashier ?? current.showCashier),
        showSavings: Boolean(input.showSavings ?? current.showSavings),
        showTax: Boolean(input.showTax ?? current.showTax),
        footerNote: optionalText(input.footerNote ?? current.footerNote, { max: 500 }),
      },
      user.user.id
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'settings.receipt_updated',
      entityType: 'settings',
      entityId: 'receipt',
      details: receipt,
    });
    return receipt;
  }

  function updateBackup(input) {
    const user = requireManage();
    const current = getSetting(db, 'backup');
    const backup = saveSetting(
      db,
      'backup',
      {
        enabled: Boolean(input.enabled ?? current.enabled),
        directory: optionalText(input.directory ?? current.directory, { max: 1000 }),
        intervalHours: requireInt(input.intervalHours ?? current.intervalHours, 'Backup interval', { min: 1, max: 720 }),
        retention: requireInt(input.retention ?? current.retention, 'Backup retention', { min: 2, max: 365 }),
        lastAutoAt: current.lastAutoAt,
      },
      user.user.id
    );
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'settings.backup_updated',
      entityType: 'settings',
      entityId: 'backup',
      details: backup,
    });
    return backup;
  }

  function setLogoPath(logoPath) {
    const user = requireManage();
    const current = getSetting(db, 'business');
    const business = saveSetting(db, 'business', { ...current, logoPath: String(logoPath || '') }, user.user.id);
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'settings.logo_updated',
      entityType: 'settings',
      entityId: 'business',
      details: { hasLogo: Boolean(logoPath) },
    });
    return business;
  }

  function listOffers() {
    auth.requirePermission('settings.manage');
    return offerRows();
  }

  function saveOffer(input, id = null) {
    const user = requireManage();
    const current = id ? db.prepare('SELECT * FROM offers WHERE id = ?').get(Number(id)) : null;
    if (id && !current) fail('Offer not found.');
    const name = requireText(input.name ?? current?.name, 'Offer name', { max: 120 });
    const discountType = input.discountType ?? current?.discount_type ?? 'percent';
    if (!['percent', 'fixed'].includes(discountType)) fail('Choose percentage or fixed discount.');
    const rawValue = requireInt(input.value ?? current?.value, 'Offer value', { min: 1, max: 100000000 });
    if (discountType === 'percent' && rawValue > 10000) fail('Percentage offer cannot exceed 100%.');
    const minBillPaise = requireMoneyPaise(input.minBillPaise ?? current?.min_bill_paise ?? 0, 'Minimum bill');
    const maxDiscountPaise = requireMoneyPaise(input.maxDiscountPaise ?? current?.max_discount_paise ?? 0, 'Maximum discount');
    const startsOn = input.startsOn ? requireDateKey(input.startsOn, 'Start date') : current?.starts_on || null;
    const endsOn = input.endsOn ? requireDateKey(input.endsOn, 'End date') : current?.ends_on || null;
    if (startsOn && endsOn && startsOn > endsOn) fail('Offer start date cannot be after its end date.');
    const priority = requireInt(input.priority ?? current?.priority ?? 100, 'Priority', { min: 0, max: 10000 });
    const status = input.status ?? current?.status ?? 'active';
    if (!['active', 'inactive'].includes(status)) fail('Choose a valid offer status.');
    const now = nowIso();
    if (id) {
      db.prepare(
        `UPDATE offers SET name = ?, discount_type = ?, value = ?, min_bill_paise = ?, max_discount_paise = ?,
         starts_on = ?, ends_on = ?, priority = ?, status = ?, updated_at = ? WHERE id = ?`
      ).run(name, discountType, rawValue, minBillPaise, maxDiscountPaise, startsOn, endsOn, priority, status, now, Number(id));
    } else {
      const result = db
        .prepare(
          `INSERT INTO offers (name, discount_type, value, min_bill_paise, max_discount_paise, starts_on, ends_on,
             priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(name, discountType, rawValue, minBillPaise, maxDiscountPaise, startsOn, endsOn, priority, status, now, now);
      id = Number(result.lastInsertRowid);
    }
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: current ? 'offer.updated' : 'offer.created',
      entityType: 'offer',
      entityId: id,
      details: { name, discountType, value: rawValue, status },
    });
    return { id };
  }

  function deleteOffer(id) {
    const user = requireManage();
    const offerId = requireInt(id, 'Offer', { min: 1 });
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(offerId);
    if (!offer) fail('Offer not found.');
    db.prepare("UPDATE offers SET status = 'inactive', updated_at = ? WHERE id = ?").run(nowIso(), offerId);
    writeAudit(db, {
      userId: user.user.id,
      userName: user.user.name,
      action: 'offer.deactivated',
      entityType: 'offer',
      entityId: offerId,
      details: { name: offer.name },
    });
    return { deactivated: true };
  }

  return {
    getPublic,
    getSnapshot,
    getLogo,
    previewPrint,
    updatePrint,
    updateBusiness,
    updateInvoice,
    updateTax,
    updatePos,
    updateHardware,
    updateReceipt,
    updateBackup,
    setLogoPath,
    listOffers,
    saveOffer,
    deleteOffer,
  };
}
