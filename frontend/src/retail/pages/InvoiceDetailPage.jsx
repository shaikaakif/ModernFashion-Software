import { Alert, App, Button, Space, Tag } from 'antd';
import { ArrowLeftOutlined, FilePdfOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatDate, formatMoney, formatNumber, whatsappNumber } from '@/retail/utils/format';
import { getCustomer } from '@/retail/utils/metrics';
import { StatusTag } from '@/retail/components/ui';

export default function InvoiceDetailPage() {
  const { message } = App.useApp();
  const { id } = useParams();
  const navigate = useNavigate();
  const { db } = useDemo();
  const invoice = db.invoices.find((item) => item.id === id);

  if (!invoice) {
    return (
      <div className="page">
        <Alert
          type="warning"
          showIcon
          message="Invoice not found"
          action={<Button onClick={() => navigate('/invoices')}>Back to invoices</Button>}
        />
      </div>
    );
  }

  const business = db.business;
  const customer = getCustomer(db, invoice.customerId);
  const customerPhone = customer?.phone || invoice.customerPhone;
  const units = invoice.items.reduce((sum, item) => sum + item.qty, 0);

  const printInvoice = () => {
    message.info('Choose “Save as PDF” in the browser print dialog to export this invoice as a PDF.');
    window.setTimeout(() => window.print(), 150);
  };

  const shareWhatsApp = () => {
    const text = [
      `Hello ${invoice.customerName},`,
      `Here is your invoice ${invoice.number} from ${business.name}, Attapur.`,
      `Date: ${formatDate(invoice.date)}`,
      `Items: ${units} unit(s)`,
      `Grand total: ${formatMoney(invoice.total)}`,
      `Payment status: ${invoice.paymentStatus}`,
      `Balance due: ${formatMoney(invoice.balance)}`,
      '',
      'DEMO / SAMPLE invoice — not a tax invoice and not a request for real payment.',
    ].join('\n');
    const phone = whatsappNumber(customerPhone);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="page invoice-detail-page">
      <div className="detail-topbar no-print">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/invoices')}>
          Invoices
        </Button>
        <Space wrap>
          <Button icon={<WhatsAppOutlined />} onClick={shareWhatsApp}>
            Share on WhatsApp
          </Button>
          <Button type="primary" icon={<FilePdfOutlined />} onClick={printInvoice}>
            Print / Save PDF
          </Button>
        </Space>
      </div>

      <div className="invoice-toolbar-note no-print">
        <div>
          <strong>{invoice.number}</strong>
          <span>
            {invoice.customerName} · {formatDate(invoice.date)} · {units} unit(s)
          </span>
        </div>
        <StatusTag status={invoice.paymentStatus} />
      </div>

      <article className="invoice-print-area">
        <div className="invoice-demo-band">DEMO / SAMPLE DATA — THIS IS NOT A TAX INVOICE</div>
        <header className="invoice-header">
          <div className="invoice-brand">
            <div className="invoice-brand-mark">MF</div>
            <div>
              <h1>{business.name}</h1>
              <p>{business.address}</p>
              <p className="invoice-contacts">
                {business.phones.map((phone) => (
                  <span key={phone}>{phone}</span>
                ))}
              </p>
              <p className="invoice-links">
                <span>{business.instagram}</span>
                <span>{business.website}</span>
              </p>
            </div>
          </div>
          <div className="invoice-number-block">
            <span>INVOICE</span>
            <strong>{invoice.number}</strong>
            <span>Date</span>
            <strong>{formatDate(invoice.date)}</strong>
            <Tag color={invoice.paymentStatus === 'Paid' ? 'green' : invoice.paymentStatus === 'Partial' ? 'gold' : 'red'}>
              {invoice.paymentStatus}
            </Tag>
          </div>
        </header>

        <div className="invoice-parties">
          <div>
            <span className="invoice-label">BILL TO</span>
            <strong>{invoice.customerName}</strong>
            <span>{customerPhone}</span>
            {customer?.address ? <span>{customer.address}</span> : null}
            {customer?.email ? <span>{customer.email}</span> : null}
          </div>
          <div>
            <span className="invoice-label">PAYMENT</span>
            <strong>{invoice.paymentMethod}</strong>
            <span>Status: {invoice.paymentStatus}</span>
            <span>Items: {units} unit(s)</span>
          </div>
          <div>
            <span className="invoice-label">STORE</span>
            <strong>Attapur, Hyderabad</strong>
            <span>Modern Fashion (Brand Hub)</span>
            <span>One shop · One computer</span>
          </div>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Variant / SKU</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.variantId}>
                <td>
                  <strong>{item.productName}</strong>
                  <span className="invoice-item-meta">{item.category}</span>
                </td>
                <td>
                  {item.color} / {item.size}
                  <span className="invoice-item-meta">{item.sku}</span>
                </td>
                <td className="num">{formatNumber(item.qty)}</td>
                <td className="num">{formatMoney(item.unitPrice)}</td>
                <td className="num">{formatMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-bottom">
          <div className="invoice-notes">
            <span className="invoice-label">NOTES</span>
            <p>{invoice.notes || 'Thank you for shopping with Modern Fashion.'}</p>
            <p className="invoice-demo-note">
              Demo invoice. No real payment, GST filing, accounting entry or message delivery is implemented.
            </p>
          </div>
          <div className="invoice-totals">
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(invoice.subtotal)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>− {formatMoney(invoice.discount)}</strong>
            </div>
            <div>
              <span>Tax ({invoice.taxPercent}%)</span>
              <strong>{formatMoney(invoice.taxAmount)}</strong>
            </div>
            <div className="grand">
              <span>Grand total</span>
              <strong>{formatMoney(invoice.total)}</strong>
            </div>
            <div>
              <span>Amount paid</span>
              <strong>{formatMoney(invoice.amountPaid)}</strong>
            </div>
            <div>
              <span>Balance due</span>
              <strong>{formatMoney(invoice.balance)}</strong>
            </div>
          </div>
        </div>

        <footer className="invoice-footer">
          <span>Modern Fashion (Brand Hub) · {business.phones[0]}</span>
          <span>Sample invoice for demonstration only</span>
        </footer>
      </article>

      <div className="invoice-below-actions no-print">
        <span>
          Customer history is updated automatically. <Link to={`/customers/${invoice.customerId}`}>View customer →</Link>
        </span>
        <span>WhatsApp opens a prefilled message in a new tab; nothing is sent automatically.</span>
      </div>
    </div>
  );
}
