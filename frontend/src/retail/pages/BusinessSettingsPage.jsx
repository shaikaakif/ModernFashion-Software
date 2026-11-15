import { useEffect } from 'react';
import { App, Button, Col, Form, Input, InputNumber, Row } from 'antd';
import {
  DeleteOutlined,
  GlobalOutlined,
  InstagramOutlined,
  PhoneOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { businessService } from '@/retail/services/businessService';
import { demoDataService } from '@/retail/services/demoDataService';
import { PageHeader, SectionCard } from '@/retail/components/ui';

export default function BusinessSettingsPage() {
  const { message, modal } = App.useApp();
  const { db } = useDemo();
  const [form] = Form.useForm();
  const business = db.business;

  useEffect(() => {
    form.setFieldsValue({
      name: business.name,
      address: business.address,
      phones: business.phones,
      instagram: business.instagram,
      website: business.website,
      taxPercent: business.taxPercent,
    });
  }, [business, form]);

  const save = (values) => {
    try {
      businessService.update({
        ...values,
        phones: (values.phones || []).filter(Boolean),
      });
      message.success('Business profile updated. New invoices use these details.');
    } catch (error) {
      message.error(error.message || 'Could not update business details.');
    }
  };

  const resetDemo = () => {
    modal.confirm({
      title: 'Reset all demo data?',
      content:
        'This restores the sample products, customers, suppliers, purchases, invoices and this business profile. Changes saved in this browser will be lost.',
      okText: 'Reset demo data',
      okButtonProps: { danger: true },
      onOk: () => {
        demoDataService.reset();
        message.success('Demo data restored.');
      },
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Application settings · Demo"
        title="Business profile"
        subtitle="These details appear in the invoice header and printable invoice template. Only the supplied business information is included — no GSTIN, email or owner name is invented."
        extra={
          <Button danger icon={<ReloadOutlined />} onClick={resetDemo}>
            Reset demo data
          </Button>
        }
      />

      <div className="settings-layout">
        <SectionCard title="Store details" description="Editable and stored in this browser.">
          <Form form={form} layout="vertical" onFinish={save}>
            <Form.Item name="name" label="Business name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="address" label="Business address" rules={[{ required: true }]}>
              <Input.TextArea rows={3} />
            </Form.Item>

            <div className="field-label-row">
              <span>Contact numbers</span>
              <small>Shown on the printed invoice header</small>
            </div>
            <Form.List name="phones">
              {(fields, { add, remove }) => (
                <div className="phone-list">
                  {fields.map(({ key, name, ...restField }) => (
                    <div className="phone-row" key={key}>
                      <PhoneOutlined />
                      <Form.Item
                        {...restField}
                        name={name}
                        rules={[{ pattern: /^[0-9+\s-]{10,15}$/, message: 'Enter a valid phone number.' }]}
                        noStyle
                      >
                        <Input placeholder="Business phone number" inputMode="tel" />
                      </Form.Item>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                        disabled={fields.length === 1}
                        aria-label="Remove phone"
                      />
                    </div>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add('')}>
                    Add phone number
                  </Button>
                </div>
              )}
            </Form.List>

            <Row gutter={16} className="settings-field-gap">
              <Col xs={24} md={12}>
                <Form.Item name="instagram" label="Instagram URL">
                  <Input prefix={<InstagramOutlined />} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="website" label="Website / listing URL">
                  <Input prefix={<GlobalOutlined />} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="taxPercent"
              label="Default demo tax rate"
              tooltip="Used as the default when creating a new invoice. This is a demo setting, not a GST configuration."
            >
              <InputNumber min={0} max={50} precision={1} addonAfter="%" style={{ width: 180 }} />
            </Form.Item>

            <div className="settings-actions">
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                Save business profile
              </Button>
            </div>
          </Form>
        </SectionCard>

        <div className="settings-side">
          <SectionCard title="Invoice header preview">
            <div className="business-preview">
              <div className="invoice-brand-mark">MF</div>
              <div>
                <strong>{business.name}</strong>
                <p>{business.address}</p>
                <div className="business-preview-phones">
                  {business.phones.map((phone) => (
                    <span key={phone}>{phone}</span>
                  ))}
                </div>
                <div className="business-preview-links">
                  <span>{business.instagram}</span>
                  <span>{business.website}</span>
                </div>
              </div>
            </div>
            <p className="form-hint">
              The same header is used on the printable invoice. Contact links are displayed as text so they remain visible on paper.
            </p>
          </SectionCard>

          <SectionCard title="Demo data controls">
            <p className="muted-text">
              This application is a frontend-only demonstration. All products, customers, suppliers, invoices, purchases, stock
              quantities and sales figures are fictional sample data.
            </p>
            <p className="muted-text">
              Changes are stored in your browser using localStorage. Nothing is sent to a server. Use Reset demo data to restore
              the original sample set.
            </p>
            <Button danger block icon={<ReloadOutlined />} onClick={resetDemo}>
              Reset demo data
            </Button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
