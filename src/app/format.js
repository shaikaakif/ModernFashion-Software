import dayjs from 'dayjs';
import { formatPaise } from '@shared/money.js';

export const money = (paise) => formatPaise(paise);
export const moneyPlain = (paise) => (Number(paise || 0) / 100).toFixed(2);

export function formatDate(value) {
  if (!value) return '—';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return dayjs(`${text}T00:00:00`).format('DD MMM YYYY');
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function businessToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function monthKey(date = new Date()) {
  return businessToday(date).slice(0, 7);
}

export function percentFromBp(bp) {
  return `${(Number(bp || 0) / 100).toFixed(Number(bp || 0) % 100 === 0 ? 0 : 2)}%`;
}

export function roleLabel(roleCode) {
  return (
    {
      owner: 'Owner / Administrator',
      manager: 'Manager',
      cashier: 'Cashier / Sales Assistant',
    }[roleCode] || roleCode
  );
}

export function paymentLabel(method) {
  return (
    {
      cash: 'Cash',
      upi: 'UPI',
      card: 'Card',
      bank_transfer: 'Bank transfer',
      credit: 'Credit / pay later',
      cheque: 'Cheque',
    }[method] || method
  );
}

export function statusColor(status) {
  if (['completed', 'paid', 'active', 'verified', 'posted', 'open'].includes(status)) return 'green';
  if (['partial', 'low'].includes(status)) return 'gold';
  if (['void', 'unpaid', 'disabled', 'inactive', 'closed'].includes(status)) return 'red';
  return 'default';
}

export function movementLabel(type) {
  return (
    {
      opening: 'Opening stock',
      purchase: 'Purchase received',
      sale: 'Sale',
      sale_return: 'Sale return / void',
      purchase_return: 'Purchase return',
      adjustment_in: 'Adjustment in',
      adjustment_out: 'Adjustment out',
      damage: 'Damage / loss',
    }[type] || type
  );
}

export function formatStock(quantity) {
  const value = Math.trunc(Number(quantity) || 0);
  return `${value > 0 ? '+' : ''}${value.toLocaleString('en-IN')} Pcs`;
}

export function frequencyLabel(hours) {
  if (hours < 24) return `every ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `every ${days} day${days === 1 ? '' : 's'}`;
}
