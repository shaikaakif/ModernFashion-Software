/**
 * Pure cart helpers used by the POS screen. Kept independent of React so the
 * repeated-scan and quantity behaviour can be unit tested.
 */
import { roundHalfUp } from './money.js';

export function createLineKey(variantId) {
  return `line-${variantId}`;
}

export function makeCartLine(item) {
  return {
    key: createLineKey(item.variantId),
    variantId: item.variantId,
    productId: item.productId,
    productName: item.productName,
    categoryName: item.categoryName || '',
    color: item.color || '',
    size: item.size || '',
    sku: item.sku || '',
    barcode: item.barcode || '',
    unitPricePaise: Number(item.pricePaise) || 0,
    mrpPaise: Number(item.mrpPaise) || 0,
    taxRateBp: Number(item.taxRateBp) || 0,
    availableStock: Number(item.stock) || 0,
    quantity: 1,
    // Per-line discount: mode 'percent' keeps the percent when quantity
    // changes; mode 'amount' is a rupee value capped at the line gross.
    discountMode: 'percent',
    discountValue: 0,
    lowStockThreshold: Number(item.lowStockThreshold) || 0,
  };
}

/** Resolved line discount in paise, capped at the gross amount. */
export function cartLineDiscountPaise(line) {
  const gross = line.quantity * line.unitPricePaise;
  if (gross <= 0) return 0;
  const value = Math.max(0, Number(line.discountValue) || 0);
  const paise = line.discountMode === 'amount' ? Math.round(value * 100) : roundHalfUp((gross * value) / 100);
  return Math.min(gross, paise);
}

export function setLineDiscount(lines, variantId, patch) {
  return lines.map((line) => (line.variantId === variantId ? { ...line, ...patch } : line));
}

/**
 * Add a scanned/searched variant. Repeated scans increment the existing line
 * instead of creating a duplicate. Never exceeds available stock.
 */
export function addToCart(lines, item, { allowExceedStock = false } = {}) {
  const existing = lines.find((line) => line.variantId === item.variantId);
  const available = Number(item.stock) || 0;
  if (existing) {
    if (!allowExceedStock && existing.quantity >= available) {
      return {
        lines,
        added: false,
        reason: `Only ${available} unit${available === 1 ? '' : 's'} available for ${item.productName}.`,
      };
    }
    return {
      lines: lines.map((line) =>
        line.variantId === item.variantId ? { ...line, quantity: line.quantity + 1, availableStock: available } : line
      ),
      added: true,
    };
  }
  if (!allowExceedStock && available <= 0) {
    return { lines, added: false, reason: `${item.productName} has no stock available.` };
  }
  return { lines: [...lines, makeCartLine(item)], added: true };
}

export function setQuantity(lines, variantId, quantity, { allowExceedStock = false } = {}) {
  const nextQuantity = Math.max(0, Math.trunc(Number(quantity) || 0));
  return lines.map((line) => {
    if (line.variantId !== variantId) return line;
    const capped = allowExceedStock ? nextQuantity : Math.min(nextQuantity, line.availableStock);
    return { ...line, quantity: capped };
  });
}

export function removeLine(lines, variantId) {
  return lines.filter((line) => line.variantId !== variantId);
}

export function cartQuantity(lines) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function cartGrossPaise(lines) {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPricePaise, 0);
}

export function cartToPayload(lines) {
  return lines
    .filter((line) => line.quantity > 0)
    .map((line) => {
      const discount =
        line.discountValue > 0
          ? line.discountMode === 'amount'
            ? { discountPaise: cartLineDiscountPaise(line) }
            : { discountPercent: line.discountValue }
          : {};
      return { variantId: line.variantId, quantity: line.quantity, ...discount };
    });
}
