import { escapeHtml, code128Svg } from './code128.js';

const DATE_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const TIME_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const PAYMENT_LABELS = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  credit: 'Credit',
  cheque: 'Cheque',
};

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return DATE_FORMAT.format(date);
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${DATE_FORMAT.format(date)}, ${TIME_FORMAT.format(date)}`;
}

export function money(paise, { symbol = 'Rs.', space = ' ' } = {}) {
  const amount = (Number(paise) || 0) / 100;
  const text = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${space}${text}`;
}

export function paymentLabel(method) {
  return PAYMENT_LABELS[method] || method || '';
}

export function amountInWords(paise) {
  const rupees = Math.floor(Math.abs(Number(paise) || 0) / 100);
  const paisePart = Math.abs(Number(paise) || 0) % 100;
  if (rupees === 0 && paisePart === 0) return 'Zero rupees only';
  const words = `${numberToIndianWords(rupees)} rupees${paisePart ? ` and ${numberToIndianWords(paisePart)} paise` : ''} only`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function belowHundred(number) {
  if (number < 20) return ONES[number];
  const tens = Math.floor(number / 10);
  const ones = number % 10;
  return `${TENS[tens]}${ones ? ` ${ONES[ones]}` : ''}`;
}

function belowThousand(number) {
  const hundreds = Math.floor(number / 100);
  const rest = number % 100;
  return `${hundreds ? `${ONES[hundreds]} hundred` : ''}${hundreds && rest ? ' ' : ''}${rest ? belowHundred(rest) : ''}`.trim();
}

function numberToIndianWords(number) {
  let value = Math.floor(Number(number) || 0);
  if (value === 0) return 'zero';
  const parts = [];
  const crore = Math.floor(value / 10000000);
  value %= 10000000;
  const lakh = Math.floor(value / 100000);
  value %= 100000;
  const thousand = Math.floor(value / 1000);
  value %= 1000;
  if (crore) parts.push(`${numberToIndianWords(crore)} crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} thousand`);
  if (value) parts.push(belowThousand(value));
  return parts.join(' ');
}

function addressLines(business) {
  return (business?.addressLines || []).filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join('');
}

function logoMarkup(logoDataUrl, { maxHeight = '16mm', className = 'logo' } = {}) {
  if (!logoDataUrl) return '';
  return `<img class="${className}" src="${logoDataUrl}" alt="" style="max-height:${maxHeight};max-width:70%;object-fit:contain;" />`;
}

function invoiceTitle(tax) {
  return tax?.enabled ? 'TAX INVOICE' : 'INVOICE';
}

function termsMarkup(invoice, receipt) {
  const terms = String(invoice?.terms || '').trim();
  const footer = String(receipt?.footerNote || '').trim();
  const lines = [];
  if (terms) lines.push(`<div class="terms"><strong>Terms &amp; Conditions</strong><div>${escapeHtml(terms).replace(/\n/g, '<br/>')}</div></div>`);
  if (footer) lines.push(`<div class="footer-note">${escapeHtml(footer).replace(/\n/g, '<br/>')}</div>`);
  return lines.join('');
}

export function receiptHtml({
  sale,
  business,
  invoice,
  receipt,
  tax,
  logoDataUrl = '',
  widthMm = 80,
  duplicate = false,
  sample = false,
}) {
  const width = widthMm === 58 ? 58 : 80;
  const contentWidth = width === 58 ? 46 : 70;
  const scale = Math.min(1.3, Math.max(0.8, Number(receipt?.fontScale || 100) / 100));
  const fs = (size) => `${(size * scale).toFixed(2)}px`;
  const showLogo = invoice?.showLogo !== false && Boolean(logoDataUrl);
  const logoHeight = Math.min(30, Math.max(8, Number(invoice?.logoHeightMm || 16)));
  const showTitle = invoice?.showTitle !== false;
  const showAddress = invoice?.showAddress !== false;
  const showPhone = invoice?.showPhone !== false;
  const showState = invoice?.showState !== false;
  const showGstin = invoice?.showGstin !== false;
  const showPayment = receipt?.showPayment !== false;
  const showAmountReceived = receipt?.showAmountReceived !== false;
  const showPoweredBy = receipt?.showPoweredBy !== false;
  const showItemDiscounts = receipt?.showItemDiscounts !== false;
  const showSku = receipt?.showSku !== false;
  const showTax = Boolean(tax?.enabled) && Number(sale.taxPaise) > 0 && receipt?.showTax !== false;
  const inclusiveTax = showTax && Boolean(sale.pricesIncludeTax);
  const balance = Math.max(0, Number(sale.balancePaise || 0));
  const change = Number(sale.changePaise || 0);
  const headerNote = String(receipt?.headerNote || '').trim();
  const amountRows = showAmountReceived
    ? `<tr><td>Amount received</td><td>${money(sale.amountPaidPaise)}</td></tr>${
        balance > 0
          ? `<tr><td>Balance due</td><td>${money(balance)}</td></tr>`
          : `<tr><td>Change</td><td>${money(change)}</td></tr>`
      }`
    : '';
  const stateLine = [
    showState
      ? business?.stateCode
        ? `${business.stateCode} - ${business.stateName || ''}`
        : business?.stateName
      : '',
    showPhone ? business?.phone : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const rows = (sale.items || [])
    .map((item) => {
      const gross = item.unitPricePaise * item.quantity;
      const discount = item.discountPaise || 0;
      const discountPercent = gross > 0 ? (discount * 100) / gross : 0;
      return `<div class="item">
        <div class="item-name">${escapeHtml(item.productName)}</div>
        <div class="item-meta">${escapeHtml(item.variantLabel)}${
          showSku && item.sku ? ` · ${escapeHtml(item.sku)}` : ''
        }</div>
        <div class="line"><span>${item.quantity} x ${money(item.unitPricePaise)}</span><span>${money(gross)}</span></div>
        ${
          showItemDiscounts && discount > 0
            ? `<div class="line discount"><span>Discount${
                discountPercent > 0 ? ` (${discountPercent.toFixed(1)}%)` : ''
              }</span><span>- ${money(discount)}</span></div>`
            : ''
        }
        <div class="line strong"><span>Amount</span><span>${money(item.lineTotalPaise)}</span></div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(sale.invoiceNo)}</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: ${contentWidth}mm; padding: 2mm 1mm 4mm; font-family: Arial, Helvetica, sans-serif; font-size: ${fs(width === 58 ? 9 : 10)}; line-height: 1.35; }
  .center { text-align: center; }
  .logo { display: block; margin: 0 auto 1.5mm; }
  .business-name { font-size: ${fs(width === 58 ? 14 : 16)}; font-weight: 800; letter-spacing: 0.03em; }
  .business-meta { font-size: ${fs(width === 58 ? 8 : 9)}; line-height: 1.35; }
  .title { margin: 2mm 0 1mm; font-size: ${fs(width === 58 ? 10 : 11)}; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
  .duplicate, .sample { margin: 1.5mm 0; padding: 1mm; border: 1px dashed #000; font-size: ${fs(8)}; font-weight: 700; letter-spacing: 0.08em; text-align: center; }
  .sample { border-style: solid; }
  .header-note { margin: 1.2mm 0; font-size: ${fs(8)}; text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 1.8mm 0; }
  .meta { width: 100%; border-collapse: collapse; }
  .meta td { padding: 0.35mm 0; vertical-align: top; font-size: ${fs(width === 58 ? 8 : 9)}; }
  .meta td:last-child { text-align: right; }
  .item { padding: 1.2mm 0 0.4mm; border-top: 1px dotted #777; }
  .item:first-child { border-top: 0; }
  .item-name { font-weight: 700; font-size: ${fs(width === 58 ? 9 : 10)}; }
  .item-meta { color: #333; font-size: ${fs(width === 58 ? 7.5 : 8.5)}; }
  .line { display: flex; justify-content: space-between; gap: 2mm; font-size: ${fs(width === 58 ? 8 : 9)}; }
  .line.strong { font-weight: 700; margin-top: 0.5mm; }
  .line.discount { color: #333; }
  .totals { width: 100%; border-collapse: collapse; margin-top: 1mm; }
  .totals td { padding: 0.45mm 0; font-size: ${fs(width === 58 ? 8 : 9)}; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .totals .grand td { padding-top: 1.2mm; font-size: ${fs(width === 58 ? 12 : 14)}; font-weight: 800; border-top: 1px solid #000; }
  .savings { margin-top: 1mm; padding: 0.8mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-weight: 700; text-align: center; }
  .terms { margin-top: 2mm; font-size: ${fs(width === 58 ? 7.5 : 8)}; line-height: 1.4; }
  .terms strong { display: block; font-size: ${fs(8)}; letter-spacing: 0.04em; text-transform: uppercase; }
  .footer-note { margin-top: 1.5mm; font-size: ${fs(7.5)}; text-align: center; }
  .thanks { margin-top: 2mm; font-size: ${fs(width === 58 ? 9 : 10)}; font-weight: 700; text-align: center; }
  .powered { margin-top: 1.5mm; font-size: ${fs(6.5)}; color: #555; text-align: center; }
  .gst { font-size: ${fs(8)}; }
</style></head>
<body>
  ${showLogo ? logoMarkup(logoDataUrl, { maxHeight: `${logoHeight}mm` }) : ''}
  <div class="center">
    <div class="business-name">${escapeHtml(business?.name || 'MODERN FASHION')}</div>
    ${showAddress ? `<div class="business-meta">${addressLines(business)}</div>` : ''}
    ${stateLine ? `<div class="business-meta">${escapeHtml(stateLine)}</div>` : ''}
    ${showGstin && tax?.enabled && tax?.gstin ? `<div class="business-meta gst">GSTIN: ${escapeHtml(tax.gstin)}</div>` : ''}
  </div>
  ${showTitle ? `<div class="center title">${invoiceTitle(tax)}</div>` : ''}
  ${sample ? '<div class="sample">SAMPLE PREVIEW · NOT A SALE</div>' : ''}
  ${duplicate ? `<div class="duplicate">${escapeHtml(invoice?.duplicateLabel || 'DUPLICATE COPY')}</div>` : ''}
  ${headerNote ? `<div class="header-note">${escapeHtml(headerNote).replace(/\n/g, '<br/>')}</div>` : ''}
  <table class="meta">
    <tr><td>Invoice</td><td>${escapeHtml(sale.invoiceNo)}</td></tr>
    <tr><td>Date</td><td>${escapeHtml(formatDateTime(sale.completedAt || sale.saleDate))}</td></tr>
    ${receipt?.showCashier !== false ? `<tr><td>Cashier</td><td>${escapeHtml(sale.cashierName || '')}</td></tr>` : ''}
    ${
      receipt?.showCustomer !== false && sale.customerName
        ? `<tr><td>Customer</td><td>${escapeHtml(sale.customerName)}</td></tr>`
        : ''
    }
    ${
      receipt?.showCustomer !== false && sale.customerPhone
        ? `<tr><td>Mobile</td><td>${escapeHtml(sale.customerPhone)}</td></tr>`
        : ''
    }
    ${showPayment ? `<tr><td>Payment</td><td>${escapeHtml(paymentLabel(sale.paymentMethod))}</td></tr>` : ''}
  </table>
  <div class="divider"></div>
  ${rows}
  <div class="divider"></div>
  <table class="totals">
    <tr><td>Total quantity</td><td>${Number(sale.items?.reduce((sum, item) => sum + item.quantity, 0) || 0)}</td></tr>
    <tr><td>Subtotal</td><td>${money(sale.subtotalPaise)}</td></tr>
    ${Number(sale.discountTotalPaise) > 0 ? `<tr><td>Discount</td><td>- ${money(sale.discountTotalPaise)}</td></tr>` : ''}
    ${showTax ? `<tr><td>${inclusiveTax ? 'Tax included' : 'Tax'}</td><td>${money(sale.taxPaise)}</td></tr>` : ''}
    ${Number(sale.roundOffPaise) !== 0 ? `<tr><td>Round off</td><td>${Number(sale.roundOffPaise) > 0 ? '+' : '-'} ${money(
      Math.abs(sale.roundOffPaise)
    )}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td>${money(sale.totalPaise)}</td></tr>
    ${amountRows}
  </table>
  ${
    receipt?.showSavings !== false && Number(sale.discountTotalPaise) > 0
      ? `<div class="savings">You saved ${money(sale.discountTotalPaise)}</div>`
      : ''
  }
  ${termsMarkup(invoice, receipt)}
  <div class="thanks">${escapeHtml(invoice?.thankYou || 'Thank you for shopping with us.')}</div>
  ${showPoweredBy ? '<div class="powered">Modern Fashion POS · Engineered by Meninges Labs</div>' : ''}
</body></html>`;
}

export function invoiceHtml({ sale, business, invoice, receipt, tax, logoDataUrl = '' }) {
  const showLogo = invoice?.showLogo !== false && Boolean(logoDataUrl);
  const logoHeight = Math.min(30, Math.max(8, Number(invoice?.logoHeightMm || 22)));
  const showAddress = invoice?.showAddress !== false;
  const showPhone = invoice?.showPhone !== false;
  const showState = invoice?.showState !== false;
  const showGstin = invoice?.showGstin !== false;
  const showTitle = invoice?.showTitle !== false;
  const showPoweredBy = receipt?.showPoweredBy !== false;
  const stateLine = [
    showState
      ? business?.stateCode
        ? `${business.stateCode} - ${business.stateName || ''}`
        : business?.stateName
      : '',
    showPhone ? business?.phone : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const rows = (sale.items || [])
    .map((item, index) => {
      const gross = item.unitPricePaise * item.quantity;
      const taxable = item.lineTotalPaise - item.taxPaise;
      return `<tr>
        <td class="num">${index + 1}</td>
        <td><strong>${escapeHtml(item.productName)}</strong><div class="muted">${escapeHtml(
          item.variantLabel
        )} · ${escapeHtml(item.sku)}</div></td>
        <td>${escapeHtml(item.hsnCode || '—')}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.unitPricePaise, { symbol: '₹', space: '' })}</td>
        <td class="num">${money(gross, { symbol: '₹', space: '' })}</td>
        <td class="num">${money(item.discountPaise, { symbol: '₹', space: '' })}</td>
        <td class="num">${money(taxable, { symbol: '₹', space: '' })}</td>
        <td class="num">${escapeHtml((item.taxRateBp / 100).toFixed(2))}%</td>
        <td class="num">${money(item.taxPaise, { symbol: '₹', space: '' })}</td>
        <td class="num strong">${money(item.lineTotalPaise, { symbol: '₹', space: '' })}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(sale.invoiceNo)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #1d1d1f; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.45; }
  .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #202124; padding-bottom: 14px; }
  .brand { display: flex; gap: 14px; align-items: flex-start; }
  .logo { max-height: 22mm; max-width: 52mm; object-fit: contain; }
  .brand h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: 0.02em; }
  .brand p { margin: 0; color: #54555a; font-size: 9.5px; }
  .doc { text-align: right; min-width: 175px; }
  .doc h2 { margin: 0 0 6px; font-size: 16px; letter-spacing: 0.12em; text-transform: uppercase; }
  .doc table { margin-left: auto; border-collapse: collapse; }
  .doc td { padding: 1px 0 1px 14px; font-size: 9.5px; }
  .doc td:first-child { color: #6b6c72; }
  .parties { display: flex; gap: 28px; margin: 16px 0; }
  .party { flex: 1; }
  .label { margin-bottom: 4px; color: #77787d; font-size: 8px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .party strong { display: block; font-size: 12px; }
  .party div { color: #4f5055; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.items thead th { padding: 7px 5px; background: #f1f1ef; border-top: 1px solid #d9d9d5; border-bottom: 1px solid #d9d9d5; font-size: 8px; letter-spacing: 0.04em; text-align: left; text-transform: uppercase; }
  table.items tbody td { padding: 7px 5px; border-bottom: 1px solid #ecece8; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #77787d; font-size: 8.5px; }
  .strong { font-weight: 700; }
  .bottom { display: flex; justify-content: space-between; gap: 30px; margin-top: 16px; }
  .words { flex: 1; font-size: 9px; }
  .words strong { display: block; margin-bottom: 4px; }
  .totals { width: 300px; border-collapse: collapse; }
  .totals td { padding: 3px 0; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { padding-top: 8px; border-top: 2px solid #202124; font-size: 14px; font-weight: 700; }
  .terms { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e2de; color: #55565b; font-size: 8.5px; }
  .foot { margin-top: 18px; display: flex; justify-content: space-between; color: #77787d; font-size: 8px; }
  .notice { margin-top: 8px; padding: 6px 8px; border: 1px solid #e4d7c8; background: #fbf7f1; color: #6b4e2e; font-size: 8px; }
</style></head>
<body>
  <div class="top">
    <div class="brand">
      ${showLogo ? logoMarkup(logoDataUrl, { maxHeight: `${logoHeight}mm` }) : ''}
      <div>
        <h1>${escapeHtml(business?.name || 'MODERN FASHION')}</h1>
        ${showAddress ? `<p>${(business?.addressLines || []).map((line) => escapeHtml(line)).join('<br/>')}</p>` : ''}
        ${stateLine ? `<p>${escapeHtml(stateLine)}</p>` : ''}
        ${showGstin && tax?.enabled && tax?.gstin ? `<p>GSTIN: ${escapeHtml(tax.gstin)}</p>` : ''}
      </div>
    </div>
    <div class="doc">
      ${showTitle ? `<h2>${invoiceTitle(tax)}</h2>` : ''}
      <table>
        <tr><td>Invoice no.</td><td><strong>${escapeHtml(sale.invoiceNo)}</strong></td></tr>
        <tr><td>Invoice date</td><td>${escapeHtml(formatDate(sale.completedAt || sale.saleDate))}</td></tr>
        <tr><td>Cashier</td><td>${escapeHtml(sale.cashierName || '')}</td></tr>
        <tr><td>Payment</td><td>${escapeHtml(paymentLabel(sale.paymentMethod))}</td></tr>
        <tr><td>Status</td><td>${escapeHtml(sale.paymentStatus)}</td></tr>
      </table>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <div class="label">Billed to</div>
      <strong>${escapeHtml(sale.customerName || 'Walk-in customer')}</strong>
      <div>${escapeHtml(sale.customerPhone || '')}</div>
    </div>
    <div class="party">
      <div class="label">Sold by</div>
      <strong>${escapeHtml(business?.name || 'MODERN FASHION')}</strong>
      <div>${escapeHtml(business?.phone || '')}</div>
    </div>
  </div>
  <table class="items">
    <thead><tr><th>#</th><th>Description</th><th>HSN</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Gross</th><th class="num">Discount</th><th class="num">Taxable</th><th class="num">Tax</th><th class="num">Tax amt</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bottom">
    <div class="words">
      <strong>Amount in words</strong>
      ${escapeHtml(amountInWords(sale.totalPaise))}
      ${tax?.enabled ? '' : '<div class="notice">Tax invoice is not enabled in Settings. This document is a sales invoice, not a GST tax invoice.</div>'}
    </div>
    <table class="totals">
      <tr><td>Subtotal</td><td>${money(sale.subtotalPaise, { symbol: '₹', space: '' })}</td></tr>
      <tr><td>Discount</td><td>- ${money(sale.discountTotalPaise, { symbol: '₹', space: '' })}</td></tr>
      ${tax?.enabled ? `<tr><td>${sale.pricesIncludeTax ? 'Tax included (not added)' : 'Tax'}</td><td>${money(sale.taxPaise, { symbol: '₹', space: '' })}</td></tr>` : ''}
      <tr><td>Round off</td><td>${money(sale.roundOffPaise, { symbol: '₹', space: '' })}</td></tr>
      <tr class="grand"><td>Total payable</td><td>${money(sale.totalPaise, { symbol: '₹', space: '' })}</td></tr>
      <tr><td>Amount received</td><td>${money(sale.amountPaidPaise, { symbol: '₹', space: '' })}</td></tr>
      <tr><td>${sale.balancePaise > 0 ? 'Balance due' : 'Change'}</td><td>${money(
        sale.balancePaise > 0 ? sale.balancePaise : sale.changePaise,
        { symbol: '₹', space: '' }
      )}</td></tr>
    </table>
  </div>
  <div class="terms">
    ${invoice?.terms ? `<strong>Terms &amp; Conditions</strong><div>${escapeHtml(invoice.terms).replace(/\n/g, '<br/>')}</div>` : ''}
    ${receipt?.footerNote ? `<div>${escapeHtml(receipt.footerNote)}</div>` : ''}
  </div>
  <div class="foot"><span>${escapeHtml(invoice?.thankYou || 'Thank you for shopping with us.')}</span>${
    showPoweredBy ? '<span>Computer-generated invoice · Modern Fashion POS</span>' : ''
  }</div>
</body></html>`;
}

export function labelHtml({ label, business, options = {} }) {
  const width = Number(options.labelWidthMm || 50);
  const height = Number(options.labelHeightMm || 25);
  const showName = options.labelShowName !== false;
  const showSku = options.labelShowSku !== false;
  const showPrice = options.labelShowPrice !== false;
  const showSize = options.labelShowSize !== false;
  const barcode = code128Svg(label.barcode, { moduleWidth: 2, height: 30, showText: true });
  return `<div class="label">
    <div class="brand">${escapeHtml(business?.name || 'MODERN FASHION')}</div>
    ${showName ? `<div class="name">${escapeHtml(label.productName)}</div>` : ''}
    ${showSize ? `<div class="size">${escapeHtml(label.color)} / ${escapeHtml(label.size)}</div>` : ''}
    <div class="barcode">${barcode}</div>
    ${showPrice ? `<div class="price">Rs. ${((label.pricePaise || 0) / 100).toFixed(2)}</div>` : ''}
    ${showSku ? `<div class="sku">${escapeHtml(label.sku)}</div>` : ''}
  </div>
  <style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
    .label { width: ${width}mm; height: ${height}mm; padding: 1.4mm 2mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; page-break-after: always; }
    .brand { font-size: 6.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #222; }
    .name { max-width: 100%; font-size: 8px; font-weight: 700; line-height: 1.15; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .size { font-size: 6.5px; color: #333; }
    .barcode { width: 100%; display: flex; justify-content: center; }
    .barcode svg { width: 100%; height: auto; max-height: 9.5mm; }
    .price { font-size: 9px; font-weight: 800; line-height: 1; }
    .sku { font-size: 5.8px; font-family: Consolas, monospace; color: #333; }
  </style>`;
}

export function labelsHtml({ labels, business, options = {} }) {
  const pages = labels.map((label) => labelHtml({ label, business, options })).join('');
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Barcode labels</title></head><body>${pages}</body></html>`;
}

export function testReceiptHtml({ business, invoice, receipt, tax, logoDataUrl = '', widthMm = 80 }) {
  const width = widthMm === 58 ? 58 : 80;
  const contentWidth = width === 58 ? 46 : 70;
  const scale = Math.min(1.3, Math.max(0.8, Number(receipt?.fontScale || 100) / 100));
  const fs = (size) => `${(size * scale).toFixed(2)}px`;
  const showLogo = invoice?.showLogo !== false && Boolean(logoDataUrl);
  const logoHeight = Math.min(30, Math.max(8, Number(invoice?.logoHeightMm || 16)));
  const stateLine = [
    business?.stateCode ? `${business.stateCode} - ${business.stateName || ''}` : business?.stateName,
    invoice?.showPhone !== false ? business?.phone : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Printer test</title>
  <style>
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; color: #000; background: #fff; }
    body { width: ${contentWidth}mm; padding: 2mm 1mm 5mm; font-family: Arial, sans-serif; font-size: ${fs(10)}; line-height: 1.4; }
    .center { text-align: center; } .logo { display:block; margin:0 auto 2mm; max-width:70%; object-fit:contain; }
    .title { margin: 2mm 0; font-size: ${fs(14)}; font-weight: 800; letter-spacing: 0.1em; }
    .banner { margin: 2mm 0; padding: 1.5mm; border: 1px dashed #000; font-size: ${fs(8)}; font-weight: 700; text-align: center; }
    .row { display:flex; justify-content:space-between; gap:2mm; border-top:1px dotted #777; padding:0.8mm 0; }
    .big { font-size: ${fs(13)}; font-weight: 800; }
    .small { font-size: ${fs(8)}; }
  </style></head><body>
    ${showLogo ? logoMarkup(logoDataUrl, { maxHeight: `${logoHeight}mm` }) : ''}
    <div class="center"><strong>${escapeHtml(business?.name || 'MODERN FASHION')}</strong><br/>${
      invoice?.showAddress !== false ? addressLines(business) : ''
    }${stateLine ? `<br/>${escapeHtml(stateLine)}` : ''}</div>
    <div class="center title">PRINTER TEST</div>
    <div class="banner">NOT A SALE · NO STOCK OR ACCOUNTING RECORD CREATED</div>
    <div class="row"><span>Printer test</span><span>PASS if readable</span></div>
    <div class="row"><span>Invoice title</span><span>${invoiceTitle(tax)}</span></div>
    <div class="row"><span>Paper width</span><span>${width} mm</span></div>
    <div class="row"><span>Date</span><span>${escapeHtml(formatDateTime(new Date().toISOString()))}</span></div>
    <div class="row"><span>Amount</span><span>Rs. 0.00</span></div>
    <div class="row big"><span>Total</span><span>Rs. 0.00</span></div>
    <div class="center small" style="margin-top:4mm">If this line is cut cleanly and the text is sharp,<br/>the Windows driver submitted the job successfully.</div>
    <div class="center small" style="margin-top:3mm">Physical output and auto-cut must be checked at the printer.</div>
  </body></html>`;
}

export function testLabelHtml({ business, options = {} }) {
  const width = Number(options.labelWidthMm || 50);
  const height = Number(options.labelHeightMm || 25);
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Label test</title>
  <style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    html, body { margin:0; padding:0; background:#fff; color:#000; font-family:Arial,sans-serif; }
    .label { width:${width}mm; height:${height}mm; padding:1.5mm 2mm; display:flex; flex-direction:column; align-items:center; justify-content:space-between; }
    .brand { font-size:7px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }
    .title { font-size:9px; font-weight:800; }
    .barcode { width:100%; display:flex; justify-content:center; }
    .barcode svg { width:100%; height:auto; max-height:10mm; }
    .small { font-size:6px; text-align:center; }
  </style></head><body><div class="label">
    <div class="brand">${escapeHtml(business?.name || 'MODERN FASHION')}</div>
    <div class="title">LABEL PRINTER TEST</div>
    <div class="barcode">${code128Svg('MFTESTLABEL', { moduleWidth: 2, height: 30 })}</div>
    <div class="small">NOT A PRODUCT · CHECK ALIGNMENT &amp; SCAN<br/>${width} x ${height} mm</div>
  </div></body></html>`;
}
