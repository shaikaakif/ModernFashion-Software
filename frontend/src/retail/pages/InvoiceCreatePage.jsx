import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Col, DatePicker, Form, Input, InputNumber, Row, Select, Tag } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatMoney, formatNumber } from '@/retail/utils/format';
import { nextInvoiceNumber } from '@/retail/utils/metrics';
import { invoiceService } from '@/retail/services/invoiceService';
import { PageHeader, SectionCard } from '@/retail/components/ui';

function newKey() {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function InvoiceCreatePage() {
  const { message } = App.useApp();
  const { db } = useDemo();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [lines, setLines] = useState([{ key: newKey(), productId: undefined, variantId: undefined, qty: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);

  const customerId = Form.useWatch('customerId', form);
  const discount = Number(Form.useWatch('discount', form) || 0);
  const taxPercent = Number(Form.useWatch('taxPercent', form) ?? db.business.taxPercent);
  const paymentStatus = Form.useWatch('paymentStatus', form) || 'Paid';
  const amountPaidInput = Number(Form.useWatch('amountPaid', form) || 0);
  const customer = db.customers.find((item) => item.id === customerId);
  const invoiceNumber = nextInvoiceNumber(db);
  const prefillCustomerId = searchParams.get('customerId');

  const updateLine = (key, patch) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    setLines((current) => [...current, { key: newKey(), productId: undefined, variantId: undefined, qty: 1, unitPrice: 0 }]);
  };

  const removeLine = (key) => {
    setLines((current) => (current.length === 1 ? current : current.filter((line) => line.key !== key)));
  };

  const handleProductChange = (key, productId) => {
    const product = db.products.find((item) => item.id === productId);
    const variant = product?.variants.find((item) => item.stock > 0);
    updateLine(key, {
      productId,
      variantId: variant?.id,
      unitPrice: variant?.sellingPrice || product?.sellingPrice || 0,
      qty: 1,
    });
  };

  const handleVariantChange = (key, variantId) => {
    const line = lines.find((item) => item.key === key);
    const product = db.products.find((item) => item.id === line?.productId);
    const variant = product?.variants.find((item) => item.id === variantId);
    updateLine(key, { variantId, unitPrice: variant?.sellingPrice || 0, qty: 1 });
  };

  const subtotal = lines.reduce(
    (sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitPrice) || 0),
    0
  );
  const appliedDiscount = Math.min(Math.max(discount, 0), subtotal);
  const taxAmount = Math.round((subtotal - appliedDiscount) * taxPercent) / 100;
  const total = Math.round((subtotal - appliedDiscount + taxAmount) * 100) / 100;
  const amountPaid = paymentStatus === 'Paid' ? total : paymentStatus === 'Unpaid' ? 0 : amountPaidInput;
  const balance = Math.max(0, total - amountPaid);

  const productOptions = useMemo(
    () =>
      db.products.map((product) => ({
        value: product.id,
        label: `${product.name} · ${product.category}`,
        disabled: !product.variants.some((variant) => variant.stock > 0),
      })),
    [db.products]
  );

  const submit = (values) => {
    try {
      setSaving(true);
      if (!values.customerId) throw new Error('Select a customer for this invoice.');
      const items = lines.map((line) => {
        if (!line.productId || !line.variantId) throw new Error('Choose a product and variant for every invoice line.');
        if (!line.qty || Number(line.qty) <= 0) throw new Error('Every invoice line needs a quantity greater than zero.');
        return { variantId: line.variantId, qty: Number(line.qty), unitPrice: Number(line.unitPrice) || 0 };
      });
      const unique = new Set(items.map((item) => item.variantId));
      if (unique.size !== items.length) throw new Error('The same product variant cannot appear twice.');
      if (values.paymentStatus === 'Partial' && (!values.amountPaid || values.amountPaid >= total)) {
        throw new Error('For a partial payment, enter an amount between zero and the grand total.');
      }
      const invoice = invoiceService.create({
        customerId: values.customerId,
        date: values.date.toISOString(),
        items,
        discount: values.discount,
        taxPercent: values.taxPercent,
        paymentMethod: values.paymentMethod,
        paymentStatus: values.paymentStatus,
        amountPaid: values.amountPaid,
        notes: values.notes,
      });
      message.success(`${invoice.number} completed. Stock has been reduced.`);
      navigate(`/invoices/${invoice.id}`);
    } catch (error) {
      message.error(error.message || 'Could not complete the invoice.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="detail-topbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/invoices')}>
          Invoices
        </Button>
      </div>
      <PageHeader
        eyebrow="Point of sale"
        title="New invoice"
        subtitle={`Invoice ${invoiceNumber} will be assigned on save. Completing the sale reduces stock and updates the customer's purchase history.`}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          customerId: prefillCustomerId || undefined,
          date: dayjs(),
          discount: 0,
          taxPercent: db.business.taxPercent,
          paymentMethod: 'UPI',
          paymentStatus: 'Paid',
          amountPaid: 0,
          notes: '',
        }}
        onFinish={submit}
      >
        <div className="form-layout">
          <div className="form-main">
            <SectionCard
              title="Customer & invoice details"
              extra={
                <Link to="/customers?new=1">
                  <UserAddOutlined /> Add customer
                </Link>
              }
            >
              <Row gutter={16}>
                <Col xs={24} md={14}>
                  <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Select a customer.' }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Search customer by name or phone"
                      options={db.customers.map((item) => ({ value: item.id, label: `${item.name} · ${item.phone}` }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={10}>
                  <Form.Item name="date" label="Invoice date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
                  </Form.Item>
                </Col>
              </Row>
              {customer ? (
                <div className="customer-inline-card">
                  <div>
                    <span>Customer</span>
                    <strong>{customer.name}</strong>
                  </div>
                  <div>
                    <span>Phone</span>
                    <strong>{customer.phone}</strong>
                  </div>
                  <div>
                    <span>Address</span>
                    <strong>{customer.address || '—'}</strong>
                  </div>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Products sold"
              description="Only variants with stock are available. Quantity is capped at the available balance."
              extra={
                <Button icon={<PlusOutlined />} onClick={addLine}>
                  Add line
                </Button>
              }
            >
              <div className="line-list">
                {lines.map((line, index) => {
                  const product = db.products.find((item) => item.id === line.productId);
                  const variant = product?.variants.find((item) => item.id === line.variantId);
                  return (
                    <div className="line-editor invoice-line" key={line.key}>
                      <div className="line-index">{String(index + 1).padStart(2, '0')}</div>
                      <div className="line-products">
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Choose product"
                          value={line.productId}
                          onChange={(value) => handleProductChange(line.key, value)}
                          options={productOptions}
                        />
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Choose in-stock variant"
                          value={line.variantId}
                          onChange={(value) => handleVariantChange(line.key, value)}
                          disabled={!product}
                          options={(product?.variants || [])
                            .filter((item) => item.stock > 0)
                            .map((item) => ({
                              value: item.id,
                              label: `${item.color} / ${item.size} · ${item.sku} · ${item.stock} in stock`,
                            }))}
                        />
                        {variant ? (
                          <span className="line-meta">
                            Available {formatNumber(variant.stock)} · {variant.color} / {variant.size} · {variant.sku}
                          </span>
                        ) : null}
                      </div>
                      <div className="line-fields">
                        <label>
                          Qty
                          <InputNumber
                            min={1}
                            max={variant?.stock || 1}
                            precision={0}
                            value={line.qty}
                            onChange={(value) => updateLine(line.key, { qty: value })}
                          />
                        </label>
                        <label>
                          Unit price
                          <InputNumber
                            min={0}
                            step={10}
                            prefix="₹"
                            value={line.unitPrice}
                            onChange={(value) => updateLine(line.key, { unitPrice: value })}
                          />
                        </label>
                      </div>
                      <div className="line-total">
                        <span>Line total</span>
                        <strong>{formatMoney((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))}</strong>
                      </div>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                        aria-label="Remove line"
                      />
                    </div>
                  );
                })}
              </div>
              <Button type="dashed" block icon={<PlusOutlined />} onClick={addLine} className="add-line-btn">
                Add another product
              </Button>
            </SectionCard>
          </div>

          <aside className="form-side">
            <SectionCard title="Invoice summary" className="summary-card">
              <div className="summary-row">
                <span>Invoice number</span>
                <strong>{invoiceNumber}</strong>
              </div>
              <div className="summary-row">
                <span>Subtotal</span>
                <strong>{formatMoney(subtotal)}</strong>
              </div>
              <div className="summary-field">
                <label>Discount</label>
                <Form.Item name="discount" noStyle>
                  <InputNumber min={0} max={subtotal || 999999} prefix="₹" style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <div className="summary-field">
                <label>Tax rate (demo)</label>
                <Form.Item name="taxPercent" noStyle>
                  <InputNumber min={0} max={50} precision={2} addonAfter="%" style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <div className="summary-row muted">
                <span>Tax amount</span>
                <strong>{formatMoney(taxAmount)}</strong>
              </div>
              <div className="summary-divider" />
              <div className="summary-row summary-total">
                <span>Grand total</span>
                <strong>{formatMoney(total)}</strong>
              </div>
              <Row gutter={10}>
                <Col span={12}>
                  <Form.Item name="paymentMethod" label="Payment method">
                    <Select
                      options={[
                        { value: 'UPI', label: 'UPI' },
                        { value: 'Cash', label: 'Cash' },
                        { value: 'Card', label: 'Card' },
                        { value: 'Bank Transfer', label: 'Bank transfer' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="paymentStatus" label="Payment status">
                    <Select
                      options={[
                        { value: 'Paid', label: 'Paid' },
                        { value: 'Partial', label: 'Partial' },
                        { value: 'Unpaid', label: 'Unpaid' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
              {paymentStatus === 'Partial' ? (
                <Form.Item name="amountPaid" label="Amount paid">
                  <InputNumber min={1} max={total} prefix="₹" style={{ width: '100%' }} />
                </Form.Item>
              ) : null}
              <div className="summary-row muted">
                <span>Amount paid</span>
                <strong>{formatMoney(amountPaid)}</strong>
              </div>
              <div className="summary-row muted">
                <span>Balance due</span>
                <strong>{formatMoney(balance)}</strong>
              </div>
              <Button type="primary" htmlType="submit" block loading={saving}>
                Complete invoice & reduce stock
              </Button>
              <p className="form-hint">
                Demo only. No real payment is processed, no GST is filed and no message is sent to the customer.
              </p>
            </SectionCard>
            <Alert
              type="info"
              showIcon
              message="Stock check is enforced"
              description="The invoice cannot be saved if a quantity exceeds the selected variant's available stock."
            />
            <div className="demo-inline-tag">
              <Tag color="orange">DEMO / SAMPLE DATA</Tag>
            </div>
          </aside>
        </div>
      </Form>
    </div>
  );
}
