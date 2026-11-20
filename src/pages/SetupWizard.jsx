import { useEffect, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Steps,
  Switch,
} from 'antd';
import { CheckCircleOutlined, FolderOpenOutlined, UploadOutlined } from '@ant-design/icons';
import { api, errorMessage } from '@/app/api';
import { useSession } from '@/app/SessionContext';

function lines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function SetupWizard({ firstRun = false, onFinish }) {
  const { setupOwner, completeSetup } = useSession();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [ownerDone, setOwnerDone] = useState(!firstRun);
  const [logo, setLogo] = useState(null);
  const [saving, setSaving] = useState(false);

  const steps = [
    ...(firstRun ? [{ key: 'owner', title: 'Owner' }] : []),
    { key: 'business', title: 'Business' },
    { key: 'tax', title: 'GST & tax' },
    { key: 'invoice', title: 'Invoice & print' },
    { key: 'backup', title: 'Backup' },
    { key: 'review', title: 'Review' },
  ];
  const current = steps[step];

  useEffect(() => {
    if (!ownerDone) return undefined;
    let active = true;
    Promise.all([api('settings.get'), api('settings.getLogo')])
      .then(([settings, logoInfo]) => {
        if (!active) return;
        setLogo(logoInfo);
        form.setFieldsValue({
          businessName: settings.business.name || '',
          legalName: settings.business.legalName || '',
          phone: settings.business.phone || '',
          altPhone: settings.business.altPhone || '',
          email: settings.business.email || '',
          addressLines: (settings.business.addressLines || []).join('\n'),
          city: settings.business.city || '',
          stateName: settings.business.stateName || '',
          stateCode: settings.business.stateCode || '',
          mapUrl: settings.business.mapUrl || '',
          returnPolicy: settings.business.returnPolicy || '',
          gstin: settings.tax.gstin || '',
          taxEnabled: Boolean(settings.tax.enabled),
          defaultRatePercent: Number(settings.tax.defaultRateBp || 0) / 100,
          invoiceTitle: settings.tax.invoiceTitle || 'Invoice',
          prefix: settings.invoice.prefix || 'MF',
          purchasePrefix: settings.invoice.purchasePrefix || 'PUR',
          receiptWidthMm: settings.hardware.receiptWidthMm || 77,
          terms: settings.invoice.terms || '',
          thankYou: settings.invoice.thankYou || '',
          whatsappCaption: settings.receipt.whatsappCaption || '',
          footerNote: settings.receipt.footerNote || '',
          backupEnabled: Boolean(settings.backup.enabled),
          backupDirectory: settings.backup.directory || '',
          backupIntervalHours: settings.backup.intervalHours || 24,
          backupRetention: settings.backup.retention || 30,
        });
      })
      .catch((error) => message.error(errorMessage(error)));
    return () => {
      active = false;
    };
  }, [ownerDone, form, message]);

  async function chooseLogo() {
    try {
      const result = await api('settings.chooseLogo');
      if (result.changed) {
        setLogo(result.logo);
        message.success('Logo saved.');
      }
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function chooseBackupFolder() {
    try {
      const result = await api('backup.chooseDirectory');
      if (result?.path) form.setFieldValue('backupDirectory', result.path);
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function backUpNow() {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      await api('settings.updateBackup', {
        enabled: values.backupEnabled,
        directory: values.backupDirectory || '',
        intervalHours: values.backupIntervalHours,
        retention: values.backupRetention,
      });
      await api('backup.create');
      message.success('Backup created and verified.', 6);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    setSaving(true);
    try {
      if (current.key === 'owner') {
        const value = await form.validateFields([
          'ownerName',
          'ownerMobile',
          'ownerPassword',
          'ownerConfirm',
        ]);
        if (value.ownerPassword !== value.ownerConfirm) {
          message.error('Passwords do not match.');
          return;
        }
        await setupOwner({
          name: value.ownerName,
          mobile: value.ownerMobile,
          password: value.ownerPassword,
        });
        setOwnerDone(true);
        setStep(step + 1);
        return;
      }
      const value = form.getFieldsValue();
      if (current.key === 'business') {
        await api('settings.updateBusiness', {
          name: value.businessName,
          legalName: value.legalName || '',
          phone: value.phone || '',
          altPhone: value.altPhone || '',
          email: value.email || '',
          addressLines: lines(value.addressLines),
          city: value.city || '',
          stateName: value.stateName || '',
          stateCode: value.stateCode || '',
          mapUrl: value.mapUrl || '',
          returnPolicy: value.returnPolicy || '',
        });
      }
      if (current.key === 'tax') {
        await api('settings.updateTax', {
          enabled: Boolean(value.taxEnabled),
          gstin: value.gstin || '',
          defaultRateBp: Math.round(Number(value.defaultRatePercent || 0) * 100),
          invoiceTitle: value.invoiceTitle || 'Invoice',
        });
      }
      if (current.key === 'invoice') {
        await api('settings.updateInvoice', {
          prefix: value.prefix,
          purchasePrefix: value.purchasePrefix,
        });
        await api('settings.updatePrint', {
          receiptWidthMm: value.receiptWidthMm,
          terms: value.terms || '',
          thankYou: value.thankYou || '',
          whatsappCaption: value.whatsappCaption || '',
          footerNote: value.footerNote || '',
        });
      }
      if (current.key === 'backup') {
        await api('settings.updateBackup', {
          enabled: Boolean(value.backupEnabled),
          directory: value.backupDirectory || '',
          intervalHours: value.backupIntervalHours,
          retention: value.backupRetention,
        });
      }
      if (current.key === 'review') {
        if (firstRun) completeSetup();
        message.success('Software configured.');
        onFinish?.();
        return;
      }
      setStep(step + 1);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const value = form.getFieldsValue();

  return (
    <div className="setup-wizard">
      <Steps current={step} size="small" items={steps.map((item) => ({ title: item.title }))} />

      <Form form={form} layout="vertical" requiredMark={false}>
        <div className="setup-wizard-body">
        {current.key === 'owner' ? (
          <>
            <Alert
              type="info"
              showIcon
              message="Create the first owner account"
              description="This account controls settings, staff, GST and backups. You can continue the guided configuration immediately after this step."
            />
            <div className="form-grid two">
              <Form.Item name="ownerName" label="Owner name" rules={[{ required: true, max: 120 }]}>
                <Input autoFocus />
              </Form.Item>
              <Form.Item name="ownerMobile" label="Mobile number" rules={[{ required: true, len: 10 }]}>
                <Input inputMode="tel" maxLength={10} />
              </Form.Item>
            </div>
            <div className="form-grid two">
              <Form.Item name="ownerPassword" label="Password / PIN" rules={[{ required: true, min: 6 }]}>
                <Input.Password />
              </Form.Item>
              <Form.Item
                name="ownerConfirm"
                label="Confirm password"
                dependencies={['ownerPassword']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator(_, input) {
                      return !input || getFieldValue('ownerPassword') === input
                        ? Promise.resolve()
                        : Promise.reject(new Error('Passwords do not match.'));
                    },
                  }),
                ]}
              >
                <Input.Password />
              </Form.Item>
            </div>
          </>
        ) : null}

        {current.key === 'business' ? (
          <>
            <div className="form-grid two">
              <Form.Item name="businessName" label="Business name" rules={[{ required: true, max: 160 }]}>
                <Input />
              </Form.Item>
              <Form.Item name="legalName" label="Legal business name">
                <Input />
              </Form.Item>
            </div>
            <div className="form-grid three">
              <Form.Item name="phone" label="Primary mobile">
                <Input inputMode="tel" />
              </Form.Item>
              <Form.Item name="altPhone" label="Alternate mobile">
                <Input inputMode="tel" />
              </Form.Item>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </div>
            <Form.Item name="addressLines" label="Address lines" extra="One line per row.">
              <Input.TextArea rows={3} />
            </Form.Item>
            <div className="form-grid three">
              <Form.Item name="city" label="City">
                <Input />
              </Form.Item>
              <Form.Item name="stateName" label="State">
                <Input />
              </Form.Item>
              <Form.Item name="stateCode" label="State code">
                <Input maxLength={8} />
              </Form.Item>
            </div>
            <div className="form-grid two">
              <Form.Item name="mapUrl" label="Map link" extra="Optional; opens in the browser.">
                <Input placeholder="https://maps.google.com/..." />
              </Form.Item>
              <Form.Item name="returnPolicy" label="Return / exchange policy">
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </div>
          </>
        ) : null}

        {current.key === 'tax' ? (
          <>
            <Alert
              type="info"
              showIcon
              message="GST is enabled only with a verified GSTIN"
              description="Do not enter an invented GSTIN. Tax invoices are prepared locally; this software does not file GST returns."
            />
            <div className="form-grid two">
              <Form.Item name="taxEnabled" label="Enable GST / tax invoicing" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="gstin" label="GSTIN" extra="15 characters, as registered.">
                <Input maxLength={15} style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </div>
            <div className="form-grid two">
              <Form.Item name="defaultRatePercent" label="Default tax rate (%)">
                <InputNumber min={0} max={28} precision={2} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="invoiceTitle" label="Invoice title">
                <Select
                  options={[
                    { value: 'Invoice', label: 'Invoice' },
                    { value: 'Tax Invoice', label: 'Tax Invoice' },
                  ]}
                />
              </Form.Item>
            </div>
          </>
        ) : null}

        {current.key === 'invoice' ? (
          <>
            <div className="form-grid three">
              <Form.Item name="prefix" label="Invoice prefix" rules={[{ required: true, max: 12 }]}>
                <Input style={{ textTransform: 'uppercase' }} />
              </Form.Item>
              <Form.Item name="purchasePrefix" label="Purchase prefix" rules={[{ required: true, max: 12 }]}>
                <Input style={{ textTransform: 'uppercase' }} />
              </Form.Item>
              <Form.Item name="receiptWidthMm" label="Receipt paper">
                <Select
                  options={[
                    { value: 77, label: '77 mm (thermal roll)' },
                    { value: 58, label: '58 mm' },
                  ]}
                />
              </Form.Item>
            </div>
            <div className="form-grid two">
              <Form.Item name="thankYou" label="Thank-you heading">
                <Input maxLength={300} />
              </Form.Item>
              <Form.Item name="footerNote" label="Footer message">
                <Input maxLength={500} />
              </Form.Item>
            </div>
            <Form.Item name="terms" label="Terms and conditions">
              <Input.TextArea rows={2} maxLength={1000} />
            </Form.Item>
            <Form.Item
              name="whatsappCaption"
              label="WhatsApp caption"
              extra="Placeholders: {customer}, {invoice}, {amount}, {shop}."
            >
              <Input.TextArea rows={2} maxLength={1000} />
            </Form.Item>
            <div className="logo-config">
              <div className={`logo-preview${logo?.dataUrl ? '' : ' is-empty'}`}>
                {logo?.dataUrl ? <img src={logo.dataUrl} alt="Business logo" /> : <span>No logo</span>}
              </div>
              <div className="logo-config-copy">
                <strong>{logo?.dataUrl ? 'Logo configured' : 'Add a business logo'}</strong>
                <p className="muted small">Optional. The MF fallback is used when no logo is set.</p>
                <Button icon={<UploadOutlined />} onClick={chooseLogo}>
                  {logo?.dataUrl ? 'Change logo' : 'Choose logo'}
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {current.key === 'backup' ? (
          <>
            <Alert
              type="info"
              showIcon
              message="Automatic backups protect your shop data"
              description="Keep the folder on a separate drive where possible. Every backup is checked before it is reported as successful."
            />
            <Form.Item name="backupEnabled" label="Automatic daily backup" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="backupDirectory" label="Backup folder">
              <Input readOnly addonAfter={<Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={chooseBackupFolder} />} />
            </Form.Item>
            <div className="form-grid two">
              <Form.Item name="backupIntervalHours" label="Interval (hours)">
                <InputNumber min={1} max={168} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="backupRetention" label="Keep latest">
                <InputNumber min={2} max={365} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <Button onClick={backUpNow} loading={saving} icon={<CheckCircleOutlined />}>
              Save and back up now
            </Button>
          </>
        ) : null}

        {current.key === 'review' ? (
          <>
            <Alert
              type="success"
              showIcon
              message="Review the configuration"
              description="You can reopen this guide later from Settings. Nothing is uploaded; all data stays on this computer."
            />
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Business">{value.businessName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{value.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="City">{value.city || '—'}</Descriptions.Item>
              <Descriptions.Item label="State">{value.stateName || '—'}</Descriptions.Item>
              <Descriptions.Item label="GSTIN">{value.gstin || 'Not configured'}</Descriptions.Item>
              <Descriptions.Item label="Tax">{value.taxEnabled ? 'Enabled' : 'Disabled'}</Descriptions.Item>
              <Descriptions.Item label="Invoice prefix">{value.prefix || '—'}</Descriptions.Item>
              <Descriptions.Item label="Receipt paper">{value.receiptWidthMm || 77} mm</Descriptions.Item>
              <Descriptions.Item label="Backup folder" span={2}>
                {value.backupDirectory || 'Default application folder'}
              </Descriptions.Item>
              <Descriptions.Item label="Logo" span={2}>
                {logo?.dataUrl ? 'Configured' : 'MF fallback'}
              </Descriptions.Item>
            </Descriptions>
          </>
        ) : null}
        </div>
      </Form>

      <div className="setup-wizard-actions">
        <Space>
          {step > 0 && !(firstRun && step === 1 && !ownerDone) ? (
            <Button onClick={() => setStep(step - 1)} disabled={saving}>
              Back
            </Button>
          ) : null}
          <Button type="primary" onClick={next} loading={saving}>
            {current.key === 'review' ? 'Finish setup' : 'Save and continue'}
          </Button>
        </Space>
      </div>
    </div>
  );
}
