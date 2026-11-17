/**
 * Pure cart helpers used by the POS screen. Kept independent of React so the
 * repeated-scan and quantity behaviour can be unit tested.
 */

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
    lowStockThreshold: Number(item.lowStockThreshold) || 0,
  };
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
    .map((line) => ({ variantId: line.variantId, quantity: line.quantity }));
}
