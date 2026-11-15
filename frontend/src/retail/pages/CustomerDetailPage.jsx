import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Alert, Button, Table } from 'antd';
import { ArrowLeftOutlined, EditOutlined, PhoneOutlined, PlusOutlined } from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { customerStats } from '@/retail/utils/metrics';
import { formatDate, formatMoney, formatNumber } from '@/retail/utils/format';
import { PageHeader, SectionCard, StatCard, StatusTag } from '@/retail/components/ui';
import CustomerFormModal from './CustomerFormModal';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { db } = useDemo();
  const [editOpen, setEditOpen] = useState(false);
  const customer = db.customers.find((item) => item.id === id);

  if (!customer) {
    return (
      <div className="page">
        <Alert type="warning" showIcon message="Customer not found" action={<Link to="/customers">Back to customers</Link>} />
      </div>
    );
  }

  const stats = customerStats(db, customer.id);
  const invoices = [...stats.invoices].sort((a, b) => new Date(b.date) - new Date(a.date));
  const columns = [
    {
      title: 'Invoice',
      dataIndex: 'number',
      render: (value) => <span className="strong-text">{value}</span>,
    },
    { title: 'Date', dataIndex: 'date', render: (value) => formatDate(value) },
    {
      title: 'Items',
      key: 'items',
      align: 'right',
      render: (_, invoice) => invoice.items.reduce((sum, item) => sum + item.qty, 0),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      align: 'right',
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      align: 'right',
      render: (value) => <span className={value > 0 ? 'stock-low' : 'muted-text'}>{formatMoney(value)}</span>,
    },
    {
      title: 'Payment',
      dataIndex: 'paymentStatus',
      render: (value) => <StatusTag status={value} />,
    },
  ];

  return (
    <div className="page">
      <div className="detail-topbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>
          Customers
        </Button>
        <div className="detail-actions">
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            Edit customer
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/invoices/new?customerId=${customer.id}`)}>
            New invoice
          </Button>
        </div>
      </div>

      <PageHeader
        eyebrow="Customer profile"
        title={customer.name}
        subtitle={`${customer.phone}${customer.email ? ` · ${customer.email}` : ''}${customer.address ? ` · ${customer.address}` : ''}`}
      />

      <div className="stat-grid stat-grid-4">
        <StatCard label="Total purchases" value={formatMoney(stats.totalPurchases)} hint={`${stats.invoiceCount} invoices`} />
        <StatCard label="Outstanding" value={formatMoney(stats.outstanding)} hint="Balance across invoices" accent={stats.outstanding ? 'red' : 'green'} />
        <StatCard label="Average invoice" value={formatMoney(stats.invoiceCount ? stats.totalPurchases / stats.invoiceCount : 0)} hint="Illustrative average" accent="teal" />
        <StatCard label="Last purchase" value={stats.lastPurchase ? formatDate(stats.lastPurchase) : '—'} hint="Most recent invoice" accent="ink" />
      </div>

      <div className="customer-profile-grid">
        <SectionCard title="Contact details">
          <div className="contact-block">
            <div>
              <span>Phone</span>
              <strong><PhoneOutlined /> {customer.phone}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{customer.email || 'Not provided'}</strong>
            </div>
            <div>
              <span>Address</span>
              <strong>{customer.address || 'Not provided'}</strong>
            </div>
            <div>
              <span>Customer since</span>
              <strong>{formatDate(customer.createdAt)}</strong>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Balance summary">
          <div className="balance-summary">
            <div>
              <span>Total billed</span>
              <strong>{formatMoney(stats.totalPurchases)}</strong>
            </div>
            <div>
              <span>Total paid</span>
              <strong>{formatMoney(stats.totalPurchases - stats.outstanding)}</strong>
            </div>
            <div className={stats.outstanding ? 'due' : ''}>
              <span>Outstanding</span>
              <strong>{formatMoney(stats.outstanding)}</strong>
            </div>
            <div>
              <span>Invoices</span>
              <strong>{formatNumber(stats.invoiceCount)}</strong>
            </div>
          </div>
        </SectionCard>
      </div>

      {stats.outstanding > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={`${formatMoney(stats.outstanding)} is outstanding for this customer`}
          description="The balance is calculated from the sample invoices marked Partial or Unpaid. No real payment collection is implemented."
        />
      ) : null}

      <SectionCard title="Purchase history" description="Invoices are shown newest first and open in the invoice detail view." bodyClassName="flush">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={invoices}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ x: 760 }}
          onRow={(record) => ({ onClick: () => navigate(`/invoices/${record.id}`), className: 'clickable-row' })}
          locale={{ emptyText: 'No invoices yet for this customer.' }}
        />
      </SectionCard>

      <CustomerFormModal open={editOpen} customer={customer} onClose={() => setEditOpen(false)} />
    </div>
  );
}
