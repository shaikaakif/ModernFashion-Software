import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import {
  DownloadOutlined,
  EyeOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDate, formatDateTime, money, paymentLabel } from '@/app/format';
import { EmptyPanel, ErrorPanel, LoadingPanel, PageHeader, SectionCard, StatusTag } from '@/app/components';
import InvoiceWorkspace from '@/pages/InvoiceWorkspace';

const { RangePicker } = DatePicker;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'void', label: 'Voided' },
];

const PAYMENT_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'credit', label: 'Credit / pay later' },
];

export default function SalesPage() {
  const { can } = useSession();
  const { message } = AntApp.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState([dayjs().subtract(29, 'day'), dayjs()]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidForm] = Form.useForm();
  const [exporting, setExporting] = useState(false);

  const from = range?.[0]?.format('YYYY-MM-DD') || null;
  const to = range?.[1]?.format('YYYY-MM-DD') || null;

  const list = useAsync(
    () =>
      api('sales.list', {
        from,
        to,
        query: debouncedQuery,
        status: status || null,
        paymentMethod: paymentMethod || null,
      }),
    [from, to, debouncedQuery, status, paymentMethod]
  );

  const invoiceParam = searchParams.get('invoice');

  useEffect(() => {
    if (!invoiceParam) return;
    const id = Number(invoiceParam);
    if (!Number.isInteger(id) || id <= 0) return;
    setDetailOpen(true);
    setDetailLoading(true);
    api('sales.get', { id })
      .then((sale) => setDetail(sale))
      .catch((error) => {
        message.error(errorMessage(error));
        setDetailOpen(false);
      })
      .finally(() => setDetailLoading(false));
  }, [invoiceParam, message]);

  const rows = list.data || [];
  const totals = useMemo(
    () =>
      (list.data || []).reduce(
        (accumulator, row) => {
          if (row.status === 'completed') {
            accumulator.count += 1;
            accumulator.value += row.totalPaise;
            accumulator.balance += row.balancePaise;
          }
          return accumulator;
        },
        { count: 0, value: 0, balance: 0 }
      ),
    [list.data]
  );

  async function openSale(id) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await api('sales.get', { id }));
    } catch (error) {
      message.error(errorMessage(error));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetail(null);
    if (invoiceParam) {
      const next = new URLSearchParams(searchParams);
      next.delete('invoice');
      setSearchParams(next, { replace: true });
    }
  }

  async function refreshDetail() {
    if (!detail?.id) return;
    try {
      setDetail(await api('sales.get', { id: detail.id }));
      list.reload();
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function printReceipt({ duplicate = false, a4 = false, widthMm = null } = {}) {
    if (!detail) return;
    setActionBusy(a4 ? 'a4' : 'receipt');
    try {
      if (a4) {
        await api('print.a4', { saleId: detail.id });
        message.success('A4 invoice sent to the printer. Check the printed copy.');
      } else {
        await api('print.receipt', { saleId: detail.id, duplicate, widthMm });
        message.success(
          duplicate
            ? 'Duplicate receipt sent to the printer. Check the printed copy.'
            : 'Receipt sent to the printer. Check the printed copy.'
        );
      }
      await refreshDetail();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setActionBusy('');
    }
  }

  async function savePdf() {
    if (!detail) return;
    setActionBusy('pdf');
    try {
      const result = await api('print.savePdf', { saleId: detail.id });
      message.success(`PDF saved: ${result.path}`, 5);
      await refreshDetail();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setActionBusy('');
    }
  }

  function whatsapp() {
    if (!detail) return;
    const customer = detail.customerName || 'Walk-in customer';
    const phone = detail.customerPhone || 'No saved mobile';
    Modal.confirm({
      title: 'Open WhatsApp Desktop?',
      content: (
        <div>
          <p>
            Recipient: <strong>{customer}</strong> · {phone}
          </p>
          <p>
            The invoice PDF will be generated and the message pre-filled in WhatsApp Desktop. Nothing is sent until
            you verify the recipient and press Send.
          </p>
        </div>
      ),
      okText: 'Open WhatsApp',
      onOk: async () => {
        setActionBusy('whatsapp');
        try {
          const result = await api('print.whatsapp', { saleId: detail.id });
          Modal.info({
            title: result.whatsappOpened ? 'WhatsApp Desktop is ready' : 'Attach the PDF manually',
            content: (
              <div>
                <p>{result.instructions}</p>
                <p className="mono small break-all">{result.path}</p>
              </div>
            ),
            okText: 'Got it',
          });
          await refreshDetail();
        } catch (error) {
          message.error(errorMessage(error));
        } finally {
          setActionBusy('');
        }
      },
    });
  }

  async function submitVoid(values) {
    if (!detail) return;
    setActionBusy('void');
    try {
      const updated = await api('sales.void', { id: detail.id, reason: values.reason });
      setDetail(updated);
      setVoidOpen(false);
      voidForm.resetFields();
      list.reload();
      message.success('Invoice voided and stock returned to inventory.');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setActionBusy('');
    }
  }

  async function exportRegister() {
    setExporting(true);
    try {
      const result = await api('export.sales', { from, to });
      if (result) message.success(`Sales register saved: ${result.path}`, 5);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  if (detailOpen) {
    if (detailLoading) return <LoadingPanel label="Opening the invoice…" />;
    if (!detail) {
      return (
        <div>
          <Button onClick={closeDetail}>Back to invoices</Button>
          <EmptyPanel title="Invoice unavailable" description="Choose another invoice from the list." />
        </div>
      );
    }
    return (
      <div>
        <InvoiceWorkspace
          detail={detail}
          loading={detailLoading}
          actionBusy={actionBusy}
          canPrint={can('sales.print')}
          canVoid={can('sales.void')}
          onBack={closeDetail}
          onPrintReceipt={printReceipt}
          onPrintA4={() => printReceipt({ a4: true })}
          onSavePdf={savePdf}
          onWhatsapp={whatsapp}
          onVoid={() => setVoidOpen(true)}
        />
        <Modal
          title="Void this invoice?"
          open={voidOpen}
          onCancel={() => setVoidOpen(false)}
          onOk={() => voidForm.submit()}
          okText="Void invoice and restock"
          okButtonProps={{ danger: true }}
          confirmLoading={actionBusy === 'void'}
          destroyOnClose
        >
          <Alert
            type="warning"
            showIcon
            className="detail-alert"
            message="This does not delete the sale."
            description="The invoice remains in the ledger as voided, every item is returned to stock, and the reason is written to the activity log."
          />
          <Form form={voidForm} layout="vertical" onFinish={submitVoid} requiredMark={false}>
            <Form.Item
              name="reason"
              label="Reason for voiding"
              rules={[{ required: true, message: 'Record why this invoice is being voided.' }, { max: 300 }]}
            >
              <Input.TextArea rows={3} maxLength={300} showCount />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Billing records"
        title="Invoices"
        subtitle="Every invoice is stored locally with its prices, cashier, payments and stock movements."
        extra={
          <Space wrap>
            {can('reports.export') ? (
              <Button icon={<DownloadOutlined />} onClick={exportRegister} loading={exporting}>
                Export CSV
              </Button>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={list.reload} loading={list.loading}>
              Refresh
            </Button>
          </Space>
        }
      />

      <SectionCard bodyClassName="panel-body flush">
        <div className="filter-bar">
          <RangePicker
            value={range}
            onChange={(value) => setRange(value || [])}
            allowClear={false}
            format="DD MMM YYYY"
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="Invoice number, customer or phone"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            allowClear
            style={{ maxWidth: 320 }}
          />
          <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} style={{ width: 160 }} />
          <Select
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={PAYMENT_OPTIONS}
            style={{ width: 190 }}
          />
          <div className="filter-summary">
            <span>{totals.count} completed invoices</span>
            <strong>{money(totals.value)}</strong>
            {totals.balance > 0 ? <span className="text-warning">Balance {money(totals.balance)}</span> : null}
          </div>
        </div>

        {list.loading && !list.data ? (
          <LoadingPanel label="Loading invoices…" />
        ) : list.error ? (
          <ErrorPanel error={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          <EmptyPanel
            title="No invoices in this period"
            description="Completed sales appear here immediately. Change the date filter or start a new sale."
          />
        ) : (
          <Table
            rowKey="id"
            dataSource={rows}
            loading={list.loading}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (count) => `${count} invoices` }}
            onRow={(row) => ({ onClick: () => openSale(row.id), className: 'clickable-row' })}
            columns={[
              {
                title: 'Invoice',
                dataIndex: 'invoiceNo',
                width: 150,
                render: (value, row) => (
                  <div>
                    <strong>{value}</strong>
                    <div className="muted small">{formatDateTime(row.completedAt)}</div>
                  </div>
                ),
              },
              {
                title: 'Customer',
                dataIndex: 'customerName',
                ellipsis: true,
                render: (value, row) => (
                  <div>
                    <span>{value || 'Walk-in customer'}</span>
                    {row.customerPhone ? <div className="muted small">{row.customerPhone}</div> : null}
                  </div>
                ),
              },
              { title: 'Cashier', dataIndex: 'cashierName', width: 140, ellipsis: true },
              {
                title: 'Payment',
                dataIndex: 'paymentMethod',
                width: 130,
                render: (value) => paymentLabel(value),
              },
              {
                title: 'Status',
                dataIndex: 'status',
                width: 110,
                render: (value, row) => (
                  <Space direction="vertical" size={2}>
                    <StatusTag status={value} />
                    {value === 'completed' && row.paymentStatus !== 'paid' ? (
                      <Tag color={row.paymentStatus === 'partial' ? 'gold' : 'red'}>{row.paymentStatus}</Tag>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: 'Total',
                dataIndex: 'totalPaise',
                width: 120,
                align: 'right',
                render: (value, row) => (
                  <div>
                    <strong>{money(value)}</strong>
                    {row.balancePaise > 0 ? (
                      <div className="muted small">Due {money(row.balancePaise)}</div>
                    ) : null}
                  </div>
                ),
              },
              {
                title: '',
                width: 60,
                align: 'center',
                render: (_, row) => (
                  <Button
                    type="text"
                    icon={<EyeOutlined />}
                    aria-label={`Open invoice ${row.invoiceNo}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      openSale(row.id);
                    }}
                  />
                ),
              },
            ]}
          />
        )}
      </SectionCard>

      <Drawer
        open={detailOpen}
        onClose={closeDetail}
        width={760}
        title={detail ? `Invoice ${detail.invoiceNo}` : 'Invoice'}
        destroyOnClose
        extra={
          detail ? (
            <Space wrap>
              {can('sales.print') ? (
                <>
                  <Button
                    icon={<PrinterOutlined />}
                    loading={actionBusy === 'receipt'}
                    onClick={() => printReceipt({ duplicate: detail.printCount > 0 })}
                  >
                    {detail.printCount > 0 ? 'Print duplicate' : 'Print receipt'}
                  </Button>
                  <Button
                    icon={<PrinterOutlined />}
                    loading={actionBusy === 'a4'}
                    onClick={() => printReceipt({ a4: true })}
                  >
                    A4
                  </Button>
                  <Button icon={<FilePdfOutlined />} loading={actionBusy === 'pdf'} onClick={savePdf}>
                    PDF
                  </Button>
                  <Button icon={<WhatsAppOutlined />} loading={actionBusy === 'whatsapp'} onClick={whatsapp}>
                    WhatsApp
                  </Button>
                </>
              ) : null}
              {can('sales.void') && detail.status === 'completed' ? (
                <Button danger icon={<StopOutlined />} onClick={() => setVoidOpen(true)}>
                  Void
                </Button>
              ) : null}
            </Space>
          ) : null
        }
      >
        {detailLoading ? (
          <LoadingPanel label="Loading the invoice…" />
        ) : detail ? (
          <div>
            {detail.status === 'void' ? (
              <Alert
                type="warning"
                showIcon
                className="detail-alert"
                message={`This invoice was voided${detail.voidedAt ? ` on ${formatDateTime(detail.voidedAt)}` : ''}.`}
                description={detail.voidReason || 'Stock was returned to inventory.'}
              />
            ) : null}

            <div className="invoice-amount-hero">
              <div>
                <span className="eyebrow">Invoice total</span>
                <strong>{money(detail.totalPaise)}</strong>
                <span>
                  {detail.paymentStatus === 'paid'
                    ? `Paid by ${paymentLabel(detail.paymentMethod)}`
                    : `${detail.paymentStatus} · ${money(detail.balancePaise)} due`}
                </span>
              </div>
              <div className="invoice-hero-side">
                <StatusTag status={detail.status} />
                {detail.taxEnabled ? <Tag>Tax {detail.pricesIncludeTax ? 'inclusive' : 'exclusive'}</Tag> : null}
                {detail.printCount > 0 ? <Tag>Printed {detail.printCount}×</Tag> : null}
              </div>
            </div>

            <Descriptions bordered size="small" column={2} className="detail-descriptions">
              <Descriptions.Item label="Business date">{formatDate(detail.businessDate)}</Descriptions.Item>
              <Descriptions.Item label="Completed">{formatDateTime(detail.completedAt)}</Descriptions.Item>
              <Descriptions.Item label="Customer">{detail.customerName || 'Walk-in customer'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{detail.customerPhone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Cashier">{detail.cashierName}</Descriptions.Item>
              <Descriptions.Item label="Payment">{paymentLabel(detail.paymentMethod)}</Descriptions.Item>
              {detail.offerName ? (
                <Descriptions.Item label="Offer / discount" span={2}>
                  {detail.offerName}
                </Descriptions.Item>
              ) : null}
              {detail.notes ? (
                <Descriptions.Item label="Note" span={2}>
                  {detail.notes}
                </Descriptions.Item>
              ) : null}
            </Descriptions>

            <SectionCard title="Items" className="inner-panel" bodyClassName="panel-body flush">
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detail.items || []}
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
                  { title: 'Unit price', dataIndex: 'unitPricePaise', width: 110, align: 'right', render: money },
                  ...(detail.grossProfitPaise !== undefined
                    ? [
                        {
                          title: 'Cost',
                          dataIndex: 'unitCostPaise',
                          width: 100,
                          align: 'right',
                          render: (value, row) => money(value * row.quantity),
                        },
                      ]
                    : []),
                  {
                    title: 'Discount',
                    dataIndex: 'discountPaise',
                    width: 100,
                    align: 'right',
                    render: (value) => (value ? money(value) : '—'),
                  },
                  { title: 'Total', dataIndex: 'lineTotalPaise', width: 110, align: 'right', render: money },
                ]}
                summary={() => (
                  <Table.Summary>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={detail.grossProfitPaise !== undefined ? 5 : 4}>
                        Subtotal
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        {money(detail.subtotalPaise)}
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={detail.grossProfitPaise !== undefined ? 5 : 4}>
                        Discounts
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        − {money(detail.discountTotalPaise)}
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                    {detail.taxEnabled ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={detail.grossProfitPaise !== undefined ? 5 : 4}>
                          Tax {detail.pricesIncludeTax ? '(included)' : ''}
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          {money(detail.taxPaise)}
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null}
                    {detail.roundOffPaise !== 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={detail.grossProfitPaise !== undefined ? 5 : 4}>
                          Round off
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          {money(detail.roundOffPaise)}
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null}
                    <Table.Summary.Row className="summary-total">
                      <Table.Summary.Cell index={0} colSpan={detail.grossProfitPaise !== undefined ? 5 : 4}>
                        Total
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        {money(detail.totalPaise)}
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                    {detail.grossProfitPaise !== undefined && detail.status === 'completed' ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={5}>
                          Gross profit (cost {money(detail.cogsPaise)})
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          <strong>{money(detail.grossProfitPaise)}</strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null}
                  </Table.Summary>
                )}
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
                          <span>{formatDateTime(payment.createdAt)}</span>
                        </div>
                        <strong>{money(payment.amountPaise)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No payment recorded. This invoice is unpaid.</p>
                )}
              </div>
              <div>
                <h3>Printing</h3>
                <p className="muted small">
                  Check the printed copy for paper, cut and print quality. The PDF is saved on this computer.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <EmptyPanel title="Invoice unavailable" description="Close this panel and choose another invoice." />
        )}
      </Drawer>

      <Modal
        title="Void this invoice?"
        open={voidOpen}
        onCancel={() => setVoidOpen(false)}
        onOk={() => voidForm.submit()}
        okText="Void invoice and restock"
        okButtonProps={{ danger: true }}
        confirmLoading={actionBusy === 'void'}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          className="detail-alert"
          message="This does not delete the sale."
          description="The invoice remains in the ledger as voided, every item is returned to stock, and the reason is written to the activity log."
        />
        <Form form={voidForm} layout="vertical" onFinish={submitVoid} requiredMark={false}>
          <Form.Item
            name="reason"
            label="Reason for voiding"
            rules={[{ required: true, message: 'Record why this invoice is being voided.' }, { max: 300 }]}
          >
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
