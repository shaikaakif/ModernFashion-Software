import { fail } from './errors.js';

export function nowIso() {
  return new Date().toISOString();
}

const KOLKATA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Business date key (YYYY-MM-DD) in Asia/Kolkata, used for all date filters. */
export function businessDate(date = new Date()) {
  return KOLKATA_DATE.format(date);
}

export function currentFinancialYear(date = new Date()) {
  const key = businessDate(date);
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function requireText(value, label, { max = 200, min = 1 } = {}) {
  const text = String(value ?? '').trim();
  if (text.length < min) fail(`${label} is required.`);
  if (text.length > max) fail(`${label} must be ${max} characters or fewer.`);
  return text;
}

export function optionalText(value, { max = 1000 } = {}) {
  const text = String(value ?? '').trim();
  if (text.length > max) fail(`Text must be ${max} characters or fewer.`);
  return text;
}

export function requireInt(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    fail(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return number;
}

export function requirePositiveInt(value, label) {
  return requireInt(value, label, { min: 1, max: 1000000 });
}

export function requireMoneyPaise(value, label, { min = 0, max = 100000000000 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    fail(`${label} must be a valid amount.`);
  }
  return number;
}

export function requireBasisPoints(value, label, { min = 0, max = 2800 } = {}) {
  return requireInt(value, label, { min, max });
}

export function normalizePhone(value, label = 'Mobile number') {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) fail(`${label} must contain 10 to 13 digits.`);
  return digits.slice(-10);
}

export function optionalPhone(value, label = 'Phone number') {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length < 10 || digits.length > 13) fail(`${label} must contain 10 to 13 digits.`);
  return digits.slice(-10);
}

export function requireDateKey(value, label = 'Date') {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail(`${label} must be a valid date.`);
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) fail(`${label} must be a valid date.`);
  return text;
}

export function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function monthRange(month) {
  const text = String(month || '');
  if (!/^\d{4}-\d{2}$/.test(text)) fail('Choose a valid month.');
  const [year, mon] = text.split('-').map(Number);
  if (mon < 1 || mon > 12) fail('Choose a valid month.');
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${text}-01`, to: `${text}-${String(lastDay).padStart(2, '0')}` };
}

export function todayKey() {
  return businessDate(new Date());
}
