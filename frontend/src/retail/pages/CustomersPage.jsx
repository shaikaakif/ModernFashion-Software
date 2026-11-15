import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input, Space, Table, Tooltip } from 'antd';
import { EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { customerStats } from '@/retail/utils/metrics';
import { formatDate, formatMoney, formatNumber } from '@/retail/utils/format';
import { PageHeader, SectionCard, StatCard } from '@/retail/components/ui';
import CustomerFormModal from './CustomerFormModal';

export default function CustomersPage() {
  const { db } = useDemo();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (searchParams.get('new') === '1') setFormOpen(true);
  }, [searchParams]);

  const rows = useMemo(
    () =>
      db.customers.map((customer) => ({
        ...customer,
        ...customerStats(db, customer.id),
      })),
    [db]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((customer) =>
        [customer.name, customer.phone, customer.email, customer.address].join(' ').toLowerCase().includes(term)
      )
      .sort((a, b) => b.totalPurchases - a.totalPurchases);
  }, [rows, search]);

  const totalPurchases = rows.reduce((sum, customer) => sum + customer.totalPurchases, 0);
  const outstanding = rows.reduce((sum, customer) => sum + customer.outstanding, 0);
  const activeCustomers = rows.filter((customer) => customer.invoiceCount > 0).length;

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (customer) => {
    setEditing(customer);
    setFormOpen(true);
  };

  const columns = [
    {
      title: 'Customer',
      dataIndex: 'name',
      render: (value, customer) => (
        <div className="customer-cell">
          <span className="customer-avatar">{value.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
          <div>
            <strong>{value}</strong>
            <span>{customer.address || 'Hyderabad'}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (_, customer) => (
        <div className="two-line-cell">
          <strong>{customer.phone}</strong>
          <span>{customer.email || '—'}</span>
        </div>
      ),
    },
    {
      title: 'Invoices',
      dataIndex: 'invoiceCount',
      align: 'right',
      width: 90,
      render: (value) => formatNumber(value),
    },
    {
      title: 'Total purchases',
      dataIndex: 'totalPurchases',
      align: 'right',
      width: 140,
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstanding',
      align: 'right',
      width: 130,
      render: (value) => <span className={value > 0 ? 'stock-low' : 'muted-text'}>{formatMoney(value)}</span>,
    },
    {
      title: 'Last purchase',
      dataIndex: 'lastPurchase',
      width: 130,
      render: (value) => (value ? formatDate(value) : '—'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      align: 'right',
      render: (_, customer) => (
        <Space size={2} onClick={(event) => event.stopPropagation()}>
          <Tooltip title="View customer">
            <Button type="text" icon={<EyeOutlined />} onClick={() => navigate(`/customers/${customer.id}`)} />
          </Tooltip>
          <Tooltip title="Edit customer">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(customer)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Customer book · Sample data"
        title="Customers"
        subtitle="Fictional customer records with automatically calculated purchase history, totals and outstanding balances."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Add customer
          </Button>
        }
      />

      <div className="stat-grid stat-grid-4">
        <StatCard label="Customers" value={formatNumber(db.customers.length)} hint={`${activeCustomers} with purchases`} icon={<TeamOutlined />} />
        <StatCard label="Total purchases" value={formatMoney(totalPurchases)} hint="All customer invoices" accent="green" />
        <StatCard label="Outstanding" value={formatMoney(outstanding)} hint="Partial and unpaid balances" accent="red" />
        <StatCard label="Average spend" value={formatMoney(rows.length ? totalPurchases / rows.length : 0)} hint="Illustrative customer value" accent="teal" />
      </div>

      <SectionCard bodyClassName="flush">
        <div className="toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search customer, phone or email…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="search-input"
          />
          <span className="toolbar-count">{filtered.length} customers</span>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `${total} customers` }}
          onRow={(record) => ({ onClick: () => navigate(`/customers/${record.id}`), className: 'clickable-row' })}
          scroll={{ x: 980 }}
        />
      </SectionCard>

      <CustomerFormModal
        open={formOpen}
        customer={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(saved) => {
          if (!editing && saved) navigate(`/customers/${saved.id}`);
        }}
      />
    </div>
  );
}
