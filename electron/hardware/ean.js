import {
  ean13CheckDigit,
  ean8CheckDigit,
  isValidEan13,
  isValidEan8,
  isValidUpcA,
  symbologyForBarcode,
  upcACheckDigit,
} from '../../shared/barcode.js';
import { code128Svg, escapeHtml } from './code128.js';

const L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
const R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
export const EAN13_GUARDS = [[0, 2], [45, 49], [92, 94]];
export const EAN8_GUARDS = [[0, 2], [31, 35], [64, 66]];

function eanBits(value) {
  const first = Number(value[0]);
  const parity = PARITY[first];
  let bits = '101';
  for (let index = 1; index <= 6; index += 1) {
    const digit = Number(value[index]);
    bits += (parity[index - 1] === 'L' ? L : G)[digit];
  }
  bits += '01010';
  for (let index = 7; index <= 12; index += 1) {
    bits += R[Number(value[index])];
  }
  return `${bits}101`;
}

function renderBars(
  bits,
  { moduleWidth = 2, height = 58, showText = true, groups, quietLeft = 11, quietRight = 7, guards = EAN13_GUARDS }
) {
  const guardExtra = Math.max(4, Math.round(height * 0.12));
  const textSize = Math.max(8, Math.round(height * 0.15));
  const textGap = showText ? textSize + 6 : 4;
  const totalHeight = height + guardExtra + textGap;
  const totalWidth = (bits.length + quietLeft + quietRight) * moduleWidth;
  const bars = [];
  let index = 0;
  let x = quietLeft * moduleWidth;

  while (index < bits.length) {
    if (bits[index] === '1') {
      let end = index;
      while (end < bits.length && bits[end] === '1') end += 1;
      const width = (end - index) * moduleWidth;
      const guard = guards.some(([start, end]) => index >= start && index <= end);
      const barHeight = guard ? height + guardExtra : height;
      bars.push(`<rect x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="${barHeight}" fill="#000" />`);
      x += width;
      index = end;
    } else {
      x += moduleWidth;
      index += 1;
    }
  }

  const texts = [];
  if (showText) {
    const baseline = height + guardExtra + textSize;
    const addText = (text, centerX, anchor = 'middle') => {
      if (!text) return;
      texts.push(
        `<text x="${centerX.toFixed(2)}" y="${baseline}" font-family="Consolas, 'Courier New', monospace" font-size="${textSize}" text-anchor="${anchor}" fill="#000">${escapeHtml(
          text
        )}</text>`
      );
    };
    addText(groups.first, (quietLeft - 1) * moduleWidth, 'end');
    addText(groups.left, (quietLeft + (groups.leftCenter ?? 24)) * moduleWidth);
    addText(groups.right, (quietLeft + (groups.rightCenter ?? 71)) * moduleWidth);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" preserveAspectRatio="none" role="img" aria-label="Barcode ${escapeHtml(
    groups.aria
  )}" shape-rendering="crispEdges">${bars.join('')}${texts.join('')}</svg>`;
}

export function ean13Svg(value, options = {}) {
  const text = String(value ?? '');
  if (!isValidEan13(text)) throw new Error('EAN-13 value must be 13 digits with a valid check digit.');
  const bits = eanBits(text);
  return renderBars(bits, {
    ...options,
    groups: { first: text[0], left: text.slice(1, 7), right: text.slice(7), aria: text },
  });
}

export function ean8Svg(value, options = {}) {
  const text = String(value ?? '');
  if (!isValidEan8(text)) throw new Error('EAN-8 value must be 8 digits with a valid check digit.');
  let bits = '101';
  for (let index = 0; index < 4; index += 1) bits += L[Number(text[index])];
  bits += '01010';
  for (let index = 4; index < 8; index += 1) bits += R[Number(text[index])];
  bits = `${bits}101`;
  return renderBars(bits, {
    ...options,
    quietLeft: 7,
    guards: EAN8_GUARDS,
    groups: { left: text.slice(0, 4), right: text.slice(4), aria: text, leftCenter: 16.5, rightCenter: 50 },
  });
}

export function upcASvg(value, options = {}) {
  const text = String(value ?? '');
  if (!isValidUpcA(text)) throw new Error('UPC-A value must be 12 digits with a valid check digit.');
  const bits = eanBits(`0${text}`);
  return renderBars(bits, {
    ...options,
    groups: { first: text[0], left: text.slice(1, 6), right: text.slice(6), aria: text },
  });
}

export function barcodeSvg(value, options = {}) {
  const symbology = symbologyForBarcode(value);
  if (symbology === 'ean13') return ean13Svg(value, options);
  if (symbology === 'ean8') return ean8Svg(value, options);
  if (symbology === 'upca') return upcASvg(value, options);
  return code128Svg(value, {
    moduleWidth: options.moduleWidth || 2,
    height: options.height || 58,
    quietZone: options.quietZone || 10,
    showText: options.showText !== false,
  });
}

export function barcodeDisplayText(value) {
  const text = String(value ?? '');
  const symbology = symbologyForBarcode(text);
  if (symbology === 'ean13') return `${text[0]} ${text.slice(1, 7)} ${text.slice(7)}`;
  if (symbology === 'ean8') return `${text.slice(0, 4)} ${text.slice(4)}`;
  if (symbology === 'upca') return `${text[0]} ${text.slice(1, 6)} ${text.slice(6)}`;
  return text;
}

export { ean13CheckDigit, ean8CheckDigit, upcACheckDigit };
