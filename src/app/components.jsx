import { Button, Empty, InputNumber, Result, Skeleton, Spin, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { toPaise } from '@shared/money.js';

/**
 * Form-bound rupee input. The form state stays in integer paise; the user sees
 * rupees. This keeps every calculation on the same money representation.
 */
export function MoneyInput({ value, onChange, min = 0, ...rest }) {
  return (
    <InputNumber
      {...rest}
      min={min}
      precision={2}
      style={{ width: '100%', ...(rest.style || {}) }}
      value={value === null || value === undefined || value === '' ? null : Number(value) / 100}
      onChange={(next) => onChange?.(next === null || next === undefined ? 0 : toPaise(next))}
    />
  );
}

export function PageHeader({ eyebrow, title, subtitle, extra }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {extra ? <div className="page-head-extra">{extra}</div> : null}
    </div>
  );
}

export function SectionCard({ title, subtitle, extra, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`panel ${className}`}>
      {title || extra ? (
        <div className="panel-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {extra ? <div className="panel-head-extra">{extra}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName || 'panel-body'}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone = 'default', icon }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-top">
        <span>{label}</span>
        {icon ? <span className="kpi-icon">{icon}</span> : null}
      </div>
      <div className="kpi-value">{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  );
}

export function StatusTag({ status, label }) {
  const color =
    {
      completed: 'green',
      paid: 'green',
      active: 'green',
      verified: 'green',
      posted: 'green',
      open: 'green',
      partial: 'gold',
      low: 'gold',
      void: 'red',
      unpaid: 'red',
      disabled: 'red',
      inactive: 'red',
      closed: 'default',
    }[status] || 'default';
  return <Tag color={color}>{label || status}</Tag>;
}

export function LoadingPanel({ label = 'Loading…' }) {
  return (
    <div className="state-panel">
      <Spin />
      <span>{label}</span>
    </div>
  );
}

export function ErrorPanel({ error, onRetry }) {
  return (
    <div className="state-panel state-panel-error" role="alert">
      <div>
        <strong>The data could not be loaded.</strong>
        <p>{error?.message || 'Unknown error'}</p>
      </div>
      {onRetry ? (
        <Button icon={<ReloadOutlined />} onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyPanel({ title = 'Nothing here yet', description, action }) {
  return (
    <div className="state-panel state-panel-empty">
      <Empty description={description || title} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      {action}
    </div>
  );
}

export function AccessDenied() {
  return (
    <Result
      status="403"
      title="No access"
      subTitle="Your role does not include this module. Ask the owner if you need access."
    />
  );
}

export function TableSkeleton({ rows = 6 }) {
  return <Skeleton active paragraph={{ rows }} />;
}
