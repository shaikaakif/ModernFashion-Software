import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App as AntApp, Button, Space, Table, Tag } from 'antd';
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  FileZipOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { api, errorMessage } from '@/app/api';
import { useSession } from '@/app/SessionContext';
import { money } from '@/app/format';
import { EmptyPanel, Kpi, LoadingPanel, PageHeader, SectionCard } from '@/app/components';

export default function VyaparImportPage() {
  const { can } = useSession();
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [inspected, setInspected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  async function chooseFile() {
    setBusy(true);
    try {
      const chosen = await api('vyapar.chooseFile');
      if (!chosen) return;
      setFile(chosen);
      setResult(null);
      setInspected(null);
      const preview = await api('vyapar.inspect', { path: chosen.path });
      setInspected(preview);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function startImport() {
    if (!inspected) return;
    modal.confirm({
      title: 'Import this Vyapar backup?',
      icon: <CloudUploadOutlined />,
      width: 620,
      content: (
        <div className="vyapar-confirm">
          <p>
            {inspected.counts.plan.products} products, {inspected.counts.plan.sales} sales,{' '}
            {inspected.counts.plan.customers} customers and {inspected.counts.plan.purchases} purchases will be
            imported.
          </p>
          <p>A verified backup of the current database is created first. If it fails, the import does not start.</p>
          <p>
            The original Vyapar file is never modified. Negative stock and zero prices are preserved exactly. Existing
            records are skipped, never overwritten.
          </p>
          <p>After a successful import the application must restart to show the new data.</p>
        </div>
      ),
      okText: 'Back up & import',
      cancelText: 'Cancel',
      onOk: async () => {
        setImporting(true);
        try {
          const imported = await api('vyapar.commit', { token: inspected.token, options: {} });
          setResult(imported);
          setInspected(null);
          message.success('Vyapar import completed. Restart the application to continue.');
        } catch (error) {
          message.error(errorMessage(error));
          throw error;
        } finally {
          setImporting(false);
        }
      },
    });
  }

  function restart() {
    api('app.restart').catch((error) => message.error(errorMessage(error)));
  }

  if (!can('products.manage')) {
    return (
      <div>
        <PageHeader eyebrow="Migration" title="Vyapar import" />
        <Alert type="warning" showIcon message="Only an owner or manager can import a Vyapar backup." />
      </div>
    );
  }

  const counts = inspected?.counts;

  return (
    <div>
      <PageHeader
        eyebrow="Migration"
        title="Import from Vyapar"
        subtitle="Bring the existing shop data from a Vyapar .vyp database or .vyb.zip backup. Nothing is overwritten."
        extra={
          <Space wrap>
            <Button icon={<FileZipOutlined />} onClick={chooseFile} loading={busy}>
              {file ? 'Choose another backup' : 'Choose Vyapar backup'}
            </Button>
            {inspected ? (
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={startImport} loading={importing}>
                Import backup
              </Button>
            ) : null}
          </Space>
        }
      />

      {result ? (
        <SectionCard title="Import complete">
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="Vyapar data imported"
            description={
              <div>
                <p>
                  {result.summary.plan.products} products, {result.summary.plan.sales} sales and{' '}
                  {result.summary.plan.customers} customers imported. Backup: {result.backupPath}
                </p>
                <p>The application needs a restart before the new data appears in billing and reports.</p>
              </div>
            }
          />
          <Space wrap className="section-gap-sm">
            <Button type="primary" onClick={restart}>
              Restart application
            </Button>
            <Button onClick={() => navigate('/inventory')}>Open inventory</Button>
            <Button onClick={() => navigate('/sales')}>Open sales history</Button>
          </Space>
        </SectionCard>
      ) : null}

      {!file ? (
        <SectionCard
          title="Choose the Vyapar backup"
          subtitle="Both the direct .vyp database and the .vyb.zip archive are supported."
        >
          <div className="vyapar-empty">
            <FileZipOutlined />
            <strong>No backup selected</strong>
            <span className="muted">
              The file is copied to temporary storage, checked read-only and deleted after import. The original stays
              untouched.
            </span>
            <Button type="primary" icon={<FileZipOutlined />} onClick={chooseFile} loading={busy}>
              Choose Vyapar backup
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {file && busy && !counts ? <LoadingPanel label="Reading and validating the Vyapar database…" /> : null}

      {counts ? (
        <>
          <div className="kpi-grid four">
            <Kpi label="Products" value={counts.plan.products} hint={`${counts.source.services} services skipped`} />
            <Kpi label="Sales" value={counts.plan.sales} hint={`${counts.plan.saleItems} invoice lines`} />
            <Kpi label="Customers" value={counts.plan.customers} hint={`${counts.source.suppliers} suppliers`} />
            <Kpi
              label="Stock"
              value={counts.source.products}
              hint="Negative and zero quantities preserved"
              tone={inspected.warnings.some((warning) => warning.code === 'negative-stock') ? 'warning' : 'default'}
            />
          </div>

          <SectionCard
            title="Source verified"
            subtitle={`${inspected.fileName} · ${inspected.sourceKind} · SHA-256 ${inspected.sourceHash.slice(0, 16)}…`}
            extra={<Tag color="green">SQLite integrity ok</Tag>}
          >
            <div className="vyapar-source-grid">
              <div>
                <span>Date range</span>
                <strong>
                  {counts.source.dateFrom?.slice(0, 10) || '—'} → {counts.source.dateTo?.slice(0, 10) || '—'}
                </strong>
              </div>
              <div>
                <span>Products / services</span>
                <strong>
                  {counts.source.products} / {counts.source.services}
                </strong>
              </div>
              <div>
                <span>Sales / lines</span>
                <strong>
                  {counts.source.sales} / {counts.source.saleLines}
                </strong>
              </div>
              <div>
                <span>Purchases / expenses</span>
                <strong>
                  {counts.plan.purchases} / {counts.plan.expenses}
                </strong>
              </div>
              <div>
                <span>Estimates skipped</span>
                <strong>{counts.source.estimates}</strong>
              </div>
              <div>
                <span>Unsupported</span>
                <strong>Opening balances, payment-outs, credit note</strong>
              </div>
            </div>
            <Alert
              className="section-gap-sm"
              type="info"
              showIcon
              message="What happens to existing records"
              description="Products, customers and invoices are matched by barcode/SKU, phone and invoice number. Matches are skipped. No existing value is overwritten."
            />
          </SectionCard>

          {inspected.warnings.length ? (
            <SectionCard title="Migration warnings" subtitle="These records are preserved or explicitly skipped.">
              <div className="vyapar-warning-list">
                {inspected.warnings.map((warning) => (
                  <div className="vyapar-warning" key={warning.code}>
                    <WarningOutlined />
                    <div>
                      <strong>
                        {warning.count} · {warning.message}
                      </strong>
                      {warning.samples?.length ? (
                        <span className="muted small">{warning.samples.slice(0, 4).join(' · ')}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Product preview" subtitle="First 25 products. Negative stock is kept as-is." bodyClassName="panel-body flush">
            <Table
              rowKey="sku"
              size="small"
              dataSource={inspected.previews.products}
              pagination={false}
              scroll={{ x: 900 }}
              columns={[
                { title: 'Product', dataIndex: 'name' },
                { title: 'SKU', dataIndex: 'sku', width: 140 },
                { title: 'Barcode', dataIndex: 'barcode', width: 160 },
                { title: 'Category', dataIndex: 'category', width: 150 },
                { title: 'Price', dataIndex: 'pricePaise', width: 110, align: 'right', render: money },
                {
                  title: 'Stock',
                  dataIndex: 'stock',
                  width: 100,
                  align: 'right',
                  render: (value) => (
                    <span className={value < 0 ? 'text-danger' : ''}>
                      {value > 0 ? '+' : ''}
                      {value}
                    </span>
                  ),
                },
              ]}
            />
          </SectionCard>

          <SectionCard title="Sales preview" subtitle="First 20 historical invoices." bodyClassName="panel-body flush">
            <Table
              rowKey="invoiceNo"
              size="small"
              dataSource={inspected.previews.sales}
              pagination={false}
              scroll={{ x: 800 }}
              columns={[
                { title: 'Invoice', dataIndex: 'invoiceNo', width: 140 },
                { title: 'Date', dataIndex: 'date', width: 120 },
                { title: 'Customer', dataIndex: 'customer' },
                { title: 'Total', dataIndex: 'totalPaise', width: 130, align: 'right', render: money },
                {
                  title: 'Payment',
                  dataIndex: 'paymentStatus',
                  width: 110,
                  render: (value) => <Tag color={value === 'paid' ? 'green' : value === 'partial' ? 'gold' : 'red'}>{value}</Tag>,
                },
              ]}
            />
          </SectionCard>

          <SectionCard title="Customers preview" subtitle="First 20 customer records with a valid phone." bodyClassName="panel-body flush">
            {inspected.previews.customers.length ? (
              <Table
                rowKey="phone"
                size="small"
                dataSource={inspected.previews.customers}
                pagination={false}
                columns={[
                  { title: 'Customer', dataIndex: 'name' },
                  { title: 'Phone', dataIndex: 'phone', width: 140 },
                  { title: 'Sales', dataIndex: 'sales', width: 90, align: 'right' },
                ]}
              />
            ) : (
              <EmptyPanel title="No customers to preview" description="Customers without a valid phone keep their invoice names only." />
            )}
          </SectionCard>
        </>
      ) : null}

      {!file ? (
        <SectionCard title="Supported and skipped">
          <div className="vyapar-source-grid">
            <div>
              <span>Imported</span>
              <strong>Products, stock, categories, customers, suppliers, sales, lines, payments, purchases, expenses</strong>
            </div>
            <div>
              <span>Skipped</span>
              <strong>Services, estimates, opening balances, payment-outs, credit note, sales without lines</strong>
            </div>
            <div>
              <span>Preserved exactly</span>
              <strong>Negative stock, zero prices, invoice numbers, dates, discounts, balances</strong>
            </div>
            <div>
              <span>Not invented</span>
              <strong>Phone numbers, GST amounts, selling prices or customer identities</strong>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
