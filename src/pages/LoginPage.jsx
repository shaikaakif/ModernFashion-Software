import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { LockOutlined, MobileOutlined } from '@ant-design/icons';
import { useSession } from '@/app/SessionContext';
import { errorMessage } from '@/app/api';

export default function LoginPage() {
  const { login, business, lockReason } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();

  async function submit(values) {
    setBusy(true);
    setError('');
    try {
      await login(values);
    } catch (loginError) {
      setError(errorMessage(loginError));
      form.setFieldValue('password', '');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <section className="auth-brand">
        <div className="brand-mark brand-mark-large">MF</div>
        <div className="auth-brand-copy">
          <span className="eyebrow">Retail point of sale</span>
          <h1>{business?.name || 'MODERN FASHION'}</h1>
          <address>
            {(business?.addressLines || []).map((line) => (
              <span key={line}>{line}</span>
            ))}
            {business?.stateCode ? (
              <span>
                {business.stateCode} - {business.stateName}
              </span>
            ) : null}
            {business?.phone ? <span>{business.phone}</span> : null}
          </address>
        </div>
        <div className="auth-brand-foot">
          <span>Offline-first billing and stock</span>
          <span>Engineered by Meninges Labs</span>
        </div>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-card">
          <span className="eyebrow">Staff sign in</span>
          <h2>{lockReason ? 'Welcome back' : 'Sign in to your counter'}</h2>
          <p className="auth-lead">
            Use the mobile number and password registered by the owner. The screen locks automatically when
            the counter is idle.
          </p>
          {lockReason === 'expired' ? (
            <Alert
              type="warning"
              showIcon
              message="Session expired"
              description="Sign in again to resume. The open cash shift is unchanged."
              className="auth-alert"
            />
          ) : null}
          {lockReason === 'locked' ? (
            <Alert
              type="info"
              showIcon
              message="Screen locked"
              description="Sign in again to resume this shift."
              className="auth-alert"
            />
          ) : null}
          {error ? <Alert type="error" showIcon message={error} className="auth-alert" /> : null}

          <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} size="large">
            <Form.Item
              name="mobile"
              label="Registered mobile number"
              rules={[
                { required: true, message: 'Enter your mobile number.' },
                { pattern: /^[0-9+\s-]{10,15}$/, message: 'Enter a valid mobile number.' },
              ]}
            >
              <Input
                prefix={<MobileOutlined />}
                placeholder="10-digit mobile number"
                autoComplete="username"
                inputMode="tel"
                autoFocus
              />
            </Form.Item>
            <Form.Item name="password" label="Password or PIN" rules={[{ required: true }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="Your password or PIN" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={busy} className="auth-submit">
              Sign in
            </Button>
          </Form>
          <p className="auth-small">
            Local accounts reduce accidental access, but they do not replace a Windows login, lock screen or
            physical control of the computer.
          </p>
        </div>
      </section>
    </div>
  );
}
