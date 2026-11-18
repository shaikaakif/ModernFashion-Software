import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Segmented, Space, Tag } from 'antd';
import {
  ArrowLeftOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  StopOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import { api } from '@/app/api';
import { formatDate, formatDateTime, money, paymentLabel } from '@/app/format';
import { ErrorPanel, LoadingPanel, StatusTag } from '@/app/components';

export default function InvoiceWorkspace({
  detail,
  loading,
  actionBusy,
  canPrint,
  canVoid,
  onBack,
  onPrintReceipt,
  onPrintA4,
  onSavePdf,
  onWhatsapp,
  onVoid,
}) {
  const [paper, setPaper] = useState('80');
  const [preview, setPreview] = useState({ html: '', error: null, loading: true });

  useEffect(() => {
    let active = true;
    if (!detail?.id) return undefined;
    setPreview((current) => ({ ...current, loading: true, error: null }));
    api('print.previewSale', {
      saleId: detail.id,
      widthMm: paper === 'a4' ? 80 : Number(paper),
      a4: paper === 'a4',
    })
      .then((result) => {
        if (active) setPreview({ html: result.html, error: null, loading: false });
      })
      .catch((error) => {
        if (active) setPreview({ html: '', error, loading: false });
      });
    return () => {
      active = false;
    };
  }, [detail?.id, paper]);

  if (loading || !detail) return <LoadingPanel label="Opening the invoice…" />;

  return (
    <div className="invoice-workspace-page">
      <div className="invoice-workspace-head">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          Invoices
        </Button>
        <div>
          <span className="eyebrow">Invoice</span>
          <h1>{detail.invoiceNo}</h1>
        </div>
        <Space wrap>
          <StatusTag status={detail.status} />
          {detail.taxEnabled ? <Tag>GST</Tag> : null}
          {detail.printCount > 0 ? <Tag>Printed {detail.printCount}×</Tag> : null}
        </Space>
      </div>

      {detail.status === 'void' ? (
        <Alert
          type="warning"
          showIcon
          className="detail-alert"
          message={`This invoice was voided${detail.voidedAt ? ` on ${formatDateTime(detail.voidedAt)}` : ''}.`}
          description={detail.voidReason || 'Stock was returned to inventory.'}
        />
      ) : null}

      <div className="invoice-workspace-grid">
        <aside className="invoice-info-pane">
          <div className="invoice-amount-hero">
            <div>
              <span className="eyebrow">Invoice total</span>
              <strong>{money(detail.totalPaise)}</strong>
              <span>
                {detail.paymentStatus === 'paid'
                  ? `Paid by ${paymentLabel(detail.paymentMethod)}`
                  : `${detail.paymentStatus} · ${money(detail.balancePaise)} due`}
              </span>
            </div>
          </div>

          <Descriptions bordered size="small" column={1} className="detail-descriptions">
            <Descriptions.Item label="Customer">{detail.customerName || 'Walk-in customer'}</Descriptions.Item>
            <Descriptions.Item label="Mobile">{detail.customerPhone || '—'}</Descriptions.Item>
            {detail.customerGstin ? <Descriptions.Item label="Customer GSTIN">{detail.customerGstin}</Descriptions.Item> : null}
            <Descriptions.Item label="Business date">{formatDate(detail.businessDate)}</Descriptions.Item>
            <Descriptions.Item label="Completed">{formatDateTime(detail.completedAt)}</Descriptions.Item>
            <Descriptions.Item label="Cashier">{detail.cashierName}</Descriptions.Item>
            <Descriptions.Item label="Payment">{paymentLabel(detail.paymentMethod)}</Descriptions.Item>
            {detail.notes ? <Descriptions.Item label="Note">{detail.notes}</Descriptions.Item> : null}
          </Descriptions>

          <div className="invoice-action-grid">
            {canPrint ? (
              <>
                <Button
                  type="primary"
                  icon={<PrinterOutlined />}
                  loading={actionBusy === 'receipt'}
                  onClick={() => onPrintReceipt({ widthMm: paper === 'a4' ? 80 : Number(paper) })}
                >
                  Print bill
                </Button>
                <Button
                  icon={<PrinterOutlined />}
                  loading={actionBusy === 'a4'}
                  onClick={onPrintA4}
                >
                  Print A4
                </Button>
                <Button icon={<FilePdfOutlined />} loading={actionBusy === 'pdf'} onClick={onSavePdf}>
                  Save PDF
                </Button>
                <Button icon={<WhatsAppOutlined />} loading={actionBusy === 'whatsapp'} onClick={onWhatsapp}>
                  WhatsApp
                </Button>
              </>
            ) : null}
            {canVoid && detail.status === 'completed' ? (
              <Button danger icon={<StopOutlined />} onClick={onVoid}>
                Void invoice
              </Button>
            ) : null}
          </div>

          <div className="invoice-payment-summary">
            <h3>Payments</h3>
            {(detail.payments || []).length ? (
              detail.payments.map((payment) => (
                <div className="list-row" key={payment.id}>
                  <div>
                    <strong>{paymentLabel(payment.method)}</strong>
                    <span>{formatDateTime(payment.createdAt)}</span>
                  </div>
                  <strong>{money(payment.amountPaise)}</strong>
                </div>
              ))
            ) : (
              <p className="muted small">No payment recorded.</p>
            )}
          </div>

          <p className="muted small">
            The preview uses the same invoice renderer as printing. Changing the paper tab does not modify the sale.
          </p>
        </aside>

        <section className="invoice-preview-pane">
          <div className="invoice-preview-head">
            <div>
              <span className="eyebrow">Bill preview</span>
              <strong>{paper === 'a4' ? 'A4 invoice' : `${paper} mm receipt`}</strong>
            </div>
            <Segmented
              value={paper}
              onChange={setPaper}
              options={[
                { label: '80 mm', value: '80' },
                { label: '58 mm', value: '58' },
                { label: 'A4', value: 'a4' },
              ]}
            />
          </div>
          {preview.loading ? (
            <LoadingPanel label="Rendering the bill…" />
          ) : preview.error ? (
            <ErrorPanel error={preview.error} onRetry={() => setPaper((value) => value)} />
          ) : (
            <div className={`invoice-preview-frame-wrap ${paper === 'a4' ? 'is-a4' : 'is-thermal'}`}>
              <iframe
                title={`Invoice ${detail.invoiceNo} preview`}
                srcDoc={preview.html}
                sandbox=""
                className="invoice-preview-frame"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
