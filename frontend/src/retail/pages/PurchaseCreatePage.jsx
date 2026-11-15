import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Col, DatePicker, Form, Input, InputNumber, Row, Select } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatMoney, formatNumber } from '@/retail/utils/format';
import { nextPurchaseReference } from '@/retail/utils/metrics';
import { purchaseService } from '@/retail/services/purchaseService';
import { PageHeader, SectionCard } from '@/retail/components/ui';

function newKey() {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function PurchaseCreatePage() {
  const { message } = App.useApp();
  const { db } = useDemo();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [supplierId, setSupplierId] = useState(db.suppliers[0]?.id || '');
  const [saving, setSaving] = useState(false);

  const prefilledProductId = searchParams.get('productId');

  const initialLines = useMemo(() => {
    const product = db.products.find((item) => item.id === prefilledProductId);
    if (product) {
      const variant = product.variants[0];
      return [
        {
          key: newKey(),
          productId: product.id,
          variantId: variant?.id || '',
          qty: 1,
          unitCost: variant?.purchasePrice || product.purchasePrice,
        },
      ];
    }
    return [{ key: newKey(), productId: undefined, variantId: undefined, qty: 1, unitCost: 0 }];
  }, [db.products, prefilledProductId]);

  const [lines, setLines] = useState(initialLines);

  const supplier = db.suppliers.find((item) => item.id === supplierId);
  const reference = nextPurchaseReference(db);

  const updateLine = (key, patch) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    setLines((current) => [...current, { key: newKey(), productId: undefined, variantId: undefined, qty: 1, unitCost: 0 }]);
  };

  const removeLine = (key) => {
    setLines((current) => (current.length === 1 ? current : current.filter((line) => line.key !== key)));
  };

  const handleProductChange = (key, productId) => {
    const product = db.products.find((item) => item.id === productId);
    const variant = product?.variants[0];
    updateLine(key, {
      productId,
      variantId: variant?.id || '',
      unitCost: variant?.purchasePrice || product?.purchasePrice || 0,
    });
  };

  const handleVariantChange = (key, variantId) => {
    const productId = lines.find((line) => line.key === key)?.productId;
    const product = db.products.find((item) => item.id === productId);
    const variant = product?.variants.find((item) => item.id === variantId);
    updateLine(key, { variantId, unitCost: variant?.purchasePrice || 0 });
  };

  const totalUnits = lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
  const totalCost = lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitCost) || 0), 0);

  const submit = (values) => {
    try {
      setSaving(true);
      const items = lines.map((line) => {
        if (!line.productId || !line.variantId) throw new Error('Choose a product and variant for every line.');
        if (!line.qty || Number(line.qty) <= 0) throw new Error('Every purchase line needs a quantity greater than zero.');
        return { variantId: line.variantId, qty: Number(line.qty), unitCost: Number(line.unitCost) || 0 };
      });
      const duplicate = new Set(items.map((item) => item.variantId));
      if (duplicate.size !== items.length) throw new Error('The same product variant cannot appear twice.');
      if (!values.supplierId) throw new Error('Select a supplier.');
      const purchase = purchaseService.create({
        supplierId: values.supplierId,
        date: values.date.toISOString(),
        notes: values.notes,
        items,
      });
      message.success(`${purchase.reference} saved. Stock has been increased.`);
      navigate(`/purchases/${purchase.id}`);
    } catch (error) {
      message.error(error.message || 'Could not save the purchase.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="detail-topbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchases')}>
          Purchases
        </Button>
      </div>
      <PageHeader
        eyebrow="Stock intake"
        title="New purchase"
        subtitle={`Reference ${reference} will be assigned automatically. Saving this purchase adds every selected variant to stock.`}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ supplierId, date: dayjs(), notes: '' }}
        onFinish={submit}
      >
        <div className="form-layout">
          <div className="form-main">
            <SectionCard title="Supplier & purchase details">
              <Row gutter={16}>
                <Col xs={24} md={14}>
                  <Form.Item name="supplierId" label="Supplier" rules={[{ required: true, message: 'Select a supplier.' }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      onChange={setSupplierId}
                      options={db.suppliers.map((item) => ({ value: item.id, label: item.name }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={10}>
                  <Form.Item name="date" label="Purchase date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} md={14}>
                  <div className="read-only-field">
                    <span>Reference number</span>
                    <strong>{reference}</strong>
                    <small>Auto-generated on save</small>
                  </div>
                </Col>
                <Col xs={24} md={10}>
                  <Form.Item name="notes" label="Notes">
                    <Input placeholder="Optional purchase note" />
                  </Form.Item>
                </Col>
              </Row>
              {supplier ? (
                <div className="supplier-card">
                  <div>
                    <span>Contact</span>
                    <strong>{supplier.contactPerson}</strong>
                  </div>
                  <div>
                    <span>Phone</span>
                    <strong>{supplier.phone}</strong>
                  </div>
                  <div>
                    <span>Address</span>
                    <strong>{supplier.address}</strong>
                  </div>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Products received"
              description="Choose a variant and quantity. The purchase cost is prefilled from the product record and can be edited."
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
                    <div className="line-editor purchase-line" key={line.key}>
                      <div className="line-index">{String(index + 1).padStart(2, '0')}</div>
                      <div className="line-products">
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Choose product"
                          value={line.productId}
                          onChange={(value) => handleProductChange(line.key, value)}
                          options={db.products.map((item) => ({ value: item.id, label: `${item.name} · ${item.category}` }))}
                        />
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Choose variant"
                          value={line.variantId}
                          onChange={(value) => handleVariantChange(line.key, value)}
                          disabled={!product}
                          options={(product?.variants || []).map((item) => ({
                            value: item.id,
                            label: `${item.color} / ${item.size} · ${item.sku} · stock ${item.stock}`,
                          }))}
                        />
                        {variant ? (
                          <span className="line-meta">
                            Current stock {formatNumber(variant.stock)} · SKU {variant.sku}
                          </span>
                        ) : null}
                      </div>
                      <div className="line-fields">
                        <label>
                          Qty
                          <InputNumber
                            min={1}
                            precision={0}
                            value={line.qty}
                            onChange={(value) => updateLine(line.key, { qty: value })}
                          />
                        </label>
                        <label>
                          Cost / unit
                          <InputNumber
                            min={0}
                            step={10}
                            prefix="₹"
                            value={line.unitCost}
                            onChange={(value) => updateLine(line.key, { unitCost: value })}
                          />
                        </label>
                      </div>
                      <div className="line-total">
                        <span>Line total</span>
                        <strong>{formatMoney((Number(line.qty) || 0) * (Number(line.unitCost) || 0))}</strong>
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
            <SectionCard title="Purchase summary" className="summary-card">
              <div className="summary-row">
                <span>Reference</span>
                <strong>{reference}</strong>
              </div>
              <div className="summary-row">
                <span>Supplier</span>
                <strong>{supplier?.name || '—'}</strong>
              </div>
              <div className="summary-row">
                <span>Product lines</span>
                <strong>{lines.length}</strong>
              </div>
              <div className="summary-row">
                <span>Units received</span>
                <strong>{formatNumber(totalUnits)}</strong>
              </div>
              <div className="summary-divider" />
              <div className="summary-row summary-total">
                <span>Purchase total</span>
                <strong>{formatMoney(totalCost)}</strong>
              </div>
              <Button type="primary" htmlType="submit" block loading={saving} icon={<ShoppingCartOutlined />}>
                Save purchase & add stock
              </Button>
              <p className="form-hint">
                This is a demo purchase record. No supplier payment is processed. Stock is updated in this browser only.
              </p>
            </SectionCard>
            <Alert
              type="info"
              showIcon
              message="Stock is connected"
              description="Saving this purchase increases every selected variant's stock and writes a stock-in movement to Inventory."
            />
          </aside>
        </div>
      </Form>
    </div>
  );
}
