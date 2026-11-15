import dayjs from 'dayjs';

const inr = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

const inrDecimal = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(amount = 0, decimals = false) {
  const value = Number(amount) || 0;
  return `₹${(decimals ? inrDecimal : inr).format(value)}`;
}

export function formatNumber(value = 0) {
  return inr.format(Number(value) || 0);
}

export function formatDate(value) {
  if (!value) return '—';
  return dayjs(value).format('DD MMM YYYY');
}

export function formatDateTime(value) {
  if (!value) return '—';
  return dayjs(value).format('DD MMM YYYY, h:mm A');
}

export function formatShortDate(value) {
  if (!value) return '—';
  return dayjs(value).format('DD MMM');
}

export function todayKey(value = new Date()) {
  return dayjs(value).format('YYYY-MM-DD');
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function phoneDigits(phone = '') {
  return String(phone).replace(/\D/g, '');
}

export function whatsappNumber(phone = '') {
  const digits = phoneDigits(phone);
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}
