import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  FileExcelOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { api, errorMessage } from '@/app/api';
import { useAsync } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { money } from '@/app/format';
import { EmptyPanel, ErrorPanel, LoadingPanel, PageHeader, SectionCard } from '@/app/components';

const ACTION_META = {
  create: { color: 'green', label: 'New' },
  update: { color: 'blue', label: 'Update' },
  skip: { color: 'default', label: 'Skip' },
  error: { color: 'red', label: 'Fix' },
};

const TAX_OPTIONS = [
  { value: 0, label: '0% — no GST' },
  { value: 500, label: '5%' },
  { value: 1200, label: '12%' },
  { value: 1800, label: '18%' },
  { value: 2800, label: '28%' },
];

function filesize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportPage() {
  const { can } = useSession();
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const categories = useAsync(() => api('catalog.categories', {}), []);
  const [file, setFile] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [mapping, setMapping] = useState({});
  const [options, setOptions] = useState({
    defaultCategoryId: null,
    defaultTaxRateBp: null,
    defaultLowStock: 5,
    existing: 'update',
    stockMode: 'set',
    createCategories: true,
    createBrands: true,
    skipInvalid: false,
  });
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!file) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setPreviewBusy(true);
      setPreviewError(null);
      try {
        const next = await api('import.preview', { filePath: file.path, mapping, options });
        if (!active) return;
        setPreview(next);
        if (!Object.keys(mapping).length) setMapping(next.mapping || {});
      } catch (error) {
        if (active) setPreviewError(error);
      } finally {
        if (active) setPreviewBusy(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [file, mapping, options]);

  async function chooseFile() {
    setChoosing(true);
    try {
      const chosen = await api('import.chooseFile');
      if (!chosen) return;
      setFile(chosen);
      setResult(null);
      setPreview(null);
      setPreviewError(null);
      setMapping({});
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setChoosing(false);
    }
  }

  async function runImport() {
    if (!file || !preview) return;
    setImporting(true);
    try {
      const imported = await api('import.commit', { filePath: file.path, mapping, options });
      setResult(imported);
      message.success(
        `${imported.createdVariants + imported.updatedVariants} row(s) imported. ${imported.createdProducts} product(s) added.`,
        8
      );
      categories.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  function patchOptions(patch) {
    setOptions((current) => ({ ...current, ...patch }));
  }

  function setMappedField(key, header) {
    setMapping((current) => {
      const next = { ...current };
      if (header) next[key] = header;
      else delete next[key];
      return next;
    });
  }

  function resetImport() {
    setFile(null);
    setPreview(null);
    setPreviewError(null);
    setMapping({});
    setResult(null);
  }

  const summary = preview?.summary;
  const actionable = (summary?.createVariants || 0) + (summary?.updateVariants || 0);
  const blocked = Boolean(summary?.errors) && !options.skipInvalid;
  const headerOptions = (preview?.headers || []).map((header) => ({ value: header, label: header }));

  const canImport = can('products.manage');

  const columns = [
    { title: 'Row', dataIndex: 'rowNumber', width: 60, align: 'right' },
    {
      title: 'Product',
      dataIndex: 'productName',
      width: 220,
      render: (value) => <strong>{value || '—'}</strong>,
    },
    {
      title: 'Variant',
      key: 'variant',
      width: 150,
      render: (_, row) => (
        <span>
          {row.colour || '—'} / {row.size || '—'}
        </span>
      ),
    },
    {
      title: 'Category / brand',
      key: 'category',
      width: 170,
      render: (_, row) => (
        <div>
          <span>{row.categoryName || '—'}</span>
          {row.brandName ? <div className="muted small">{row.brandName}</div> : null}
        </div>
      ),
    },
    {
      title: 'SKU / barcode',
      key: 'codes',
      width: 190,
      render: (_, row) => (
        <div className="mono small">
          <div>{row.sku || 'generated'}</div>
          <div className="muted">{row.barcode || 'generated'}</div>
        </div>
      ),
    },
    {
      title: 'Price',
      dataIndex: 'pricePaise',
      width: 110,
      align: 'right',
      render: (value) => (value === null || value === undefined ? '—' : money(value)),
    },
    {
      title: 'MRP',
      dataIndex: 'mrpPaise',
      width: 110,
      align: 'right',
      render: (value) => (value ? money(value) : '—'),
    },
    {
      title: 'Stock',
      key: 'stock',
      width: 90,
      align: 'right',
      render: (_, row) => (
        <span>
          {row.stock === null || row.stock === undefined ? '—' : row.stock}
          {row.existingStock !== null && row.existingStock !== undefined ? (
            <span className="muted small"> ({row.existingStock})</span>
          ) : null}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'action',
      width: 100,
      render: (value) => {
        const meta = ACTION_META[value] || ACTION_META.error;
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: 'Notes',
      key: 'notes',
      render: (_, row) => {
        const notes = [...(row.errors || []), ...(row.messages || [])];
        if (!notes.length) return <span className="muted small">—</span>;
        return (
          <span className={row.errors?.length ? 'import-row-error' : 'muted small'}>
            {notes.join(' ')}
          </span>
        );
      },
    },
  ];

  if (!canImport) {
    return (
      <div>
        <PageHeader eyebrow="Catalogue tools" title="Import products" />
        <Alert type="warning" showIcon message="Only an owner or manager can import products." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue tools"
        title="Import products & stock"
        subtitle="Bring an existing product list from Vyapar, Excel or another system. Nothing is saved until you review the preview."
        extra={
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={chooseFile} loading={choosing}>
              {file ? 'Change file' : 'Choose file'}
            </Button>
            {file ? (
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                onClick={runImport}
                loading={importing}
                disabled={
                  !actionable ||
                  blocked ||
                  Boolean(previewError) ||
                  (!can('inventory.adjust') && options.stockMode !== 'ignore')
                }
              >
                Import {actionable || ''} row{actionable === 1 ? '' : 's'}
              </Button>
            ) : null}
          </Space>
        }
      />

      <div className="settings-stack">
        <SectionCard
          title="1. Choose the file"
          subtitle="CSV, XLSX or XLS up to 20 MB. The first sheet with data is used."
        >
          <div className="import-file-bar">
            <Button type="primary" icon={<FileExcelOutlined />} onClick={chooseFile} loading={choosing}>
              {file ? 'Choose another file' : 'Choose a CSV or Excel file'}
            </Button>
            {file ? (
              <div className="import-file-meta">
                <strong>{file.fileName}</strong>
                <span className="muted small">{filesize(file.sizeBytes)}</span>
              </div>
            ) : (
              <span className="muted small">No file chosen yet.</span>
            )}
          </div>
          {result ? (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              className="section-gap-sm"
              message={`Import finished — ${result.reference}`}
              description={
                <div>
                  <p>
                    {result.createdProducts} product(s) added, {result.createdVariants} variant(s) added,{' '}
                    {result.updatedVariants} updated, {result.stockChanges} stock change(s) recorded.
                    {result.skipped ? ` ${result.skipped} row(s) skipped.` : ''}
                    {result.errors ? ` ${result.errors} invalid row(s) were not imported.` : ''}
                  </p>
                  <Space wrap>
                    <Button type="primary" onClick={() => navigate('/inventory?tab=stock')}>
                      View inventory
                    </Button>
                    <Button onClick={resetImport}>Import another file</Button>
                  </Space>
                </div>
              }
            />
          ) : null}
        </SectionCard>

        {previewError ? (
          <ErrorPanel error={previewError} onRetry={() => setMapping((current) => ({ ...current }))} />
        ) : null}

        {file && previewBusy && !preview ? <LoadingPanel label="Reading the file…" /> : null}

        {file && preview ? (
          <>
            <SectionCard
              title="2. Match the columns"
              subtitle="The most likely columns are chosen automatically. Change any match that is wrong."
              extra={
                <Button icon={<ReloadOutlined />} onClick={() => setMapping(preview.suggested || {})}>
                  Use suggested columns
                </Button>
              }
            >
              <div className="import-mapping">
                {(preview.fields || []).map((field) => (
                  <label className="import-field" key={field.key}>
                    <span>
                      {field.label}
                      {field.required ? <span className="import-required"> *</span> : null}
                    </span>
                    <Select
                      allowClear
                      placeholder="Not imported"
                      value={mapping[field.key]}
                      onChange={(value) => setMappedField(field.key, value)}
                      options={headerOptions.map((option) => ({
                        ...option,
                        disabled: Object.entries(mapping).some(
                          ([key, header]) => key !== field.key && header === option.value
                        ),
                      }))}
                    />
                    <span className="muted small">{field.hint}</span>
                  </label>
                ))}
              </div>
              <div className="panel-note">
                Barcode and SKU are generated when the file does not provide them. In Excel, format the barcode column
                as Text to keep leading zeros.
              </div>
            </SectionCard>

            <SectionCard title="3. Import rules" subtitle="How existing products and stock should be handled.">
              <div className="import-options">
                <label className="import-field">
                  <span>Default category</span>
                  <Select
                    allowClear
                    placeholder="Required only when the file has no category"
                    value={options.defaultCategoryId}
                    onChange={(value) => patchOptions({ defaultCategoryId: value || null })}
                    options={(categories.data || []).map((category) => ({ value: category.id, label: category.name }))}
                  />
                  <span className="muted small">Used when a row has no Category value.</span>
                </label>
                <label className="import-field">
                  <span>Default GST %</span>
                  <Select
                    value={options.defaultTaxRateBp === null ? 'default' : options.defaultTaxRateBp}
                    onChange={(value) => patchOptions({ defaultTaxRateBp: value === 'default' ? null : value })}
                    options={[{ value: 'default', label: 'Use shop default' }, ...TAX_OPTIONS]}
                  />
                  <span className="muted small">Used when the file has no GST rate.</span>
                </label>
                <label className="import-field">
                  <span>Low-stock level</span>
                  <InputNumber
                    min={0}
                    max={100000}
                    value={options.defaultLowStock}
                    onChange={(value) => patchOptions({ defaultLowStock: Number(value || 0) })}
                    style={{ width: '100%' }}
                  />
                  <span className="muted small">Used when the file has no reorder level.</span>
                </label>
                <label className="import-field">
                  <span>Existing products</span>
                  <Select
                    value={options.existing}
                    onChange={(value) => patchOptions({ existing: value })}
                    options={[
                      { value: 'update', label: 'Update price, MRP and stock' },
                      { value: 'skip', label: 'Leave existing products untouched' },
                    ]}
                  />
                  <span className="muted small">Existing rows are matched by barcode, SKU or product + colour + size.</span>
                </label>
                <label className="import-field">
                  <span>Stock in the file</span>
                  <Select
                    value={options.stockMode}
                    onChange={(value) => patchOptions({ stockMode: value })}
                    options={[
                      { value: 'set', label: 'Replace current stock with the file count' },
                      { value: 'add', label: 'Add the file count to current stock' },
                      { value: 'ignore', label: 'Do not change stock' },
                    ]}
                  />
                  <span className="muted small">Every stock change is written to the stock history.</span>
                </label>
                <div className="import-switches">
                  <label className="inline-check">
                    <Switch
                      checked={options.createCategories}
                      onChange={(checked) => patchOptions({ createCategories: checked })}
                    />
                    Create missing categories
                  </label>
                  <label className="inline-check">
                    <Switch
                      checked={options.createBrands}
                      onChange={(checked) => patchOptions({ createBrands: checked })}
                    />
                    Create missing brands
                  </label>
                  <label className="inline-check">
                    <Switch
                      checked={options.skipInvalid}
                      onChange={(checked) => patchOptions({ skipInvalid: checked })}
                    />
                    Import valid rows and skip rows with errors
                  </label>
                </div>
              </div>
              {!can('inventory.adjust') && options.stockMode !== 'ignore' ? (
                <Alert
                  type="warning"
                  showIcon
                  className="section-gap-sm"
                  message="Your role cannot change stock."
                  description="Choose “Do not change stock” to import products only, or ask the owner to run this import."
                />
              ) : null}
            </SectionCard>

            <SectionCard
              title="4. Review the preview"
              subtitle={`Read from ${preview.sheetName || file.fileName}. The file is checked again when you import.`}
              extra={
                <Space wrap>
                  <Tag color="green">{summary.createProducts} new product(s)</Tag>
                  <Tag color="blue">{summary.createVariants} new variant(s)</Tag>
                  <Tag color="cyan">{summary.updateVariants} update(s)</Tag>
                  <Tag>{summary.skipped} skipped</Tag>
                  <Tag color={summary.errors ? 'red' : 'default'}>{summary.errors} error(s)</Tag>
                </Space>
              }
              bodyClassName="panel-body flush"
            >
              {summary.createCategories.length || summary.createBrands.length ? (
                <Alert
                  type="info"
                  showIcon
                  className="import-alert"
                  message="New categories or brands will be created"
                  description={[
                    summary.createCategories.length ? `Categories: ${summary.createCategories.join(', ')}` : '',
                    summary.createBrands.length ? `Brands: ${summary.createBrands.join(', ')}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ) : null}
              <Table
                rowKey="rowNumber"
                size="small"
                dataSource={preview.rows}
                loading={previewBusy}
                pagination={{ pageSize: 25, showSizeChanger: true }}
                scroll={{ x: 1300 }}
                columns={columns}
                locale={{
                  emptyText: (
                    <EmptyPanel
                      title="Nothing to preview"
                      description="Choose the product and price columns in step 2."
                    />
                  ),
                }}
              />
              {summary.totalRows > preview.previewLimit ? (
                <div className="panel-note">
                  Showing the first {preview.previewLimit} of {summary.totalRows} rows. All rows are checked and
                  imported.
                </div>
              ) : null}
              {blocked ? (
                <div className="import-alert">
                  <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message={`Fix ${summary.errors} row(s) or turn on “Import valid rows”.`}
                    description="Nothing has been saved yet. Update the file in Excel, then choose it again."
                  />
                </div>
              ) : null}
            </SectionCard>
          </>
        ) : null}

        {!file ? (
          <SectionCard title="Expected columns" subtitle="Column names do not have to match exactly — you map them in step 2.">
            <div className="import-column-list">
              {[
                'Product name (required)',
                'Selling price (required)',
                'MRP',
                'Purchase cost',
                'Category',
                'Brand',
                'Colour',
                'Size',
                'SKU / item code',
                'Barcode',
                'Current stock',
                'GST %',
                'HSN code',
                'Reorder level',
                'Status',
              ].map((item) => (
                <Tag key={item}>{item}</Tag>
              ))}
            </div>
            <div className="panel-note">
              One row is one variant. For a product with sizes, add a row for each size. Vyapar item exports,
              Modern Fashion catalogue exports and plain Excel lists all work.
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Coming from Vyapar?"
          subtitle="Import the item export, not the .VYB backup."
        >
          <ol className="vyapar-steps">
            <li>In Vyapar, open <strong>Items</strong> and use <strong>Export to Excel</strong> (or CSV).</li>
            <li>Save the file and choose it above. The column names are matched automatically.</li>
            <li>Review the preview, then import products and current stock.</li>
          </ol>
          <Alert
            type="info"
            showIcon
            className="section-gap-sm"
            message="Vyapar .VYB backups are not supported."
            description="A .VYB file is Vyapar's own backup container, not a standard database or spreadsheet. This app does not claim to restore it. The item export is the safe, documented route. Customers, suppliers and old sales still need to be exported separately from Vyapar."
          />
        </SectionCard>
      </div>
    </div>
  );
}
