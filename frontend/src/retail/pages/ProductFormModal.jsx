import { useEffect } from 'react';
import { Alert, App, Button, Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { CATEGORIES, COLOR_OPTIONS, getDefaultSizes } from '@/retail/utils/catalog';
import { productService } from '@/retail/services/productService';

export default function ProductFormModal({ open, product, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const isEdit = Boolean(product);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (product) {
      form.setFieldsValue({
        name: product.name,
        category: product.category,
        description: product.description,
        colors: product.colors,
        sizes: product.sizes,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        lowStockThreshold: product.variants?.[0]?.lowStockThreshold ?? 5,
      });
    } else {
      form.setFieldsValue({
        category: 'T-shirts',
        sizes: getDefaultSizes('T-shirts'),
        colors: ['Black'],
        lowStockThreshold: 5,
        openingStock: 0,
      });
    }
  }, [open, product, form]);

  const handleCategoryChange = (category) => {
    form.setFieldValue('sizes', getDefaultSizes(category));
  };

  const handleFinish = (values) => {
    try {
      const payload = {
        ...values,
        colors: values.colors || [],
        sizes: values.sizes || [],
      };
      if (isEdit) {
        const updated = productService.update(product.id, payload);
        message.success('Product updated. New variants are assigned SKUs and barcodes automatically.');
        onSaved?.(updated);
      } else {
        const created = productService.create(payload);
        message.success('Product created with generated SKUs and Code 128 barcodes.');
        onSaved?.(created);
      }
      onClose();
    } catch (error) {
      message.error(error.message || 'Could not save the product.');
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit product' : 'Add product'}
      onCancel={onClose}
      width={760}
      destroyOnClose
      footer={null}
      className="form-modal"
    >
      <p className="modal-intro">
        {isEdit
          ? 'Update product details, colours and sizes. Existing variants keep their SKU and barcode.'
          : 'Create a product. Each colour and size combination becomes an independently tracked variant.'}
      </p>
      <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark="optional">
        <Row gutter={14}>
          <Col xs={24} md={15}>
            <Form.Item name="name" label="Product name" rules={[{ required: true, message: 'Enter a product name.' }]}>
              <Input placeholder="e.g. Oversized Cotton Tee" />
            </Form.Item>
          </Col>
          <Col xs={24} md={9}>
            <Form.Item name="category" label="Category" rules={[{ required: true }]}>
              <Select
                options={CATEGORIES.map((category) => ({ value: category, label: category }))}
                onChange={handleCategoryChange}
                showSearch
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="Short product description" maxLength={220} showCount />
        </Form.Item>

        <Row gutter={14}>
          <Col xs={24} md={12}>
            <Form.Item
              name="colors"
              label="Colours"
              rules={[{ required: true, message: 'Add at least one colour.' }]}
              extra="Type a colour and press Enter to add it."
            >
              <Select mode="tags" placeholder="Black, White…" options={COLOR_OPTIONS.map((c) => ({ value: c, label: c }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="sizes"
              label="Sizes"
              rules={[{ required: true, message: 'Add at least one size.' }]}
              extra="Clothing uses M–5XL. Footwear uses 7–10."
            >
              <Select mode="tags" placeholder="M, L, XL…" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={14}>
          <Col xs={24} md={6}>
            <Form.Item name="purchasePrice" label="Purchase price" rules={[{ required: true, message: 'Enter a cost price.' }]}>
              <InputNumber min={0} step={10} prefix="₹" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="sellingPrice" label="Selling price" rules={[{ required: true, message: 'Enter a selling price.' }]}>
              <InputNumber min={0} step={10} prefix="₹" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              name="lowStockThreshold"
              label="Low-stock level"
              tooltip="Variants at or below this number trigger a low-stock alert."
            >
              <InputNumber min={0} precision={0} style={{ width: '100%' }} addonAfter="units" />
            </Form.Item>
          </Col>
          {!isEdit ? (
            <Col xs={24} md={6}>
              <Form.Item
                name="openingStock"
                label="Opening stock / variant"
                tooltip="Optional. New stock should normally arrive through a purchase."
              >
                <InputNumber min={0} precision={0} style={{ width: '100%' }} addonAfter="units" />
              </Form.Item>
            </Col>
          ) : null}
        </Row>

        <Alert
          type="info"
          showIcon
          message="SKU and barcode generation"
          description="The demo generates an internal SKU (MF-CATEGORY-###-COLOUR-SIZE) and a unique Code 128 barcode for every variant. These are internal identifiers, not registered EAN numbers."
        />

        {isEdit ? (
          <Alert
            className="form-alert"
            type="warning"
            showIcon
            message="Variant changes"
            description="Removing a colour or size is only allowed when that variant has zero stock. Variants with stock must be adjusted to zero in Inventory first."
          />
        ) : null}

        <div className="modal-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit">
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
