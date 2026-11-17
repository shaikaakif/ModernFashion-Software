import { useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select, Space, Table, Tag, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/app/api';
import { useAsync } from '@/app/hooks';
import { formatDateTime } from '@/app/format';
import { ErrorPanel, LoadingPanel, PageHeader, SectionCard } from '@/app/components';

const { RangePicker } = DatePicker;

const ENTITY_OPTIONS = [
  'sale',
  'purchase',
  'product',
  'variant',
  'inventory',
  'customer',
  'supplier',
  'expense',
  'user',
  'shift',
  'settings',
  'offer',
  'backup',
  'database',
];

function detailsText(details) {
  if (!details || !Object.keys(details).length) return '—';
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(' · ');
}

export default function AuditPage() {
  const [range, setRange] = useState([dayjs().subtract(29, 'day'), dayjs()]);
  const [action, setAction] = useState(null);
  const [entityType, setEntityType] = useState(null);
  const [limit, setLimit] = useState(500);

  const filters = useMemo(
    () => ({
      from: range?.[0]?.format('YYYY-MM-DD') || null,
      to: range?.[1]?.format('YYYY-MM-DD') || null,
      action: action || '',
      entityType: entityType || '',
      limit,
    }),
    [range, action, entityType, limit]
  );

  const actions = useAsync(() => api('audit.actions'), []);
  const audit = useAsync(() => api('audit.list', filters), [filters]);

  const columns = [
    {
      title: 'When',
      dataIndex: 'createdAt',
      width: 190,
      render: (value) => formatDateTime(value),
    },
    {
      title: 'Staff',
      dataIndex: 'userName',
      width: 150,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 220,
      render: (value) => <Tag className="audit-action-tag">{value}</Tag>,
    },
    {
      title: 'Record',
      key: 'entity',
      width: 150,
      render: (_, row) => (
        <span>
          {row.entityType || '—'}
          {row.entityId !== null && row.entityId !== undefined ? (
            <span className="muted"> #{row.entityId}</span>
          ) : null}
        </span>
      ),
    },
    {
      title: 'Details',
      dataIndex: 'details',
      render: (value) => (
        <Tooltip title={<pre className="audit-tooltip">{JSON.stringify(value || {}, null, 2)}</pre>}>
          <span className="audit-details-cell">{detailsText(value)}</span>
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Accountability"
        title="Audit log"
        subtitle="Append-only record of sign-ins, sales, stock movements, price changes and administrative actions. Entries cannot be edited or deleted from the app."
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              audit.reload();
              actions.reload();
            }}
            loading={audit.loading}
          >
            Reload
          </Button>
        }
      />

      <SectionCard title="Filters" subtitle="Narrow the trail by date, action or record type.">
        <Space wrap size="middle">
          <RangePicker
            value={range}
            onChange={(value) => setRange(value)}
            allowClear={false}
            format="DD MMM YYYY"
          />
          <Select
            allowClear
            showSearch
            placeholder="All actions"
            value={action}
            onChange={(value) => setAction(value || null)}
            loading={actions.loading}
            options={(actions.data || []).map((value) => ({ value, label: value }))}
            style={{ minWidth: 230 }}
          />
          <Select
            allowClear
            showSearch
            placeholder="All record types"
            value={entityType}
            onChange={(value) => setEntityType(value || null)}
            options={ENTITY_OPTIONS.map((value) => ({ value, label: value }))}
            style={{ minWidth: 200 }}
          />
          <Select
            value={limit}
            onChange={setLimit}
            options={[100, 250, 500, 1000, 2000].map((value) => ({
              value,
              label: `Latest ${value}`,
            }))}
            style={{ width: 140 }}
          />
          <Input
            readOnly
            value={audit.data ? `${audit.data.length} record${audit.data.length === 1 ? '' : 's'}` : '—'}
            style={{ width: 130 }}
            aria-label="Audit record count"
          />
        </Space>
      </SectionCard>

      <SectionCard
        title="Activity trail"
        subtitle="Newest entries appear first. The audit table is protected by database triggers and cannot be rewritten by services."
        bodyClassName="panel-body panel-body-flush"
      >
        {audit.loading && !audit.data ? <LoadingPanel label="Loading the audit trail." /> : null}
        {audit.error ? <ErrorPanel error={audit.error} onRetry={audit.reload} /> : null}
        {audit.data ? (
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={audit.data}
            loading={audit.loading}
            pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100] }}
            scroll={{ x: 980 }}
            locale={{ emptyText: 'No audit entries match these filters.' }}
          />
        ) : null}
      </SectionCard>
    </div>
  );
}
