import { useEffect, useMemo, useState } from 'react';
import {
  App as AntApp,
  Button,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import { PrinterOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { money } from '@/app/format';
import { EmptyPanel, ErrorPanel, LoadingPanel, PageHeader, SectionCard } from '@/app/components';
import { useSearchParams } from 'react-router-dom';

export default function BarcodesPage() {
  const { can } = useSession();
  const { message } = AntApp.useApp();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [copies, setCopies] = useState({});
  const [widthMm, setWidthMm] = useState(50);
  const [heightMm, setHeightMm] = useState(25);
  const [preview, setPreview] = useState({ html: '', error: null, loading: false });
  const [printing, setPrinting] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);

  const categories = useAsync(() => api('catalog.categories', {}), []);
  const variants = useAsync(
    () => api('inventory.list', { query: debouncedQuery, categoryId, limit: 2000 }),
    [debouncedQuery, categoryId]
  );

  const rows = variants.data || [];
  const selectedKey = selected.map((id) => `${id}x${copies[id] || 1}`).join('|');
  const items = useMemo(
    () => selected.map((id) => ({ variantId: id, copies: Math.max(1, Number(copies[id] || 1)) })),
    [selected, copies]
  );

  useEffect(() => {
    const requested = String(searchParams.get('variant') || '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    if (!requested.length) return;
    setSelected(requested);
    setCopies(Object.fromEntries(requested.map((id) => [id, 1])));
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    if (!items.length) {
      setPreview({ html: '', error: null, loading: false });
      return undefined;
    }
    setPreview((current) => ({ ...current, loading: true, error: null }));
    api('print.previewLabels', { items, labelWidthMm: widthMm, labelHeightMm: heightMm })
      .then((result) => {
        if (active) setPreview({ html: result.html, error: null, loading: false });
      })
      .catch((error) => {
        if (active) setPreview({ html: '', error, loading: false });
      });
    return () => {
      active = false;
    };
    // selectedKey captures item and copy changes without re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, widthMm, heightMm]);

  function changeSelection(keys) {
    setSelected(keys);
    setCopies((current) => {
      const next = { ...current };
      for (const id of keys) if (!next[id]) next[id] = 1;
      return next;
    });
  }

  function selectAllVisible() {
    changeSelection(rows.map((row) => row.variantId));
  }

  async function printLabels() {
    if (!items.length) {
      message.warning('Select at least one product variant.');
      return;
    }
    setPrinting(true);
    try {
      const result = await api('print.labels', { items, labelWidthMm: widthMm, labelHeightMm: heightMm });
      message.success(`${result.count} label(s) sent to the Windows label printer.`);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setPrinting(false);
    }
  }

  const previewWidth = Math.min(460, Math.max(260, widthMm * 4));

  return (
    <div>
      <PageHeader
        eyebrow="Barcode studio"
        title="Barcodes"
        subtitle="Select variants, set label counts and preview the exact EAN-13, UPC-A or Code 128 labels before printing. No stock or sales records change here."
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => variants.reload()} loading={variants.loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PrinterOutlined />} onClick={printLabels} loading={printing} disabled={!items.length}>
              Print {items.length ? `${items.length} variant(s)` : ''}
            </Button>
          </Space>
        }
      />

      <div className="barcode-workspace">
        <SectionCard
          title="Products"
          subtitle="Every active variant has its own barcode. Archived products are excluded."
          bodyClassName="panel-body flush"
        >
          <div className="filter-bar">
            <Input
              prefix={<SearchOutlined />}
              placeholder="Product, SKU or barcode"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              allowClear
              style={{ maxWidth: 300 }}
            />
            <Select
              allowClear
              placeholder="All categories"
              value={categoryId}
              onChange={setCategoryId}
              options={(categories.data || []).map((category) => ({ value: category.id, label: category.name }))}
              style={{ width: 190 }}
            />
            <Button onClick={selectAllVisible} disabled={!rows.length}>
              Select all visible
            </Button>
            <Button onClick={() => changeSelection([])} disabled={!selected.length}>
              Clear
            </Button>
            <span className="muted small">{selected.length} selected</span>
          </div>

          {variants.loading && !variants.data ? (
            <LoadingPanel label="Loading barcode variants…" />
          ) : variants.error ? (
            <ErrorPanel error={variants.error} onRetry={variants.reload} />
          ) : rows.length === 0 ? (
            <EmptyPanel title="No active variants" description="Add products in Inventory before printing barcode labels." />
          ) : (
            <Table
              rowKey="variantId"
              size="small"
              dataSource={rows}
              loading={variants.loading}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              rowSelection={{
                selectedRowKeys: selected,
                onChange: changeSelection,
              }}
              scroll={{ x: 860 }}
              columns={[
                {
                  title: 'Product',
                  dataIndex: 'productName',
                  render: (value, row) => (
                    <div>
                      <strong>{value}</strong>
                      <div className="muted small">
                        {row.color} / {row.size} · {row.sku}
                      </div>
                    </div>
                  ),
                },
                {
                  title: 'Barcode',
                  dataIndex: 'barcode',
                  render: (value) => <span className="mono small">{value}</span>,
                },
                {
                  title: 'MRP',
                  dataIndex: 'mrpPaise',
                  width: 100,
                  align: 'right',
                  render: (value) => (value ? money(value) : '—'),
                },
                {
                  title: 'Selling price',
                  dataIndex: 'pricePaise',
                  width: 120,
                  align: 'right',
                  render: money,
                },
                {
                  title: 'Stock',
                  dataIndex: 'stock',
                  width: 90,
                  align: 'right',
                  render: (value) => <Tag color={value > 0 ? 'default' : 'red'}>{value}</Tag>,
                },
                {
                  title: 'Labels',
                  width: 90,
                  align: 'center',
                  render: (_, row) => (
                    <InputNumber
                      min={1}
                      max={100}
                      value={copies[row.variantId] || 1}
                      onChange={(value) =>
                        setCopies((current) => ({ ...current, [row.variantId]: Math.max(1, Number(value || 1)) }))
                      }
                      disabled={!selected.includes(row.variantId)}
                      style={{ width: 64 }}
                      aria-label={`Label copies for ${row.sku}`}
                    />
                  ),
                },
              ]}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Label preview"
          extra={
            <Space wrap>
              <label className="inline-check barcode-size-field">
                Width
                <InputNumber
                  min={20}
                  max={110}
                  value={widthMm}
                  onChange={(value) => setWidthMm(Number(value || 50))}
                  style={{ width: 112 }}
                  addonAfter="mm"
                />
              </label>
              <label className="inline-check barcode-size-field">
                Height
                <InputNumber
                  min={15}
                  max={80}
                  value={heightMm}
                  onChange={(value) => setHeightMm(Number(value || 25))}
                  style={{ width: 112 }}
                  addonAfter="mm"
                />
              </label>
            </Space>
          }
        >
          <div className="barcode-preview">
            {preview.loading ? (
              <LoadingPanel label="Rendering labels…" />
            ) : preview.error ? (
              <ErrorPanel error={preview.error} onRetry={() => setWidthMm((value) => value)} />
            ) : !items.length ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Select products to preview labels." />
            ) : (
              <iframe
                title="Barcode label preview"
                srcDoc={preview.html}
                sandbox=""
                className="barcode-preview-frame"
                style={{ width: previewWidth }}
              />
            )}
          </div>
          <p className="muted small">
            Default 50 × 25 mm. Match these measurements to your label roll. The design leaves a small top gap so the
            first line is not clipped at the label edge.
          </p>
          {!can('products.manage') ? <Tag color="red">Barcode printing is owner/manager only.</Tag> : null}
        </SectionCard>
      </div>
    </div>
  );
}
