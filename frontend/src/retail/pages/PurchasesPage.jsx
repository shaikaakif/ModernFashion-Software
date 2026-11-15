import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Table, Tag } from 'antd';
import { PlusOutlined, SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatDate, formatMoney, formatNumber } from '@/retail/utils/format';
import { PageHeader, SectionCard, StatCard } from '@/retail/components/ui';

export default function PurchasesPage() {
  const { db } = useDemo();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.purchases.filter((purchase) =>
      [purchase.reference, purchase.supplierName, purchase.date, ...purchase.items.map((item) => item.productName)]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [db.purchases, search]);

  const totalUnits = db.purchases.reduce(
    (sum, purchase) => sum + purchase.items.reduce((itemSum, item) => itemSum + item.qty, 0),
    0
  );
  const totalValue = db.purchases.reduce((sum, purchase) => sum + purchase.total, 0);

  const columns = [
    {
      title: 'Reference',
      dataIndex: 'reference',
      render: (value) => <span className="strong-text">{value}</span>,
    },
    {
      title: 'Supplier',
      dataIndex: 'supplierName',
      render: (value, record) => (
        <div className="two-line-cell">
          <strong>{value}</strong>
          <span>{record.supplierPhone}</span>
        </div>
      ),
    },
    { title: 'Purchase date', dataIndex: 'date', render: (value) => formatDate(value) },
    {
      title: 'Lines',
      key: 'lines',
      align: 'right',
      render: (_, purchase) => purchase.items.length,
    },
    {
      title: 'Units received',
      key: 'units',
      align: 'right',
      render: (_, purchase) => formatNumber(purchase.items.reduce((sum, item) => sum + item.qty, 0)),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      align: 'right',
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
    { title: 'Status', dataIndex: 'status', render: (value) => <Tag color="green">{value}</Tag> },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Stock intake · Sample data"
        title="Purchases"
        subtitle="Record supplier stock receipts. Saving a purchase increases variant stock and appears in Inventory immediately."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/purchases/new')}>
            New purchase
          </Button>
        }
      />

      <div className="stat-grid stat-grid-4">
        <StatCard label="Purchase records" value={formatNumber(db.purchases.length)} hint="Sample supplier receipts" icon={<ShoppingCartOutlined />} />
        <StatCard label="Suppliers" value={formatNumber(db.suppliers.length)} hint="Fictional demo suppliers" accent="blue" />
        <StatCard label="Units received" value={formatNumber(totalUnits)} hint="Across purchase history" accent="teal" />
        <StatCard label="Purchase value" value={formatMoney(totalValue)} hint="Illustrative cost value" accent="green" />
      </div>

      <SectionCard bodyClassName="flush">
        <div className="toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search reference, supplier or product…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="search-input"
          />
          <span className="toolbar-count">{filtered.length} purchases</span>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `${total} purchases` }}
          onRow={(record) => ({ onClick: () => navigate(`/purchases/${record.id}`), className: 'clickable-row' })}
          scroll={{ x: 900 }}
        />
      </SectionCard>
    </div>
  );
}
