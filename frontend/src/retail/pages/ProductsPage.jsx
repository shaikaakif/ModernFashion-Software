import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Input, Select, Space, Table, Tag, Tooltip } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  SearchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatMoney, formatNumber } from '@/retail/utils/format';
import { productStock, variantCount, lowStockVariants } from '@/retail/utils/metrics';
import { productService } from '@/retail/services/productService';
import { PageHeader, ProductThumb, SectionCard } from '@/retail/components/ui';
import ProductFormModal from './ProductFormModal';

export default function ProductsPage() {
  const { message, modal } = App.useApp();
  const { db } = useDemo();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const lowIds = useMemo(() => new Set(lowStockVariants(db).map((row) => row.product.id)), [db]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.products.filter((product) => {
      if (category !== 'all' && product.category !== category) return false;
      if (stockFilter === 'low' && !lowIds.has(product.id)) return false;
      if (stockFilter === 'out' && productStock(product) > 0) return false;
      if (!term) return true;
      const haystack = [
        product.name,
        product.category,
        ...product.variants.map((variant) => `${variant.sku} ${variant.barcode} ${variant.color} ${variant.size}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [db.products, search, category, stockFilter, lowIds]);

  const totalVariants = db.products.reduce((sum, product) => sum + variantCount(product), 0);
  const totalStock = db.products.reduce((sum, product) => sum + productStock(product), 0);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setFormOpen(true);
  };

  const confirmDelete = (product) => {
    modal.confirm({
      title: `Delete ${product.name}?`,
      content:
        'This removes the product and its variants from the catalogue and inventory. Existing sample invoice and purchase snapshots remain readable.',
      okText: 'Delete product',
      okButtonProps: { danger: true },
      onOk: () => {
        productService.remove(product.id);
        message.success('Product deleted.');
      },
    });
  };

  const columns = [
    {
      title: 'Product',
      key: 'product',
      width: 330,
      render: (_, product) => (
        <div className="table-product">
          <ProductThumb product={product} />
          <div>
            <strong>{product.name}</strong>
            <span>Added {new Date(product.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 150,
      render: (value) => <Tag className="category-tag">{value}</Tag>,
    },
    {
      title: 'Variants',
      key: 'variants',
      width: 92,
      render: (_, product) => <span className="strong-text">{variantCount(product)}</span>,
    },
    {
      title: 'Stock',
      key: 'stock',
      width: 150,
      render: (_, product) => {
        const stock = productStock(product);
        return (
          <div className="stock-cell">
            <strong>{formatNumber(stock)} units</strong>
            {lowIds.has(product.id) ? (
              <span className="stock-low">
                <WarningOutlined /> Low stock
              </span>
            ) : (
              <span className="stock-ok">Healthy</span>
            )}
          </div>
        );
      },
    },
    {
      title: 'Selling price',
      dataIndex: 'sellingPrice',
      width: 130,
      align: 'right',
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      align: 'right',
      render: (_, product) => (
        <Space size={2} onClick={(event) => event.stopPropagation()}>
          <Tooltip title="View product">
            <Button type="text" icon={<EyeOutlined />} onClick={() => navigate(`/products/${product.id}`)} />
          </Tooltip>
          <Tooltip title="Edit product">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(product)} />
          </Tooltip>
          <Tooltip title="Delete product">
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(product)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Catalogue · Sample data"
        title="Products"
        subtitle="Manage the demo clothing and footwear catalogue, its variants, prices and internal barcodes."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Add product
          </Button>
        }
      />

      <div className="mini-stats">
        <div>
          <span>Products</span>
          <strong>{formatNumber(db.products.length)}</strong>
        </div>
        <div>
          <span>Variants</span>
          <strong>{formatNumber(totalVariants)}</strong>
        </div>
        <div>
          <span>Stock units</span>
          <strong>{formatNumber(totalStock)}</strong>
        </div>
        <div className={lowIds.size ? 'warn' : ''}>
          <span>Low-stock products</span>
          <strong>{formatNumber(lowIds.size)}</strong>
        </div>
      </div>

      <SectionCard bodyClassName="flush">
        <div className="toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search name, SKU, barcode, colour…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="search-input"
          />
          <Select
            value={category}
            onChange={setCategory}
            className="filter-select"
            options={[{ value: 'all', label: 'All categories' }, ...db.products.map((p) => p.category).filter((v, i, a) => a.indexOf(v) === i).sort().map((value) => ({ value, label: value }))]}
          />
          <Select
            value={stockFilter}
            onChange={setStockFilter}
            className="filter-select small"
            options={[
              { value: 'all', label: 'All stock' },
              { value: 'low', label: 'Low stock' },
              { value: 'out', label: 'Out of stock' },
            ]}
          />
          <span className="toolbar-count">
            {filtered.length} of {db.products.length} products
          </span>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `${total} products` }}
          onRow={(record) => ({ onClick: () => navigate(`/products/${record.id}`), className: 'clickable-row' })}
          scroll={{ x: 980 }}
        />
      </SectionCard>

      <ProductFormModal
        open={formOpen}
        product={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          if (!editing && saved) navigate(`/products/${saved.id}`);
        }}
      />
    </div>
  );
}
