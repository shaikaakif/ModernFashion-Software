import { Link, useNavigate } from 'react-router-dom';
import { Button, Col, Progress, Row, Table } from 'antd';
import {
  AppstoreOutlined,
  BarcodeOutlined,
  ContainerOutlined,
  PlusOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { getDashboardMetrics } from '@/retail/utils/metrics';
import { formatDate, formatMoney, formatNumber, percent } from '@/retail/utils/format';
import { PageHeader, SectionCard, StatCard, ProductThumb, StatusTag, DemoNotice, EmptyState } from '@/retail/components/ui';

export default function DashboardPage() {
  const { db } = useDemo();
  const navigate = useNavigate();
  const metrics = getDashboardMetrics(db);
  const business = db.business;

  const invoiceColumns = [
    {
      title: 'Invoice',
      dataIndex: 'number',
      render: (value) => <span className="strong-text">{value}</span>,
    },
    { title: 'Customer', dataIndex: 'customerName' },
    { title: 'Date', dataIndex: 'date', render: (value) => formatDate(value) },
    {
      title: 'Total',
      dataIndex: 'total',
      align: 'right',
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
    {
      title: 'Payment',
      dataIndex: 'paymentStatus',
      align: 'right',
      render: (status) => <StatusTag status={status} />,
    },
  ];

  const purchaseColumns = [
    {
      title: 'Reference',
      dataIndex: 'reference',
      render: (value) => <span className="strong-text">{value}</span>,
    },
    { title: 'Supplier', dataIndex: 'supplierName' },
    { title: 'Date', dataIndex: 'date', render: (value) => formatDate(value) },
    {
      title: 'Total',
      dataIndex: 'total',
      align: 'right',
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
  ];

  const lowStockColumns = [
    {
      title: 'Product',
      key: 'product',
      render: (_, row) => (
        <div className="inline-product">
          <ProductThumb product={row.product} size="sm" />
          <div>
            <strong>{row.product.name}</strong>
            <span>
              {row.variant.color} / {row.variant.size}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: 'Stock',
      key: 'stock',
      align: 'right',
      render: (_, row) => (
        <span className={row.variant.stock === 0 ? 'stock-out' : 'stock-low'}>
          {row.variant.stock} units
        </span>
      ),
    },
  ];

  return (
    <div className="page dashboard-page">
      <PageHeader
        eyebrow="Overview · Sample data"
        title="Dashboard"
        subtitle={`A live snapshot of ${business.name}, Attapur. Every figure below is calculated from the demo data used across all modules.`}
        extra={
          <div className="quick-actions">
            <Button icon={<BarcodeOutlined />} onClick={() => navigate('/barcode')}>
              Scan barcode
            </Button>
            <Button icon={<ShoppingCartOutlined />} onClick={() => navigate('/purchases/new')}>
              New purchase
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/invoices/new')}>
              New invoice
            </Button>
          </div>
        }
      />

      <div className="stat-grid">
        <StatCard
          label="Today's sales"
          value={formatMoney(metrics.todaySales)}
          hint={`${metrics.todayInvoiceCount} invoice${metrics.todayInvoiceCount === 1 ? '' : 's'} created today`}
          icon={<ContainerOutlined />}
        />
        <StatCard
          label="Total invoices"
          value={formatNumber(metrics.totalInvoices)}
          hint={`${formatMoney(metrics.outstanding)} outstanding`}
          icon={<ContainerOutlined />}
          accent="ink"
        />
        <StatCard
          label="Total products"
          value={formatNumber(metrics.totalProducts)}
          hint="Active demo catalogue"
          icon={<AppstoreOutlined />}
          accent="teal"
        />
        <StatCard
          label="Total customers"
          value={formatNumber(metrics.totalCustomers)}
          hint="Sample customer records"
          icon={<TeamOutlined />}
          accent="blue"
        />
        <StatCard
          label="Total stock units"
          value={formatNumber(metrics.totalStock)}
          hint="Across all product variants"
          icon={<ShoppingCartOutlined />}
          accent="green"
        />
        <StatCard
          label="Low-stock products"
          value={formatNumber(metrics.lowStockProductCount)}
          hint={`${metrics.lowStockVariantCount} variants at or below threshold`}
          icon={<WarningOutlined />}
          accent={metrics.lowStockProductCount ? 'red' : 'green'}
        />
      </div>

      <DemoNotice />

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={15}>
          <SectionCard
            title="Sales overview"
            description="Invoice value across the last seven days."
            extra={<Link to="/invoices">View invoices →</Link>}
            className="chart-panel"
          >
            <div className="sales-chart">
              {metrics.last7.map((day) => {
                const height = Math.max(6, Math.round((day.total / metrics.maxDaySale) * 168));
                return (
                  <div className="chart-col" key={day.key}>
                    <div className="chart-value">{formatMoney(day.total)}</div>
                    <div className="chart-track">
                      <div
                        className={`chart-bar ${day.total === 0 ? 'muted' : ''}`}
                        style={{ height }}
                        title={`${day.label}: ${formatMoney(day.total)} from ${day.count} invoice(s)`}
                      />
                    </div>
                    <span>{day.label}</span>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </Col>
        <Col xs={24} xl={9}>
          <SectionCard
            title="Top-selling products"
            description="By units sold in the sample invoice history."
            extra={<Link to="/products">Catalogue →</Link>}
            className="top-products-panel"
          >
            {metrics.topProducts.length ? (
              <div className="rank-list">
                {metrics.topProducts.map((item, index) => (
                  <div className="rank-row" key={item.productId}>
                    <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
                    <ProductThumb product={item.liveProduct || item} size="sm" />
                    <div className="rank-main">
                      <div className="rank-title">
                        <strong>{item.liveProduct?.name || item.name}</strong>
                        <span>{formatMoney(item.revenue)}</span>
                      </div>
                      <Progress
                        percent={percent(item.qty, metrics.topProducts[0].qty)}
                        showInfo={false}
                        strokeColor="#e4602a"
                        trailColor="#f0ece6"
                        size="small"
                      />
                      <small>{item.qty} units sold · {item.category}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No sales yet" description="Create an invoice to populate this list." />
            )}
          </SectionCard>
        </Col>
      </Row>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={15}>
          <SectionCard
            title="Recent invoices"
            extra={<Link to="/invoices">All invoices →</Link>}
            bodyClassName="flush"
          >
            <Table
              rowKey="id"
              columns={invoiceColumns}
              dataSource={metrics.recentInvoices}
              pagination={false}
              size="middle"
              onRow={(record) => ({ onClick: () => navigate(`/invoices/${record.id}`), className: 'clickable-row' })}
              scroll={{ x: 620 }}
            />
          </SectionCard>
        </Col>
        <Col xs={24} xl={9}>
          <SectionCard
            title="Low-stock alerts"
            extra={<Link to="/inventory?low=1">Open inventory →</Link>}
            bodyClassName="flush"
          >
            {metrics.lowStockRows.length ? (
              <Table
                rowKey={(row) => row.variant.id}
                columns={lowStockColumns}
                dataSource={metrics.lowStockRows}
                pagination={false}
                size="middle"
              />
            ) : (
              <div className="panel-pad">
                <EmptyState title="Stock levels look healthy" description="No variants are at or below their reorder threshold." />
              </div>
            )}
          </SectionCard>
        </Col>
      </Row>

      <SectionCard
        title="Recent purchases"
        description="Stock received from sample suppliers."
        extra={<Link to="/purchases">All purchases →</Link>}
        bodyClassName="flush"
      >
        <Table
          rowKey="id"
          columns={purchaseColumns}
          dataSource={metrics.recentPurchases}
          pagination={false}
          size="middle"
          onRow={(record) => ({ onClick: () => navigate(`/purchases/${record.id}`), className: 'clickable-row' })}
          scroll={{ x: 620 }}
        />
      </SectionCard>
    </div>
  );
}
