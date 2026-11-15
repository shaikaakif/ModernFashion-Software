import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Select, Table } from 'antd';
import { ContainerOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatDate, formatMoney, formatNumber } from '@/retail/utils/format';
import { PageHeader, SectionCard, StatCard, StatusTag } from '@/retail/components/ui';

export default function InvoicesPage() {
  const { db } = useDemo();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.invoices
      .filter((invoice) => (status === 'all' ? true : invoice.paymentStatus === status))
      .filter((invoice) =>
        [invoice.number, invoice.customerName, invoice.customerPhone, invoice.paymentMethod, invoice.date]
          .join(' ')
          .toLowerCase()
          .includes(term)
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [db.invoices, search, status]);

  const totalSales = db.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const paidCount = db.invoices.filter((invoice) => invoice.paymentStatus === 'Paid').length;
  const outstanding = db.invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.amountPaid), 0);

  const columns = [
    {
      title: 'Invoice',
      dataIndex: 'number',
      width: 120,
      render: (value) => <span className="strong-text">{value}</span>,
    },
    {
      title: 'Customer',
      dataIndex: 'customerName',
      render: (value, invoice) => (
        <div className="two-line-cell">
          <strong>{value}</strong>
          <span>{invoice.customerPhone}</span>
        </div>
      ),
    },
    { title: 'Date', dataIndex: 'date', width: 130, render: (value) => formatDate(value) },
    {
      title: 'Items',
      key: 'items',
      width: 80,
      align: 'right',
      render: (_, invoice) => invoice.items.reduce((sum, item) => sum + item.qty, 0),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      width: 130,
      align: 'right',
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
    {
      title: 'Paid',
      dataIndex: 'amountPaid',
      width: 120,
      align: 'right',
      render: (value) => <span className="muted-text">{formatMoney(value)}</span>,
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      width: 120,
      align: 'right',
      render: (value) => <span className={value > 0 ? 'stock-low' : 'muted-text'}>{formatMoney(value)}</span>,
    },
    {
      title: 'Payment',
      dataIndex: 'paymentStatus',
      width: 100,
      render: (value) => <StatusTag status={value} />,
    },
    {
      title: 'Method',
      dataIndex: 'paymentMethod',
      width: 110,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Sales · Sample data"
        title="Invoices"
        subtitle="Create demo customer invoices, track payment status and reduce stock when a sale is completed."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/invoices/new')}>
            New invoice
          </Button>
        }
      />

      <div className="stat-grid stat-grid-4">
        <StatCard label="Total invoices" value={formatNumber(db.invoices.length)} hint={`${paidCount} fully paid`} icon={<ContainerOutlined />} />
        <StatCard label="Total sales" value={formatMoney(totalSales)} hint="Sample invoice value" accent="green" />
        <StatCard label="Outstanding" value={formatMoney(outstanding)} hint="Partial and unpaid invoices" accent="red" />
        <StatCard label="Average invoice" value={formatMoney(db.invoices.length ? totalSales / db.invoices.length : 0)} hint="Illustrative average" accent="teal" />
      </div>

      <SectionCard bodyClassName="flush">
        <div className="toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search invoice number, customer or phone…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="search-input"
          />
          <Select
            value={status}
            onChange={setStatus}
            className="filter-select small"
            options={[
              { value: 'all', label: 'All payments' },
              { value: 'Paid', label: 'Paid' },
              { value: 'Partial', label: 'Partial' },
              { value: 'Unpaid', label: 'Unpaid' },
            ]}
          />
          <span className="toolbar-count">{filtered.length} invoices</span>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `${total} invoices` }}
          onRow={(record) => ({ onClick: () => navigate(`/invoices/${record.id}`), className: 'clickable-row' })}
          scroll={{ x: 1080 }}
        />
      </SectionCard>
    </div>
  );
}
