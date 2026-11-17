import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import {
  DownloadOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDate, formatDateTime, money, paymentLabel } from '@/app/format';
import {
  EmptyPanel,
  ErrorPanel,
  Kpi,
  LoadingPanel,
  MoneyInput,
  PageHeader,
  SectionCard,
  StatusTag,
} from '@/app/components';

const { RangePicker } = DatePicker;

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
];

function ProductPicker({ onPick }) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const results = useAsync(
    () => (debounced.trim().length < 2 ? Promise.resolve([]) : api('inventory.list', { query: debounced, limit: 25 })),
    [debounced]
  );

  return (
    <Select
      showSearch
      value={null}
      filterOption={false}
      searchValue={search}
      onSearch={setSearch}
      loading={results.loading}
      placeholder="Search a product, SKU or barcode to add"
      style={{ width: '100%' }}
      notFoundContent={
        debounced.trim().length < 2 ? <span className="muted">Type at least two characters.</span> : 'No matching variant.'
      }
      options={(results.data || []).map((item) => ({
        value: item.variantId,
        item,
        label: `${item.productName} · ${item.color} / ${item.size} · ${item.sku} (stock ${item.stock})`,
      }))}
      onSelect={(_value, option) => {
        if (option?.item) onPick(option.item);
        setSearch('');
      }}
    />
  );
}

export default function PurchasesPage() {
  const { can } = useSession();
  const { message } = AntApp.useApp();
  const [range, setRange] = useState([dayjs().subtract(59, 'day'), dayjs()]);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [createForm] = Form.useForm();
  const [paymentForm] = Form.useForm();

  const from = range?.[0]?.format('YYYY-MM-DD') || null;
  const to = range?.[1]?.format('YYYY-MM-DD') || null;

  const suppliers = useAsync(() => api('suppliers.list', {}), []);
  const purchases = useAsync(() => api('purchases.list', { from, to, query: debouncedQuery }), [
    from,
    to,
    debouncedQuery,
  ]);

  useEffect(() => {
    if (createOpen) {
      createForm.resetFields();
      setLines([]);
      createForm.setFieldsValue({
        purchaseDate: dayjs(),
        discountPaise: 0,
        additionalCostPaise: 0,
        amountPaidPaise: 0,
        paymentMethod: 'cash',
      });
    }
  }, [createOpen, createForm]);

  useEffect(() => {
    if (paymentOpen && detail) {
      paymentForm.resetFields();
      paymentForm.setFieldsValue({ amountPaise: detail.balancePaise, method: 'cash' });
    }
  }, [paymentOpen, detail, paymentForm]);

  const canManage = can('purchases.manage');
  const canSeeInventory = can('inventory.view');
  const rows = purchases.data || [];
  const outstanding = rows.reduce((sum, row) => sum + (row.status === 'posted' ? row.balancePaise : 0), 0);
  const postedTotal = rows
    .filter((row) => row.status === 'posted')
    .reduce((sum, row) => sum + row.totalPaise, 0);

  const subtotalPaise = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitCostPaise, 0),
    [lines]
  );

  function addLine(item) {
    if (lines.some((line) => line.variantId === item.variantId)) {
      message.info('This variant is already on the purchase. Change its quantity instead.');
      return;
    }
    setLines((current) => [
      ...current,
      {
        variantId: item.variantId,
        productName: item.productName,
        variantLabel: `${item.color} / ${item.size}`,
        sku: item.sku,
        stock: item.stock,
        quantity: 1,
        unitCostPaise: item.costPaise || 0,
      },
    ]);
  }

  function updateLine(variantId, change) {
    setLines((current) =>
      current.map((line) => (line.variantId === variantId ? { ...line, ...change } : line))
    );
  }

  function removeLine(variantId) {
    setLines((current) => current.filter((line) => line.variantId !== variantId));
  }

  async function submitPurchase(values) {
    if (!lines.length) {
      message.warning('Add at least one product to the purchase.');
      return;
    }
    if (lines.some((line) => !line.quantity || line.quantity < 1)) {
      message.warning('Every line needs a quantity of at least one.');
      return;
    }
    if (lines.some((line) => !line.unitCostPaise || line.unitCostPaise < 1)) {
      message.warning('Every line needs a purchase cost greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const created = await api('purchases.create', {
        supplierId: values.supplierId,
        purchaseDate: values.purchaseDate?.format('YYYY-MM-DD'),
        supplierInvoiceRef: values.supplierInvoiceRef || '',
        notes: values.notes || '',
        discountPaise: values.discountPaise || 0,
        additionalCostPaise: values.additionalCostPaise || 0,
        amountPaidPaise: values.amountPaidPaise || 0,
        paymentMethod: values.paymentMethod || 'cash',
        paymentReference: values.paymentReference || '',
        items: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitCostPaise: line.unitCostPaise,
        })),
      });
      message.success(`Purchase ${created.reference} posted. Stock and weighted cost updated.`);
      setCreateOpen(false);
      purchases.reload();
      setDetail(created);
      setDetailOpen(true);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await api('purchases.get', { id }));
    } catch (error) {
      message.error(errorMessage(error));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitPayment(values) {
    if (!detail) return;
    setPaymentSaving(true);
    try {
      const updated = await api('purchases.payment', {
        id: detail.id,
        amountPaise: values.amountPaise,
        method: values.method,
        reference: values.reference || '',
      });
      setDetail(updated);
      setPaymentOpen(false);
      purchases.reload();
      message.success('Supplier payment recorded.');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setPaymentSaving(false);
    }
  }

  async function exportPurchases() {
    setExporting(true);
    try {
      const result = await api('export.purchases', { from, to });
      if (result) message.success(`Purchase register saved: ${result.path}`, 5);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Stock acquisitions"
        title="Purchases"
        subtitle="A purchase brings stock in and updates the weighted-average cost. Purchases are inventory, not operating expenses."
        extra={
          <Space wrap>
            {can('reports.export') ? (
              <Button icon={<DownloadOutlined />} onClick={exportPurchases} loading={exporting}>
                Export CSV
              </Button>
            ) : null}
            {canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                New purchase
              </Button>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={purchases.reload} loading={purchases.loading}>
              Refresh
            </Button>
          </Space>
        }
      />

      <div className="kpi-grid three">
        <Kpi label="Purchases in view" value={rows.length} hint={`${rows.filter((row) => row.status === 'posted').length} posted`} />
        <Kpi label="Purchase value" value={money(postedTotal)} hint="Posted entries in this period" />
        <Kpi
          label="Outstanding to suppliers"
          value={money(outstanding)}
          hint="Balance on posted purchases in view"
          tone={outstanding > 0 ? 'warning' : 'success'}
        />
      </div>

      <SectionCard bodyClassName="panel-body flush">
        <div className="filter-bar">
          <RangePicker value={range} onChange={(value) => setRange(value || [])} allowClear={false} format="DD MMM YYYY" />
          <Input
            prefix={<SearchOutlined />}
            placeholder="Reference, supplier invoice or supplier"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            allowClear
            style={{ maxWidth: 340 }}
          />
        </div>

        {purchases.loading && !purchases.data ? (
          <LoadingPanel label="Loading purchases…" />
        ) : purchases.error ? (
          <ErrorPanel error={purchases.error} onRetry={purchases.reload} />
        ) : rows.length === 0 ? (
          <EmptyPanel
            title="No purchases in this period"
            description="Record a supplier bill to bring real stock into the local ledger."
            action={
              canManage ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  Record a purchase
                </Button>
              ) : null
            }
          />
        ) : (
          <Table
            rowKey="id"
            dataSource={rows}
            loading={purchases.loading}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            onRow={(row) => ({ onClick: () => openDetail(row.id), className: 'clickable-row' })}
            columns={[
              {
                title: 'Reference',
                dataIndex: 'reference',
                width: 160,
                render: (value, row) => (
                  <div>
                    <strong>{value}</strong>
                    <div className="muted small">{formatDate(row.purchaseDate)}</div>
                  </div>
                ),
              },
              {
                title: 'Supplier',
                dataIndex: 'supplierName',
                render: (value, row) => (
                  <div>
                    <span>{value}</span>
                    {row.supplierInvoiceRef ? <div className="muted small">Bill {row.supplierInvoiceRef}</div> : null}
                  </div>
                ),
              },
              { title: 'Total', dataIndex: 'totalPaise', width: 130, align: 'right', render: money },
              { title: 'Paid', dataIndex: 'amountPaidPaise', width: 120, align: 'right', render: money },
              {
                title: 'Balance',
                dataIndex: 'balancePaise',
                width: 120,
                align: 'right',
                render: (value) => <span className={value > 0 ? 'text-warning' : ''}>{money(value)}</span>,
              },
              {
                title: 'Payment',
                dataIndex: 'paymentStatus',
                width: 110,
                render: (value) => (
                  <Tag color={value === 'paid' ? 'green' : value === 'partial' ? 'gold' : 'red'}>{value}</Tag>
                ),
              },
              {
                title: 'Status',
                dataIndex: 'status',
                width: 100,
                render: (value) => <StatusTag status={value} />,
              },
              {
                title: '',
                width: 50,
                render: (_, row) => (
                  <Button
                    type="text"
                    icon={<EyeOutlined />}
                    aria-label={`Open ${row.reference}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      openDetail(row.id);
                    }}
                  />
                ),
              },
            ]}
          />
        )}
      </SectionCard>

      <Modal
        title="New purchase"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={saving}
        okText="Post purchase"
        width={980}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={submitPurchase} requiredMark={false}>
          <div className="form-grid three">
            <Form.Item name="supplierId" label="Supplier" rules={[{ required: true, message: 'Choose a supplier.' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Choose the supplier"
                options={(suppliers.data || []).map((supplier) => ({
                  value: supplier.id,
                  label: supplier.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="purchaseDate" label="Bill date" rules={[{ required: true, message: 'Choose a date.' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="supplierInvoiceRef" label="Supplier invoice number">
              <Input maxLength={120} placeholder="Optional" />
            </Form.Item>
          </div>

          <Form.Item label="Products received" required>
            {canSeeInventory ? (
              <ProductPicker onPick={addLine} />
            ) : (
              <Alert type="warning" showIcon message="Stock search needs inventory view permission." />
            )}
          </Form.Item>

          <Table
            rowKey="variantId"
            size="small"
            pagination={false}
            dataSource={lines}
            locale={{ emptyText: 'Search above to add the products received on this bill.' }}
            columns={[
              {
                title: 'Product',
                render: (_, row) => (
                  <div>
                    <strong>{row.productName}</strong>
                    <div className="muted small">
                      {row.variantLabel} · {row.sku} · stock {row.stock}
                    </div>
                  </div>
                ),
              },
              {
                title: 'Qty',
                width: 100,
                render: (_, row) => (
                  <InputNumber
                    min={1}
                    max={1000000}
                    value={row.quantity}
                    onChange={(value) => updateLine(row.variantId, { quantity: Number(value) || 1 })}
                    style={{ width: 80 }}
                  />
                ),
              },
              {
                title: 'Unit cost (₹)',
                width: 160,
                render: (_, row) => (
                  <MoneyInput
                    value={row.unitCostPaise}
                    onChange={(paise) => updateLine(row.variantId, { unitCostPaise: paise })}
                    aria-label={`Unit cost for ${row.productName}`}
                  />
                ),
              },
              {
                title: 'Amount',
                width: 120,
                align: 'right',
                render: (_, row) => <strong>{money(row.quantity * row.unitCostPaise)}</strong>,
              },
              {
                title: '',
                width: 50,
                render: (_, row) => (
                  <Button danger type="text" onClick={() => removeLine(row.variantId)}>
                    Remove
                  </Button>
                ),
              },
            ]}
          />

          <div className="purchase-footer-grid">
            <div>
              <div className="form-grid two">
                <Form.Item name="discountPaise" label="Bill discount (₹)">
                  <MoneyInput />
                </Form.Item>
                <Form.Item
                  name="additionalCostPaise"
                  label="Additional cost (₹)"
                  extra="Freight, packing or other cost to include in landed cost."
                >
                  <MoneyInput />
                </Form.Item>
              </div>
              <Form.Item name="notes" label="Notes">
                <Input.TextArea rows={2} maxLength={1000} />
              </Form.Item>
            </div>
            <div className="purchase-summary">
              <div>
                <span>Subtotal</span>
                <strong>{money(subtotalPaise)}</strong>
              </div>
              <div>
                <span>Lines</span>
                <strong>{lines.reduce((sum, line) => sum + line.quantity, 0)} units</strong>
              </div>
              <p className="muted small">
                Tax and landed cost are calculated by the local service when posted. The final supplier total
                appears on the saved purchase.
              </p>
            </div>
          </div>

          <div className="form-grid three">
            <Form.Item name="amountPaidPaise" label="Amount paid now (₹)">
              <MoneyInput />
            </Form.Item>
            <Form.Item name="paymentMethod" label="Payment method">
              <Select options={PAYMENT_METHODS} />
            </Form.Item>
            <Form.Item name="paymentReference" label="Payment reference">
              <Input maxLength={120} placeholder="Optional" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Drawer
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        width={820}
        title={detail?.reference || 'Purchase'}
        destroyOnClose
        extra={
          detail && canManage && detail.balancePaise > 0 && detail.status === 'posted' ? (
            <Button type="primary" icon={<WalletOutlined />} onClick={() => setPaymentOpen(true)}>
              Record payment
            </Button>
          ) : null
        }
      >
        {detailLoading ? (
          <LoadingPanel label="Loading purchase…" />
        ) : detail ? (
          <div>
            <div className="invoice-amount-hero">
              <div>
                <span className="eyebrow">Purchase total</span>
                <strong>{money(detail.totalPaise)}</strong>
                <span>
                  Paid {money(detail.amountPaidPaise)} · balance {money(detail.balancePaise)}
                </span>
              </div>
              <Space direction="vertical" align="end">
                <StatusTag status={detail.status} />
                <Tag color={detail.paymentStatus === 'paid' ? 'green' : detail.paymentStatus === 'partial' ? 'gold' : 'red'}>
                  {detail.paymentStatus}
                </Tag>
              </Space>
            </div>

            <Descriptions bordered size="small" column={2} className="detail-descriptions">
              <Descriptions.Item label="Supplier">{detail.supplierName}</Descriptions.Item>
              <Descriptions.Item label="Supplier phone">{detail.supplierPhone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Bill date">{formatDate(detail.purchaseDate)}</Descriptions.Item>
              <Descriptions.Item label="Supplier invoice">{detail.supplierInvoiceRef || '—'}</Descriptions.Item>
              <Descriptions.Item label="Recorded by">{detail.createdByName}</Descriptions.Item>
              <Descriptions.Item label="Recorded at">{formatDateTime(detail.createdAt)}</Descriptions.Item>
              {detail.notes ? (
                <Descriptions.Item label="Notes" span={2}>
                  {detail.notes}
                </Descriptions.Item>
              ) : null}
            </Descriptions>

            <SectionCard title="Items received" className="inner-panel" bodyClassName="panel-body flush">
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detail.items || []}
                scroll={{ x: 700 }}
                columns={[
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
                  { title: 'Qty', dataIndex: 'quantity', width: 60, align: 'right' },
                  { title: 'Unit cost', dataIndex: 'unitCostPaise', width: 110, align: 'right', render: money },
                  {
                    title: 'Discount',
                    dataIndex: 'discountPaise',
                    width: 100,
                    align: 'right',
                    render: (value) => (value ? money(value) : '—'),
                  },
                  {
                    title: 'Extra cost',
                    dataIndex: 'additionalCostPaise',
                    width: 100,
                    align: 'right',
                    render: (value) => (value ? money(value) : '—'),
                  },
                  { title: 'Tax', dataIndex: 'taxPaise', width: 100, align: 'right', render: money },
                  { title: 'Line total', dataIndex: 'lineTotalPaise', width: 120, align: 'right', render: money },
                ]}
              />
            </SectionCard>

            <div className="detail-grid">
              <div>
                <h3>Payments</h3>
                {(detail.payments || []).length ? (
                  <div className="stack-list">
                    {detail.payments.map((payment) => (
                      <div className="list-row" key={payment.id}>
                        <div>
                          <strong>{paymentLabel(payment.method)}</strong>
                          <span>{formatDateTime(payment.paidAt)} · {payment.createdByName}</span>
                        </div>
                        <strong>{money(payment.amountPaise)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No supplier payment recorded.</p>
                )}
              </div>
              <div>
                <h3>Costing</h3>
                <p className="muted small">
                  Stock was increased once for each line. The variant cost was recalculated using weighted average,
                  including allocated bill discount and additional landed cost.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <EmptyPanel title="Purchase unavailable" />
        )}
      </Drawer>

      <Modal
        title="Record supplier payment"
        open={paymentOpen}
        onCancel={() => setPaymentOpen(false)}
        onOk={() => paymentForm.submit()}
        confirmLoading={paymentSaving}
        okText="Record payment"
        destroyOnClose
      >
        {detail ? (
          <p className="modal-note">
            Outstanding balance for <strong>{detail.reference}</strong> is{' '}
            <strong>{money(detail.balancePaise)}</strong>.
          </p>
        ) : null}
        <Form form={paymentForm} layout="vertical" onFinish={submitPayment} requiredMark={false}>
          <Form.Item name="amountPaise" label="Amount (₹)" rules={[{ required: true, message: 'Enter an amount.' }]}>
            <MoneyInput />
          </Form.Item>
          <Form.Item name="method" label="Method" rules={[{ required: true }]}>
            <Select options={PAYMENT_METHODS} />
          </Form.Item>
          <Form.Item name="reference" label="Reference">
            <Input maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
