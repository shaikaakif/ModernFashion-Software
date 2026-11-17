import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { LockOutlined, MobileOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons';
import { useSession } from '@/app/SessionContext';
import BrandMark from '@/app/BrandMark';
import { errorMessage } from '@/app/api';

export default function SetupPage() {
  const { setupOwner, business } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();

  async function submit(values) {
    setBusy(true);
    setError('');
    try {
      await setupOwner(values);
    } catch (setupError) {
      setError(errorMessage(setupError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <section className="auth-brand">
        <BrandMark size={58} />
        <div className="auth-brand-copy">
          <span className="eyebrow">First-time setup</span>
          <h1>MODERN FASHION</h1>
          <p className="auth-brand-note">
            This creates the owner account and the local store database. No demo products, customers or sales
            are added. You will add the real catalogue after signing in.
          </p>
        </div>
        <div className="auth-brand-foot">
          <span>Data stays on this computer</span>
          <span>Engineered by Meninges Labs</span>
        </div>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-card auth-form-wide">
          <span className="eyebrow">Owner account</span>
          <h2>Set up the store</h2>
          <p className="auth-lead">
            Write down the password and keep it safe. There is no online account recovery.
          </p>
          {error ? <Alert type="error" showIcon message={error} className="auth-alert" /> : null}
          <Form
            form={form}
            layout="vertical"
            onFinish={submit}
            requiredMark={false}
            initialValues={{
              businessName: business?.name || 'MODERN FASHION',
              businessPhone: business?.phone || '',
            }}
          >
            <div className="form-grid two">
              <Form.Item name="name" label="Owner name" rules={[{ required: true, max: 120 }]}>
                <Input prefix={<UserOutlined />} placeholder="Name of the owner" autoFocus />
              </Form.Item>
              <Form.Item
                name="mobile"
                label="Owner mobile number"
                rules={[
                  { required: true, message: 'Enter the owner mobile number.' },
                  { pattern: /^[0-9+\s-]{10,15}$/, message: 'Enter a valid mobile number.' },
                ]}
              >
                <Input prefix={<MobileOutlined />} inputMode="tel" placeholder="10-digit mobile number" />
              </Form.Item>
            </div>
            <div className="form-grid two">
              <Form.Item name="password" label="Password or PIN" rules={[{ required: true, min: 6 }]}>
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label="Confirm password"
                dependencies={['password']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      return !value || getFieldValue('password') === value
                        ? Promise.resolve()
                        : Promise.reject(new Error('Passwords do not match.'));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
            </div>
            <div className="form-grid two">
              <Form.Item name="businessName" label="Business name" rules={[{ required: true, max: 160 }]}>
                <Input prefix={<ShopOutlined />} />
              </Form.Item>
              <Form.Item name="businessPhone" label="Store phone">
                <Input inputMode="tel" />
              </Form.Item>
            </div>
            <Button type="primary" htmlType="submit" block loading={busy} size="large" className="auth-submit">
              Create owner account and open the store
            </Button>
          </Form>
        </div>
      </section>
    </div>
  );
}
