import { Button, Empty, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { formatMoney } from '@/retail/utils/format';

const CATEGORY_TONES = {
  'T-shirts': ['#fde8dd', '#b64b20'],
  Hoodies: ['#e8e5f6', '#5949a5'],
  Zippers: ['#e4eef2', '#2f6a7d'],
  Jackets: ['#e8ece2', '#4d643a'],
  Tracksuits: ['#e9e7e1', '#5d5548'],
  Shackets: ['#f4e8dc', '#8a5a30'],
  'Printed shirts': ['#fbe5ea', '#a13c58'],
  'Formal shirts': ['#e6edf7', '#335f97'],
  'Denim shirts': ['#e0eaf5', '#315f8c'],
  'Formal pants': ['#e8e8e8', '#4a4f57'],
  Jeans: ['#e1eaf6', '#345b8a'],
  'Kurta pyjama sets': ['#f7eadf', '#9a5b2a'],
  Shoes: ['#f0ece4', '#6e5d47'],
  'Leather slippers': ['#f1e6da', '#7c5434'],
  'Cord sets': ['#e9eee6', '#4c6a42'],
};

export function PageHeader({ eyebrow, title, subtitle, extra, children }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {extra ? <div className="page-header-actions">{extra}</div> : null}
      {children}
    </div>
  );
}

export function SectionCard({ title, description, extra, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`panel ${className}`}>
      {title || extra ? (
        <header className="panel-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {extra ? <div className="panel-extra">{extra}</div> : null}
        </header>
      ) : null}
      <div className={`panel-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon, accent = 'orange' }) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-top">
        <span>{label}</span>
        {icon ? <span className="stat-icon">{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function ProductThumb({ product, size = 'md' }) {
  const [bg, fg] = CATEGORY_TONES[product?.category] || ['#f1ede7', '#6b5b48'];
  const label = (product?.name || 'MF')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  return (
    <span className={`product-thumb thumb-${size}`} style={{ background: bg, color: fg }} aria-hidden="true">
      {label}
    </span>
  );
}

const STATUS_COLORS = {
  Paid: 'green',
  Partial: 'gold',
  Unpaid: 'red',
  Received: 'green',
  Active: 'green',
  'In stock': 'green',
  'Low stock': 'gold',
  'Out of stock': 'red',
  purchase: 'blue',
  sale: 'orange',
  adjustment: 'purple',
};

export function StatusTag({ status, children }) {
  return (
    <Tag className="status-tag" color={STATUS_COLORS[status] || 'default'}>
      {children || status}
    </Tag>
  );
}

export function StockStatus({ stock, threshold = 5 }) {
  if (stock <= 0) return <StatusTag status="Out of stock" />;
  if (stock <= threshold) return <StatusTag status="Low stock" />;
  return <StatusTag status="In stock" />;
}

export function MoneyText({ value, decimals = false, className = '' }) {
  return <span className={`money-text ${className}`}>{formatMoney(value, decimals)}</span>;
}

export function EmptyState({ title = 'Nothing here yet', description, actionText, onAction, actionLink }) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <div className="empty-copy">
          <strong>{title}</strong>
          {description ? <span>{description}</span> : null}
        </div>
      }
    >
      {actionText ? (
        actionLink ? (
          <Button type="primary" href={actionLink} icon={<PlusOutlined />}>
            {actionText}
          </Button>
        ) : (
          <Button type="primary" onClick={onAction} icon={<PlusOutlined />}>
            {actionText}
          </Button>
        )
      ) : null}
    </Empty>
  );
}

export function DemoNotice({ children }) {
  return <div className="demo-notice">{children || 'DEMO / SAMPLE DATA — figures are illustrative only.'}</div>;
}
