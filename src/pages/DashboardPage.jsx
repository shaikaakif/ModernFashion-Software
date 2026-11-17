import { useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, DatePicker, Space, Table, Tag } from 'antd';
import {
  BarChartOutlined,
  CloudUploadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SwapOutlined,
  UserAddOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '@/app/api';
import { useAsync } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import BrandMark from '@/app/BrandMark';
import { businessToday, formatDateTime, money, paymentLabel } from '@/app/format';
import { ErrorPanel, Kpi, LoadingPanel, PageHeader, SectionCard, StatusTag } from '@/app/components';

const kpiGrid = 'dashboard-kpis';

export default function DashboardPage() {
  const { user, can } = useSession();
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [date, setDate] = useState(businessToday());
  const [backupBusy, setBackupBusy] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api('dashboard.get', { date }), [date]);
  const backup = useAsync(
    () => (can('backup.manage') ? api('backup.status') : Promise.resolve(null)),
    [can]
  );
  const canSeeProfit = Boolean(data?.canSeeProfit);
  const stockCounts = data?.stockCounts || {};

  async function backupNow() {
    setBackupBusy(true);
    try {
      const result = await api('backup.create');
      message.success(`Backup verified and saved: ${result.path}`);
      backup.reload();
    } catch (backupError) {
      message.error(errorMessage(backupError));
    } finally {
      setBackupBusy(false);
    }
  }

  const quickActions = [
    {
      key: 'sale',
      label: 'New Sale',
      icon: <ShoppingCartOutlined />,
      allowed: can('pos.use'),
      primary: true,
      onClick: () => navigate('/pos'),
    },
    {
      key: 'product',
      label: 'Add Product',
      icon: <PlusOutlined />,
      allowed: can('products.manage'),
      onClick: () => navigate('/inventory?new=product'),
    },
    {
      key: 'stock',
      label: 'Update Stock',
      icon: <SwapOutlined />,
      allowed: can('inventory.adjust'),
      onClick: () => navigate('/inventory?tab=stock'),
    },
    {
      key: 'customer',
      label: 'Add Customer',
      icon: <UserAddOutlined />,
      allowed: can('customers.manage'),
      onClick: () => navigate('/customers?new=1'),
    },
    {
      key: 'reports',
      label: 'View Reports',
      icon: <BarChartOutlined />,
      allowed: can('reports.sales') || can('reports.profit'),
      onClick: () => navigate('/reports'),
    },
    {
      key: 'backup',
      label: 'Back Up Now',
      icon: <CloudUploadOutlined />,
      allowed: can('backup.manage'),
      loading: backupBusy,
      onClick: backupNow,
    },
    {
      key: 'settings',
      label: 'Configure Software',
      icon: <SettingOutlined />,
      allowed: can('settings.manage'),
      onClick: () => navigate('/settings'),
    },
  ].filter((action) => action.allowed);

  const seriesMax = useMemo(
    () => Math.max(1, ...(data?.sevenDaySeries || []).map((day) => day.totalPaise)),
    [data]
  );

  if (loading && !data) return <LoadingPanel label="Loading today's trading position…" />;
  if (error) return <ErrorPanel error={error} onRetry={reload} />;

  const sales = data?.sales || {};
  const lastBackup = backup.data?.lastBackup || null;
  const backupStale =
    lastBackup &&
    backup.data?.intervalHours &&
    Date.now() - new Date(lastBackup.createdAt).getTime() > Number(backup.data.intervalHours) * 3600000;

  return (
    <div>
      <PageHeader
        eyebrow={data?.scope === 'own' ? 'Your counter' : 'Store overview'}
        title={`Good ${greeting()}, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle={
          data?.scope === 'own'
            ? 'Your own sales for the selected day. Store-wide costs and other cashiers are hidden for your role.'
            : 'Live figures from the local database. No internet connection is used.'
        }
        extra={
          <div className="toolbar">
            <BrandMark size={40} />
            <DatePicker
              allowClear={false}
              value={dayjs(date)}
              onChange={(value) => setDate(value.format('YYYY-MM-DD'))}
              format="DD MMM YYYY"
            />
            <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      <div className={`${kpiGrid} five`}>
        <Kpi
          label="Net sales"
          value={money(sales.netSalesPaise)}
          hint={`Gross ${money(sales.grossSalesPaise)} · excluding tax`}
          tone="accent"
        />
        <Kpi label="Invoices" value={Number(sales.invoiceCount || 0)} hint={`Average bill ${money(sales.averageBillPaise)}`} />
        <Kpi label="Discounts" value={money(sales.discountTotalPaise)} hint="Manual and automatic offers" />
        {canSeeProfit ? (
          <Kpi
            label="Gross profit"
            value={money(sales.grossProfitPaise)}
            hint={`COGS ${money(sales.cogsPaise)} · weighted average`}
            tone="success"
          />
        ) : (
          <Kpi label="Amount collected" value={money(sales.amountPaidPaise)} hint="Payments recorded on invoices" />
        )}
        {data?.scope === 'shop' ? (
          <Kpi
            label="Net operating result"
            value={money((sales.grossProfitPaise || 0) - (data?.expenses?.totalPaise || 0))}
            hint={`After ${money(data?.expenses?.totalPaise)} operating expenses`}
            tone={(sales.grossProfitPaise || 0) - (data?.expenses?.totalPaise || 0) >= 0 ? 'success' : 'danger'}
          />
        ) : (
          <Kpi label="Outstanding" value={money(sales.outstandingPaise)} hint="Credit balances on your invoices" tone="warning" />
        )}
      </div>

      <SectionCard
        title="Quick actions"
        subtitle="Every button opens the real workflow below."
        className="dashboard-actions"
      >
        <Space wrap>
          {quickActions.map((action) => (
            <Button
              key={action.key}
              type={action.primary ? 'primary' : 'default'}
              icon={action.icon}
              loading={action.loading}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </Space>
      </SectionCard>

      {can('backup.manage') ? (
        <SectionCard
          title="Backup status"
          subtitle="Verified local snapshots of the database and business assets."
          className="dashboard-backup"
          extra={
            <Button icon={<CloudUploadOutlined />} onClick={backupNow} loading={backupBusy}>
              Back up now
            </Button>
          }
        >
          {backup.loading && !backup.data ? (
            <LoadingPanel label="Checking the last backup…" />
          ) : backup.error ? (
            <ErrorPanel error={backup.error} onRetry={backup.reload} />
          ) : lastBackup ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Alert
                type={!lastBackup.exists || backupStale ? 'warning' : 'success'}
                showIcon
                message={
                  !lastBackup.exists
                    ? 'The last backup file is missing'
                    : backupStale
                      ? 'The last backup is older than the configured interval'
                      : 'Last backup verified'
                }
                description={`${formatDateTime(lastBackup.createdAt)} · ${lastBackup.filename}`}
              />
              <span className="muted small">Backup folder: {backup.data.directory}</span>
            </Space>
          ) : (
            <Alert
              type="warning"
              showIcon
              message="No verified backup yet"
              description="Create a backup before closing the shop. The file is verified and recorded locally."
            />
          )}
        </SectionCard>
      ) : null}

      <div className="dashboard-grid">
        <SectionCard
          title="Last seven days"
          subtitle="Invoice value by business date. The selected date is the last bar."
          className="span-8"
        >
          <div className="bar-chart" role="img" aria-label="Daily sales bar chart">
            {(data?.sevenDaySeries || []).map((day) => (
              <div className="bar-column" key={day.date}>
                <div className="bar-value">{money(day.totalPaise)}</div>
                <div className="bar-track">
                  <div
                    className={`bar-fill ${day.date === data.date ? 'is-current' : ''}`}
                    style={{ height: `${Math.max(2, (day.totalPaise / seriesMax) * 100)}%` }}
                  />
                </div>
                <div className="bar-label">
                  {dayjs(day.date).format('ddd')}
                  <small>{day.invoiceCount}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="metric-strip">
            <div>
              <span>Payments</span>
              <div className="tag-row">
                {(data?.paymentMethods || []).length ? (
                  data.paymentMethods.map((payment) => (
                    <Tag key={payment.method}>
                      {paymentLabel(payment.method)} · {money(payment.totalPaise)} ({payment.count})
                    </Tag>
                  ))
                ) : (
                  <span className="muted">No completed payments.</span>
                )}
              </div>
            </div>
            <div>
              <span>Purchases today</span>
              <strong>{data?.purchases ? money(data.purchases.totalPaise) : 'Hidden for your role'}</strong>
              <small>{data?.purchases ? `${data.purchases.count} posted` : ''}</small>
            </div>
            <div>
              <span>Month to date</span>
              <strong>{money(data?.monthToDate?.netSalesPaise)}</strong>
              <small>{Number(data?.monthToDate?.invoiceCount || 0)} invoices</small>
            </div>
            <div>
              <span>Operating expenses</span>
              <strong>{data?.expenses ? money(data.expenses.totalPaise) : 'Hidden for your role'}</strong>
              <small>{data?.expenses ? `${data.expenses.count} entries` : ''}</small>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Low stock"
          subtitle="Variants at or below their reorder threshold."
          className="span-4"
          extra={
            <Space>
              <Tag color="red">{Number(stockCounts.out || 0)} out</Tag>
              <WarningOutlined className="panel-icon warning" />
            </Space>
          }
        >
          {(data?.lowStock || []).length ? (
            <div className="stack-list">
              {data.lowStock.map((item) => (
                <button
                  type="button"
                  className="list-row"
                  key={item.variantId}
                  onClick={() => navigate('/inventory')}
                >
                  <div>
                    <strong>{item.productName}</strong>
                    <span>
                      {item.color} / {item.size} · {item.sku}
                    </span>
                  </div>
                  <Tag color={item.stock === 0 ? 'red' : 'gold'}>{item.stock} left</Tag>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">No low-stock variants. This list updates from the stock ledger.</p>
          )}
        </SectionCard>

        <SectionCard title="Top products" subtitle="By units sold on the selected date." className="span-5">
          <Table
            size="small"
            rowKey={(row) => `${row.sku}-${row.variantLabel}`}
            pagination={false}
            dataSource={data?.topProducts || []}
            locale={{ emptyText: 'No products sold on this date.' }}
            columns={[
              {
                title: 'Product',
                dataIndex: 'productName',
                render: (value, row) => (
                  <div>
                    <strong>{value}</strong>
                    <div className="muted small">
                      {row.variantLabel} · {row.sku}
                    </div>
                  </div>
                ),
              },
              { title: 'Units', dataIndex: 'units', align: 'right', width: 70 },
              { title: 'Net', dataIndex: 'netSalesPaise', align: 'right', render: money },
              ...(canSeeProfit
                ? [{ title: 'Profit', dataIndex: 'grossProfitPaise', align: 'right', render: money }]
                : []),
            ]}
          />
        </SectionCard>

        <SectionCard title="Recent invoices" subtitle="Latest completed or voided bills." className="span-7" extra={<ShoppingOutlined className="panel-icon" />}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data?.recentSales || []}
            locale={{ emptyText: 'No invoices on this date.' }}
            onRow={(row) => ({ onClick: () => navigate(`/sales?invoice=${row.id}`), className: 'clickable-row' })}
            columns={[
              { title: 'Invoice', dataIndex: 'invoiceNo', render: (value) => <strong>{value}</strong> },
              { title: 'Time', dataIndex: 'completedAt', render: formatDateTime, width: 150 },
              { title: 'Customer', dataIndex: 'customerName', ellipsis: true },
              { title: 'Cashier', dataIndex: 'cashierName', ellipsis: true },
              { title: 'Status', dataIndex: 'status', render: (value) => <StatusTag status={value} />, width: 100 },
              { title: 'Total', dataIndex: 'totalPaise', align: 'right', render: money, width: 110 },
            ]}
          />
        </SectionCard>

        {data?.scope === 'shop' ? (
          <SectionCard title="Cashier performance" subtitle="Completed sales for the selected date." className="span-12">
            <Table
              size="small"
              rowKey="userId"
              pagination={false}
              dataSource={data?.cashierSales || []}
              locale={{ emptyText: 'No cashier sales on this date.' }}
              columns={[
                { title: 'Cashier', dataIndex: 'userName' },
                { title: 'Invoices', dataIndex: 'invoiceCount', align: 'right' },
                { title: 'Sales', dataIndex: 'totalPaise', align: 'right', render: money },
                { title: 'Discounts', dataIndex: 'discountPaise', align: 'right', render: money },
              ]}
            />
          </SectionCard>
        ) : null}
      </div>

      <div className="definition-note">
        <strong>How these figures are defined</strong>
        <span>Net sales = gross selling price minus discounts, excluding tax.</span>
        <span>Gross profit = net sales minus COGS at weighted-average purchase cost.</span>
        <span>Net operating result = gross profit minus recorded operating expenses; inventory purchases are shown separately.</span>
        {!canSeeProfit ? <span>Cost and profit are hidden because your role does not include financial cost access.</span> : null}
      </div>
    </div>
  );
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date())
  );
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
