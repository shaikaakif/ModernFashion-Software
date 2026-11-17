export const DEFAULT_BARCODE = {
  prefix: 'MF',
  digits: 10,
};

export const BARCODE_SYMBOLOGY = 'CODE128';

export function normalizeBarcodeConfig(input = {}) {
  const prefix = String(input.prefix ?? DEFAULT_BARCODE.prefix)
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(prefix)) {
    throw new Error('Barcode prefix must be 2 to 6 letters or digits.');
  }
  const digits = Number(input.digits ?? DEFAULT_BARCODE.digits);
  if (!Number.isInteger(digits) || digits < 6 || digits > 12) {
    throw new Error('Barcode number width must be between 6 and 12 digits.');
  }
  return { prefix, digits };
}

export function formatBarcode(prefix, digits, sequence) {
  const config = normalizeBarcodeConfig({ prefix, digits });
  const value = Math.max(0, Number(sequence) || 0);
  return `${config.prefix}${String(value).padStart(config.digits, '0')}`;
}

export function barcodeExample(prefix, digits) {
  return formatBarcode(prefix, digits, 123456);
}
