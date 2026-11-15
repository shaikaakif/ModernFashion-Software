import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Descriptions, Space, Table, Tag } from 'antd';
import { ArrowLeftOutlined, BarcodeOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatMoney, formatNumber } from '@/retail/utils/format';
import { productStock } from '@/retail/utils/metrics';
import { PageHeader, ProductThumb, SectionCard, StatCard, StockStatus } from '@/retail/components/ui';
import ProductFormModal from './ProductFormModal';

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { db } = useDemo();
  const [editOpen, setEditOpen] = useState(false);
  const product = db.products.find((item) => item.id === id);

  if (!product) {
    return (
      <div className="page">
        <Alert
          type="warning"
          showIcon
          message="Product not found"
          description="This product may have been deleted from the demo catalogue."
          action={<Link to="/products">Back to products</Link>}
        />
      </div>
    );
  }

  const stock = productStock(product);
  const lowCount = product.variants.filter((variant) => variant.stock <= variant.lowStockThreshold).length;

  const columns = [
    { title: 'Colour', dataIndex: 'color', width: 120 },
    { title: 'Size', dataIndex: 'size', width: 80 },
    {
      title: 'SKU',
      dataIndex: 'sku',
      render: (value) => <code className="code-text">{value}</code>,
    },
    {
      title: 'Internal barcode',
      dataIndex: 'barcode',
      render: (value, variant) => (
        <Button type="link" className="barcode-link" onClick={() => navigate(`/barcode?variant=${variant.id}`)}>
          <BarcodeOutlined /> {value}
        </Button>
      ),
    },
    {
      title: 'Stock',
      dataIndex: 'stock',
      align: 'right',
      render: (value, variant) => (
        <div className="stock-cell align-right">
          <strong>{formatNumber(value)}</strong>
          <StockStatus stock={value} threshold={variant.lowStockThreshold} />
        </div>
      ),
    },
    {
      title: 'Cost',
      dataIndex: 'purchasePrice',
      align: 'right',
      render: (value) => <span className="muted-text">{formatMoney(value)}</span>,
    },
    {
      title: 'Selling',
      dataIndex: 'sellingPrice',
      align: 'right',
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
  ];

  return (
    <div className="page">
      <div className="detail-topbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/products')}>
          Products
        </Button>
        <Space wrap>
          <Button icon={<BarcodeOutlined />} onClick={() => navigate(`/barcode?variant=${product.variants[0]?.id || ''}`)}>
            Barcode studio
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => navigate(`/purchases/new?productId=${product.id}`)}>
            Add stock via purchase
          </Button>
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            Edit product
          </Button>
        </Space>
      </div>

      <section className="product-hero">
        <ProductThumb product={product} size="xl" />
        <div className="product-hero-main">
          <div className="page-eyebrow">Product details</div>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          <div className="hero-tags">
            <Tag className="category-tag">{product.category}</Tag>
            <Tag color="green">Active</Tag>
            {lowCount ? <Tag color="gold">{lowCount} low-stock variants</Tag> : null}
          </div>
        </div>
        <div className="product-hero-price">
          <span>Selling price</span>
          <strong>{formatMoney(product.sellingPrice)}</strong>
          <small>Cost {formatMoney(product.purchasePrice)}</small>
        </div>
      </section>

      <div className="stat-grid stat-grid-4">
        <StatCard label="Variants" value={formatNumber(product.variants.length)} hint="Unique colour × size" />
        <StatCard label="Units on hand" value={formatNumber(stock)} hint="Across all variants" accent="teal" />
        <StatCard label="Stock at retail" value={formatMoney(stock * product.sellingPrice)} hint="Illustrative value" accent="green" />
        <StatCard label="Stock at cost" value={formatMoney(stock * product.purchasePrice)} hint="Illustrative value" accent="ink" />
      </div>

      {lowCount ? (
        <Alert
          type="warning"
          showIcon
          message={`${lowCount} variant${lowCount > 1 ? 's are' : ' is'} at or below the reorder level`}
          description="Open Inventory to review low-stock variants or record a purchase to replenish them."
          action={<Link to={`/inventory?product=${product.id}&low=1`}>Review stock</Link>}
        />
      ) : null}

      <SectionCard title="Variants & barcodes" description="Every variant has its own SKU, Code 128 barcode and stock balance." bodyClassName="flush">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={product.variants}
          pagination={product.variants.length > 12 ? { pageSize: 12 } : false}
          scroll={{ x: 900 }}
          size="middle"
        />
      </SectionCard>

      <SectionCard title="Product information">
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label="Product ID">{product.id}</Descriptions.Item>
          <Descriptions.Item label="Category">{product.category}</Descriptions.Item>
          <Descriptions.Item label="Colours">{product.colors.join(', ')}</Descriptions.Item>
          <Descriptions.Item label="Sizes">{product.sizes.join(', ')}</Descriptions.Item>
          <Descriptions.Item label="Created">{new Date(product.createdAt).toLocaleDateString('en-IN')}</Descriptions.Item>
          <Descriptions.Item label="Status">{product.status}</Descriptions.Item>
        </Descriptions>
      </SectionCard>

      <ProductFormModal
        open={editOpen}
        product={product}
        onClose={() => setEditOpen(false)}
        onSaved={() => setEditOpen(false)}
      />
    </div>
  );
}
