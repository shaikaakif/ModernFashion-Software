import { useMemo, useState } from 'react';
import { Button, DatePicker, Table, Tag } from 'antd';
import { ReloadOutlined, ShoppingOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { api } from '@/app/api';
import { useAsync } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { businessToday, formatDateTime, money, paymentLabel } from '@/app/format';
import { ErrorPanel, Kpi, LoadingPanel, PageHeader, SectionCard, StatusTag } from '@/app/components';

const kpiGrid = 'dashboard-kpis';

export default function DashboardPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [date, setDate] = useState(businessToday());
  const { data, loading, error, reload } = useAsync(() => api('dashboard.get', { date }), [date]);
  const canSeeProfit = Boolean(data?.canSeeProfit);

  const seriesMax = useMemo(
    () => Math.max(1, ...(data?.sevenDaySeries || []).map((day) => day.totalPaise)),
    [data]
  );

  if (loading && !data) return <LoadingPanel label="Loading today's trading position…" />;
  if (error) return <ErrorPanel error={error} onRetry={reload} />;

  const sales = data?.sales || {};

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
          extra={<WarningOutlined className="panel-icon warning" />}
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
