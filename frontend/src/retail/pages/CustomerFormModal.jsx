import { useEffect } from 'react';
import { App, Button, Col, Form, Input, Modal, Row } from 'antd';
import { customerService } from '@/retail/services/customerService';

export default function CustomerFormModal({ open, customer, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const isEdit = Boolean(customer);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (customer) form.setFieldsValue(customer);
  }, [open, customer, form]);

  const submit = (values) => {
    try {
      const saved = isEdit ? customerService.update(customer.id, values) : customerService.create(values);
      message.success(isEdit ? 'Customer updated.' : 'Customer added.');
      onSaved?.(saved);
      onClose();
    } catch (error) {
      message.error(error.message || 'Could not save the customer.');
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit customer' : 'Add customer'}
      onCancel={onClose}
      footer={null}
      width={620}
      destroyOnClose
      className="form-modal"
    >
      <p className="modal-intro">
        Customer data in this demo is fictional. Invoice history and outstanding balances update automatically.
      </p>
      <Form form={form} layout="vertical" onFinish={submit} requiredMark="optional">
        <Row gutter={14}>
          <Col xs={24} md={12}>
            <Form.Item name="name" label="Full name" rules={[{ required: true, message: 'Enter the customer name.' }]}>
              <Input placeholder="e.g. Aarav Mehta" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="phone"
              label="Phone"
              rules={[
                { required: true, message: 'Enter a phone number.' },
                { pattern: /^[0-9+\s-]{10,15}$/, message: 'Enter a valid phone number.' },
              ]}
            >
              <Input placeholder="10-digit mobile number" inputMode="tel" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="email" label="Email (optional)" rules={[{ type: 'email', message: 'Enter a valid email address.' }]}>
          <Input placeholder="customer@example.com" />
        </Form.Item>
        <Form.Item name="address" label="Address">
          <Input.TextArea rows={2} placeholder="Area, city" />
        </Form.Item>
        <div className="modal-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit">
            {isEdit ? 'Save changes' : 'Add customer'}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
