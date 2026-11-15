import { Alert, Button, Descriptions, Table, Tag } from 'antd';
import { ArrowLeftOutlined, PhoneOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatDate, formatMoney, formatNumber } from '@/retail/utils/format';
import { getSupplier } from '@/retail/utils/metrics';
import { PageHeader, SectionCard } from '@/retail/components/ui';

export default function PurchaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { db } = useDemo();
  const purchase = db.purchases.find((item) => item.id === id);

  if (!purchase) {
    return (
      <div className="page">
        <Alert type="warning" showIcon message="Purchase not found" action={<Button onClick={() => navigate('/purchases')}>Back to purchases</Button>} />
      </div>
    );
  }

  const supplier = getSupplier(db, purchase.supplierId);
  const units = purchase.items.reduce((sum, item) => sum + item.qty, 0);
  const columns = [
    {
      title: 'Product',
      key: 'product',
      render: (_, item) => (
        <div className="two-line-cell">
          <strong>{item.productName}</strong>
          <span>{item.color} / {item.size} · {item.sku}</span>
        </div>
      ),
    },
    { title: 'Qty received', dataIndex: 'qty', align: 'right', render: (value) => formatNumber(value) },
    { title: 'Cost / unit', dataIndex: 'unitCost', align: 'right', render: (value) => formatMoney(value) },
    {
      title: 'Line total',
      dataIndex: 'lineTotal',
      align: 'right',
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
  ];

  return (
    <div className="page">
      <div className="detail-topbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchases')}>
          Purchases
        </Button>
        <Button onClick={() => navigate('/inventory')}>View inventory</Button>
      </div>

      <PageHeader
        eyebrow="Purchase record"
        title={purchase.reference}
        subtitle={`Stock received on ${formatDate(purchase.date)} from ${purchase.supplierName}.`}
        extra={<Tag color="green">{purchase.status}</Tag>}
      />

      <div className="document-meta-grid">
        <SectionCard title="Supplier">
          <div className="supplier-detail">
            <strong>{purchase.supplierName}</strong>
            {supplier ? (
              <>
                <span>{supplier.contactPerson}</span>
                <span><PhoneOutlined /> {purchase.supplierPhone}</span>
                <span>{supplier.address}</span>
              </>
            ) : (
              <span>{purchase.supplierPhone}</span>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Purchase information">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Reference">{purchase.reference}</Descriptions.Item>
            <Descriptions.Item label="Purchase date">{formatDate(purchase.date)}</Descriptions.Item>
            <Descriptions.Item label="Lines">{purchase.items.length}</Descriptions.Item>
            <Descriptions.Item label="Units received">{formatNumber(units)}</Descriptions.Item>
          </Descriptions>
        </SectionCard>
        <SectionCard title="Total">
          <div className="document-total">
            <span>Purchase total</span>
            <strong>{formatMoney(purchase.total)}</strong>
            <small>Illustrative cost value</small>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Items received" bodyClassName="flush">
        <Table rowKey={(item) => `${item.variantId}`} columns={columns} dataSource={purchase.items} pagination={false} scroll={{ x: 700 }} />
        <div className="document-totals">
          <div>
            <span>Total units</span>
            <strong>{formatNumber(units)}</strong>
          </div>
          <div className="grand">
            <span>Purchase total</span>
            <strong>{formatMoney(purchase.total)}</strong>
          </div>
        </div>
      </SectionCard>

      {purchase.notes ? (
        <SectionCard title="Notes">
          <p className="muted-text">{purchase.notes}</p>
        </SectionCard>
      ) : null}

      <Alert
        type="success"
        showIcon
        message="Inventory updated"
        description={`This purchase increased stock by ${formatNumber(units)} units across ${purchase.items.length} variant lines. The stock-in movements are visible in Inventory → Movement history.`}
      />
    </div>
  );
}
