import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Form, Input, InputNumber, Modal, Select, Segmented, Space, Table, Tag } from 'antd';
import { SearchOutlined, SwapOutlined, WarningOutlined } from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatDateTime, formatMoney, formatNumber } from '@/retail/utils/format';
import { productStock } from '@/retail/utils/metrics';
import { inventoryService } from '@/retail/services/inventoryService';
import { PageHeader, ProductThumb, SectionCard, StatCard, StockStatus } from '@/retail/components/ui';

const MOVEMENT_LABELS = { purchase: 'Purchase', sale: 'Sale', adjustment: 'Adjustment' };
const MOVEMENT_COLORS = { purchase: 'blue', sale: 'orange', adjustment: 'purple' };

export default function InventoryPage() {
  const { message } = App.useApp();
  const { db } = useDemo();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('stock');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [lowOnly, setLowOnly] = useState(searchParams.get('low') === '1');
  const [productFilter, setProductFilter] = useState(searchParams.get('product') || 'all');
  const [movementType, setMovementType] = useState('all');
  const [movementSearch, setMovementSearch] = useState('');
  const [adjusting, setAdjusting] = useState(null);
  const [form] = Form.useForm();

  const variantRows = useMemo(
    () =>
      db.products.flatMap((product) =>
        product.variants.map((variant) => ({
          key: variant.id,
          product,
          variant,
        }))
      ),
    [db.products]
  );

  const filteredVariants = useMemo(() => {
    const term = search.trim().toLowerCase();
    return variantRows.filter(({ product, variant }) => {
      if (category !== 'all' && product.category !== category) return false;
      if (productFilter !== 'all' && product.id !== productFilter) return false;
      if (lowOnly && variant.stock > variant.lowStockThreshold) return false;
      if (!term) return true;
      return [product.name, product.category, variant.color, variant.size, variant.sku, variant.barcode]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [variantRows, search, category, lowOnly, productFilter]);

  const filteredMovements = useMemo(() => {
    const term = movementSearch.trim().toLowerCase();
    return db.movements.filter((movement) => {
      if (movementType === 'in' && movement.qtyChange <= 0) return false;
      if (movementType === 'out' && movement.qtyChange >= 0) return false;
      if (['purchase', 'sale', 'adjustment'].includes(movementType) && movement.type !== movementType) return false;
      if (!term) return true;
      return [movement.productName, movement.sku, movement.reference, movement.variantLabel, movement.note]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [db.movements, movementType, movementSearch]);

  const lowCount = variantRows.filter(({ variant }) => variant.stock <= variant.lowStockThreshold).length;
  const outCount = variantRows.filter(({ variant }) => variant.stock === 0).length;
  const totalUnits = db.products.reduce((sum, product) => sum + productStock(product), 0);

  const openAdjust = (row) => {
    setAdjusting(row);
    form.setFieldsValue({ direction: 'in', quantity: 1, reason: '' });
  };

  const handleAdjust = (values) => {
    try {
      inventoryService.adjust({
        variantId: adjusting.variant.id,
        direction: values.direction,
        quantity: values.quantity,
        reason: values.reason,
      });
      message.success('Stock adjusted. The movement history has been updated.');
      setAdjusting(null);
    } catch (error) {
      message.error(error.message || 'Could not adjust stock.');
    }
  };

  const stockColumns = [
    {
      title: 'Product',
      key: 'product',
      width: 280,
      render: (_, row) => (
        <div className="table-product">
          <ProductThumb product={row.product} size="sm" />
          <div>
            <strong>{row.product.name}</strong>
            <span>{row.product.category}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Variant',
      key: 'variant',
      width: 140,
      render: (_, row) => (
        <div className="variant-cell">
          <strong>
            {row.variant.color} / {row.variant.size}
          </strong>
          <span>{row.variant.sku}</span>
        </div>
      ),
    },
    {
      title: 'Barcode',
      dataIndex: ['variant', 'barcode'],
      width: 130,
      render: (value) => <code className="code-text">{value}</code>,
    },
    {
      title: 'Stock',
      key: 'stock',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.variant.stock - b.variant.stock,
      render: (_, row) => <span className={row.variant.stock === 0 ? 'stock-out strong-text' : 'strong-text'}>{formatNumber(row.variant.stock)}</span>,
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, row) => <StockStatus stock={row.variant.stock} threshold={row.variant.lowStockThreshold} />,
    },
    {
      title: 'Value',
      key: 'value',
      width: 120,
      align: 'right',
      render: (_, row) => <span className="muted-text">{formatMoney(row.variant.stock * row.variant.sellingPrice)}</span>,
    },
    {
      title: '',
      key: 'action',
      width: 100,
      align: 'right',
      render: (_, row) => (
        <Button size="small" icon={<SwapOutlined />} onClick={() => openAdjust(row)}>
          Adjust
        </Button>
      ),
    },
  ];

  const movementColumns = [
    {
      title: 'Date',
      dataIndex: 'date',
      width: 160,
      render: (value) => formatDateTime(value),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 110,
      render: (value) => (
        <Tag color={MOVEMENT_COLORS[value] || 'default'}>{MOVEMENT_LABELS[value] || value}</Tag>
      ),
    },
    {
      title: 'Product / variant',
      key: 'product',
      render: (_, movement) => (
        <div className="movement-product">
          <strong>{movement.productName}</strong>
          <span>{movement.variantLabel} · {movement.sku}</span>
        </div>
      ),
    },
    {
      title: 'Change',
      dataIndex: 'qtyChange',
      align: 'right',
      width: 100,
      render: (value) => (
        <span className={value > 0 ? 'qty-in' : 'qty-out'}>
          {value > 0 ? '+' : ''}
          {value}
        </span>
      ),
    },
    {
      title: 'Balance',
      dataIndex: 'balanceAfter',
      align: 'right',
      width: 100,
      render: (value) => (value === null || value === undefined ? '—' : formatNumber(value)),
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      width: 130,
      render: (value) => <code className="code-text">{value}</code>,
    },
    {
      title: 'Note',
      dataIndex: 'note',
      render: (value) => <span className="muted-text">{value}</span>,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Stock control · Sample data"
        title="Inventory"
        subtitle="Variant-level stock, low-stock alerts and a complete movement history connected to purchases, invoices and manual adjustments."
      />

      <div className="stat-grid stat-grid-4">
        <StatCard label="Stock units" value={formatNumber(totalUnits)} hint={`${variantRows.length} tracked variants`} />
        <StatCard label="Low-stock variants" value={formatNumber(lowCount)} hint="At or below reorder level" accent="red" icon={<WarningOutlined />} />
        <StatCard label="Out of stock" value={formatNumber(outCount)} hint="Needs replenishment" accent="ink" />
        <StatCard label="Movements recorded" value={formatNumber(db.movements.length)} hint="Purchases, sales and adjustments" accent="teal" />
      </div>

      {lowCount ? (
        <button type="button" className="inventory-alert" onClick={() => { setTab('stock'); setLowOnly(true); }}>
          <WarningOutlined />
          <span>
            <strong>{lowCount} variants need attention.</strong> Click to filter the low-stock list.
          </span>
          <span>Review →</span>
        </button>
      ) : null}

      <SectionCard bodyClassName="flush">
        <div className="inventory-tabs-bar">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'stock', label: 'Current stock' },
              { value: 'movements', label: 'Movement history' },
            ]}
          />
          {tab === 'stock' ? (
            <div className="toolbar inventory-toolbar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search product, SKU or barcode…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="search-input"
              />
              <Select
                value={category}
                onChange={setCategory}
                className="filter-select"
                options={[
                  { value: 'all', label: 'All categories' },
                  ...[...new Set(db.products.map((p) => p.category))].sort().map((value) => ({ value, label: value })),
                ]}
              />
              <Select
                value={productFilter}
                onChange={setProductFilter}
                className="filter-select"
                showSearch
                optionFilterProp="label"
                options={[
                  { value: 'all', label: 'All products' },
                  ...db.products.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              <Button
                type={lowOnly ? 'primary' : 'default'}
                danger={lowOnly}
                ghost={lowOnly}
                onClick={() => setLowOnly((value) => !value)}
              >
                Low stock only
              </Button>
            </div>
          ) : (
            <div className="toolbar inventory-toolbar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search product, reference or note…"
                value={movementSearch}
                onChange={(event) => setMovementSearch(event.target.value)}
                className="search-input"
              />
              <Select
                value={movementType}
                onChange={setMovementType}
                className="filter-select"
                options={[
                  { value: 'all', label: 'All movements' },
                  { value: 'in', label: 'Stock in' },
                  { value: 'out', label: 'Stock out' },
                  { value: 'purchase', label: 'Purchases' },
                  { value: 'sale', label: 'Sales' },
                  { value: 'adjustment', label: 'Adjustments' },
                ]}
              />
              <span className="toolbar-count">{filteredMovements.length} movements</span>
            </div>
          )}
        </div>

        {tab === 'stock' ? (
          <Table
            rowKey={(row) => row.variant.id}
            columns={stockColumns}
            dataSource={filteredVariants}
            pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `${total} variants` }}
            scroll={{ x: 1000 }}
          />
        ) : (
          <Table
            rowKey="id"
            columns={movementColumns}
            dataSource={filteredMovements}
            pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `${total} movements` }}
            scroll={{ x: 980 }}
          />
        )}
      </SectionCard>

      <Modal
        open={Boolean(adjusting)}
        title={adjusting ? `Adjust stock · ${adjusting.product.name}` : 'Adjust stock'}
        onCancel={() => setAdjusting(null)}
        onOk={() => form.submit()}
        okText="Save adjustment"
        destroyOnClose
      >
        {adjusting ? (
          <div className="adjust-summary">
            <span>
              {adjusting.variant.color} / {adjusting.variant.size}
            </span>
            <code>{adjusting.variant.sku}</code>
            <strong>Current stock: {adjusting.variant.stock}</strong>
          </div>
        ) : null}
        <Form form={form} layout="vertical" onFinish={handleAdjust}>
          <Form.Item name="direction" label="Movement" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'in', label: 'Stock in — add units' },
                { value: 'out', label: 'Stock out — remove units' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="Quantity"
            rules={[{ required: true, message: 'Enter a quantity.' }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} addonAfter="units" />
          </Form.Item>
          <Form.Item name="reason" label="Reason / note">
            <Input placeholder="e.g. Damaged item, stock count correction, sample return" />
          </Form.Item>
          <p className="form-hint">Manual adjustments are written to the movement history immediately.</p>
        </Form>
      </Modal>

      <Space className="inventory-footnote" wrap>
        <span>Customer-facing sales can never exceed available stock.</span>
        <span>Purchase receipts increase stock automatically.</span>
      </Space>
    </div>
  );
}
