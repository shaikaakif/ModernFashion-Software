import { escapeHtml } from './code128.js';
import { barcodeDisplayText, barcodeSvg } from './ean.js';

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

function logoMarkup(logoDataUrl, { maxHeight = '16mm', maxWidth = '70%', className = 'logo' } = {}) {
  if (!logoDataUrl) return '';
  return `<img class="${className}" src="${logoDataUrl}" alt="" style="max-height:${maxHeight};max-width:${maxWidth};object-fit:contain;" />`;
}

function invoiceTitle(tax) {
  return tax?.enabled ? 'TAX INVOICE' : 'INVOICE';
}

function receiptMoney(paise, { symbol = true } = {}) {
  const amount = (Number(paise) || 0) / 100;
  const text = amount.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return symbol ? `₹${text}` : text;
}

// GSTIN is printed only when a real one is configured; the check keeps a
// placeholder value out of a tax invoice.
function validGstin(value) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(String(value || '').trim());
}

export function receiptHtml({
  sale,
  business,
  invoice,
  receipt,
  tax,
  logoDataUrl = '',
  widthMm = 77,
  duplicate = false,
  sample = false,
}) {
  // 77 mm paper sits on an 80 mm-class head (576 dots at 203 dpi = 72 mm of
  // printable width). The body must be the head width, not the paper width,
  // or the last few millimetres are cut off the right edge. 58 mm paper uses a
  // 384-dot head (48 mm).
  const paperWidth = widthMm === 58 ? 58 : 77;
  const printWidth = paperWidth === 58 ? 48 : 72;
  const compact = paperWidth === 58;
  const sidePadding = 1;
  const scale = Math.min(1.3, Math.max(0.8, Number(receipt?.fontScale || 100) / 100));
  const fs = (size) => `${(size * scale).toFixed(2)}px`;
  const showLogo = invoice?.showLogo !== false && Boolean(logoDataUrl);
  // Thermal receipts need a logo that reads across the counter; 20 mm is the floor.
  const logoHeight = Math.min(30, Math.max(20, Number(invoice?.logoHeightMm || 20)));
  const showTitle = invoice?.showTitle !== false;
  const showAddress = invoice?.showAddress !== false;
  const showPhone = invoice?.showPhone !== false;
  const showGstin = invoice?.showGstin !== false;
  const showAmountReceived = receipt?.showAmountReceived !== false;
  const showTax = Boolean(tax?.enabled) && Number(sale.taxPaise) > 0 && receipt?.showTax !== false;
  const inclusiveTax = showTax && Boolean(sale.pricesIncludeTax);
  const balance = Math.max(0, Number(sale.balancePaise || 0));
  const change = Number(sale.changePaise || 0);
  const discountTotal = Number(sale.discountTotalPaise || 0);
  const headerNote = String(receipt?.headerNote || '').trim();
  const returnPolicy = String(business?.returnPolicy || '').trim();
  const terms = String(invoice?.terms || '').trim();
  const policies = [terms, returnPolicy]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);
  const gstin = validGstin(tax?.gstin) ? String(tax.gstin).trim() : '';
  const phone = showPhone ? String(business?.phone || '').trim() : '';
  const showCustomer = receipt?.showCustomer !== false;

  const itemRows = (sale.items || [])
    .map((item) => {
      const gross = Number(item.unitPricePaise) * Number(item.quantity);
      const discount = Number(item.discountPaise || 0);
      const discountPercent = gross > 0 ? (discount * 100) / gross : 0;
      // Qty and variant share one compact line under the name; a discount gets
      // its own small line so the amount never wraps mid-number.
      const meta = [`Qty ${Number(item.quantity)}`, item.variantLabel || ''].filter(Boolean).join(' · ');
      const discountNote =
        discount > 0
          ? `Disc ${discountPercent > 0 ? `${discountPercent.toFixed(1)}% ` : ''}−${receiptMoney(discount)}`
          : '';
      return `<tr>
        <td class="item">
          <span class="item-name">${escapeHtml(item.productName)}</span>
          <span class="item-meta">${escapeHtml(meta)}</span>
          ${discountNote ? `<span class="item-disc">${escapeHtml(discountNote)}</span>` : ''}
        </td>
        <td class="num">${receiptMoney(item.unitPricePaise, { symbol: false })}</td>
        <td class="num amount">${receiptMoney(item.lineTotalPaise, { symbol: false })}</td>
      </tr>`;
    })
    .join('');

  const amountRows = showAmountReceived
    ? `<tr><td>Amount received</td><td>${receiptMoney(sale.amountPaidPaise)}</td></tr>${
        balance > 0
          ? `<tr class="due"><td>Balance due</td><td>${receiptMoney(balance)}</td></tr>`
          : change > 0
            ? `<tr><td>Change</td><td>${receiptMoney(change)}</td></tr>`
            : ''
      }`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(sale.invoiceNo)}</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  /* 77 mm paper, 72 mm thermal head: the body must stay inside the head. */
  body { width: ${printWidth}mm; margin: 0; padding: 2mm ${sidePadding}mm 3mm; font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: ${fs(
    compact ? 10.5 : 12.5
  )}; line-height: 1.35; text-align: left; -webkit-font-smoothing: antialiased; }
  .center { text-align: center; }
  .header { text-align: center; }
  .logo { display: block; width: auto; margin: 0 auto 1.5mm; max-width: 62%; object-fit: contain; }
  .business-name { font-size: ${fs(compact ? 15 : 18)}; font-weight: 800; letter-spacing: 0.06em; line-height: 1.15; text-transform: uppercase; overflow-wrap: anywhere; }
  .business-meta { margin-top: 0.5mm; font-size: ${fs(compact ? 9 : 11)}; font-weight: 500; line-height: 1.35; overflow-wrap: anywhere; }
  .gst { font-weight: 700; }
  .title { margin: 2mm 0 1.5mm; font-size: ${fs(compact ? 12 : 14)}; font-weight: 800; letter-spacing: 0.18em; text-align: center; text-transform: uppercase; }
  .duplicate, .sample { margin: 0 0 1.5mm; padding: 1mm 0; border: 1px dashed #000; font-size: ${fs(compact ? 9 : 10.5)}; font-weight: 700; letter-spacing: 0.06em; text-align: center; }
  .sample { border-style: solid; }
  .header-note { margin: 0 0 1.5mm; font-size: ${fs(compact ? 9 : 10.5)}; line-height: 1.4; text-align: center; overflow-wrap: anywhere; }
  .bill-meta { display: flex; justify-content: space-between; gap: 2mm; padding: 1mm 0; border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: ${fs(
    compact ? 9.5 : 11
  )}; line-height: 1.4; }
  .bill-meta b { font-weight: 700; }
  .bill-customer { padding: 0.8mm 0 1.2mm; font-size: ${fs(compact ? 9.5 : 11)}; line-height: 1.4; overflow-wrap: anywhere; }
  .bill-customer b { font-weight: 700; }
  .items { width: 100%; margin-top: 1mm; border-collapse: collapse; table-layout: fixed; }
  .items th { padding: 1mm 0; border-bottom: 1px solid #000; font-size: ${fs(compact ? 8.5 : 10)}; font-weight: 700; letter-spacing: 0.05em; text-align: left; text-transform: uppercase; }
  .items th.num, .items td.num { padding-left: 1mm; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .items th:nth-child(1) { width: 54%; }
  .items th:nth-child(2) { width: 21%; }
  .items th:nth-child(3) { width: 25%; }
  .items td { padding: 1.3mm 0 0; vertical-align: top; font-size: ${fs(compact ? 10 : 12)}; text-align: left; overflow-wrap: anywhere; }
  .items td.amount { font-weight: 700; }
  .item-name { display: block; font-weight: 700; line-height: 1.25; }
  .item-meta { display: block; color: #222; font-size: ${fs(compact ? 8.5 : 10)}; line-height: 1.25; }
  .item-disc { display: block; color: #222; font-size: ${fs(compact ? 8.5 : 10)}; line-height: 1.25; }
  .totals { width: 100%; margin-top: 1.5mm; border-collapse: collapse; }
  .totals td { padding: 0.8mm 0; font-size: ${fs(compact ? 10 : 11.5)}; text-align: left; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .totals .grand td { padding: 1.6mm 0 1mm; border-top: 1.5px solid #000; font-size: ${fs(compact ? 15 : 18)}; font-weight: 800; }
  .totals .due td { font-weight: 800; }
  .footer { margin-top: 2.5mm; padding-top: 2mm; border-top: 1px dashed #555; text-align: center; }
  .footer .thanks { font-size: ${fs(compact ? 10.5 : 12)}; font-weight: 800; letter-spacing: 0.04em; line-height: 1.35; text-transform: uppercase; overflow-wrap: anywhere; }
  .footer .policy, .footer .note { margin-top: 1mm; font-size: ${fs(compact ? 8.5 : 10)}; line-height: 1.35; overflow-wrap: anywhere; }
  .footer .policy { font-weight: 700; text-transform: uppercase; }
</style></head>
<body class="${compact ? 'w58' : 'w77'}">
  <div class="header">
    ${showLogo ? logoMarkup(logoDataUrl, { maxHeight: `${logoHeight}mm`, maxWidth: '62%' }) : ''}
    <div class="business-name">${escapeHtml(business?.name || 'MODERN FASHION')}</div>
    ${showAddress ? `<div class="business-meta">${addressLines(business)}</div>` : ''}
    ${phone ? `<div class="business-meta">Phone: ${escapeHtml(phone)}</div>` : ''}
    ${showGstin && tax?.enabled && gstin ? `<div class="business-meta gst">GSTIN: ${escapeHtml(gstin)}</div>` : ''}
  </div>
  ${showTitle ? `<div class="title">${invoiceTitle(tax)}</div>` : ''}
  ${sample ? '<div class="sample">SAMPLE PREVIEW · NOT A SALE</div>' : ''}
  ${duplicate ? `<div class="duplicate">${escapeHtml(invoice?.duplicateLabel || 'DUPLICATE COPY')}</div>` : ''}
  ${headerNote ? `<div class="header-note">${escapeHtml(headerNote).replace(/\n/g, '<br/>')}</div>` : ''}
  <div class="bill-meta"><span>Invoice <b>${escapeHtml(sale.invoiceNo)}</b></span><span>${escapeHtml(formatDate(sale.completedAt || sale.saleDate))}</span></div>
  ${
    showCustomer && (sale.customerName || sale.customerPhone || sale.customerGstin)
      ? `<div class="bill-customer">${[
          sale.customerName ? `Customer: <b>${escapeHtml(sale.customerName)}</b>` : '',
          sale.customerPhone ? `Mobile: ${escapeHtml(sale.customerPhone)}` : '',
          sale.customerGstin ? `GSTIN: ${escapeHtml(sale.customerGstin)}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}</div>`
      : ''
  }
  <table class="items">
    <thead><tr><th>Item</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td>${receiptMoney(sale.subtotalPaise)}</td></tr>
    ${discountTotal > 0 ? `<tr><td>Total discount</td><td>- ${receiptMoney(discountTotal)}</td></tr>` : ''}
    ${showTax ? `<tr><td>${inclusiveTax ? 'Tax included' : 'Tax'}</td><td>${receiptMoney(sale.taxPaise)}</td></tr>` : ''}
    ${Number(sale.roundOffPaise) !== 0 ? `<tr><td>Round off</td><td>${Number(sale.roundOffPaise) > 0 ? '+' : '-'} ${receiptMoney(
      Math.abs(sale.roundOffPaise)
    )}</td></tr>` : ''}
    <tr class="grand"><td>Grand Total</td><td>${receiptMoney(sale.totalPaise)}</td></tr>
    ${amountRows}
  </table>
  <div class="footer">
    <div class="thanks">${escapeHtml(invoice?.thankYou || 'Thank you for shopping with us!')}</div>
    ${policies
      .map((policy) => `<div class="policy">${escapeHtml(policy).replace(/\n/g, '<br/>')}</div>`)
      .join('')}
    ${receipt?.footerNote ? `<div class="note">${escapeHtml(receipt.footerNote).replace(/\n/g, '<br/>')}</div>` : ''}
  </div>
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
  const hasDiscount =
    Number(sale.discountTotalPaise || 0) > 0 ||
    (sale.items || []).some((item) => Number(item.discountPaise) > 0);
  const showTax = Boolean(tax?.enabled);
  const returnPolicy = String(business?.returnPolicy || '').trim();
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
        ${showTax ? `<td>${escapeHtml(item.hsnCode || '—')}</td>` : ''}
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.unitPricePaise, { symbol: '₹', space: '' })}</td>
        ${
          hasDiscount
            ? `<td class="num">${money(gross, { symbol: '₹', space: '' })}</td>
               <td class="num">${money(item.discountPaise, { symbol: '₹', space: '' })}</td>`
            : ''
        }
        ${
          showTax
            ? `<td class="num">${money(taxable, { symbol: '₹', space: '' })}</td>
               <td class="num">${escapeHtml((item.taxRateBp / 100).toFixed(2))}%</td>
               <td class="num">${money(item.taxPaise, { symbol: '₹', space: '' })}</td>`
            : ''
        }
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
  /* On-screen preview only: show the real A4 sheet with its print margins. */
  @media screen {
    body { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 12mm; }
  }
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
  .return-policy { margin: 4px 0 0; color: #55565b; font-size: 9px; font-weight: 700; text-transform: uppercase; }
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
        ${returnPolicy ? `<p class="return-policy">${escapeHtml(returnPolicy)}</p>` : ''}
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
      ${sale.customerGstin ? `<div>GSTIN: ${escapeHtml(sale.customerGstin)}</div>` : ''}
    </div>
    <div class="party">
      <div class="label">Sold by</div>
      <strong>${escapeHtml(business?.name || 'MODERN FASHION')}</strong>
      <div>${escapeHtml(business?.phone || '')}</div>
    </div>
  </div>
  <table class="items">
    <thead><tr>
      <th>#</th><th>Description</th>
      ${showTax ? '<th>HSN</th>' : ''}
      <th class="num">Qty</th><th class="num">Rate</th>
      ${hasDiscount ? '<th class="num">Gross</th><th class="num">Discount</th>' : ''}
      ${showTax ? '<th class="num">Taxable</th><th class="num">Tax</th><th class="num">Tax amt</th>' : ''}
      <th class="num">Amount</th>
    </tr></thead>
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
      ${Number(sale.discountTotalPaise) > 0 ? `<tr><td>Discount</td><td>- ${money(sale.discountTotalPaise, { symbol: '₹', space: '' })}</td></tr>` : ''}
      ${showTax && Number(sale.taxPaise) > 0 ? `<tr><td>${sale.pricesIncludeTax ? 'Tax included (not added)' : 'Tax'}</td><td>${money(sale.taxPaise, { symbol: '₹', space: '' })}</td></tr>` : ''}
      ${Number(sale.roundOffPaise) !== 0 ? `<tr><td>Round off</td><td>${money(sale.roundOffPaise, { symbol: '₹', space: '' })}</td></tr>` : ''}
      <tr class="grand"><td>Total payable</td><td>${money(sale.totalPaise, { symbol: '₹', space: '' })}</td></tr>
      <tr><td>Amount received</td><td>${money(sale.amountPaidPaise, { symbol: '₹', space: '' })}</td></tr>
      ${sale.balancePaise > 0 ? `<tr><td>Balance due</td><td>${money(sale.balancePaise, { symbol: '₹', space: '' })}</td></tr>` : Number(sale.changePaise) > 0 ? `<tr><td>Change</td><td>${money(sale.changePaise, { symbol: '₹', space: '' })}</td></tr>` : ''}
    </table>
  </div>
  <div class="terms">
    ${invoice?.terms ? `<strong>Terms &amp; Conditions</strong><div>${escapeHtml(invoice.terms).replace(/\n/g, '<br/>')}</div>` : ''}
    ${receipt?.footerNote ? `<div>${escapeHtml(receipt.footerNote)}</div>` : ''}
  </div>
  <div class="foot"><span>${escapeHtml(invoice?.thankYou || 'Thank you for shopping with us!')}</span>${
    showPoweredBy ? '<span>Computer-generated invoice · Modern Fashion POS</span>' : ''
  }</div>
</body></html>`;
}

function labelAmount(paise) {
  const amount = (Number(paise) || 0) / 100;
  const text = Number.isInteger(amount)
    ? amount.toLocaleString('en-IN')
    : amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${text}`;
}

export function labelHtml({ label, business, options = {} }) {
  const width = Number(options.labelWidthMm || 50);
  const height = Number(options.labelHeightMm || 25);
  const showName = options.labelShowName !== false;
  const showSku = options.labelShowSku !== false;
  const showPrice = options.labelShowPrice !== false;
  const showSize = options.labelShowSize !== false;
  const scale = Math.max(0.72, Math.min(1.3, height / 25));
  const fs = (size) => `${(size * scale).toFixed(1)}px`;
  const topPadding = Math.max(1.2, Math.min(2.4, height * 0.07));
  const mrpPaise = Number(label.mrpPaise || 0);
  const pricePaise = Number(label.pricePaise || 0);
  const showMrp = showPrice && mrpPaise > 0 && mrpPaise !== pricePaise;
  const showSelling = showPrice && pricePaise > 0;
  // Reserve the tallest slice of the label for the barcode: wide bars scan better
  // than wide text on a 50 x 25 mm stock.
  const barcodeHeight = Math.max(6.4, Math.min(11, height * 0.31));
  const shortLabel = height < 22;
  const tallLabel = height >= 30;
  const barcode = barcodeSvg(label.barcode, { moduleWidth: 2, height: 60, showText: false });
  const variantLine = [label.color, label.size ? `SIZE ${label.size}` : ''].filter(Boolean).join(' · ');
  // SKU only fits on taller stock; short labels keep to one variant line.
  const metaLine = tallLabel && showSku ? [variantLine, label.sku].filter(Boolean).join(' · ') : variantLine;
  return `<div class="label${shortLabel ? ' is-short' : ''}${tallLabel ? ' is-tall' : ''}">
    <div class="brand">${escapeHtml(business?.name || 'MODERN FASHION')}</div>
    ${showSelling ? `<div class="price-row">SELLING PRICE : <span class="price">${labelAmount(pricePaise)}</span></div>` : ''}
    ${showMrp ? `<div class="mrp">MRP : ${labelAmount(mrpPaise)}</div>` : ''}
    <div class="barcode">${barcode}<div class="barcode-text">${escapeHtml(barcodeDisplayText(label.barcode))}</div></div>
    ${showName ? `<div class="name">${escapeHtml(label.productName)}</div>` : ''}
    ${showSize && metaLine ? `<div class="meta">${escapeHtml(metaLine)}</div>` : ''}
  </div>
  <style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: "Segoe UI", Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased; }
    .label { width: ${width}mm; height: ${height}mm; padding: ${topPadding.toFixed(1)}mm 2mm 1.1mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 0.3mm; overflow: hidden; page-break-after: always; }
    .label:last-child { page-break-after: auto; }
    .brand { width: 100%; overflow: hidden; font-size: ${fs(6.2)}; font-weight: 800; letter-spacing: 0.09em; line-height: 1.1; text-align: center; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
    .price-row { width: 100%; font-size: ${fs(8.6)}; font-weight: 700; letter-spacing: 0.02em; line-height: 1.12; text-align: center; text-transform: uppercase; white-space: nowrap; }
    .price { font-size: ${fs(11)}; font-weight: 800; letter-spacing: 0; }
    .mrp { width: 100%; font-size: ${fs(8)}; font-weight: 700; line-height: 1.1; text-align: center; text-transform: uppercase; white-space: nowrap; }
    .barcode { display: flex; width: 100%; min-height: 0; flex-direction: column; align-items: center; justify-content: center; padding: 0.3mm 0 0; }
    .barcode svg { display: block; width: 100%; height: ${barcodeHeight.toFixed(1)}mm; }
    .barcode-text { margin-top: 0.3mm; font-family: Consolas, "Courier New", monospace; font-size: ${fs(7.4)}; font-weight: 700; letter-spacing: 0.08em; line-height: 1; text-align: center; white-space: nowrap; }
    .name { display: -webkit-box; width: 100%; overflow: hidden; font-size: ${fs(8.6)}; font-weight: 800; line-height: 1.12; text-align: center; text-transform: uppercase; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
    .meta { width: 100%; overflow: hidden; font-size: ${fs(7)}; font-weight: 700; line-height: 1.1; text-align: center; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
    .label.is-tall .name { font-size: ${fs(9.4)}; -webkit-line-clamp: 2; }
    .label.is-short { gap: 0.2mm; padding: 0.9mm 1.8mm 0.8mm; }
    .label.is-short .brand { font-size: ${fs(5.6)}; }
    .label.is-short .price-row { font-size: ${fs(7.8)}; }
    .label.is-short .price { font-size: ${fs(9.6)}; }
    .label.is-short .mrp { font-size: ${fs(7.2)}; }
    .label.is-short .name { font-size: ${fs(7.8)}; }
    .label.is-short .meta { display: none; }
    .label.is-short .barcode-text { font-size: ${fs(6.4)}; }
  </style>`;
}

export function labelsHtml({ labels, business, options = {}, preview = false }) {
  const pages = labels.map((label) => labelHtml({ label, business, options })).join('');
  const previewCss = preview
    ? `<style>
        html, body { margin: 0; padding: 10px; background: #e9e6df; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .label { flex: 0 0 auto; background: #fff; box-shadow: 0 1px 6px rgb(0 0 0 / 18%); }
      </style>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Barcode labels</title>${previewCss}</head><body>${pages}</body></html>`;
}

export function testReceiptHtml({ business, invoice, receipt, tax, logoDataUrl = '', widthMm = 77 }) {
  // The test page must fit the same printable head width as a real receipt.
  const paperWidth = widthMm === 58 ? 58 : 77;
  const width = paperWidth === 58 ? 48 : 72;
  const sidePadding = 1;
  const scale = Math.min(1.3, Math.max(0.8, Number(receipt?.fontScale || 100) / 100));
  const fs = (size) => `${(size * scale).toFixed(2)}px`;
  const showLogo = invoice?.showLogo !== false && Boolean(logoDataUrl);
  const logoHeight = Math.min(30, Math.max(10, Number(invoice?.logoHeightMm || 20)));
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
    body { width: ${width}mm; margin: 0; padding: 2mm ${sidePadding}mm 3mm; font-family: Arial, sans-serif; font-size: ${fs(11)}; line-height: 1.4; }
    .center { text-align: center; } .logo { display:block; margin:0 auto 1.5mm; max-width:62%; object-fit:contain; }
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
    <div class="row"><span>Paper / print</span><span>${paperWidth} / ${width} mm</span></div>
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
    .barcode svg { width:100%; height:8mm; }
    .barcode-text { font-family:Consolas,monospace; font-size:6px; letter-spacing:0.08em; }
    .small { font-size:6px; text-align:center; }
  </style></head><body><div class="label">
    <div class="brand">${escapeHtml(business?.name || 'MODERN FASHION')}</div>
    <div class="title">LABEL PRINTER TEST</div>
    <div class="barcode">${barcodeSvg('2000000000017', { moduleWidth: 2, height: 58, showText: false })}</div>
    <div class="barcode-text">2 000000 000017</div>
    <div class="small">NOT A PRODUCT · CHECK ALIGNMENT &amp; SCAN<br/>${width} x ${height} mm</div>
  </div></body></html>`;
}
