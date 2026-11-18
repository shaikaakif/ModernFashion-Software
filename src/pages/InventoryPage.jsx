import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  App as AntApp,
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import {
  HistoryOutlined,
  ImportOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDateTime, money, movementLabel } from '@/app/format';
import { EmptyPanel, ErrorPanel, Kpi, LoadingPanel, PageHeader, SectionCard } from '@/app/components';
import ProductsPage from '@/pages/ProductsPage';

const { RangePicker } = DatePicker;

const MOVEMENT_TYPES = [
  'opening',
  'purchase',
  'sale',
  'sale_return',
  'purchase_return',
  'adjustment_in',
  'adjustment_out',
  'damage',
];

export default function InventoryPage() {
  const { can } = useSession();
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('products');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [stockFilter, setStockFilter] = useState('all');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [adjustRow, setAdjustRow] = useState(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjustForm] = Form.useForm();
  const adjustMode = Form.useWatch('mode', adjustForm);
  const adjustQuantity = Form.useWatch('quantity', adjustForm);
  const adjustActual = Form.useWatch('actualQuantity', adjustForm);

  const [movementType, setMovementType] = useState(null);
  const [movementRange, setMovementRange] = useState(null);
  const [variantFilter, setVariantFilter] = useState(null);
  const [movementLimit, setMovementLimit] = useState(200);

  const [reconQuery, setReconQuery] = useState('');
  const debouncedReconQuery = useDebouncedValue(reconQuery, 300);

  const summary = useAsync(() => api('inventory.summary'), []);
  const categories = useAsync(() => api('catalog.categories', {}), []);
  const stock = useAsync(
    () =>
      api('inventory.list', {
        query: debouncedQuery,
        categoryId,
        status: stockFilter === 'all' ? null : stockFilter,
      }),
    [debouncedQuery, categoryId, stockFilter]
  );
  const valuation = useAsync(() => api('inventory.valuation'), []);
  const reconciliation = useAsync(
    () => api('inventory.reconciliation', { query: debouncedReconQuery }),
    [debouncedReconQuery]
  );
  const movements = useAsync(
    () =>
      api('inventory.movements', {
        variantId: variantFilter?.variantId || null,
        type: movementType,
        from: movementRange?.[0]?.format('YYYY-MM-DD') || null,
        to: movementRange?.[1]?.format('YYYY-MM-DD') || null,
        limit: movementLimit,
      }),
    [variantFilter?.variantId, movementType, movementRange, movementLimit]
  );

  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested) setTab(requested);
  }, [searchParams]);

  useEffect(() => {
    if (adjustOpen) {
      adjustForm.resetFields();
      adjustForm.setFieldsValue({ mode: 'add', quantity: 1 });
    }
  }, [adjustOpen, adjustForm]);

  useEffect(() => {
    if (adjustOpen && adjustMode === 'correct' && adjustRow) {
      adjustForm.setFieldsValue({ actualQuantity: adjustRow.stock });
    }
  }, [adjustMode, adjustOpen, adjustRow, adjustForm]);

  const canAdjust = can('inventory.adjust');
  const canSeeCost = can('reports.profit');
  const stats = summary.data || {};
  const stockRows = stock.data || [];
  const previewBalance = adjustRow
    ? adjustMode === 'correct'
      ? Number(adjustActual ?? adjustRow.stock)
      : adjustRow.stock + (adjustMode === 'remove' ? -Number(adjustQuantity || 0) : Number(adjustQuantity || 0))
    : 0;

  function openAdjust(row) {
    setAdjustRow(row);
    setAdjustOpen(true);
  }

  async function submitAdjust(values) {
    if (!adjustRow) return;
    setSaving(true);
    try {
      const payload = {
        variantId: adjustRow.variantId,
        mode: values.mode,
        reason: values.reason,
        note: values.note || '',
      };
      if (values.mode === 'correct') payload.actualQuantity = values.actualQuantity;
      else payload.quantity = values.quantity;
      if (values.mode === 'remove' && values.movementType) payload.movementType = values.movementType;
      const result = await api('inventory.adjust', payload);
      const verb =
        values.mode === 'add'
          ? `Added ${values.quantity}`
          : values.mode === 'remove'
            ? `Removed ${values.quantity}`
            : `Corrected to ${values.actualQuantity}`;
      message.success(`${verb}. New balance ${result.balanceAfter}. Reference ${result.reference}.`);
      setAdjustOpen(false);
      setAdjustRow(null);
      stock.reload();
      summary.reload();
      movements.reload();
      reconciliation.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function showHistory(row) {
    setVariantFilter({ variantId: row.variantId, label: `${row.productName} · ${row.color} / ${row.size}` });
    setTab('movements');
  }

  const stockPanel = (
    <div>
      <div className="kpi-grid four">
        <Kpi label="Variants tracked" value={Number(stats.variants || 0)} hint={`${Number(stats.units || 0)} units on hand`} />
        <Kpi
          label="Stock value at cost"
          value={canSeeCost ? money(stats.costValuePaise) : 'Restricted'}
          hint={canSeeCost ? 'Weighted-average purchase cost' : 'Cost is hidden for your role'}
        />
        <Kpi
          label="Retail value"
          value={money(stats.retailValuePaise)}
          hint="Current selling price × stock"
          tone="accent"
        />
        <Kpi
          label="Reorder attention"
          value={`${Number(stats.lowStock || 0)} low`}
          hint={`${Number(stats.outOfStock || 0)} out of stock`}
          tone={Number(stats.outOfStock || 0) > 0 ? 'danger' : Number(stats.lowStock || 0) > 0 ? 'warning' : 'success'}
        />
      </div>

      <SectionCard bodyClassName="panel-body flush">
        <div className="filter-bar">
          <Input
            prefix={<SearchOutlined />}
            placeholder="Product, SKU or barcode"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            allowClear
            style={{ maxWidth: 300 }}
          />
          <Select
            allowClear
            placeholder="All categories"
            value={categoryId}
            onChange={setCategoryId}
            options={(categories.data || []).map((category) => ({ value: category.id, label: category.name }))}
            style={{ width: 190 }}
          />
          <label className="inline-check">
            <Select
              value={stockFilter}
              onChange={setStockFilter}
              style={{ width: 170 }}
              options={[
                { value: 'all', label: 'All active stock' },
                { value: 'in', label: 'In stock' },
                { value: 'low', label: 'Low stock' },
                { value: 'out', label: 'Out of stock' },
                { value: 'archived', label: 'Removed products' },
              ]}
            />
          </label>
          <Button icon={<ReloadOutlined />} onClick={() => { stock.reload(); summary.reload(); }} loading={stock.loading}>
            Refresh
          </Button>
        </div>

        {stock.loading && !stock.data ? (
          <LoadingPanel label="Loading stock levels…" />
        ) : stock.error ? (
          <ErrorPanel error={stock.error} onRetry={stock.reload} />
        ) : stockRows.length === 0 ? (
          <EmptyPanel
            title="No stock records"
            description="Add products and receive purchases. Opening stock can be recorded when a product is created."
          />
        ) : (
          <Table
            rowKey="variantId"
            dataSource={stockRows}
            loading={stock.loading}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 25, showSizeChanger: true }}
            columns={[
              {
                title: 'Product',
                dataIndex: 'productName',
                render: (value, row) => (
                  <div>
                    <strong>{value}</strong>
                    <div className="muted small">
                      {row.color} / {row.size} · {row.sku}
                    </div>
                  </div>
                ),
              },
              { title: 'Category', dataIndex: 'categoryName', width: 140, ellipsis: true },
              {
                title: 'Stock',
                dataIndex: 'stock',
                width: 100,
                align: 'right',
                render: (value, row) => (
                  <Space direction="vertical" size={2} style={{ alignItems: 'flex-end' }}>
                    <strong className={value === 0 ? 'text-danger' : value <= row.threshold ? 'text-warning' : ''}>
                      {value}
                    </strong>
                    {value === 0 ? (
                      <Tag color="red">Out</Tag>
                    ) : value <= row.threshold ? (
                      <Tag color="gold">Low</Tag>
                    ) : null}
                  </Space>
                ),
              },
              { title: 'Alert at', dataIndex: 'threshold', width: 90, align: 'right' },
              { title: 'Last updated', dataIndex: 'updatedAt', width: 160, render: formatDateTime },
              ...(canSeeCost
                ? [
                    {
                      title: 'Cost value',
                      dataIndex: 'stockValuePaise',
                      width: 120,
                      align: 'right',
                      render: money,
                    },
                  ]
                : []),
              {
                title: 'Retail value',
                dataIndex: 'retailValuePaise',
                width: 120,
                align: 'right',
                render: money,
              },
              {
                title: '',
                width: 170,
                render: (_, row) => (
                  <Space size={4}>
                    <Button size="small" icon={<HistoryOutlined />} onClick={() => showHistory(row)}>
                      History
                    </Button>
                    {canAdjust && row.productStatus === 'active' ? (
                      <Button size="small" icon={<SwapOutlined />} onClick={() => openAdjust(row)}>
                        Update stock
                      </Button>
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </SectionCard>
    </div>
  );

  const movementsPanel = (
    <SectionCard bodyClassName="panel-body flush">
      <div className="filter-bar">
        {variantFilter ? (
          <Tag closable onClose={() => setVariantFilter(null)}>
            {variantFilter.label}
          </Tag>
        ) : null}
        <Select
          allowClear
          placeholder="All movement types"
          value={movementType}
          onChange={setMovementType}
          options={MOVEMENT_TYPES.map((type) => ({ value: type, label: movementLabel(type) }))}
          style={{ width: 200 }}
        />
        <RangePicker value={movementRange} onChange={setMovementRange} format="DD MMM YYYY" />
        <Select
          value={movementLimit}
          onChange={setMovementLimit}
          options={[100, 200, 500, 1000].map((value) => ({ value, label: `Latest ${value}` }))}
          style={{ width: 130 }}
        />
        <Button icon={<ReloadOutlined />} onClick={movements.reload} loading={movements.loading}>
          Refresh
        </Button>
      </div>
      {movements.loading && !movements.data ? (
        <LoadingPanel label="Loading the stock ledger…" />
      ) : movements.error ? (
        <ErrorPanel error={movements.error} onRetry={movements.reload} />
      ) : (movements.data || []).length === 0 ? (
        <EmptyPanel title="No stock movements" description="Opening stock, purchases, sales and adjustments appear here." />
      ) : (
        <Table
          rowKey="id"
          dataSource={movements.data}
          loading={movements.loading}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 25, showSizeChanger: true }}
          columns={[
            { title: 'When', dataIndex: 'createdAt', width: 160, render: formatDateTime },
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
            { title: 'Movement', dataIndex: 'movementType', width: 150, render: movementLabel },
            {
              title: 'Change',
              dataIndex: 'quantityChange',
              width: 90,
              align: 'right',
              render: (value) => (
                <strong className={value > 0 ? 'text-success' : 'text-danger'}>
                  {value > 0 ? '+' : ''}
                  {value}
                </strong>
              ),
            },
            { title: 'Balance', dataIndex: 'balanceAfter', width: 90, align: 'right' },
            ...(canSeeCost
              ? [{ title: 'Unit cost', dataIndex: 'unitCostPaise', width: 110, align: 'right', render: money }]
              : []),
            {
              title: 'Reference',
              dataIndex: 'referenceNo',
              width: 150,
              render: (value, row) => (
                <div>
                  <span className="mono small">{value}</span>
                  <div className="muted small">{row.reason}</div>
                </div>
              ),
            },
            { title: 'Note', dataIndex: 'note', ellipsis: true },
          ]}
        />
      )}
    </SectionCard>
  );

  const valuationPanel = valuation.loading && !valuation.data ? (
    <LoadingPanel label="Valuing stock…" />
  ) : valuation.error ? (
    <ErrorPanel error={valuation.error} onRetry={valuation.reload} />
  ) : (
    <SectionCard
      title="Stock value by category"
      subtitle="Cost value uses the current weighted-average cost; retail value uses the current selling price."
      extra={
        can('reports.export') ? (
          <Button
            onClick={() => api('export.inventory', {}).then((result) => result && message.success(`Saved: ${result.path}`)).catch((error) => message.error(errorMessage(error)))}
          >
            Export stock CSV
          </Button>
        ) : null
      }
      bodyClassName="panel-body flush"
    >
      <Table
        rowKey="categoryId"
        dataSource={valuation.data || []}
        pagination={false}
        columns={[
          { title: 'Category', dataIndex: 'categoryName' },
          { title: 'Units', dataIndex: 'units', align: 'right', width: 100 },
          ...(canSeeCost
            ? [{ title: 'Cost value', dataIndex: 'costValuePaise', align: 'right', width: 160, render: money }]
            : []),
          { title: 'Retail value', dataIndex: 'retailValuePaise', align: 'right', width: 160, render: money },
        ]}
        summary={() => (
          <Table.Summary>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                {(valuation.data || []).reduce((sum, row) => sum + row.units, 0)}
              </Table.Summary.Cell>
              {canSeeCost ? (
                <Table.Summary.Cell index={2} align="right">
                  {money((valuation.data || []).reduce((sum, row) => sum + row.costValuePaise, 0))}
                </Table.Summary.Cell>
              ) : null}
              <Table.Summary.Cell index={canSeeCost ? 3 : 2} align="right">
                {money((valuation.data || []).reduce((sum, row) => sum + row.retailValuePaise, 0))}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
      <div className="panel-note">
        Costing method: weighted average. Purchases update the variant cost; sales capture the cost at the time of
        sale so historical profit does not change when prices are edited later.
      </div>
    </SectionCard>
  );

  const reconRows = reconciliation.data || [];
  const inconsistent = reconRows.filter((row) => !row.consistent);
  const reconciliationPanel = (
    <SectionCard
      title="Balance vs ledger"
      subtitle="The stock balance must equal the sum of every immutable stock movement."
      extra={
        <Button icon={<ReloadOutlined />} onClick={reconciliation.reload} loading={reconciliation.loading}>
          Recheck
        </Button>
      }
      bodyClassName="panel-body flush"
    >
      <div className="filter-bar">
        <Input
          prefix={<SearchOutlined />}
          placeholder="Product, SKU or barcode"
          value={reconQuery}
          onChange={(event) => setReconQuery(event.target.value)}
          allowClear
          style={{ maxWidth: 300 }}
        />
        {inconsistent.length ? (
          <Tag color="red" icon={<WarningOutlined />}>
            {inconsistent.length} mismatch{inconsistent.length === 1 ? '' : 'es'}
          </Tag>
        ) : (
          <Tag color="green">Balances agree with the ledger</Tag>
        )}
      </div>
      {reconciliation.loading && !reconciliation.data ? (
        <LoadingPanel label="Checking stock balances…" />
      ) : reconciliation.error ? (
        <ErrorPanel error={reconciliation.error} onRetry={reconciliation.reload} />
      ) : (
        <Table
          rowKey="variantId"
          size="small"
          dataSource={reconRows}
          pagination={{ pageSize: 25 }}
          columns={[
            {
              title: 'Product',
              dataIndex: 'productName',
              render: (value, row) => (
                <div>
                  <strong>{value}</strong>
                  <div className="muted small">
                    {row.color} / {row.size} · {row.sku}
                  </div>
                </div>
              ),
            },
            { title: 'Balance', dataIndex: 'stock', width: 100, align: 'right' },
            { title: 'Ledger total', dataIndex: 'ledger', width: 120, align: 'right' },
            {
              title: 'Result',
              dataIndex: 'consistent',
              width: 120,
              render: (value) =>
                value ? <Tag color="green">Consistent</Tag> : <Tag color="red">Mismatch</Tag>,
            },
          ]}
        />
      )}
    </SectionCard>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Stock control"
        title="Inventory"
        subtitle="Products, stock levels and the immutable movement ledger live together. Archived products stay in history but leave the active catalogue."
        extra={
          can('products.manage') ? (
            <Button icon={<ImportOutlined />} onClick={() => navigate('/import')}>
              Import products
            </Button>
          ) : null
        }
      />

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'products', label: 'Products', children: <ProductsPage embedded initialTab="products" initialAction={searchParams.get('new')} /> },
          { key: 'stock', label: 'Stock', children: stockPanel },
          { key: 'movements', label: 'Stock history', children: movementsPanel },
          { key: 'categories', label: 'Categories', children: <ProductsPage embedded initialTab="categories" /> },
          { key: 'archived', label: 'Removed', children: <ProductsPage embedded initialTab="archived" /> },
          { key: 'valuation', label: 'Valuation', children: valuationPanel },
          { key: 'reconciliation', label: 'Reconciliation', children: reconciliationPanel },
        ]}
      />

      <Modal
        title="Update stock"
        open={adjustOpen}
        onCancel={() => {
          setAdjustOpen(false);
          setAdjustRow(null);
        }}
        onOk={() => adjustForm.submit()}
        confirmLoading={saving}
        okText="Record movement"
        destroyOnClose
      >
        {adjustRow ? (
          <div>
            <Alert
              type="info"
              showIcon
              className="detail-alert"
              message={`${adjustRow.productName} · ${adjustRow.color} / ${adjustRow.size}`}
              description={`Current recorded stock: ${adjustRow.stock}. Every change is written to the stock ledger and cannot be deleted.`}
            />
            <Form form={adjustForm} layout="vertical" onFinish={submitAdjust} requiredMark={false}>
              <Form.Item name="mode" label="What happened?" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'add', label: 'Add stock — new items received' },
                    { value: 'correct', label: 'Correct stock — match the actual count' },
                    { value: 'remove', label: 'Remove stock — damaged, missing or removed' },
                  ]}
                />
              </Form.Item>
              {adjustMode === 'correct' ? (
                <Form.Item
                  name="actualQuantity"
                  label="Actual quantity on hand"
                  rules={[{ required: true, message: 'Enter the actual counted quantity.' }]}
                >
                  <InputNumber min={0} max={1000000} style={{ width: '100%' }} />
                </Form.Item>
              ) : (
                <Form.Item
                  name="quantity"
                  label={adjustMode === 'remove' ? 'Quantity to remove' : 'Quantity to add'}
                  rules={[{ required: true, message: 'Enter a quantity.' }]}
                >
                  <InputNumber min={1} max={1000000} style={{ width: '100%' }} />
                </Form.Item>
              )}
              <div className={`panel-note${previewBalance < 0 ? ' text-danger' : ''}`}>
                New balance after this movement: <strong>{previewBalance}</strong>
                {previewBalance < 0 ? ' — stock cannot go below zero.' : ''}
              </div>
              {adjustMode === 'remove' ? (
                <Form.Item name="movementType" label="Reason type">
                  <Select allowClear placeholder="Standard correction" options={[{ value: 'damage', label: 'Damage / loss' }]} />
                </Form.Item>
              ) : null}
              <Form.Item
                name="reason"
                label="Reason"
                rules={[{ required: true, message: 'A reason is required.' }, { max: 200 }]}
              >
                <Input placeholder="e.g. Stock count correction" />
              </Form.Item>
              <Form.Item name="note" label="Note">
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Form>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
