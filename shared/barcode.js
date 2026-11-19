export const DEFAULT_BARCODE = {
  symbology: 'ean13',
  prefix: 'MF',
  digits: 10,
  eanPrefix: '20',
};

export const BARCODE_SYMBOLOGIES = ['ean13', 'ean8', 'upca', 'code128'];

export const SYMBOLOGY_LABELS = {
  ean13: 'EAN-13',
  ean8: 'EAN-8',
  upca: 'UPC-A',
  code128: 'Code 128',
};

/**
 * Internally generated EAN-13/UPC-A numbers use the GS1 restricted-circulation
 * range (prefix 20-29). They are not GS1-registered retail identifiers.
 */
export function normalizeBarcodeConfig(input = {}) {
  const rawSymbology = String(input.symbology ?? DEFAULT_BARCODE.symbology).toLowerCase();
  if (!BARCODE_SYMBOLOGIES.includes(rawSymbology)) {
    throw new Error('Choose EAN-13, EAN-8, UPC-A or Code 128.');
  }
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
  const eanPrefix = String(input.eanPrefix ?? DEFAULT_BARCODE.eanPrefix).trim();
  if (!/^2\d$/.test(eanPrefix)) {
    throw new Error('In-store EAN prefix must be 20 to 29.');
  }
  return { symbology: rawSymbology, prefix, digits, eanPrefix };
}

export function ean13CheckDigit(payload) {
  const value = String(payload);
  if (!/^\d{12}$/.test(value)) throw new Error('EAN-13 needs 12 digits before the check digit.');
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(value[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function ean8CheckDigit(payload) {
  const value = String(payload);
  if (!/^\d{7}$/.test(value)) throw new Error('EAN-8 needs 7 digits before the check digit.');
  let sum = 0;
  for (let index = 0; index < 7; index += 1) {
    sum += Number(value[index]) * (index % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function upcACheckDigit(payload) {
  const value = String(payload);
  if (!/^\d{11}$/.test(value)) throw new Error('UPC-A needs 11 digits before the check digit.');
  let sum = 0;
  for (let index = 0; index < 11; index += 1) {
    sum += Number(value[index]) * (index % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(value) {
  const text = String(value ?? '');
  return /^\d{13}$/.test(text) && ean13CheckDigit(text.slice(0, 12)) === Number(text[12]);
}

export function isValidUpcA(value) {
  const text = String(value ?? '');
  return /^\d{12}$/.test(text) && upcACheckDigit(text.slice(0, 11)) === Number(text[11]);
}

export function isValidEan8(value) {
  const text = String(value ?? '');
  return /^\d{8}$/.test(text) && ean8CheckDigit(text.slice(0, 7)) === Number(text[7]);
}

export function formatEan13(eanPrefix, sequence) {
  const prefix = String(eanPrefix ?? DEFAULT_BARCODE.eanPrefix);
  if (!/^2\d$/.test(prefix)) throw new Error('In-store EAN prefix must be 20 to 29.');
  const payload = `${prefix}${String(Math.max(0, Number(sequence) || 0)).padStart(10, '0').slice(-10)}`;
  return `${payload}${ean13CheckDigit(payload)}`;
}

export function formatEan8(eanPrefix, sequence) {
  const prefix = String(eanPrefix ?? DEFAULT_BARCODE.eanPrefix);
  if (!/^2\d$/.test(prefix)) throw new Error('In-store EAN prefix must be 20 to 29.');
  const payload = `${prefix}${String(Math.max(0, Number(sequence) || 0)).padStart(5, '0').slice(-5)}`;
  return `${payload}${ean8CheckDigit(payload)}`;
}

export function formatUpcA(eanPrefix, sequence) {
  const prefix = String(eanPrefix ?? DEFAULT_BARCODE.eanPrefix);
  if (!/^2\d$/.test(prefix)) throw new Error('In-store UPC prefix must be 20 to 29.');
  const payload = `${prefix}${String(Math.max(0, Number(sequence) || 0)).padStart(9, '0').slice(-9)}`;
  return `${payload}${upcACheckDigit(payload)}`;
}

export function formatBarcode(prefix, digits, sequence) {
  const config = normalizeBarcodeConfig({ prefix, digits, symbology: 'code128' });
  const value = Math.max(0, Number(sequence) || 0);
  return `${config.prefix}${String(value).padStart(config.digits, '0')}`;
}

export function generatedBarcode(configInput, sequence) {
  const config = normalizeBarcodeConfig(configInput);
  if (config.symbology === 'ean13') return formatEan13(config.eanPrefix, sequence);
  if (config.symbology === 'ean8') return formatEan8(config.eanPrefix, sequence);
  if (config.symbology === 'upca') return formatUpcA(config.eanPrefix, sequence);
  return formatBarcode(config.prefix, config.digits, sequence);
}

export function symbologyForBarcode(value) {
  if (isValidEan13(value)) return 'ean13';
  if (isValidEan8(value)) return 'ean8';
  if (isValidUpcA(value)) return 'upca';
  return 'code128';
}

export function barcodeExample(configInput = DEFAULT_BARCODE, digits, sequence = 123456) {
  if (configInput && typeof configInput === 'object') return generatedBarcode(configInput, sequence);
  return formatBarcode(configInput, digits, sequence);
}
