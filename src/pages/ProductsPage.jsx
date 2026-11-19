import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
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
  EditOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDate, formatStock, money } from '@/app/format';
import {
  ErrorPanel,
  EmptyPanel,
  LoadingPanel,
  MoneyInput,
  PageHeader,
  SectionCard,
  StatusTag,
} from '@/app/components';

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function ProductsPage({ embedded = false, initialTab = 'products', initialAction = null }) {
  const { can } = useSession();
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [status, setStatus] = useState(null);
  const [lowStock, setLowStock] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [productModal, setProductModal] = useState({ open: false, record: null });
  const [variantModal, setVariantModal] = useState({ open: false, record: null });
  const [categoryModal, setCategoryModal] = useState({ open: false, record: null });
  const [brandModal, setBrandModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);

  const categories = useAsync(() => api('catalog.categories', { includeInactive: true }), []);
  const brands = useAsync(() => api('catalog.brands', { includeInactive: true }), []);
  const suppliers = useAsync(() => api('suppliers.list', {}), [], { immediate: can('purchases.view') });
  const products = useAsync(
    () =>
      api('catalog.list', {
        query: debouncedQuery,
        categoryId,
        status,
        lowStock,
      }),
    [debouncedQuery, categoryId, status, lowStock]
  );

  const categoryOptions = useMemo(
    () =>
      (categories.data || []).map((category) => ({
        value: category.id,
        label: category.status === 'active' ? category.name : `${category.name} (inactive)`,
      })),
    [categories.data]
  );

  const [productForm] = Form.useForm();
  const [variantForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [brandForm] = Form.useForm();

  useEffect(() => {
    if (initialAction === 'product' && can('products.manage')) {
      setProductModal({ open: true, record: null });
    }
  }, [initialAction, can]);

  useEffect(() => {
    if (productModal.open) {
      productForm.resetFields();
      if (productModal.record) {
        const singleVariant =
          productModal.record.variants?.length === 1 ? productModal.record.variants[0] : null;
        productForm.setFieldsValue({
          name: productModal.record.name,
          categoryId: productModal.record.categoryId,
          brandId: productModal.record.brandId || null,
          supplierId: productModal.record.supplierId || null,
          hsnCode: productModal.record.hsnCode || '',
          taxRatePercent: Number(productModal.record.taxRateBp || 0) / 100,
          status: productModal.record.status,
          description: productModal.record.description || '',
          ...(singleVariant
            ? {
                costPaise: singleVariant.costPaise,
                pricePaise: singleVariant.pricePaise,
                mrpPaise: singleVariant.mrpPaise,
                lowStockThreshold: singleVariant.lowStockThreshold,
              }
            : {}),
        });
      } else {
        productForm.setFieldsValue({
          status: 'active',
          taxRatePercent: 0,
          lowStockThreshold: 5,
          openingStock: 0,
          colors: 'Default',
          sizes: 'Free',
        });
      }
    }
  }, [productModal.open, productModal.record, productForm]);

  useEffect(() => {
    if (variantModal.open) {
      variantForm.resetFields();
      if (variantModal.record) {
        variantForm.setFieldsValue({
          costPaise: variantModal.record.costPaise,
          pricePaise: variantModal.record.pricePaise,
          mrpPaise: variantModal.record.mrpPaise,
          lowStockThreshold: variantModal.record.lowStockThreshold,
          status: variantModal.record.status,
        });
      } else {
        variantForm.setFieldsValue({
          lowStockThreshold: 5,
          openingStock: 0,
          costPaise: 0,
          pricePaise: 0,
          mrpPaise: 0,
        });
      }
    }
  }, [variantModal.open, variantModal.record, variantForm]);

  useEffect(() => {
    if (categoryModal.open) {
      categoryForm.resetFields();
      if (categoryModal.record) {
        categoryForm.setFieldsValue({
          name: categoryModal.record.name,
          code: categoryModal.record.code,
          status: categoryModal.record.status,
        });
      } else {
        categoryForm.setFieldsValue({ status: 'active' });
      }
    }
  }, [categoryModal.open, categoryModal.record, categoryForm]);

  useEffect(() => {
    if (brandModal) {
      brandForm.resetFields();
    }
  }, [brandModal, brandForm]);

  async function openProduct(id) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await api('catalog.get', { id }));
    } catch (error) {
      message.error(errorMessage(error));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetail() {
    if (!detail) return;
    try {
      setDetail(await api('catalog.get', { id: detail.id }));
      products.reload();
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function submitProduct(values) {
    setSaving(true);
    try {
      const payload = {
        name: values.name,
        categoryId: values.categoryId,
        brandId: values.brandId || null,
        supplierId: values.supplierId || null,
        hsnCode: values.hsnCode || '',
        taxRateBp: Math.round(Number(values.taxRatePercent || 0) * 100),
        description: values.description || '',
        status: values.status || 'active',
      };
      if (productModal.record) {
        const singleVariant =
          productModal.record.variants?.length === 1 ? productModal.record.variants[0] : null;
        let updated = await api('catalog.update', { ...payload, id: productModal.record.id });
        if (singleVariant && values.pricePaise !== undefined) {
          await api('catalog.updateVariant', {
            variantId: singleVariant.id,
            costPaise: values.costPaise || 0,
            pricePaise: values.pricePaise,
            mrpPaise: values.mrpPaise || 0,
            lowStockThreshold: values.lowStockThreshold ?? singleVariant.lowStockThreshold,
            status: singleVariant.status,
          });
          updated = await api('catalog.get', { id: productModal.record.id });
        }
        message.success('Product details updated.');
        setProductModal({ open: false, record: null });
        setDetail(updated);
        products.reload();
      } else {
        const colors = splitList(values.colors);
        const sizes = splitList(values.sizes);
        const created = await api('catalog.create', {
          ...payload,
          costPaise: values.costPaise || 0,
          pricePaise: values.pricePaise,
          mrpPaise: values.mrpPaise || 0,
          lowStockThreshold: values.lowStockThreshold ?? 5,
          variants: (colors.length ? colors : ['Default']).flatMap((color) =>
            (sizes.length ? sizes : ['Free']).map((size) => ({ color, size }))
          ),
          openingStock: values.openingStock || 0,
        });
        message.success(`Product created with ${created.variants.length} variant(s).`);
        setProductModal({ open: false, record: null });
        products.reload();
        setDetail(created);
        setDetailOpen(true);
      }
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function submitVariant(values) {
    if (!detail) return;
    setSaving(true);
    try {
      const payload = {
        costPaise: values.costPaise || 0,
        pricePaise: values.pricePaise,
        mrpPaise: values.mrpPaise || 0,
        lowStockThreshold: values.lowStockThreshold ?? 5,
      };
      if (variantModal.record) {
        await api('catalog.updateVariant', { ...payload, variantId: variantModal.record.id, status: values.status });
        message.success('Variant updated.');
      } else {
        await api('catalog.addVariant', {
          ...payload,
          productId: detail.id,
          color: values.color,
          size: values.size,
          openingStock: values.openingStock || 0,
          barcode: values.barcode || undefined,
        });
        message.success('Variant added.');
      }
      setVariantModal({ open: false, record: null });
      await refreshDetail();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function submitCategory(values) {
    setSaving(true);
    try {
      if (categoryModal.record) {
        await api('catalog.updateCategory', { ...values, id: categoryModal.record.id });
        message.success('Category updated.');
      } else {
        await api('catalog.createCategory', values);
        message.success('Category created.');
      }
      setCategoryModal({ open: false, record: null });
      categories.reload();
      brands.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function submitBrand(values) {
    setSaving(true);
    try {
      await api('catalog.createBrand', values);
      message.success('Brand created.');
      setBrandModal(false);
      brands.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function openLabelPreview(variantIds) {
    if (!variantIds.length) {
      message.info('Choose at least one variant.');
      return;
    }
    navigate(`/barcodes?variant=${variantIds.join(',')}`);
  }

  function regenerateBarcode(row, symbology) {
    const label = symbology === 'ean8' ? 'EAN-8' : 'UPC-A';
    const digits = symbology === 'ean8' ? 8 : 12;
    modal.confirm({
      title: `Regenerate ${row.sku} as ${label}?`,
      content: (
        <div>
          <p>
            The barcode will change from <strong>{row.barcode}</strong> to a new {digits}-digit {label} number.
          </p>
          <p>Old printed labels will stop scanning for this variant until replaced. Sales history is unchanged.</p>
          <p>Only the label code changes. The SKU, price, stock and invoice records stay the same.</p>
        </div>
      ),
      okText: `Regenerate ${label}`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const result = await api('catalog.regenerateBarcode', { variantId: row.id, symbology });
          message.success(`New ${label} barcode: ${result.barcode}. Reprint the label.`, 8);
          await refreshDetail();
        } catch (error) {
          message.error(errorMessage(error));
          throw error;
        }
      },
    });
  }

  const canManage = can('products.manage');
  const canSeeCost = can('reports.profit');
  const canLinkSupplier = can('purchases.view');
  const rows = products.data || [];
  const productCount = rows.length;
  const archivedRows = rows.filter((row) => row.status === 'inactive');

  async function refreshAfterStatus() {
    products.reload();
    if (detail) {
      try {
        setDetail(await api('catalog.get', { id: detail.id }));
      } catch {
        setDetail(null);
      }
    }
  }

  function confirmRestore(record) {
    Modal.confirm({
      title: `Restore ${record.name}?`,
      content: 'The product will be selectable in new sales again.',
      okText: 'Restore product',
      onOk: async () => {
        try {
          await api('catalog.restore', { id: record.id });
          message.success(`${record.name} restored.`);
          await refreshAfterStatus();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  }

  function confirmDelete(record) {
    Modal.confirm({
      title: `Delete ${record.name}?`,
      content:
        'If this product has sales or stock history, it is removed from the active catalogue and historical invoices stay intact. If it has no history, it is deleted permanently. This action cannot be undone.',
      okText: 'Delete product',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const result = await api('catalog.delete', { id: record.id });
          message.success(
            result.archived
              ? `${record.name} removed from inventory. Historical invoices are preserved.`
              : `${record.name} deleted permanently.`
          );
          if (detail?.id === record.id) {
            setDetailOpen(false);
            setDetail(null);
          }
          products.reload();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  }

  return (
    <div>
      {!embedded ? (
        <PageHeader
          eyebrow="Catalogue"
          title="Products & variants"
          subtitle="Prices, SKUs and barcodes are stored locally. Every variant is unique and can be printed as a Code 128 label."
          extra={
            <Space wrap>
              {canManage ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setProductModal({ open: true, record: null })}
                >
                  New product
                </Button>
              ) : null}
              <Button icon={<ReloadOutlined />} onClick={() => { products.reload(); categories.reload(); brands.reload(); }}>
                Refresh
              </Button>
            </Space>
          }
        />
      ) : null}

      <Tabs
        activeKey={tab}
        onChange={setTab}
        tabBarStyle={embedded ? { display: 'none' } : undefined}
        items={[
          {
            key: 'products',
            label: 'Products',
            children: (
              <SectionCard bodyClassName="panel-body flush">
                <div className="filter-bar">
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder="Product name, SKU or barcode"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    allowClear
                    style={{ maxWidth: 320 }}
                  />
                  <Select
                    allowClear
                    placeholder="All categories"
                    value={categoryId}
                    onChange={setCategoryId}
                    options={categoryOptions}
                    style={{ width: 200 }}
                  />
                  <Select
                    allowClear
                    placeholder="All statuses"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Removed (inactive)' },
                    ]}
                    style={{ width: 160 }}
                  />
                  <label className="inline-check">
                    <Switch size="small" checked={lowStock} onChange={setLowStock} /> Low stock only
                  </label>
                  <div className="filter-summary">
                    <span>{productCount} products</span>
                  </div>
                  {embedded && canManage ? (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setProductModal({ open: true, record: null })}
                    >
                      New product
                    </Button>
                  ) : null}
                </div>

                {products.loading && !products.data ? (
                  <LoadingPanel label="Loading the catalogue…" />
                ) : products.error ? (
                  <ErrorPanel error={products.error} onRetry={products.reload} />
                ) : rows.length === 0 ? (
                  <EmptyPanel
                    title="No products added yet"
                    description={
                      canManage
                        ? 'Add the real store catalogue. Demo products are intentionally not seeded.'
                        : 'The owner has not added products to the local catalogue yet.'
                    }
                    action={
                      canManage ? (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setProductModal({ open: true, record: null })}>
                          Add the first product
                        </Button>
                      ) : null
                    }
                  />
                ) : (
                  <Table
                    rowKey="id"
                    dataSource={rows}
                    loading={products.loading}
                    scroll={{ x: 900 }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    onRow={(row) => ({ onClick: () => openProduct(row.id), className: 'clickable-row' })}
                    columns={[
                      {
                        title: 'Product',
                        dataIndex: 'name',
                        render: (value, row) => (
                          <div>
                            <strong>{value}</strong>
                            <div className="muted small">
                              {row.categoryName}
                              {row.brandName ? ` · ${row.brandName}` : ''}
                            </div>
                          </div>
                        ),
                      },
                      {
                        title: 'Variants',
                        dataIndex: 'variantCount',
                        width: 90,
                        align: 'right',
                      },
                      {
                        title: 'Stock',
                        dataIndex: 'stock',
                        width: 110,
                        align: 'right',
                        render: (value, row) => (
                          <Space direction="vertical" size={2} style={{ alignItems: 'flex-end' }}>
                            <strong className={value < 0 ? 'text-danger' : value === 0 ? 'text-danger' : ''}>
                              {formatStock(value)}
                            </strong>
                            {value < 0 ? <Tag color="red">Negative</Tag> : null}
                            {row.lowStockCount > 0 ? (
                              <Tag color="gold">
                                {row.lowStockCount} variant{row.lowStockCount === 1 ? '' : 's'} low
                              </Tag>
                            ) : null}
                          </Space>
                        ),
                      },
                      {
                        title: 'Selling price',
                        width: 170,
                        align: 'right',
                        render: (_, row) => {
                          if (!row.variantCount) return '—';
                          if (row.minPricePaise === row.maxPricePaise) return money(row.minPricePaise);
                          return `${money(row.minPricePaise)} – ${money(row.maxPricePaise)}`;
                        },
                      },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        width: 100,
                        render: (value) => <StatusTag status={value} />,
                      },
                      {
                        title: 'Updated',
                        dataIndex: 'updatedAt',
                        width: 130,
                        render: formatDate,
                      },
                      ...(canManage
                        ? [
                            {
                              title: '',
                              width: 100,
                              render: (_, row) => (
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    confirmDelete(row);
                                  }}
                                >
                                  Delete
                                </Button>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </SectionCard>
            ),
          },
          {
            key: 'categories',
            label: 'Categories & brands',
            children: (
              <div className="split-2">
                <SectionCard
                  title="Categories"
                  subtitle="Codes feed the readable SKU prefix."
                  extra={
                    canManage ? (
                      <Button
                        icon={<PlusOutlined />}
                        onClick={() => setCategoryModal({ open: true, record: null })}
                      >
                        New category
                      </Button>
                    ) : null
                  }
                  bodyClassName="panel-body flush"
                >
                  <Table
                    rowKey="id"
                    size="small"
                    loading={categories.loading}
                    dataSource={categories.data || []}
                    pagination={false}
                    columns={[
                      { title: 'Name', dataIndex: 'name' },
                      { title: 'Code', dataIndex: 'code', width: 100 },
                      { title: 'Products', dataIndex: 'productCount', width: 100, align: 'right' },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        width: 100,
                        render: (value) => <StatusTag status={value} />,
                      },
                      ...(canManage
                        ? [
                            {
                              title: '',
                              width: 60,
                              render: (_, row) => (
                                <Button
                                  type="text"
                                  icon={<EditOutlined />}
                                  aria-label={`Edit ${row.name}`}
                                  onClick={() => setCategoryModal({ open: true, record: row })}
                                />
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                </SectionCard>

                <SectionCard
                  title="Brands"
                  subtitle="Optional labels for filtering and barcode labels."
                  extra={
                    canManage ? (
                      <Button icon={<TagsOutlined />} onClick={() => setBrandModal(true)}>
                        New brand
                      </Button>
                    ) : null
                  }
                  bodyClassName="panel-body flush"
                >
                  <Table
                    rowKey="id"
                    size="small"
                    loading={brands.loading}
                    dataSource={brands.data || []}
                    pagination={false}
                    columns={[
                      { title: 'Brand', dataIndex: 'name' },
                      { title: 'Products', dataIndex: 'productCount', width: 100, align: 'right' },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        width: 100,
                        render: (value) => <StatusTag status={value} />,
                      },
                    ]}
                  />
                </SectionCard>
              </div>
            ),
          },
          {
            key: 'archived',
            label: `Removed${archivedRows.length ? ` (${archivedRows.length})` : ''}`,
            children: (
              <SectionCard
                title="Removed products"
                subtitle="Removed from active inventory. Historical invoices, stock movements and reports are unchanged."
                bodyClassName="panel-body flush"
              >
                {archivedRows.length === 0 ? (
                  <EmptyPanel
                    title="No removed products"
                    description="Products with sales or stock history appear here after deletion, so old bills stay readable."
                  />
                ) : (
                  <Table
                    rowKey="id"
                    size="small"
                    dataSource={archivedRows}
                    pagination={{ pageSize: 20 }}
                    columns={[
                      {
                        title: 'Product',
                        dataIndex: 'name',
                        render: (value, row) => (
                          <div>
                            <strong>{value}</strong>
                            <div className="muted small">{row.categoryName}</div>
                          </div>
                        ),
                      },
                      { title: 'Variants', dataIndex: 'variantCount', width: 90, align: 'right' },
                      { title: 'Stock', dataIndex: 'stock', width: 110, align: 'right', render: formatStock },
                      { title: 'Updated', dataIndex: 'updatedAt', width: 130, render: formatDate },
                      {
                        title: '',
                        width: 230,
                        render: (_, row) => (
                          <Space size={4} wrap>
                            <Button size="small" onClick={() => openProduct(row.id)}>
                              View
                            </Button>
                            {canManage ? (
                              <Button size="small" onClick={() => confirmRestore(row)}>
                                Restore
                              </Button>
                            ) : null}
                            {canManage ? (
                              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(row)}>
                                Delete
                              </Button>
                            ) : null}
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}
              </SectionCard>
            ),
          },
        ]}
      />

      <Drawer
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        width={820}
        title={detail ? detail.name : 'Product'}
        destroyOnClose
        extra={
          detail ? (
            <Space wrap>
              {canManage ? (
                <>
                  <Button icon={<EditOutlined />} onClick={() => setProductModal({ open: true, record: detail })}>
                    Edit details
                  </Button>
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => setVariantModal({ open: true, record: null })}
                  >
                    Add variant
                  </Button>
                  <Button
                    icon={<PrinterOutlined />}
                    onClick={() => openLabelPreview((detail.variants || []).map((variant) => variant.id))}
                  >
                    Print all labels
                  </Button>
                  {detail.status === 'active' ? (
                    <Button danger icon={<DeleteOutlined />} onClick={() => confirmDelete(detail)}>
                      Delete
                    </Button>
                  ) : (
                    <>
                      <Button onClick={() => confirmRestore(detail)}>Restore</Button>
                      <Button danger icon={<DeleteOutlined />} onClick={() => confirmDelete(detail)}>
                        Delete
                      </Button>
                    </>
                  )}
                </>
              ) : null}
            </Space>
          ) : null
        }
      >
        {detailLoading ? (
          <LoadingPanel label="Loading the product…" />
        ) : detail ? (
          <div>
            <div className="product-hero">
              <div>
                <span className="eyebrow">{detail.categoryName}</span>
                <h2>{detail.name}</h2>
                <div className="tag-row">
                  <StatusTag status={detail.status} />
                  {detail.brandName ? <Tag>{detail.brandName}</Tag> : null}
                  {detail.hsnCode ? <Tag>HSN {detail.hsnCode}</Tag> : null}
                  <Tag>Tax {(Number(detail.taxRateBp || 0) / 100).toFixed(2)}%</Tag>
                </div>
              </div>
              <div className="hero-metric">
                <span>Total stock</span>
                <strong>{formatStock(detail.stock || 0)}</strong>
                <small>{detail.variants?.length || 0} variants</small>
              </div>
            </div>

            {detail.description ? <p className="muted">{detail.description}</p> : null}

            <Descriptions bordered size="small" column={2} className="detail-descriptions">
              <Descriptions.Item label="Category">{detail.categoryName}</Descriptions.Item>
              <Descriptions.Item label="Brand">{detail.brandName || '—'}</Descriptions.Item>
              {canLinkSupplier ? (
                <Descriptions.Item label="Preferred supplier">{detail.supplierName || '—'}</Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Last updated">{formatDate(detail.updatedAt)}</Descriptions.Item>
            </Descriptions>

            <SectionCard title="Variants" className="inner-panel" bodyClassName="panel-body flush">
              <p className="muted small" style={{ padding: '10px 12px 0' }}>
                Purchase price, selling price, MRP and low-stock threshold are per variant. Use <strong>Edit price</strong> on a row.
                Opening stock is set at creation; use Inventory → Update stock for later corrections.
              </p>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detail.variants || []}
                scroll={{ x: 760 }}
                columns={[
                  {
                    title: 'Colour / size',
                    render: (_, row) => (
                      <div>
                        <strong>
                          {row.color} / {row.size}
                        </strong>
                        <div className="muted small">{row.sku}</div>
                      </div>
                    ),
                  },
                  {
                    title: 'Barcode',
                    dataIndex: 'barcode',
                    width: 150,
                    render: (value, row) => (
                      <Button
                        type="link"
                        size="small"
                        className="barcode-link mono small"
                        onClick={() => openLabelPreview([row.id])}
                      >
                        {value}
                      </Button>
                    ),
                  },
                  {
                    title: 'Stock',
                    dataIndex: 'stock',
                    width: 80,
                    align: 'right',
                    render: (value, row) => (
                      <span className={value < 0 ? 'text-danger' : value <= row.lowStockThreshold ? 'text-warning' : ''}>
                        {formatStock(value)}
                      </span>
                    ),
                  },
                  ...(canSeeCost
                    ? [
                        {
                          title: 'Cost',
                          dataIndex: 'costPaise',
                          width: 100,
                          align: 'right',
                          render: money,
                        },
                      ]
                    : []),
                  { title: 'Price', dataIndex: 'pricePaise', width: 100, align: 'right', render: money },
                  { title: 'MRP', dataIndex: 'mrpPaise', width: 100, align: 'right', render: (value) => (value ? money(value) : '—') },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    width: 90,
                    render: (value) => <StatusTag status={value} />,
                  },
                  {
                    title: '',
                    width: 240,
                    render: (_, row) => (
                      <Space size={2}>
                        <Button
                          type="text"
                          size="small"
                          icon={<BarcodeOutlined />}
                          aria-label={`Preview label for ${row.sku}`}
                          onClick={() => openLabelPreview([row.id])}
                        />
                        {canManage ? (
                          <>
                            <Dropdown
                              trigger={['click']}
                              menu={{
                                items: [
                                  { key: 'ean8', label: 'EAN-8 — 8 digits, widest bars' },
                                  { key: 'upca', label: 'UPC-A — 12 digits' },
                                ],
                                onClick: ({ key }) => regenerateBarcode(row, key),
                              }}
                            >
                              <Button type="text" size="small" aria-label={`Regenerate barcode for ${row.sku}`}>
                                New code
                              </Button>
                            </Dropdown>
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              aria-label={`Edit price for ${row.sku}`}
                              onClick={() => setVariantModal({ open: true, record: row })}
                            >
                              Edit price
                            </Button>
                          </>
                        ) : null}
                      </Space>
                    ),
                  },
                ]}
              />
            </SectionCard>
            <p className="muted small">
              Price and cost changes do not alter historical invoices. Completed sales keep the price and cost
              captured on the day of sale.
            </p>
          </div>
        ) : (
          <EmptyPanel title="Product unavailable" />
        )}
      </Drawer>

      <Modal
        title={productModal.record ? 'Edit product' : 'New product'}
        open={productModal.open}
        onCancel={() => setProductModal({ open: false, record: null })}
        onOk={() => productForm.submit()}
        confirmLoading={saving}
        okText={productModal.record ? 'Save changes' : 'Create product'}
        width={760}
        destroyOnClose
      >
        <Form form={productForm} layout="vertical" onFinish={submitProduct} requiredMark={false}>
          <div className="form-grid two">
            <Form.Item name="name" label="Product name" rules={[{ required: true, max: 160 }]}>
              <Input placeholder="e.g. Slim fit denim jeans" autoFocus />
            </Form.Item>
            <Form.Item name="categoryId" label="Category" rules={[{ required: true, message: 'Choose a category.' }]}>
              <Select options={categoryOptions} placeholder="Choose a category" showSearch optionFilterProp="label" />
            </Form.Item>
          </div>
          <div className="form-grid two">
            <Form.Item name="brandId" label="Brand">
              <Select
                allowClear
                options={(brands.data || [])
                  .filter((brand) => brand.status === 'active')
                  .map((brand) => ({ value: brand.id, label: brand.name }))}
                placeholder="Optional"
              />
            </Form.Item>
            {canLinkSupplier ? (
              <Form.Item name="supplierId" label="Preferred supplier">
                <Select
                  allowClear
                  options={(suppliers.data || [])
                    .filter((supplier) => supplier.status === 'active')
                    .map((supplier) => ({ value: supplier.id, label: supplier.name }))}
                  placeholder="Optional"
                />
              </Form.Item>
            ) : null}
          </div>
          <div className="form-grid three">
            <Form.Item name="hsnCode" label="HSN code">
              <Input maxLength={20} placeholder="Optional" />
            </Form.Item>
            <Form.Item name="taxRatePercent" label="Tax rate (%)">
              <InputNumber min={0} max={28} precision={2} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Removed (inactive)' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>

          {productModal.record ? (
            productModal.record.variants?.length === 1 ? (
              <>
                <div className="form-grid three">
                  <Form.Item name="costPaise" label="Purchase price (₹)">
                    <MoneyInput />
                  </Form.Item>
                  <Form.Item
                    name="pricePaise"
                    label="Selling price (₹)"
                    rules={[{ required: true, message: 'Enter a selling price.' }]}
                  >
                    <MoneyInput />
                  </Form.Item>
                  <Form.Item name="mrpPaise" label="MRP (₹)">
                    <MoneyInput />
                  </Form.Item>
                </div>
                <Form.Item name="lowStockThreshold" label="Low-stock alert at">
                  <InputNumber min={0} max={100000} style={{ width: '100%' }} />
                </Form.Item>
                <Alert
                  type="info"
                  showIcon
                  className="detail-alert"
                  message="Stock corrections use the ledger"
                  description="Opening stock is recorded when the product is created. Use Inventory → Update stock to add, correct or remove current stock; every change is recorded."
                />
              </>
            ) : (
              <Alert
                type="info"
                showIcon
                className="detail-alert"
                message={`${productModal.record.variants?.length || 0} variants`}
                description="Edit purchase price, selling price, MRP and low-stock threshold per variant from the Variants table in the product view. This keeps each size and colour priced correctly."
              />
            )
          ) : null}

          {!productModal.record ? (
            <>
              <div className="form-grid two">
                <Form.Item
                  name="colors"
                  label="Colours (comma separated)"
                  extra="One variant is created for every colour and size combination."
                >
                  <Input placeholder="Black, White, Blue" />
                </Form.Item>
                <Form.Item name="sizes" label="Sizes (comma separated)">
                  <Input placeholder="S, M, L, XL" />
                </Form.Item>
              </div>
              <div className="form-grid three">
                <Form.Item name="costPaise" label="Purchase cost (₹)">
                  <MoneyInput />
                </Form.Item>
                <Form.Item name="pricePaise" label="Selling price (₹)" rules={[{ required: true, message: 'Enter a selling price.' }]}>
                  <MoneyInput />
                </Form.Item>
                <Form.Item name="mrpPaise" label="MRP (₹)">
                  <MoneyInput />
                </Form.Item>
              </div>
              <div className="form-grid three">
                <Form.Item name="lowStockThreshold" label="Low-stock alert at">
                  <InputNumber min={0} max={100000} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="openingStock" label="Opening stock per variant" extra="Creates an opening stock movement per variant.">
                  <InputNumber min={0} max={1000000} style={{ width: '100%' }} />
                </Form.Item>
              </div>
            </>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={variantModal.record ? `Edit ${variantModal.record.sku}` : 'Add variant'}
        open={variantModal.open}
        onCancel={() => setVariantModal({ open: false, record: null })}
        onOk={() => variantForm.submit()}
        confirmLoading={saving}
        okText={variantModal.record ? 'Save variant' : 'Add variant'}
        destroyOnClose
      >
        <Form form={variantForm} layout="vertical" onFinish={submitVariant} requiredMark={false}>
          {!variantModal.record ? (
            <div className="form-grid two">
              <Form.Item name="color" label="Colour" rules={[{ required: true, max: 60 }]}>
                <Input placeholder="Black" />
              </Form.Item>
              <Form.Item name="size" label="Size" rules={[{ required: true, max: 60 }]}>
                <Input placeholder="M" />
              </Form.Item>
            </div>
          ) : (
            <Alert
              type="info"
              showIcon
              className="detail-alert"
              message="Colour and size cannot be renamed."
              description="The SKU and barcode stay stable so existing labels remain valid. Create a new variant instead."
            />
          )}
          <div className="form-grid three">
            <Form.Item name="costPaise" label="Cost (₹)">
              <MoneyInput />
            </Form.Item>
            <Form.Item name="pricePaise" label="Selling price (₹)" rules={[{ required: true, message: 'Enter a price.' }]}>
              <MoneyInput />
            </Form.Item>
            <Form.Item name="mrpPaise" label="MRP (₹)">
              <MoneyInput />
            </Form.Item>
          </div>
          <div className="form-grid three">
            <Form.Item name="lowStockThreshold" label="Low-stock alert at">
              <InputNumber min={0} max={100000} style={{ width: '100%' }} />
            </Form.Item>
            {variantModal.record ? (
              <Form.Item name="status" label="Status">
                <Select
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </Form.Item>
            ) : (
              <Form.Item name="openingStock" label="Opening stock">
                <InputNumber min={0} max={1000000} style={{ width: '100%' }} />
              </Form.Item>
            )}
          </div>
          {!variantModal.record ? (
            <Form.Item name="barcode" label="Barcode" extra="Leave blank to generate an internal MF barcode.">
              <Input maxLength={64} placeholder="Scan or type an existing barcode" />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={categoryModal.record ? 'Edit category' : 'New category'}
        open={categoryModal.open}
        onCancel={() => setCategoryModal({ open: false, record: null })}
        onOk={() => categoryForm.submit()}
        confirmLoading={saving}
        okText="Save category"
        destroyOnClose
      >
        <Form form={categoryForm} layout="vertical" onFinish={submitCategory} requiredMark={false}>
          <Form.Item name="name" label="Category name" rules={[{ required: true, max: 80 }]}>
            <Input placeholder="e.g. Shirts" autoFocus />
          </Form.Item>
          <Form.Item
            name="code"
            label="Short code"
            extra="Up to 8 letters or digits. Used in generated SKUs."
            rules={[{ required: true, max: 8 }]}
          >
            <Input placeholder="SHR" maxLength={8} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          {categoryModal.record ? (
            <Form.Item name="status" label="Status">
              <Select
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title="New brand"
        open={brandModal}
        onCancel={() => setBrandModal(false)}
        onOk={() => brandForm.submit()}
        confirmLoading={saving}
        okText="Create brand"
        destroyOnClose
      >
        <Form form={brandForm} layout="vertical" onFinish={submitBrand} requiredMark={false}>
          <Form.Item name="name" label="Brand name" rules={[{ required: true, max: 80 }]}>
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
