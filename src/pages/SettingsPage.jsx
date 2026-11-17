import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  App as AntApp,
  AutoComplete,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'antd';
import {
  BarcodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import JsBarcode from 'jsbarcode';
import { api, errorMessage } from '@/app/api';
import { useAsync } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDateTime, money, percentFromBp } from '@/app/format';
import { LoadingPanel, MoneyInput, PageHeader, SectionCard } from '@/app/components';
import { barcodeExample, BARCODE_SYMBOLOGY } from '@shared/barcode.js';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'credit', label: 'Credit / pay later' },
];

function filesize(bytes) {
  const value = Number(bytes || 0);
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value > 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

export default function SettingsPage() {
  const { can, refresh, refreshBranding } = useSession();
  const { message, modal } = AntApp.useApp();
  const [tab, setTab] = useState('business');
  const [saving, setSaving] = useState('');
  const [printers, setPrinters] = useState([]);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [offerModal, setOfferModal] = useState({ open: false, record: null });
  const [restorePath, setRestorePath] = useState('');
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [preview, setPreview] = useState({ html: '', widthMm: 80, error: '' });
  const [previewNonce, setPreviewNonce] = useState(0);
  const barcodeRef = useRef(null);

  const settings = useAsync(() => api('settings.get'), []);
  const logo = useAsync(() => api('settings.getLogo'), []);
  const appInfo = useAsync(() => api('app.info'), []);
  const backups = useAsync(
    () => (can('backup.manage') ? api('backup.list') : Promise.resolve([])),
    []
  );
  const diagnostics = useAsync(
    () => (can('backup.manage') ? api('app.diagnostics') : Promise.resolve(null)),
    []
  );

  const [businessForm] = Form.useForm();
  const [invoiceForm] = Form.useForm();
  const [printForm] = Form.useForm();
  const [taxForm] = Form.useForm();
  const [posForm] = Form.useForm();
  const [hardwareForm] = Form.useForm();
  const [backupForm] = Form.useForm();
  const [offerForm] = Form.useForm();
  const [restoreForm] = Form.useForm();
  const offerType = Form.useWatch('discountType', offerForm);
  const printValues = Form.useWatch([], printForm);

  const data = settings.data;

  useEffect(() => {
    if (!data) return;
    businessForm.setFieldsValue({
      ...data.business,
      addressLines: (data.business.addressLines || []).join('\n'),
    });
    invoiceForm.setFieldsValue(data.invoice);
    printForm.setFieldsValue({
      ...data.invoice,
      ...data.receipt,
      receiptWidthMm: data.hardware.receiptWidthMm,
      barcodePrefix: data.barcode.prefix,
      barcodeDigits: data.barcode.digits,
    });
    taxForm.setFieldsValue({
      ...data.tax,
      defaultRatePercent: Number(data.tax.defaultRateBp || 0) / 100,
    });
    posForm.setFieldsValue(data.pos);
    hardwareForm.setFieldsValue(data.hardware);
    backupForm.setFieldsValue(data.backup);
  }, [data, businessForm, invoiceForm, printForm, taxForm, posForm, hardwareForm, backupForm]);

  let barcodeText = '';
  let barcodeError = '';
  try {
    barcodeText =
      printValues?.barcodePrefix !== undefined && printValues?.barcodeDigits !== undefined
        ? barcodeExample(printValues.barcodePrefix, printValues.barcodeDigits)
        : '';
  } catch (error) {
    barcodeError = error.message;
  }

  useEffect(() => {
    const node = barcodeRef.current;
    if (!node) return;
    if (!barcodeText) {
      node.innerHTML = '';
      return;
    }
    try {
      JsBarcode(node, barcodeText, {
        format: 'CODE128',
        width: 2,
        height: 58,
        displayValue: true,
        fontSize: 14,
        margin: 8,
        background: '#ffffff',
        lineColor: '#111111',
      });
    } catch {
      // The visible error message already explains an invalid format.
    }
  }, [barcodeText]);

  const printSignature = printValues ? JSON.stringify(printValues) : '';

  useEffect(() => {
    if (!data || !printSignature) return undefined;
    const timer = setTimeout(async () => {
      setPreviewBusy(true);
      try {
        const result = await api('print.previewReceipt', JSON.parse(printSignature));
        setPreview({ html: result.html, widthMm: result.widthMm, error: '' });
      } catch (error) {
        setPreview((current) => ({ ...current, error: errorMessage(error) }));
      } finally {
        setPreviewBusy(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [data, printSignature, previewNonce]);

  useEffect(() => {
    if (!offerModal.open) return;
    offerForm.resetFields();
    if (offerModal.record) {
      const record = offerModal.record;
      offerForm.setFieldsValue({
        name: record.name,
        discountType: record.discountType,
        valuePercent: record.discountType === 'percent' ? record.value / 100 : null,
        valuePaise: record.discountType === 'fixed' ? record.value : 0,
        minBillPaise: record.minBillPaise,
        maxDiscountPaise: record.maxDiscountPaise,
        startsOn: record.startsOn ? dayjs(record.startsOn) : null,
        endsOn: record.endsOn ? dayjs(record.endsOn) : null,
        priority: record.priority,
        status: record.status,
      });
    } else {
      offerForm.setFieldsValue({
        discountType: 'percent',
        valuePercent: 10,
        valuePaise: 0,
        minBillPaise: 0,
        maxDiscountPaise: 0,
        priority: 100,
        status: 'active',
      });
    }
  }, [offerModal, offerForm]);

  useEffect(() => {
    if (restoreOpen) restoreForm.resetFields();
  }, [restoreOpen, restoreForm]);

  async function reloadSettings() {
    settings.reload();
    await refresh().catch(() => {});
  }

  async function save(kind, request, successMessage) {
    setSaving(kind);
    try {
      await request();
      message.success(successMessage);
      await reloadSettings();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving('');
    }
  }

  function submitBusiness(values) {
    const addressLines = String(values.addressLines || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    save(
      'business',
      () => api('settings.updateBusiness', { ...values, addressLines }),
      'Business details saved. Receipts and reports use these details.'
    );
  }

  function submitInvoice(values) {
    save('invoice', () => api('settings.updateInvoice', values), 'Invoice numbering saved.');
  }

  function submitPrint(values) {
    save(
      'print',
      () => api('settings.updatePrint', values),
      'Print layout and barcode format saved. Existing barcodes were not changed.'
    );
  }

  function submitTax(values) {
    save(
      'tax',
      () =>
        api('settings.updateTax', {
          ...values,
          defaultRateBp: Math.round(Number(values.defaultRatePercent || 0) * 100),
        }),
      'Tax settings saved.'
    );
  }

  function submitPos(values) {
    save('pos', () => api('settings.updatePos', values), 'Billing and security settings saved.');
  }

  function submitHardware(values) {
    save('hardware', () => api('settings.updateHardware', values), 'Printer and label settings saved. Physical output is still unverified.');
  }

  function submitBackup(values) {
    save('backup', () => api('settings.updateBackup', values), 'Backup schedule saved.');
  }

  async function chooseLogo() {
    setLogoBusy(true);
    try {
      const result = await api('settings.chooseLogo');
      if (result.changed) {
        if (result.logo) logo.setData(result.logo);
        else logo.reload();
        message.success('Logo saved. Sidebar, login, reports and print previews now use it.');
        await reloadSettings();
        await refreshBranding();
      }
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setLogoBusy(false);
    }
  }

  async function clearLogo() {
    setLogoBusy(true);
    try {
      const result = await api('settings.clearLogo');
      if (result?.logo) logo.setData(result.logo);
      else logo.reload();
      message.success('Logo removed. Every screen and document now uses the MF fallback.');
      await reloadSettings();
      await refreshBranding();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setLogoBusy(false);
    }
  }

  async function loadPrinters() {
    setPrinterBusy(true);
    try {
      setPrinters(await api('print.printers'));
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setPrinterBusy(false);
    }
  }

  async function testPrint(kind) {
    setPrinterBusy(true);
    try {
      await api(kind === 'receipt' ? 'print.testReceipt' : 'print.testLabel');
      message.success(
        `Test ${kind} sent to the Windows printer driver. Check the physical output — driver acceptance is not proof of a good print.`
      );
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setPrinterBusy(false);
    }
  }

  function submitOffer(values) {
    setSaving('offer');
    const payload = {
      name: values.name,
      discountType: values.discountType,
      value:
        values.discountType === 'percent'
          ? Math.round(Number(values.valuePercent || 0) * 100)
          : values.valuePaise || 0,
      minBillPaise: values.minBillPaise || 0,
      maxDiscountPaise: values.maxDiscountPaise || 0,
      startsOn: values.startsOn?.format('YYYY-MM-DD') || '',
      endsOn: values.endsOn?.format('YYYY-MM-DD') || '',
      priority: values.priority,
      status: values.status,
      id: offerModal.record?.id,
    };
    api('settings.saveOffer', payload)
      .then(() => {
        message.success(offerModal.record ? 'Offer updated.' : 'Offer created.');
        setOfferModal({ open: false, record: null });
        settings.reload();
      })
      .catch((error) => message.error(errorMessage(error)))
      .finally(() => setSaving(''));
  }

  async function deactivateOffer(record) {
    try {
      await api('settings.deleteOffer', { id: record.id });
      message.success('Offer deactivated.');
      settings.reload();
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function createBackup() {
    setSaving('backupNow');
    try {
      const result = await api('backup.create');
      message.success(`Verified backup created: ${result.path}`, 6);
      backups.reload();
      diagnostics.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving('');
    }
  }

  async function chooseBackupDirectory() {
    try {
      const result = await api('backup.chooseDirectory');
      if (result?.path) {
        backupForm.setFieldValue('directory', result.path);
        message.info('Folder selected. Save the backup schedule to keep it.');
      }
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function verifyBackup() {
    try {
      const chosen = await api('backup.chooseFile');
      if (!chosen?.path) return;
      const result = await api('backup.verify', { path: chosen.path });
      modal.success({
        title: 'Backup verified',
        content: (
          <div>
            <p>The SQLite integrity check passed and the expected tables are present.</p>
            <p className="mono small break-all">{result.path}</p>
            <p className="muted small">SHA-256: {result.sha256}</p>
            <p className="muted small">Size: {filesize(result.sizeBytes)}</p>
          </div>
        ),
      });
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function chooseRestore() {
    try {
      const chosen = await api('backup.chooseFile');
      if (!chosen?.path) return;
      const verification = await api('backup.verify', { path: chosen.path });
      setRestorePath(chosen.path);
      setRestoreOpen(true);
      message.info(`Backup verified (${filesize(verification.sizeBytes)}). Review the confirmation carefully.`);
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function submitRestore(values) {
    setSaving('restore');
    try {
      const result = await api('backup.restore', { path: restorePath, confirm: values.confirm });
      setRestoreOpen(false);
      modal.success({
        title: 'Restore accepted',
        content: (
          <div>
            <p>The database will be replaced and the application will restart.</p>
            <p className="small break-all">Safety backup: {result.safetyBackup}</p>
          </div>
        ),
        okText: 'Understood',
      });
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving('');
    }
  }

  async function openDataFolder() {
    try {
      await api('app.openDataFolder');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  const printerOptions = printers.map((printer) => ({
    value: printer.name,
    label: `${printer.displayName}${printer.isDefault ? ' (default)' : ''}`,
  }));

  const businessPanel = settings.loading && !data ? (
    <LoadingPanel label="Loading settings…" />
  ) : (
    <div className="settings-stack">
      <SectionCard title="Business identity" subtitle="Used on receipts, invoices, reports and barcode labels.">
        <Form form={businessForm} layout="vertical" onFinish={submitBusiness} requiredMark={false}>
          <div className="form-grid two">
            <Form.Item name="name" label="Business name" rules={[{ required: true, max: 160 }]}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input inputMode="tel" />
            </Form.Item>
          </div>
          <Form.Item
            name="addressLines"
            label="Address lines"
            extra="One line per row. Keep the format used on the receipt."
            rules={[{ required: true, message: 'Add at least one address line.' }]}
          >
            <Input.TextArea rows={4} />
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
          <div className="form-grid three">
            <Form.Item name="altPhone" label="Alternate phone">
              <Input inputMode="tel" />
            </Form.Item>
            <Form.Item name="email" label="Email">
              <Input type="email" />
            </Form.Item>
            <Form.Item name="legalName" label="Legal name" extra="Only if registered differently.">
              <Input />
            </Form.Item>
          </div>
          <Form.Item
            name="gstin"
            label="Business GSTIN"
            extra="Leave blank unless the client supplies a verified GSTIN. The software does not invent one."
          >
            <Input maxLength={20} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving === 'business'}>
            Save business details
          </Button>
        </Form>
      </SectionCard>

      <SectionCard title="Logo" subtitle="The saved logo appears on receipts, invoices and the print preview.">
        <div className="logo-config">
          <div className={`logo-preview${logo.data?.dataUrl ? '' : ' is-empty'}`}>
            {logo.data?.dataUrl ? (
              <img src={logo.data.dataUrl} alt="Current business logo" />
            ) : (
              <span>{logo.loading ? 'Loading…' : 'No logo image'}</span>
            )}
          </div>
          <div className="logo-config-copy">
            <Alert
              type={data?.hasLogo ? 'success' : 'info'}
              showIcon
              message={data?.hasLogo ? 'A logo file is configured for print.' : 'No logo is configured yet.'}
              description="Choose a PNG, JPG, WebP, GIF or BMP file up to 5 MB. The image is resized to a maximum of 1024 px, stored in the local data folder and included in backups. Aspect ratio is preserved."
            />
            <Space wrap className="section-gap-sm">
              <Button icon={<UploadOutlined />} onClick={chooseLogo} loading={logoBusy}>
                {data?.hasLogo ? 'Change logo file' : 'Choose logo file'}
              </Button>
              {data?.hasLogo ? (
                <Popconfirm title="Remove the configured logo?" onConfirm={clearLogo} okText="Remove" cancelText="Keep">
                  <Button danger icon={<DeleteOutlined />} loading={logoBusy}>
                    Remove logo
                  </Button>
                </Popconfirm>
              ) : null}
            </Space>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const billingPanel = (
    <div className="settings-stack">
      <SectionCard title="Invoice numbering" subtitle="Sequences are allocated only when a sale or purchase is completed.">
        <Form form={invoiceForm} layout="vertical" onFinish={submitInvoice} requiredMark={false}>
          <div className="form-grid two">
            <Form.Item name="prefix" label="Invoice prefix" rules={[{ required: true, max: 12 }]}>
              <Input style={{ textTransform: 'uppercase' }} />
            </Form.Item>
            <Form.Item name="purchasePrefix" label="Purchase prefix" rules={[{ required: true, max: 12 }]}>
              <Input style={{ textTransform: 'uppercase' }} />
            </Form.Item>
          </div>
          <Alert
            type="info"
            showIcon
            message="Paper width, logo, layout and barcode format moved to Print & barcodes."
            description="That section shows a live sample receipt and a barcode preview before you save."
          />
          <div className="section-gap-sm">
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving === 'invoice'}>
              Save invoice numbering
            </Button>
          </div>
        </Form>
      </SectionCard>
    </div>
  );

  const logoOn = printValues?.showLogo !== false;
  const previewWidth = Math.round((preview.widthMm || 80) * 3.78);

  const printPanel = (
    <div className="settings-stack">
      <Alert
        type="info"
        showIcon
        message="The preview below is a sample receipt, not a sale. The real print uses the same layout engine."
        description="Existing product barcodes keep their current values. Changing the prefix or digit width only affects barcodes generated from now on."
      />
      <Form form={printForm} layout="vertical" onFinish={submitPrint} requiredMark={false}>
        <div className="settings-stack">
          <SectionCard
            title="Receipt layout"
            subtitle="Owner-controlled paper layout. The live preview updates as you change these values."
          >
            <div className="logo-config logo-config-compact">
              <div className={`logo-preview${logo.data?.dataUrl ? '' : ' is-empty'}`}>
                {logo.data?.dataUrl ? (
                  <img src={logo.data.dataUrl} alt="Current business logo" />
                ) : (
                  <span>{logo.loading ? 'Loading…' : 'No logo'}</span>
                )}
              </div>
              <div className="logo-config-copy">
                <strong>{logo.data?.dataUrl ? 'Logo file ready' : 'No logo file selected'}</strong>
                <p className="muted small">
                  Change or remove it in the Business tab. Logo size and visibility are controlled here.
                </p>
              </div>
            </div>
            <div className="form-grid three">
              <Form.Item name="receiptWidthMm" label="Receipt paper width">
                <Select
                  options={[
                    { value: 58, label: '58 mm' },
                    { value: 80, label: '80 mm' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="fontScale" label="Text size (%)" extra="80–130%. Values apply to the thermal receipt.">
                <InputNumber min={80} max={130} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="logoHeightMm" label="Logo height (mm)">
                <InputNumber min={8} max={30} disabled={!logoOn} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <Divider />
            <h3>Business header</h3>
            <div className="settings-switches">
              <Form.Item name="showLogo" label="Print logo" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showTitle" label="Print document title" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showAddress" label="Print address" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showPhone" label="Print phone" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showState" label="Print state" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showGstin" label="Print GSTIN (when tax is enabled)" valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
            <Divider />
            <h3>Receipt sections</h3>
            <div className="settings-switches">
              <Form.Item name="showCustomer" label="Customer" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showCashier" label="Cashier" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showSku" label="SKU on items" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showItemDiscounts" label="Item discount lines" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showTax" label="Tax rows" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showSavings" label="Savings banner" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showPayment" label="Payment method" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showAmountReceived" label="Amount received & change" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showPoweredBy" label="Powered-by line" valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
            <Divider />
            <h3>Text blocks</h3>
            <div className="form-grid two">
              <Form.Item name="headerNote" label="Header note under the title">
                <Input.TextArea rows={2} maxLength={300} placeholder="Optional line printed above the invoice details" />
              </Form.Item>
              <Form.Item name="footerNote" label="Footer note">
                <Input.TextArea rows={2} maxLength={500} placeholder="Exchange policy or a short closing note" />
              </Form.Item>
            </div>
            <div className="form-grid two">
              <Form.Item name="duplicateLabel" label="Duplicate copy label">
                <Input maxLength={40} />
              </Form.Item>
              <Form.Item name="thankYou" label="Closing line">
                <Input maxLength={300} />
              </Form.Item>
            </div>
            <Form.Item
              name="terms"
              label="Terms & conditions"
              extra="Set the final wording with the client and their CA before enabling tax invoices."
            >
              <Input.TextArea rows={3} maxLength={1000} placeholder="Return/exchange terms approved by the client" />
            </Form.Item>
          </SectionCard>

          <SectionCard
            title="Barcode format"
            subtitle={`New product barcodes use ${BARCODE_SYMBOLOGY}. Existing barcode values are never rewritten.`}
            extra={<Tag icon={<BarcodeOutlined />}>CODE128</Tag>}
          >
            <div className="form-grid two">
              <Form.Item
                name="barcodePrefix"
                label="Barcode prefix"
                rules={[
                  { required: true, message: 'Enter a prefix.' },
                  { pattern: /^[A-Za-z0-9]{2,6}$/, message: 'Use 2–6 letters or digits.' },
                ]}
                extra="Example: MF. Stored in uppercase."
              >
                <Input maxLength={6} style={{ textTransform: 'uppercase' }} />
              </Form.Item>
              <Form.Item name="barcodeDigits" label="Sequence digits" extra="6–12 digits. Wider numbers stay scannable.">
                <InputNumber min={6} max={12} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <div className="barcode-preview-card">
              {barcodeText ? <svg ref={barcodeRef} role="img" aria-label={`Barcode preview ${barcodeText}`} /> : null}
              {barcodeError ? <p className="form-error">{barcodeError}</p> : null}
              <p className="mono barcode-value">{barcodeText || 'Enter a valid prefix and digit width'}</p>
              <p className="muted small">
                Preview value only. The printed label uses the stored internal barcode, not a fabricated EAN/GTIN.
              </p>
            </div>
          </SectionCard>
        </div>
        <div className="print-save-bar">
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving === 'print'}>
            Save print & barcode settings
          </Button>
          <span className="muted small">
            Saves receipt layout, barcode format and paper width. A4 reprints use the same header, logo and footer text.
          </span>
        </div>
      </Form>

      <SectionCard
        title="Live receipt preview"
        subtitle={`Sample for ${preview.widthMm || 80} mm paper. Nothing is recorded or printed by this preview.`}
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setPreviewNonce((value) => value + 1)}
            loading={previewBusy}
          >
            Refresh preview
          </Button>
        }
      >
        <div className="receipt-preview-shell">
          {preview.error ? (
            <Alert type="error" showIcon message="Preview could not be generated" description={preview.error} />
          ) : null}
          {preview.html ? (
            <iframe
              title="Sample receipt preview"
              className="receipt-preview-frame"
              style={{ width: `${previewWidth}px` }}
              srcDoc={preview.html}
            />
          ) : (
            <LoadingPanel label="Building sample receipt…" />
          )}
        </div>
      </SectionCard>
    </div>
  );

  const taxPanel = (
    <div className="settings-stack">
      <Alert
        type="warning"
        showIcon
        message="Do not enable tax invoices without a verified GSTIN and CA approval."
        description="Tax is disabled by default and the invoice title remains “Invoice”. No GSTIN, tax rate or compliance claim is invented by this software. Confirm the registration, rates and invoice wording with the client and their CA."
      />
      <SectionCard title="Tax configuration" subtitle="Rates are stored in basis points; screens show percent.">
        <Form form={taxForm} layout="vertical" onFinish={submitTax} requiredMark={false}>
          <div className="settings-switches">
            <Form.Item name="enabled" label="Enable tax on new sales" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="pricesIncludeTax" label="Selling prices include tax" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <div className="form-grid three">
            <Form.Item name="gstin" label="GSTIN" extra="15 characters, verified with the client.">
              <Input maxLength={20} style={{ textTransform: 'uppercase' }} />
            </Form.Item>
            <Form.Item name="legalName" label="Registered legal name">
              <Input maxLength={160} />
            </Form.Item>
            <Form.Item name="defaultRatePercent" label="Default tax rate (%)">
              <InputNumber min={0} max={28} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="placeOfSupply" label="Place of supply">
            <Input maxLength={80} placeholder="36 - Telangana" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving === 'tax'}>
            Save tax settings
          </Button>
        </Form>
      </SectionCard>
    </div>
  );

  const posPanel = (
    <div className="settings-stack">
      <SectionCard title="Discounts & payment" subtitle="Limits are enforced by the sales service, not only by the screen.">
        <Form form={posForm} layout="vertical" onFinish={submitPos} requiredMark={false}>
          <div className="form-grid three">
            <Form.Item name="manualDiscountMaxPercent" label="Manager discount limit (%)">
              <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="cashierManualDiscountMaxPercent"
              label="Cashier discount limit (%)"
              extra="Cashiers without sales.discount permission cannot apply manual discounts at all."
            >
              <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="defaultPaymentMethod" label="Default payment method">
              <Select options={PAYMENT_METHODS} />
            </Form.Item>
          </div>
          <div className="form-grid three">
            <Form.Item name="lowStockThreshold" label="Default low-stock alert">
              <InputNumber min={0} max={100000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="scannerMinLength" label="Scanner minimum length">
              <InputNumber min={1} max={64} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="scannerSuffix" label="Scanner suffix">
              <Select
                options={[
                  { value: 'enter', label: 'Enter' },
                  { value: 'tab', label: 'Tab' },
                  { value: 'none', label: 'None' },
                ]}
              />
            </Form.Item>
          </div>
          <div className="settings-switches">
            <Form.Item name="allowWalkIn" label="Allow walk-in customers" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="confirmClearCart" label="Confirm before clearing a bill" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <Divider />
          <h3>Session security</h3>
          <div className="form-grid three">
            <Form.Item name="sessionIdleMinutes" label="Lock screen after (minutes)">
              <InputNumber min={5} max={480} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxLoginAttempts" label="Failed sign-ins before lockout">
              <InputNumber min={3} max={20} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="lockMinutes" label="Lockout duration (minutes)">
              <InputNumber min={1} max={240} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving === 'pos'}>
            Save billing and security settings
          </Button>
        </Form>
      </SectionCard>
    </div>
  );

  const hardwarePanel = (
    <div className="settings-stack">
      <Alert
        type="warning"
        showIcon
        message="Printer output is not yet physically verified."
        description="Reported hardware: TVS LP 46 NEO label printer, a receipt printer described as “TVS RP32 Double Zero Star”, and a wired USB HID barcode scanner. Confirm the exact Windows driver names on the counter PC and test real paper, cut, label size and scanner input before acceptance."
      />
      <SectionCard
        title="Windows printers"
        subtitle="Printing uses the installed Windows driver. Raw ESC/POS commands are not assumed."
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadPrinters} loading={printerBusy}>
            List printers
          </Button>
        }
      >
        <Form form={hardwareForm} layout="vertical" onFinish={submitHardware} requiredMark={false}>
          <div className="form-grid two">
            <Form.Item name="receiptPrinter" label="Receipt printer (Windows name)">
              <AutoComplete
                options={printerOptions}
                placeholder="Click List printers and choose the exact name"
                filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
            <Form.Item name="labelPrinter" label="Label printer (Windows name)">
              <AutoComplete
                options={printerOptions}
                placeholder="TVS LP 46 NEO as installed in Windows"
                filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
          </div>
          {printers.length ? (
            <div className="printer-list">
              {printers.map((printer) => (
                <Tag key={printer.name} color={printer.isDefault ? 'green' : 'default'}>
                  {printer.displayName}
                  {printer.status ? ` · status ${printer.status}` : ''}
                </Tag>
              ))}
            </div>
          ) : (
            <p className="muted small">No printer list loaded yet. Use List printers, then choose a name.</p>
          )}
          <div className="settings-switches">
            <Form.Item name="autoPrintReceipt" label="Print receipt automatically after a sale" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <div className="form-grid two">
            <Form.Item name="labelWidthMm" label="Label width (mm)">
              <InputNumber min={20} max={150} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="labelHeightMm" label="Label height (mm)">
              <InputNumber min={10} max={150} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div className="form-grid three">
            <Form.Item name="labelCopies" label="Label copies per print">
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="labelShowPrice" label="Label shows price" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="labelShowName" label="Label shows product name" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <div className="settings-switches">
            <Form.Item name="labelShowSku" label="Label shows SKU" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="labelShowSize" label="Label shows size" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <Space wrap>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving === 'hardware'}>
              Save printer settings
            </Button>
            <Button icon={<PrinterOutlined />} onClick={() => testPrint('receipt')} loading={printerBusy}>
              Test receipt
            </Button>
            <Button icon={<PrinterOutlined />} onClick={() => testPrint('label')} loading={printerBusy}>
              Test label
            </Button>
          </Space>
        </Form>
      </SectionCard>
    </div>
  );

  const offers = data?.offers || [];

  const offersPanel = (
    <SectionCard
      title="Automatic offers"
      subtitle="The best eligible offer is applied at billing and recorded on the invoice. Manual discounts are never combined on top."
      extra={
        <Button icon={<PlusOutlined />} onClick={() => setOfferModal({ open: true, record: null })}>
          New offer
        </Button>
      }
      bodyClassName="panel-body flush"
    >
      <Table
        rowKey="id"
        size="small"
        dataSource={offers}
        pagination={false}
        locale={{ emptyText: 'No offers configured. Billing still works without offers.' }}
        columns={[
          {
            title: 'Offer',
            dataIndex: 'name',
            render: (value, row) => (
              <div>
                <strong>{value}</strong>
                <div className="muted small">
                  {row.discountType === 'percent' ? `${percentFromBp(row.value)} off` : `${money(row.value)} off`}
                </div>
              </div>
            ),
          },
          { title: 'Minimum bill', dataIndex: 'minBillPaise', width: 130, align: 'right', render: money },
          {
            title: 'Maximum discount',
            dataIndex: 'maxDiscountPaise',
            width: 150,
            align: 'right',
            render: (value) => (value ? money(value) : 'No cap'),
          },
          {
            title: 'Valid',
            width: 190,
            render: (_, row) =>
              row.startsOn || row.endsOn
                ? `${row.startsOn || 'any'} → ${row.endsOn || 'any'}`
                : 'Always while active',
          },
          { title: 'Priority', dataIndex: 'priority', width: 80, align: 'right' },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 100,
            render: (value) => <Tag color={value === 'active' ? 'green' : 'default'}>{value}</Tag>,
          },
          {
            title: '',
            width: 110,
            render: (_, row) => (
              <Space size={2}>
                <Button type="text" icon={<EditOutlined />} onClick={() => setOfferModal({ open: true, record: row })} />
                {row.status === 'active' ? (
                  <Popconfirm title="Deactivate this offer?" onConfirm={() => deactivateOffer(row)} okText="Deactivate">
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
      <div className="panel-note">
        Offers apply to the bill subtotal. A manual discount replaces the automatic offer only when it is larger.
        Expired offers are ignored even if left active.
      </div>
    </SectionCard>
  );

  const backupPanel = can('backup.manage') ? (
    <div className="settings-stack">
      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="Backups are verified SQLite copies made on this computer."
        description="Keep at least one copy on a separate drive. Restoring replaces the live database and restarts the application. A pre-restore safety backup is always created first."
      />
      <SectionCard title="Automatic backups" subtitle="A verified copy is made when the application is running and the interval has elapsed.">
        <Form form={backupForm} layout="vertical" onFinish={submitBackup} requiredMark={false}>
          <div className="settings-switches">
            <Form.Item name="enabled" label="Enable automatic backups" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <Form.Item name="directory" label="Backup folder" extra="Ideally a separate physical drive, not the same disk.">
            <Input readOnly placeholder={diagnostics.data?.backupFolder || 'Default application backup folder'} />
          </Form.Item>
          <Space wrap className="section-gap-sm">
            <Button icon={<FolderOpenOutlined />} onClick={chooseBackupDirectory}>
              Choose folder
            </Button>
          </Space>
          <div className="form-grid two">
            <Form.Item name="intervalHours" label="Interval (hours)">
              <InputNumber min={1} max={720} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="retention" label="Automatic backups to keep">
              <InputNumber min={2} max={365} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving === 'backup'}>
            Save backup schedule
          </Button>
        </Form>
      </SectionCard>

      <SectionCard
        title="Manual backup & restore"
        subtitle="Verify a backup before using it. Restore is deliberately guarded."
        extra={
          <Space wrap>
            <Button type="primary" icon={<DownloadOutlined />} onClick={createBackup} loading={saving === 'backupNow'}>
              Back up now
            </Button>
            <Button icon={<SafetyCertificateOutlined />} onClick={verifyBackup}>
              Verify file
            </Button>
            <Button danger icon={<UploadOutlined />} onClick={chooseRestore}>
              Restore…
            </Button>
          </Space>
        }
        bodyClassName="panel-body flush"
      >
        <Table
          rowKey="id"
          size="small"
          loading={backups.loading}
          dataSource={backups.data || []}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'No backups recorded yet.' }}
          columns={[
            {
              title: 'Backup',
              dataIndex: 'filename',
              render: (value, row) => (
                <div>
                  <strong className="mono small">{value}</strong>
                  <div className="muted small">{row.path}</div>
                </div>
              ),
            },
            { title: 'Created', dataIndex: 'createdAt', width: 165, render: formatDateTime },
            { title: 'By', dataIndex: 'createdByName', width: 120 },
            {
              title: 'Kind',
              dataIndex: 'kind',
              width: 110,
              render: (value) => <Tag>{value}</Tag>,
            },
            { title: 'Size', dataIndex: 'sizeBytes', width: 90, align: 'right', render: filesize },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 110,
              render: (value, row) => (
                <Space direction="vertical" size={2}>
                  <Tag color={value === 'verified' ? 'green' : 'red'}>{value}</Tag>
                  {!row.exists ? <Tag color="red">file missing</Tag> : null}
                </Space>
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Diagnostics" subtitle="Useful when reporting a problem. Contains no customer data.">
        {diagnostics.data ? (
          <div>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Application">{diagnostics.data.version}</Descriptions.Item>
              <Descriptions.Item label="Packaged">{diagnostics.data.packaged ? 'Yes' : 'No (development)'}</Descriptions.Item>
              <Descriptions.Item label="Electron">{diagnostics.data.electron}</Descriptions.Item>
              <Descriptions.Item label="Node">{diagnostics.data.node}</Descriptions.Item>
              <Descriptions.Item label="Database size">{filesize(diagnostics.data.databaseSizeBytes)}</Descriptions.Item>
              <Descriptions.Item label="Data folder" span={1}>
                <span className="mono small break-all">{diagnostics.data.dataFolder}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Live database" span={2}>
                <span className="mono small break-all">{diagnostics.data.databasePath}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Backup folder" span={2}>
                <span className="mono small break-all">{diagnostics.data.backupFolder}</span>
              </Descriptions.Item>
            </Descriptions>
            <Space wrap className="section-gap-sm">
              <Button icon={<FolderOpenOutlined />} onClick={openDataFolder}>
                Open data folder
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => { diagnostics.reload(); backups.reload(); }}>
                Refresh
              </Button>
            </Space>
          </div>
        ) : (
          <p className="muted">Diagnostics are available to the owner account.</p>
        )}
      </SectionCard>
    </div>
  ) : null;

  const items = [
    { key: 'business', label: 'Business', children: businessPanel },
    { key: 'print', label: 'Print & barcodes', children: printPanel },
    { key: 'billing', label: 'Invoice numbering', children: billingPanel },
    { key: 'tax', label: 'Tax', children: taxPanel },
    { key: 'pos', label: 'Billing & security', children: posPanel },
    { key: 'hardware', label: 'Hardware', children: hardwarePanel },
    { key: 'offers', label: 'Offers', children: offersPanel },
  ];
  if (backupPanel) items.push({ key: 'backup', label: 'Backup & restore', children: backupPanel });
  items.push({
    key: 'about',
    label: 'About',
    children: (
      <SectionCard title="Modern Fashion POS" subtitle="Offline-first retail point of sale and inventory.">
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="Version">{appInfo.data?.version || '—'}</Descriptions.Item>
          <Descriptions.Item label="Electron">{appInfo.data?.electron || '—'}</Descriptions.Item>
          <Descriptions.Item label="Data storage">Local SQLite on this computer</Descriptions.Item>
          <Descriptions.Item label="Internet">Only for update checks and downloads</Descriptions.Item>
          <Descriptions.Item label="Developed by" span={2}>
            Meninges Labs
          </Descriptions.Item>
        </Descriptions>
        <p className="muted small">
          This application does not publish data to the cloud. WhatsApp handoff opens WhatsApp and the invoice PDF
          locally; the user chooses whether to send it. Hardware acceptance remains pending until physically tested.
        </p>
      </SectionCard>
    ),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Store configuration"
        title="Settings"
        subtitle="Changes are recorded in the audit log. Tax and receipt details must be confirmed with the client."
        extra={
          <Button icon={<ReloadOutlined />} onClick={reloadSettings} loading={settings.loading}>
            Reload
          </Button>
        }
      />
      <Tabs activeKey={tab} onChange={setTab} items={items} />

      <Modal
        title={offerModal.record ? 'Edit offer' : 'New automatic offer'}
        open={offerModal.open}
        onCancel={() => setOfferModal({ open: false, record: null })}
        onOk={() => offerForm.submit()}
        confirmLoading={saving === 'offer'}
        okText={offerModal.record ? 'Save offer' : 'Create offer'}
        destroyOnClose
      >
        <Form form={offerForm} layout="vertical" onFinish={submitOffer} requiredMark={false}>
          <Form.Item name="name" label="Offer name" rules={[{ required: true, max: 120 }]}>
            <Input autoFocus placeholder="e.g. Festival 10% off" />
          </Form.Item>
          <div className="form-grid two">
            <Form.Item name="discountType" label="Discount type" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'percent', label: 'Percentage' },
                  { value: 'fixed', label: 'Fixed amount' },
                ]}
              />
            </Form.Item>
            {offerType === 'fixed' ? (
              <Form.Item name="valuePaise" label="Discount amount (₹)" rules={[{ required: true }]}>
                <MoneyInput />
              </Form.Item>
            ) : (
              <Form.Item name="valuePercent" label="Discount (%)" rules={[{ required: true }]}>
                <InputNumber min={0.01} max={100} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            )}
          </div>
          <div className="form-grid two">
            <Form.Item name="minBillPaise" label="Minimum bill (₹)">
              <MoneyInput />
            </Form.Item>
            <Form.Item name="maxDiscountPaise" label="Maximum discount (₹)" extra="0 means no cap.">
              <MoneyInput />
            </Form.Item>
          </div>
          <div className="form-grid two">
            <Form.Item name="startsOn" label="Starts on">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="endsOn" label="Ends on">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </div>
          <div className="form-grid two">
            <Form.Item name="priority" label="Priority" extra="Lower number is chosen when discounts tie.">
              <InputNumber min={0} max={10000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Restore the live database"
        open={restoreOpen}
        onCancel={() => setRestoreOpen(false)}
        onOk={() => restoreForm.submit()}
        okText="Restore and restart"
        okButtonProps={{ danger: true }}
        confirmLoading={saving === 'restore'}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          message="This replaces all current data."
          description="The chosen backup has already passed the SQLite integrity check. A verified pre-restore safety backup will be created in the backup folder. The application will close and restart after the restore."
        />
        <p className="mono small break-all">{restorePath}</p>
        <Form form={restoreForm} layout="vertical" onFinish={submitRestore} requiredMark={false}>
          <Form.Item
            name="confirm"
            label="Type RESTORE to confirm"
            rules={[
              { required: true, message: 'Type RESTORE.' },
              {
                validator: (_, value) =>
                  value === 'RESTORE' ? Promise.resolve() : Promise.reject(new Error('Type RESTORE exactly.')),
              },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
