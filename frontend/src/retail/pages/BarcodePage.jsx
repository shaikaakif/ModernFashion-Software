import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import {
  BarcodeOutlined,
  PrinterOutlined,
  ScanOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useDemo } from '@/retail/hooks/useDemo';
import { formatMoney } from '@/retail/utils/format';
import { findVariant } from '@/retail/utils/metrics';
import { barcodeService } from '@/retail/services/barcodeService';
import { PageHeader, ProductThumb, SectionCard, StatCard } from '@/retail/components/ui';
import BarcodeSvg from '@/retail/components/BarcodeSvg';

export default function BarcodePage() {
  const { message } = App.useApp();
  const { db } = useDemo();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef(null);
  const [scanValue, setScanValue] = useState('');
  const [scanVariantId, setScanVariantId] = useState('');
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [copies, setCopies] = useState(1);
  const [directorySearch, setDirectorySearch] = useState('');
  const [productFilter, setProductFilter] = useState('all');

  const allVariants = useMemo(
    () =>
      db.products.flatMap((product) =>
        product.variants.map((variant) => ({
          key: variant.id,
          product,
          variant,
        }))
      ),
    [db.products]
  );

  const scanned = scanVariantId ? findVariant(db, scanVariantId) : null;
  const selectedRows = allVariants.filter((row) => selectedKeys.includes(row.variant.id));
  const assignedCount = allVariants.filter((row) => row.variant.barcode).length;
  const missingCount = allVariants.length - assignedCount;

  const demoCodes = useMemo(
    () =>
      ['prd_01', 'prd_29', 'prd_33']
        .map((id) => allVariants.find((row) => row.product.id === id))
        .filter(Boolean),
    [allVariants]
  );

  useEffect(() => {
    if (searchParams.get('variant')) {
      const variantId = searchParams.get('variant');
      if (findVariant(db, variantId)) {
        setScanVariantId(variantId);
        setSelectedKeys((current) => (current.includes(variantId) ? current : [...current, variantId]));
      }
    }
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const performScan = (rawValue) => {
    const query = String(rawValue || '').trim().toLowerCase();
    if (!query) return;
    const found = allVariants.find(
      (row) =>
        row.variant.barcode?.toLowerCase() === query ||
        row.variant.sku?.toLowerCase() === query
    );
    if (!found) {
      setScanVariantId('');
      message.error('No product variant matches that barcode or SKU.');
      return;
    }
    setScanVariantId(found.variant.id);
    setScanValue(found.variant.barcode);
    message.success(`Scanned ${found.product.name} — ${found.variant.color} / ${found.variant.size}.`);
    inputRef.current?.focus();
  };

  const scanSample = (row) => {
    setScanValue(row.variant.barcode);
    performScan(row.variant.barcode);
  };

  const addToQueue = (variantId) => {
    setSelectedKeys((current) => (current.includes(variantId) ? current : [...current, variantId]));
    message.success('Variant added to the barcode label queue.');
  };

  const removeFromQueue = (variantId) => {
    setSelectedKeys((current) => current.filter((id) => id !== variantId));
  };

  const generateMissing = () => {
    try {
      let count = 0;
      allVariants.forEach((row) => {
        if (!row.variant.barcode) {
          barcodeService.assign(row.variant.id);
          count += 1;
        }
      });
      message.success(count ? `${count} internal barcode(s) assigned.` : 'Every demo variant already has an internal barcode.');
    } catch (error) {
      message.error(error.message || 'Could not assign barcodes.');
    }
  };

  const printLabels = () => {
    if (!selectedKeys.length) {
      message.warning('Select at least one variant to print labels.');
      return;
    }
    window.print();
  };

  const filteredDirectory = useMemo(() => {
    const term = directorySearch.trim().toLowerCase();
    return allVariants.filter((row) => {
      if (productFilter !== 'all' && row.product.id !== productFilter) return false;
      if (!term) return true;
      return [row.product.name, row.product.category, row.variant.color, row.variant.size, row.variant.sku, row.variant.barcode]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [allVariants, directorySearch, productFilter]);

  const columns = [
    {
      title: 'Product',
      key: 'product',
      width: 280,
      render: (_, row) => (
        <div className="table-product">
          <ProductThumb product={row.product} size="sm" />
          <div>
            <strong>{row.product.name}</strong>
            <span>{row.product.category}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Variant',
      key: 'variant',
      render: (_, row) => (
        <div className="variant-cell">
          <strong>{row.variant.color} / {row.variant.size}</strong>
          <span>{row.variant.sku}</span>
        </div>
      ),
    },
    {
      title: 'Internal barcode',
      dataIndex: ['variant', 'barcode'],
      render: (value) => (value ? <code className="code-text">{value}</code> : <Tag>Not assigned</Tag>),
    },
    {
      title: 'Price',
      dataIndex: ['variant', 'sellingPrice'],
      align: 'right',
      render: (value) => <span className="money-text">{formatMoney(value)}</span>,
    },
    {
      title: '',
      key: 'action',
      align: 'right',
      width: 150,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => addToQueue(row.variant.id)}>
            Add label
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page barcode-page">
      <PageHeader
        eyebrow="Barcode studio · Demo"
        title="Barcode"
        subtitle="Search internal Code 128 identifiers, simulate a USB keyboard-wedge scanner and print sample labels. No registered EAN numbers are used."
        extra={
          <Button icon={<TagsOutlined />} onClick={generateMissing}>
            Assign missing barcodes
          </Button>
        }
      />

      <div className="stat-grid stat-grid-4">
        <StatCard label="Variants" value={allVariants.length} hint="Each has its own SKU" icon={<BarcodeOutlined />} />
        <StatCard label="Barcodes assigned" value={assignedCount} hint="Internal Code 128 values" accent="green" />
        <StatCard label="Missing barcodes" value={missingCount} hint="Assign if needed" accent={missingCount ? 'red' : 'ink'} />
        <StatCard label="Labels queued" value={selectedKeys.length} hint={`${copies} cop${copies === 1 ? 'y' : 'ies'} each`} accent="teal" />
      </div>

      <div className="barcode-workspace">
        <SectionCard
          title="Scanner input"
          description="A USB barcode scanner that behaves as a keyboard can type into this focused field. Press Enter to look up the variant."
          className="scanner-panel"
        >
          <div className="scanner-input-wrap">
            <ScanOutlined />
            <Input
              ref={inputRef}
              size="large"
              placeholder="Scan or type a barcode / SKU"
              value={scanValue}
              onChange={(event) => setScanValue(event.target.value)}
              onPressEnter={() => performScan(scanValue)}
              autoFocus
            />
            <Button type="primary" onClick={() => performScan(scanValue)}>
              Find
            </Button>
          </div>
          <div className="demo-scan-row">
            <span>Try a demo scan</span>
            {demoCodes.map((row) => (
              <button type="button" key={row.variant.id} onClick={() => scanSample(row)}>
                {row.variant.barcode}
              </button>
            ))}
          </div>
          <Alert
            type="info"
            showIcon
            message="Scanner simulation"
            description="This demo reads keyboard input only. No camera, hardware scanner or external service is connected."
          />
        </SectionCard>

        <SectionCard title="Scan result" className="scan-result-panel">
          {scanned ? (
            <div className="scan-result">
              <div className="scan-product-head">
                <ProductThumb product={scanned.product} />
                <div>
                  <strong>{scanned.product.name}</strong>
                  <span>{scanned.product.category} · {scanned.variant.color} / {scanned.variant.size}</span>
                </div>
              </div>
              <div className="scan-data">
                <div><span>SKU</span><code>{scanned.variant.sku}</code></div>
                <div><span>Barcode</span><code>{scanned.variant.barcode}</code></div>
                <div><span>Stock</span><strong>{scanned.variant.stock} units</strong></div>
                <div><span>Price</span><strong>{formatMoney(scanned.variant.sellingPrice)}</strong></div>
              </div>
              <div className="barcode-preview">
                <BarcodeSvg value={scanned.variant.barcode} height={54} width={1.8} />
              </div>
              <Space wrap>
                <Button type="primary" onClick={() => addToQueue(scanned.variant.id)} icon={<TagsOutlined />}>
                  Add label to queue
                </Button>
                <Button onClick={() => navigate(`/products/${scanned.product.id}`)}>Open product</Button>
              </Space>
            </div>
          ) : (
            <div className="scan-placeholder">
              <BarcodeOutlined />
              <strong>No barcode scanned yet</strong>
              <span>Scan a label or choose a demo barcode to preview it here.</span>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Label queue & preview"
        description="Select variants below, then print the label sheet. Labels include product, variant, SKU and internal Code 128 barcode."
        extra={
          <Space>
            <span className="copies-label">Copies</span>
            <InputNumber min={1} max={10} value={copies} onChange={(value) => setCopies(value || 1)} style={{ width: 70 }} />
            <Button type="primary" icon={<PrinterOutlined />} onClick={printLabels} disabled={!selectedRows.length}>
              Print labels
            </Button>
          </Space>
        }
        bodyClassName={selectedRows.length ? '' : 'panel-pad'}
      >
        {selectedRows.length ? (
          <div className="label-preview-grid">
            {selectedRows.map((row) => (
              <div className="label-preview-card" key={row.variant.id}>
                <button type="button" className="label-remove" onClick={() => removeFromQueue(row.variant.id)}>
                  Remove
                </button>
                <span className="label-brand">MODERN FASHION · BRAND HUB</span>
                <strong>{row.product.name}</strong>
                <span>{row.variant.color} / {row.variant.size} · {row.variant.sku}</span>
                <BarcodeSvg value={row.variant.barcode} height={38} width={1.3} fontSize={10} />
                <div className="label-price-row">
                  <span>MRP</span>
                  <strong>{formatMoney(row.variant.sellingPrice)}</strong>
                  <small>DEMO</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="scan-placeholder">
            <TagsOutlined />
            <strong>No labels queued</strong>
            <span>Use the scanner above or add variants from the barcode directory.</span>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Barcode directory"
        description="Search by product, SKU or barcode to find a variant."
        bodyClassName="flush"
      >
        <div className="toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search product, SKU or barcode…"
            value={directorySearch}
            onChange={(event) => setDirectorySearch(event.target.value)}
            className="search-input"
          />
          <Select
            value={productFilter}
            onChange={setProductFilter}
            className="filter-select"
            showSearch
            optionFilterProp="label"
            options={[
              { value: 'all', label: 'All products' },
              ...db.products.map((product) => ({ value: product.id, label: product.name })),
            ]}
          />
          <span className="toolbar-count">{filteredDirectory.length} variants</span>
        </div>
        <Table
          rowKey={(row) => row.variant.id}
          columns={columns}
          dataSource={filteredDirectory}
          pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `${total} variants` }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys),
            preserveSelectedRowKeys: true,
          }}
          scroll={{ x: 820 }}
        />
      </SectionCard>

      <div className="label-print-sheet" aria-hidden="true">
        {selectedRows.flatMap((row) =>
          Array.from({ length: copies }, (_, index) => (
            <div className="print-label" key={`${row.variant.id}_${index}`}>
              <span className="print-label-brand">MODERN FASHION · BRAND HUB</span>
              <strong>{row.product.name}</strong>
              <span>{row.variant.color} / {row.variant.size} · {row.variant.sku}</span>
              <BarcodeSvg value={row.variant.barcode} height={44} width={1.4} fontSize={10} />
              <div className="print-label-bottom">
                <span>{formatMoney(row.variant.sellingPrice)}</span>
                <small>DEMO LABEL</small>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
