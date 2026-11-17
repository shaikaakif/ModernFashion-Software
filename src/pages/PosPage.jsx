import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App as AntApp,
  Alert,
  Button,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import {
  BarcodeOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  PrinterOutlined,
  SearchOutlined,
  UserAddOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import { addToCart, cartGrossPaise, cartQuantity, cartToPayload, removeLine, setQuantity } from '@shared/cart.js';
import { computeCartTotals, pickBestOffer, toPaise } from '@shared/money.js';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDateTime, money, moneyPlain, paymentLabel, statusColor } from '@/app/format';
import { LoadingPanel, PageHeader } from '@/app/components';

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'credit', label: 'Credit / pay later' },
];

export default function PosPage() {
  const { can } = useSession();
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();
  const bootstrapAsync = useAsync(() => api('sales.bootstrap'), []);
  const { data: bootstrap, loading, error, reload } = bootstrapAsync;
  const [cart, setCart] = useState([]);
  const [scan, setScan] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [billDiscount, setBillDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [lastPrinted, setLastPrinted] = useState(false);
  const scanRef = useRef(null);
  const idempotencyRef = useRef(newIdempotencyKey());

  const taxEnabled = Boolean(bootstrap?.settings?.tax?.enabled);
  const inclusiveTax = taxEnabled && Boolean(bootstrap?.settings?.tax?.pricesIncludeTax);
  const subtotalPaise = cartGrossPaise(cart);
  const autoOffer = useMemo(() => {
    if (!bootstrap) return null;
    return pickBestOffer(bootstrap.offers, subtotalPaise, bootstrap.businessDate);
  }, [bootstrap, subtotalPaise]);
  const manualDiscountPaise = toPaise(billDiscount || 0);
  const appliedDiscountPaise = Math.max(manualDiscountPaise, autoOffer?.discountPaise || 0);
  const totals = useMemo(
    () =>
      computeCartTotals(
        cart.map((line) => ({
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          taxRateBp: taxEnabled ? line.taxRateBp : 0,
          lineDiscountBp: 0,
        })),
        { billDiscountPaise: appliedDiscountPaise, roundToRupee: true, pricesIncludeTax: inclusiveTax }
      ),
    [cart, appliedDiscountPaise, taxEnabled, inclusiveTax]
  );

  useEffect(() => {
    if (!amountTouched) {
      if (paymentMethod === 'credit') setAmountReceived(cart.length ? '0.00' : '');
      else setAmountReceived(totals.totalPaise > 0 ? moneyPlain(totals.totalPaise) : '');
    }
  }, [totals.totalPaise, amountTouched, paymentMethod, cart.length]);

  useEffect(() => {
    if (bootstrap?.settings?.pos?.defaultPaymentMethod) setPaymentMethod(bootstrap.settings.pos.defaultPaymentMethod);
  }, [bootstrap?.settings?.pos?.defaultPaymentMethod]);

  useEffect(() => {
    if (!lastSale) scanRef.current?.focus();
  }, [lastSale]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        scanRef.current?.focus();
      }
      if (event.key === 'F8' && !submitting && !lastSale) {
        event.preventDefault();
        document.getElementById('pos-complete')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, lastSale]);

  const focusScan = useCallback(() => {
    requestAnimationFrame(() => scanRef.current?.focus());
  }, []);

  const addItem = useCallback(
    (item) => {
      const result = addToCart(cart, item);
      if (!result.added) {
        message.warning(result.reason);
        focusScan();
        return false;
      }
      setCart(result.lines);
      setSearchResults([]);
      setScan('');
      focusScan();
      return true;
    },
    [cart, focusScan, message]
  );

  async function handleScan(rawValue) {
    const code = String(rawValue ?? scan).trim();
    if (!code) return;
    setSearching(true);
    try {
      const item = await api('catalog.posLookup', { code });
      addItem(item);
    } catch (lookupError) {
      if (lookupError?.code === 'NOT_FOUND') {
        try {
          const results = await api('catalog.posSearch', { query: code });
          setSearchResults(results);
          setScan('');
          if (results.length) {
            message.info('No exact barcode or SKU match. Choose a product from the results.');
          } else {
            message.warning(`No product found for “${code}”. Check the barcode and try again.`);
          }
        } catch (searchError) {
          message.error(errorMessage(searchError));
        }
      } else {
        message.error(errorMessage(lookupError));
      }
    } finally {
      setSearching(false);
      focusScan();
    }
  }

  async function runSearch() {
    const text = scan.trim();
    if (text.length < 2) {
      message.info('Type at least two characters to search, or scan a barcode.');
      return;
    }
    setSearching(true);
    try {
      const results = await api('catalog.posSearch', { query: text });
      setSearchResults(results);
      if (!results.length) message.info('No active products match this search.');
    } catch (searchError) {
      message.error(errorMessage(searchError));
    } finally {
      setSearching(false);
      focusScan();
    }
  }

  function updateQuantity(line, quantity) {
    setCart(setQuantity(cart, line.variantId, quantity));
  }

  function clearCart() {
    const doClear = () => {
      setCart([]);
      setBillDiscount(0);
      setCustomer(null);
      setNotes('');
      setAmountTouched(false);
      setLastSale(null);
      idempotencyRef.current = newIdempotencyKey();
      focusScan();
    };
    if (bootstrap?.settings?.pos?.confirmClearCart !== false && cart.length) {
      modal.confirm({
        title: 'Clear this bill?',
        content: 'The cart, customer and discount will be removed. No sale has been saved yet.',
        okText: 'Clear bill',
        okButtonProps: { danger: true },
        onOk: doClear,
      });
    } else {
      doClear();
    }
  }

  function choosePayment(value) {
    setPaymentMethod(value);
    setAmountTouched(false);
    if (value === 'credit') setAmountReceived('0.00');
    else setAmountReceived(moneyPlain(totals.totalPaise));
  }

  async function completeSale() {
    if (!cart.length) {
      message.warning('Add at least one product to the bill.');
      focusScan();
      return;
    }
    if (paymentMethod !== 'credit' && toPaise(amountReceived || 0) < totals.totalPaise) {
      message.error('Amount received is less than the total. Choose Credit / pay later for a partial payment.');
      return;
    }
    if (manualDiscountPaise > 0 && !can('sales.discount')) {
      message.error('Your account cannot apply a manual discount.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api('sales.complete', {
        idempotencyKey: idempotencyRef.current,
        items: cartToPayload(cart),
        customerId: customer?.id || null,
        customerName: customer?.id ? undefined : customer?.name || undefined,
        customerPhone: customer?.id ? undefined : customer?.phone || undefined,
        billDiscountPaise: manualDiscountPaise,
        notes,
        paymentMethod,
        amountPaidPaise: toPaise(amountReceived || 0),
        allowPartial: paymentMethod === 'credit',
      });
      setLastSale(result.sale);
      setLastPrinted(false);
      setCart([]);
      setCustomer(null);
      setBillDiscount(0);
      setNotes('');
      setAmountTouched(false);
      idempotencyRef.current = newIdempotencyKey();
      reload();

      if (bootstrap?.settings?.hardware?.autoPrintReceipt) {
        if (!bootstrap?.settings?.hardware?.receiptPrinter) {
          message.info('Sale saved. No receipt printer is assigned in Settings, so nothing was printed.');
        } else {
          setReceiptBusy(true);
          try {
            await api('print.receipt', { saleId: result.sale.id, duplicate: false });
            setLastPrinted(true);
            message.success('Sale saved and sent to the Windows receipt printer.');
          } catch (printError) {
            message.warning(
              `Sale saved successfully, but the receipt did not print: ${errorMessage(printError)} The invoice is safe; use Print receipt to retry.`
            );
          } finally {
            setReceiptBusy(false);
          }
        }
      } else {
        message.success(`Sale ${result.sale.invoiceNo} saved.`);
      }
    } catch (saleError) {
      message.error(errorMessage(saleError));
    } finally {
      setSubmitting(false);
    }
  }

  async function printLastSale() {
    if (!lastSale) return;
    setReceiptBusy(true);
    try {
      await api('print.receipt', { saleId: lastSale.id, duplicate: lastPrinted || lastSale.printCount > 0 });
      setLastPrinted(true);
      message.success('Receipt sent to the Windows printer driver. Verify the physical copy.');
    } catch (printError) {
      message.error(errorMessage(printError));
    } finally {
      setReceiptBusy(false);
    }
  }

  async function savePdf() {
    if (!lastSale) return;
    try {
      const result = await api('print.savePdf', { saleId: lastSale.id });
      message.success(`PDF saved: ${result.path}`);
    } catch (pdfError) {
      message.error(errorMessage(pdfError));
    }
  }

  function whatsapp() {
    if (!lastSale) return;
    const customer = lastSale.customerName || 'Walk-in customer';
    const phone = lastSale.customerPhone || 'No saved mobile';
    modal.confirm({
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
        try {
          const result = await api('print.whatsapp', { saleId: lastSale.id });
          modal.info({
            title: result.whatsappOpened ? 'WhatsApp Desktop is ready' : 'Attach the PDF manually',
            content: (
              <div>
                <p>{result.instructions}</p>
                <p className="mono small break-all">{result.path}</p>
              </div>
            ),
            okText: 'Got it',
          });
        } catch (shareError) {
          message.error(errorMessage(shareError));
        }
      },
    });
  }

  if (loading && !bootstrap) return <LoadingPanel label="Preparing the billing counter…" />;
  if (error && !bootstrap) return <Alert type="error" showIcon message={errorMessage(error)} />;
  if (!bootstrap) return null;

  const canDiscount = Boolean(bootstrap.canDiscount);
  const maxDiscountPercent = Number(bootstrap.settings.pos.manualDiscountMaxPercent || 0);
  const changePaise = Math.max(0, toPaise(amountReceived || 0) - totals.totalPaise);
  const balancePaise = Math.max(0, totals.totalPaise - toPaise(amountReceived || 0));

  return (
    <div className="pos-page">
      <PageHeader
        eyebrow={`${bootstrap.businessDate} · ${bootstrap.cashier.roleCode === 'owner' ? 'Owner counter' : 'Cash shift'}`}
        title="New sale"
        subtitle="Scan a barcode and press Enter. Scanning the same product again increases its quantity."
        extra={
          <div className="pos-head-meta">
            <Tag color="green">Scanner ready</Tag>
            <span className="muted small">F2 scan field · F8 complete</span>
          </div>
        }
      />

      <div className="pos-shell">
        <div className="pos-main">
          <div className="scan-bar">
            <Input
              ref={scanRef}
              size="large"
              prefix={<BarcodeOutlined />}
              placeholder="Scan barcode / SKU, or type a product name and press Enter"
              value={scan}
              onChange={(event) => setScan(event.target.value)}
              onPressEnter={() => handleScan()}
              suffix={
                <Button type="text" size="small" icon={<SearchOutlined />} loading={searching} onClick={runSearch}>
                  Search
                </Button>
              }
              autoFocus
              spellCheck={false}
              aria-label="Scan barcode or search products"
            />
            <div className="scan-hint">
              Next invoice <strong>{bootstrap.nextInvoiceNumber}</strong> · Prices are authoritative in the local database.
            </div>
          </div>

          {searchResults.length ? (
            <div className="search-results">
              <div className="search-results-head">
                <strong>{searchResults.length} matches</strong>
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setSearchResults([])}>
                  Close
                </Button>
              </div>
              <div className="search-result-list">
                {searchResults.map((item) => (
                  <button
                    type="button"
                    key={item.variantId}
                    className="search-result"
                    onClick={() => addItem(item)}
                  >
                    <div>
                      <strong>{item.productName}</strong>
                      <span>
                        {item.color} / {item.size} · {item.sku}
                      </span>
                    </div>
                    <div className="search-result-side">
                      <strong>{money(item.pricePaise)}</strong>
                      <Tag color={item.stock > 0 ? 'default' : 'red'}>{item.stock} in stock</Tag>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="cart-panel">
            <div className="cart-panel-head">
              <div>
                <h2>Current bill</h2>
                <span className="muted">
                  {cartQuantity(cart)} unit{cartQuantity(cart) === 1 ? '' : 's'} · {cart.length} line
                  {cart.length === 1 ? '' : 's'}
                </span>
              </div>
              <Button danger type="text" disabled={!cart.length} onClick={clearCart}>
                Clear bill
              </Button>
            </div>
            <Table
              className="pos-cart-table"
              rowKey="variantId"
              dataSource={cart}
              pagination={false}
              size="middle"
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Scan a barcode to start the bill. Manual search is available above."
                  />
                ),
              }}
              columns={[
                {
                  title: 'Product',
                  dataIndex: 'productName',
                  render: (value, row) => (
                    <div className="cart-product">
                      <strong>{value}</strong>
                      <span>
                        {row.color} / {row.size} · {row.sku}
                      </span>
                      <small>
                        {row.availableStock} in stock
                        {row.availableStock <= row.lowStockThreshold ? <Tag color="gold">Low stock</Tag> : null}
                      </small>
                    </div>
                  ),
                },
                {
                  title: 'Qty',
                  width: 110,
                  align: 'center',
                  render: (_, row) => (
                    <InputNumber
                      min={1}
                      max={Math.max(1, row.availableStock)}
                      value={row.quantity}
                      onChange={(value) => updateQuantity(row, value)}
                      onPressEnter={focusScan}
                      style={{ width: 78 }}
                      aria-label={`Quantity for ${row.productName}`}
                    />
                  ),
                },
                {
                  title: 'Unit price',
                  dataIndex: 'unitPricePaise',
                  align: 'right',
                  width: 130,
                  render: money,
                },
                {
                  title: 'Amount',
                  align: 'right',
                  width: 130,
                  render: (_, row) => <strong>{money(row.unitPricePaise * row.quantity)}</strong>,
                },
                {
                  title: '',
                  width: 52,
                  align: 'center',
                  render: (_, row) => (
                    <Tooltip title="Remove line">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setCart(removeLine(cart, row.variantId))}
                        aria-label={`Remove ${row.productName}`}
                      />
                    </Tooltip>
                  ),
                },
              ]}
            />
          </div>
        </div>

        <aside className="pos-side">
          <div className="pos-total-card">
            <div className="pos-total-head">
              <span className="eyebrow">Payment</span>
              <strong>Bill summary</strong>
            </div>

            <Button icon={<UserOutlined />} block className="customer-button" onClick={() => setCustomerOpen(true)}>
              {customer?.name || 'Walk-in customer'}
              {customer?.phone ? <span className="muted"> · {customer.phone}</span> : null}
            </Button>

            <div className="total-rows">
              <div>
                <span>Subtotal</span>
                <strong>{money(totals.subtotalPaise)}</strong>
              </div>
              {autoOffer && manualDiscountPaise <= autoOffer.discountPaise ? (
                <div className="offer-row">
                  <span>{autoOffer.reason}</span>
                  <strong>- {money(autoOffer.discountPaise)}</strong>
                </div>
              ) : null}
              {manualDiscountPaise > 0 ? (
                <div>
                  <span>Manual discount</span>
                  <strong>- {money(manualDiscountPaise)}</strong>
                </div>
              ) : null}
              {taxEnabled ? (
                <div>
                  <span>Tax {inclusiveTax ? '(included)' : ''}</span>
                  <strong>{money(totals.taxPaise)}</strong>
                </div>
              ) : null}
              {totals.roundOffPaise !== 0 ? (
                <div>
                  <span>Round off</span>
                  <strong>{money(totals.roundOffPaise)}</strong>
                </div>
              ) : null}
            </div>

            <div className="grand-total">
              <span>Total payable</span>
              <strong>{money(totals.totalPaise)}</strong>
            </div>

            {canDiscount ? (
              <div className="discount-box">
                <label htmlFor="pos-discount">Manual bill discount (₹)</label>
                <InputNumber
                  id="pos-discount"
                  min={0}
                  precision={2}
                  value={billDiscount}
                  onChange={(value) => setBillDiscount(value || 0)}
                  style={{ width: '100%' }}
                  placeholder="0.00"
                />
                <small>
                  Limit {maxDiscountPercent}% of subtotal. Automatic offers are applied only when better.
                </small>
              </div>
            ) : null}

            <Divider className="pos-divider" />

            <label className="field-label" htmlFor="pos-payment">
              Payment method
            </label>
            <Select
              id="pos-payment"
              value={paymentMethod}
              onChange={choosePayment}
              options={PAYMENT_OPTIONS}
              style={{ width: '100%' }}
            />

            <label className="field-label" htmlFor="pos-received">
              Amount received (₹)
            </label>
            <InputNumber
              id="pos-received"
              min={0}
              precision={2}
              value={amountReceived === '' ? null : Number(amountReceived)}
              onChange={(value) => {
                setAmountTouched(true);
                setAmountReceived(value === null || value === undefined ? '' : String(value));
              }}
              onPressEnter={completeSale}
              style={{ width: '100%' }}
              placeholder={moneyPlain(totals.totalPaise)}
            />

            <div className="change-row">
              <span>{balancePaise > 0 ? 'Balance due' : 'Change'}</span>
              <strong className={balancePaise > 0 ? 'text-danger' : 'text-success'}>
                {money(balancePaise > 0 ? balancePaise : changePaise)}
              </strong>
            </div>

            <label className="field-label" htmlFor="pos-notes">
              Bill note (optional)
            </label>
            <Input.TextArea
              id="pos-notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Visible in the invoice record and audit trail"
            />

            <Button
              id="pos-complete"
              type="primary"
              size="large"
              block
              className="complete-button"
              icon={<CheckCircleOutlined />}
              loading={submitting}
              disabled={!cart.length || receiptBusy}
              onClick={completeSale}
            >
              Complete sale · {money(totals.totalPaise)}
            </Button>
            <div className="pos-safe-note">
              The sale, payment and stock movement are saved together. A printing failure never creates a second
              sale.
            </div>
          </div>

          <div className="pos-cashier-note">
            <strong>{bootstrap.cashier.name}</strong>
            <span>Every invoice records this signed-in cashier.</span>
          </div>
        </aside>
      </div>

      <CustomerModal
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onSelect={(value) => {
          setCustomer(value);
          setCustomerOpen(false);
        }}
        canManage={can('customers.manage')}
      />

      <Modal
        open={Boolean(lastSale)}
        title={lastSale ? `Sale saved · ${lastSale.invoiceNo}` : ''}
        onCancel={() => {
          setLastSale(null);
          focusScan();
        }}
        footer={null}
        width={520}
        className="sale-success-modal"
      >
        {lastSale ? (
          <div>
            <div className="success-hero">
              <CheckCircleOutlined />
              <div>
                <strong>{money(lastSale.totalPaise)}</strong>
                <span>
                  {lastSale.paymentStatus === 'paid'
                    ? `Paid by ${paymentLabel(lastSale.paymentMethod)}`
                    : `Balance ${money(lastSale.balancePaise)}`}
                  {lastSale.changePaise > 0 ? ` · Change ${money(lastSale.changePaise)}` : ''}
                </span>
              </div>
            </div>
            <div className="sale-meta-grid">
              <div>
                <span>Invoice</span>
                <strong>{lastSale.invoiceNo}</strong>
              </div>
              <div>
                <span>Time</span>
                <strong>{formatDateTime(lastSale.completedAt)}</strong>
              </div>
              <div>
                <span>Status</span>
                <Tag color={statusColor(lastSale.status)}>{lastSale.status}</Tag>
              </div>
            </div>
            {lastSale.items?.length ? (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={lastSale.items}
                columns={[
                  { title: 'Item', dataIndex: 'productName', render: (value, row) => `${value} · ${row.variantLabel}` },
                  { title: 'Qty', dataIndex: 'quantity', align: 'right', width: 60 },
                  { title: 'Amount', dataIndex: 'lineTotalPaise', align: 'right', render: money, width: 100 },
                ]}
              />
            ) : null}
            <div className="success-actions">
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                loading={receiptBusy}
                onClick={printLastSale}
              >
                {lastPrinted ? 'Print duplicate' : 'Print receipt'}
              </Button>
              <Button onClick={savePdf}>Save PDF</Button>
              <Button icon={<WhatsAppOutlined />} onClick={whatsapp}>
                WhatsApp
              </Button>
              <Button
                onClick={() => {
                  const id = lastSale.id;
                  setLastSale(null);
                  navigate(`/sales?invoice=${id}`);
                }}
              >
                Open invoice
              </Button>
              <Button
                onClick={() => {
                  setLastSale(null);
                  focusScan();
                }}
              >
                New sale
              </Button>
            </div>
            <p className="muted small">
              The print action reports whether the Windows driver accepted the job. Check the physical receipt
              for paper, cut and print quality.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function CustomerModal({ open, onClose, onSelect, canManage }) {
  const { message } = AntApp.useApp();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 250);
  const [results, setResults] = useState([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setResults([]);
    setCreating(false);
    form.resetFields();
  }, [open, form]);

  useEffect(() => {
    let active = true;
    if (!open || debounced.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    api('customers.search', { query: debounced })
      .then((rows) => {
        if (active) setResults(rows);
      })
      .catch(() => {
        if (active) setResults([]);
      });
    return () => {
      active = false;
    };
  }, [debounced, open]);

  async function createCustomer(values) {
    setSaving(true);
    try {
      const created = await api('customers.create', values);
      message.success('Customer saved.');
      onSelect({ id: created.id, name: created.name, phone: created.phone });
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Attach customer"
      footer={null}
      destroyOnClose
    >
      <Input
        prefix={<SearchOutlined />}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search saved customer by name or phone"
        autoFocus
        allowClear
      />
      <div className="customer-results">
        {results.map((customer) => (
          <button
            type="button"
            key={customer.id}
            className="customer-result"
            onClick={() => onSelect({ id: customer.id, name: customer.name, phone: customer.phone })}
          >
            <div>
              <strong>{customer.name}</strong>
              <span>{customer.phone}</span>
            </div>
            <span className="muted">Select</span>
          </button>
        ))}
        {!results.length && search.trim().length >= 2 ? <p className="muted">No saved customer matches.</p> : null}
      </div>
      <Divider />
      <div className="customer-modal-foot">
        <Button onClick={() => onSelect(null)}>Use walk-in customer</Button>
        {canManage ? (
          <Button icon={<UserAddOutlined />} onClick={() => setCreating((value) => !value)}>
            {creating ? 'Hide new customer' : 'New customer'}
          </Button>
        ) : null}
      </div>
      {creating ? (
        <Form form={form} layout="vertical" onFinish={createCustomer} className="customer-create-form">
          <Form.Item name="name" label="Customer name" rules={[{ required: true, max: 160 }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Mobile number"
            rules={[
              { required: true, message: 'Mobile number is required.' },
              { pattern: /^[0-9+\s-]{10,15}$/, message: 'Enter a valid mobile number.' },
            ]}
          >
            <Input inputMode="tel" />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            Save customer
          </Button>
        </Form>
      ) : null}
    </Modal>
  );
}

function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
