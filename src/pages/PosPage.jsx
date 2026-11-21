import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App as AntApp,
  Alert,
  Button,
  Divider,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
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
  DownOutlined,
  PrinterOutlined,
  SearchOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { addToCart, cartGrossPaise, cartLineDiscountPaise, cartToPayload, removeLine, setLineDiscount, setQuantity } from '@shared/cart.js';
import { computeCartTotals, pickBestOffer, toPaise } from '@shared/money.js';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDateTime, formatStock, money, moneyPlain } from '@/app/format';
import { LoadingPanel } from '@/app/components';

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
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const debouncedCustomerQuery = useDebouncedValue(customerQuery, 250);
  const [billDiscount, setBillDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
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
  const saleType = paymentMethod === 'credit' ? 'credit' : 'cash';
  const totals = useMemo(
    () =>
      computeCartTotals(
        cart.map((line) => ({
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          taxRateBp: taxEnabled ? line.taxRateBp : 0,
          lineDiscountPaise: cartLineDiscountPaise(line),
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
    scanRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    const query = debouncedCustomerQuery.trim();
    if (query.length < 2) {
      setCustomerResults([]);
      return undefined;
    }
    api('customers.search', { query })
      .then((rows) => {
        if (active) setCustomerResults(rows || []);
      })
      .catch(() => {
        if (active) setCustomerResults([]);
      });
    return () => {
      active = false;
    };
  }, [debouncedCustomerQuery]);

  function chooseCustomer(row) {
    setCustomer(row);
    setCustomerName(row.name || '');
    setCustomerPhone(row.phone || '');
    setCustomerQuery('');
    setCustomerResults([]);
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        scanRef.current?.focus();
      }
      if (event.key === 'F8' && !submitting) {
        event.preventDefault();
        document.getElementById('pos-complete')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting]);

  const focusScan = useCallback(() => {
    requestAnimationFrame(() => scanRef.current?.focus());
  }, []);

  const addItem = useCallback(
    (item) => {
      const result = addToCart(cart, item, { allowExceedStock: true });
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
    const code = String(rawValue ?? scan)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
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

  // Results follow the typed text; a barcode still goes straight through
  // handleScan on Enter and clears the list when the item is added.
  const liveQuery = useDebouncedValue(scan, 250);
  useEffect(() => {
    const text = liveQuery.trim();
    if (text.length < 2) return undefined;
    let active = true;
    api('catalog.posSearch', { query: text })
      .then((rows) => {
        if (active) setSearchResults(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [liveQuery]);

  function updateQuantity(line, quantity) {
    setCart(setQuantity(cart, line.variantId, quantity, { allowExceedStock: true }));
  }

  function updateDiscountMode(line, mode) {
    if (mode === line.discountMode) return;
    const gross = line.quantity * line.unitPricePaise;
    const currentPaise = cartLineDiscountPaise(line);
    // Convert the current discount so switching %/₹ keeps the same money off.
    const value = mode === 'amount' ? currentPaise / 100 : gross > 0 ? (currentPaise * 100) / gross : 0;
    setCart(setLineDiscount(cart, line.variantId, { discountMode: mode, discountValue: Number(value.toFixed(2)) }));
  }

  function clearCart() {
    const doClear = () => {
      setCart([]);
      setBillDiscount(0);
      setCustomer(null);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
      setNotes('');
      setAmountTouched(false);
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

  async function completeSale(printMode = 'auto') {
    const mode = typeof printMode === 'string' ? printMode : 'auto';
    if (!cart.length) {
      message.warning('Add at least one product to the bill.');
      focusScan();
      return;
    }
    const phone = String(customer?.phone || customerPhone || '').replace(/\D/g, '').slice(-10);
    if (!/^\d{10}$/.test(phone)) {
      message.error('Customer mobile number is required for every invoice.');
      return;
    }
    const gstin = String(customerGstin || '').trim().toUpperCase();
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
      message.error('Customer GSTIN must be exactly 15 letters and digits.');
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
        customerName: customer?.id ? undefined : customerName.trim() || undefined,
        customerPhone: phone,
        customerGstin: gstin || undefined,
        billDiscountPaise: manualDiscountPaise,
        notes,
        paymentMethod,
        amountPaidPaise: toPaise(amountReceived || 0),
        allowPartial: paymentMethod === 'credit',
      });
      setCart([]);
      setCustomer(null);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
      setBillDiscount(0);
      setNotes('');
      setAmountTouched(false);
      idempotencyRef.current = newIdempotencyKey();
      reload();

      const autoPrint = Boolean(bootstrap?.settings?.hardware?.autoPrintReceipt);
      const shouldPrintReceipt = mode === 'receipt' || (mode === 'auto' && autoPrint);
      if (shouldPrintReceipt) {
        if (!bootstrap?.settings?.hardware?.receiptPrinter) {
          message.info('Sale saved. No receipt printer is assigned in Settings, so nothing was printed.');
        } else {
          setReceiptBusy(true);
          try {
            await api('print.receipt', { saleId: result.sale.id, duplicate: false });
            message.success('Sale saved and sent to the receipt printer.');
          } catch (printError) {
            message.warning(
              `Sale saved successfully, but the receipt did not print: ${errorMessage(printError)} The invoice is safe; use Print receipt to retry.`
            );
          } finally {
            setReceiptBusy(false);
          }
        }
      } else if (mode === 'a4') {
        try {
          await api('print.a4', { saleId: result.sale.id });
          message.success('Sale saved and A4 invoice sent to the printer.');
        } catch (printError) {
          message.warning(`Sale saved, but the A4 invoice did not print: ${errorMessage(printError)}`);
        }
      } else if (mode === 'pdf') {
        try {
          const pdf = await api('print.savePdf', { saleId: result.sale.id });
          message.success(`Sale saved. PDF: ${pdf.path}`);
        } catch (pdfError) {
          message.warning(`Sale saved, but the PDF could not be saved: ${errorMessage(pdfError)}`);
        }
      } else {
        message.success(`Sale ${result.sale.invoiceNo} saved.`);
      }
      navigate(`/sales?invoice=${result.sale.id}`);
    } catch (saleError) {
      message.error(errorMessage(saleError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !bootstrap) return <LoadingPanel label="Preparing the billing counter…" />;
  if (error && !bootstrap) return <Alert type="error" showIcon message={errorMessage(error)} />;
  if (!bootstrap) return null;

  const canDiscount = Boolean(bootstrap.canDiscount);
  const maxDiscountPercent = Number(bootstrap.settings.pos.manualDiscountMaxPercent || 0);
  const changePaise = Math.max(0, toPaise(amountReceived || 0) - totals.totalPaise);
  const balancePaise = Math.max(0, totals.totalPaise - toPaise(amountReceived || 0));

  return (
    <div className="pos-terminal">
      <div className="pos-terminal-top">
        <div className="pos-sale-type">
          <Segmented
            block
            value={saleType}
            onChange={(value) => choosePayment(value === 'credit' ? 'credit' : 'cash')}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'credit', label: 'Credit' },
            ]}
          />
        </div>

        <div className="pos-customer-area">
          <div className="pos-customer-search">
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search name or phone"
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              allowClear
            />
            {customerResults.length ? (
              <div className="pos-customer-results">
                {customerResults.map((row) => (
                  <button type="button" key={row.id} onClick={() => chooseCustomer(row)}>
                    <strong>{row.name}</strong>
                    <span>{row.phone}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Input
            placeholder="Billing name"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            maxLength={120}
          />
          <Input
            placeholder="Phone (required)"
            inputMode="tel"
            maxLength={10}
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value.replace(/\D/g, ''))}
          />
          <Input
            placeholder="GSTIN"
            maxLength={15}
            value={customerGstin}
            onChange={(event) => setCustomerGstin(event.target.value.toUpperCase())}
          />
          {customer ? (
            <Tag
              closable
              color="green"
              onClose={() => {
                setCustomer(null);
                setCustomerName('');
                setCustomerPhone('');
                setCustomerGstin('');
              }}
            >
              {customer.name} · {customer.phone}
            </Tag>
          ) : null}
        </div>

        <div className="pos-invoice-info">
          <div>
            <span>Invoice</span>
            <strong>{bootstrap.nextInvoiceNumber}</strong>
          </div>
          <div>
            <span>Date / time</span>
            <strong>{formatDateTime(new Date().toISOString())}</strong>
          </div>
          <div>
            <span>State of supply</span>
            <strong>{bootstrap.settings.tax?.placeOfSupply || bootstrap.business?.stateName || 'Telangana'}</strong>
          </div>
          <Button type="link" size="small" icon={<UserAddOutlined />} onClick={() => setCustomerOpen(true)}>
            Customer list
          </Button>
        </div>
      </div>

      <div className="pos-terminal-main">
        <div className="pos-entry-bar">
          <Input
            ref={scanRef}
            size="large"
            prefix={<BarcodeOutlined />}
            placeholder="Scan barcode / SKU, or type a product name and press Enter"
            value={scan}
            onChange={(event) => setScan(event.target.value)}
            onPressEnter={(event) => handleScan(event.currentTarget.value)}
            suffix={
              <Button type="text" size="small" icon={<SearchOutlined />} loading={searching} onClick={runSearch}>
                Search
              </Button>
            }
            autoFocus
            spellCheck={false}
            aria-label="Scan barcode or search products"
          />
          <Button onClick={focusScan}>Add row</Button>
          <Button danger disabled={!cart.length} onClick={clearCart}>
            Clear bill
          </Button>
          <span className="muted small">F2 scan · F8 save</span>
        </div>

        {searchResults.length ? (
          <div className="search-results pos-search-results">
            <div className="search-results-head">
              <strong>{searchResults.length} matches</strong>
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setSearchResults([])}>
                Close
              </Button>
            </div>
            <div className="search-result-list">
              {searchResults.map((item) => (
                <button type="button" key={item.variantId} className="search-result" onClick={() => addItem(item)}>
                  <div>
                    <strong>{item.productName}</strong>
                    <span>
                      {item.color} / {item.size} · {item.sku}
                    </span>
                  </div>
                  <div className="search-result-side">
                    <strong>{money(item.pricePaise)}</strong>
                    <Tag color={item.stock > 0 ? 'default' : item.stock < 0 ? 'red' : 'gold'}>
                      {formatStock(item.stock)}
                    </Tag>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="pos-table-wrap">
          <Table
            className="pos-entry-table"
            rowKey="variantId"
            dataSource={cart}
            pagination={false}
            size="middle"
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Scan a barcode or search a product to start the bill."
                />
              ),
            }}
            columns={[
              {
                title: 'Item',
                dataIndex: 'productName',
                render: (value, row) => (
                  <div className="cart-product">
                    <strong>{value}</strong>
                    <span>
                      {row.color} / {row.size} · {row.sku}
                    </span>
                    <small>
                      {formatStock(row.availableStock)}
                      {row.availableStock < 0 ? <Tag color="red">Negative</Tag> : null}
                      {row.availableStock >= 0 && row.availableStock <= row.lowStockThreshold ? (
                        <Tag color="gold">Low stock</Tag>
                      ) : null}
                    </small>
                  </div>
                ),
              },
              {
                title: 'Qty',
                width: 90,
                align: 'center',
                render: (_, row) => (
                  <InputNumber
                    min={1}
                    max={999999}
                    value={row.quantity}
                    onChange={(value) => updateQuantity(row, value)}
                    onPressEnter={focusScan}
                    style={{ width: 68 }}
                    aria-label={`Quantity for ${row.productName}`}
                  />
                ),
              },
              {
                title: 'Price',
                dataIndex: 'unitPricePaise',
                align: 'right',
                width: 110,
                render: money,
              },
              {
                title: 'Discount',
                key: 'discount',
                width: 190,
                render: (_, row, index) => {
                  const line = totals.lines[index];
                  return (
                    <div className="cart-discount">
                      <InputNumber
                        min={0}
                        max={row.discountMode === 'percent' ? 100 : (row.quantity * row.unitPricePaise) / 100}
                        precision={2}
                        value={row.discountValue}
                        onChange={(value) =>
                          setCart(setLineDiscount(cart, row.variantId, { discountValue: value || 0 }))
                        }
                        onPressEnter={focusScan}
                        disabled={!canDiscount}
                        style={{ width: 84 }}
                        aria-label={`Discount for ${row.productName}`}
                      />
                      <Segmented
                        size="small"
                        value={row.discountMode}
                        onChange={(mode) => updateDiscountMode(row, mode)}
                        disabled={!canDiscount}
                        options={[
                          { value: 'percent', label: '%' },
                          { value: 'amount', label: '₹' },
                        ]}
                      />
                      {line?.discountPaise ? (
                        <small className="muted">−{money(line.discountPaise)}</small>
                      ) : null}
                    </div>
                  );
                },
              },
              {
                title: taxEnabled ? 'Tax' : 'Tax (off)',
                key: 'tax',
                align: 'right',
                width: 100,
                render: (_, row, index) => {
                  const line = totals.lines[index];
                  return taxEnabled && line?.taxPaise ? money(line.taxPaise) : '—';
                },
              },
              {
                title: 'Final amount',
                key: 'total',
                align: 'right',
                width: 130,
                render: (_, row, index) => {
                  const line = totals.lines[index];
                  const gross = row.unitPricePaise * row.quantity;
                  return (
                    <div className="cart-final">
                      <strong>{money(line?.totalPaise ?? gross)}</strong>
                      {line?.discountPaise ? <small className="muted"><s>{money(gross)}</s></small> : null}
                    </div>
                  );
                },
              },
              {
                title: '',
                width: 50,
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

      <div className="pos-terminal-bottom">
        <div className="pos-bottom-left">
          <span className="eyebrow">Terms &amp; conditions</span>
          <div className="pos-terms">{bootstrap.settings.invoice?.terms || 'Set invoice terms in Settings.'}</div>
          <label className="field-label" htmlFor="pos-notes">
            Invoice description
          </label>
          <Input.TextArea
            id="pos-notes"
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional note for this invoice"
          />
        </div>

        <div className="pos-bottom-mid">
          <div className="pos-bottom-row">
            {canDiscount ? (
              <div className="pos-bottom-field">
                <label className="field-label" htmlFor="pos-discount">
                  Overall discount (₹)
                </label>
                <InputNumber
                  id="pos-discount"
                  min={0}
                  precision={2}
                  value={billDiscount}
                  onChange={(value) => setBillDiscount(value || 0)}
                  style={{ width: '100%' }}
                  placeholder="0.00"
                />
                <small className="muted small">
                  Limit {maxDiscountPercent}% of subtotal. Automatic offers apply only when better.
                </small>
              </div>
            ) : null}
            <div className="pos-bottom-field">
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
            </div>
          </div>
          <div className="pos-bottom-row">
            <div className="pos-bottom-field">
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
                onPressEnter={() => completeSale('receipt')}
                style={{ width: '100%' }}
                placeholder={moneyPlain(totals.totalPaise)}
              />
            </div>
            <div className="pos-bottom-field pos-change">
              <span>{balancePaise > 0 ? 'Balance due' : 'Change'}</span>
              <strong className={balancePaise > 0 ? 'text-danger' : 'text-success'}>
                {money(balancePaise > 0 ? balancePaise : changePaise)}
              </strong>
            </div>
          </div>
        </div>

        <div className="pos-bottom-right">
          <div className="pos-total-lines">
            <div>
              <span>Subtotal</span>
              <strong>{money(totals.subtotalPaise)}</strong>
            </div>
            {totals.lineDiscountPaise > 0 ? (
              <div>
                <span>Line discounts</span>
                <strong>- {money(totals.lineDiscountPaise)}</strong>
              </div>
            ) : null}
            {totals.billDiscountPaise > 0 ? (
              <div>
                <span>Bill discount</span>
                <strong>- {money(totals.billDiscountPaise)}</strong>
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

          <div className="pos-grand-total">
            <span>Total payable</span>
            <strong>{money(totals.totalPaise)}</strong>
          </div>

          <div className="pos-action-bar">
            <Button
              id="pos-complete"
              type="primary"
              size="large"
              icon={<CheckCircleOutlined />}
              loading={submitting}
              disabled={!cart.length || receiptBusy}
              onClick={() => completeSale('none')}
            >
              Save
            </Button>
            <Button
              size="large"
              icon={<PrinterOutlined />}
              loading={receiptBusy}
              disabled={!cart.length || submitting}
              onClick={() => completeSale('receipt')}
            >
              Save &amp; print
            </Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'a4', label: 'Save & print A4 invoice' },
                  { key: 'pdf', label: 'Save & save PDF' },
                ],
                onClick: ({ key }) => completeSale(key),
              }}
              disabled={!cart.length || submitting}
            >
              <Button size="large" icon={<DownOutlined />} aria-label="More save and print options" />
            </Dropdown>
          </div>
          <span className="muted small">Sale, payment and stock ledger are saved together.</span>
        </div>
      </div>

      <CustomerModal
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onSelect={(value) => {
          chooseCustomer(value);
          setCustomerOpen(false);
        }}
        canManage={can('customers.manage')}
      />
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
