import { useEffect, useState } from 'react';
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import { EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDate, money } from '@/app/format';
import { EmptyPanel, ErrorPanel, Kpi, LoadingPanel, PageHeader, SectionCard, StatusTag } from '@/app/components';

export default function SuppliersPage() {
  const { can } = useSession();
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);
  const [modal, setModal] = useState({ open: false, record: null });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form] = Form.useForm();

  const suppliers = useAsync(
    () => api('suppliers.list', { query: debouncedQuery, includeInactive }),
    [debouncedQuery, includeInactive]
  );

  useEffect(() => {
    if (!modal.open) return;
    form.resetFields();
    if (modal.record) {
      form.setFieldsValue({
        name: modal.record.name,
        contactPerson: modal.record.contactPerson || '',
        phone: modal.record.phone || '',
        email: modal.record.email || '',
        gstin: modal.record.gstin || '',
        address: modal.record.address || '',
        notes: modal.record.notes || '',
        status: modal.record.status,
      });
    } else {
      form.setFieldsValue({ status: 'active' });
    }
  }, [modal, form]);

  async function submit(values) {
    setSaving(true);
    try {
      if (modal.record) {
        await api('suppliers.update', { ...values, id: modal.record.id });
        message.success('Supplier updated.');
      } else {
        await api('suppliers.create', values);
        message.success('Supplier added.');
      }
      setModal({ open: false, record: null });
      suppliers.reload();
      if (detail && modal.record?.id === detail.id) await openDetail(detail.id);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await api('suppliers.get', { id }));
    } catch (error) {
      message.error(errorMessage(error));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const canManage = can('purchases.manage');
  const rows = suppliers.data || [];
  const outstanding = rows.reduce((sum, row) => sum + row.outstandingPaise, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Supply chain"
        title="Suppliers"
        subtitle="Supplier balances are calculated from posted purchases and recorded payments."
        extra={
          <Space wrap>
            {canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, record: null })}>
                New supplier
              </Button>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={suppliers.reload} loading={suppliers.loading}>
              Refresh
            </Button>
          </Space>
        }
      />

      <div className="kpi-grid three">
        <Kpi label="Active suppliers" value={rows.filter((row) => row.status === 'active').length} hint={`${rows.length} records loaded`} />
        <Kpi label="Outstanding payable" value={money(outstanding)} hint="Across all posted purchases in view" tone={outstanding > 0 ? 'warning' : 'success'} />
        <Kpi
          label="Purchase value"
          value={money(rows.reduce((sum, row) => sum + row.purchaseTotalPaise, 0))}
          hint="Lifetime posted purchases in view"
        />
      </div>

      <SectionCard bodyClassName="panel-body flush">
        <div className="filter-bar">
          <Input
            prefix={<SearchOutlined />}
            placeholder="Supplier name, phone or contact"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            allowClear
            style={{ maxWidth: 320 }}
          />
          <label className="inline-check">
            <Switch size="small" checked={includeInactive} onChange={setIncludeInactive} /> Show inactive
          </label>
        </div>

        {suppliers.loading && !suppliers.data ? (
          <LoadingPanel label="Loading suppliers…" />
        ) : suppliers.error ? (
          <ErrorPanel error={suppliers.error} onRetry={suppliers.reload} />
        ) : rows.length === 0 ? (
          <EmptyPanel
            title="No suppliers yet"
            description={
              canManage
                ? 'Add the suppliers used for real purchase entries. No supplier records are pre-filled.'
                : 'The owner has not added suppliers yet.'
            }
            action={
              canManage ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, record: null })}>
                  Add supplier
                </Button>
              ) : null
            }
          />
        ) : (
          <Table
            rowKey="id"
            dataSource={rows}
            loading={suppliers.loading}
            scroll={{ x: 850 }}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            columns={[
              {
                title: 'Supplier',
                dataIndex: 'name',
                render: (value, row) => (
                  <div>
                    <strong>{value}</strong>
                    <div className="muted small">{row.contactPerson || row.email || 'No contact person'}</div>
                  </div>
                ),
              },
              { title: 'Phone', dataIndex: 'phone', width: 140 },
              { title: 'GSTIN', dataIndex: 'gstin', width: 160, render: (value) => value || '—' },
              { title: 'Purchases', dataIndex: 'purchaseCount', width: 100, align: 'right' },
              {
                title: 'Outstanding',
                dataIndex: 'outstandingPaise',
                width: 140,
                align: 'right',
                render: (value) => (
                  <strong className={value > 0 ? 'text-warning' : ''}>{money(value)}</strong>
                ),
              },
              {
                title: 'Status',
                dataIndex: 'status',
                width: 100,
                render: (value) => <StatusTag status={value} />,
              },
              {
                title: '',
                width: 110,
                render: (_, row) => (
                  <Space size={2}>
                    <Button
                      type="text"
                      icon={<EyeOutlined />}
                      aria-label={`View ${row.name}`}
                      onClick={() => openDetail(row.id)}
                    />
                    {canManage ? (
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        aria-label={`Edit ${row.name}`}
                        onClick={() => setModal({ open: true, record: row })}
                      />
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </SectionCard>

      <Drawer
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        width={620}
        title={detail?.name || 'Supplier'}
        destroyOnClose
        extra={
          detail && canManage ? (
            <Button icon={<EditOutlined />} onClick={() => setModal({ open: true, record: detail })}>
              Edit supplier
            </Button>
          ) : null
        }
      >
        {detailLoading ? (
          <LoadingPanel label="Loading supplier…" />
        ) : detail ? (
          <div>
            <div className="invoice-amount-hero">
              <div>
                <span className="eyebrow">Outstanding payable</span>
                <strong>{money(detail.outstandingPaise)}</strong>
                <span>{detail.purchaseCount} posted purchases</span>
              </div>
              <StatusTag status={detail.status} />
            </div>
            <Descriptions bordered size="small" column={2} className="detail-descriptions">
              <Descriptions.Item label="Contact person">{detail.contactPerson || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{detail.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Email">{detail.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="GSTIN">{detail.gstin || '—'}</Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>
                {detail.address || '—'}
              </Descriptions.Item>
              {detail.notes ? (
                <Descriptions.Item label="Notes" span={2}>
                  {detail.notes}
                </Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Added">{formatDate(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Purchase value">{money(detail.purchaseTotalPaise)}</Descriptions.Item>
            </Descriptions>

            <SectionCard title="Purchase history" className="inner-panel" bodyClassName="panel-body flush">
              {(detail.purchases || []).length ? (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 10 }}
                  dataSource={detail.purchases}
                  columns={[
                    { title: 'Reference', dataIndex: 'reference' },
                    { title: 'Date', dataIndex: 'purchaseDate', width: 110, render: formatDate },
                    { title: 'Total', dataIndex: 'totalPaise', align: 'right', width: 110, render: money },
                    {
                      title: 'Balance',
                      dataIndex: 'balancePaise',
                      align: 'right',
                      width: 110,
                      render: money,
                    },
                    {
                      title: 'Payment',
                      dataIndex: 'paymentStatus',
                      width: 100,
                      render: (value) => <Tag color={value === 'paid' ? 'green' : value === 'partial' ? 'gold' : 'red'}>{value}</Tag>,
                    },
                  ]}
                />
              ) : (
                <p className="muted panel-pad">No purchases recorded for this supplier.</p>
              )}
            </SectionCard>
          </div>
        ) : (
          <EmptyPanel title="Supplier unavailable" />
        )}
      </Drawer>

      <Modal
        title={modal.record ? 'Edit supplier' : 'New supplier'}
        open={modal.open}
        onCancel={() => setModal({ open: false, record: null })}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={modal.record ? 'Save changes' : 'Add supplier'}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
          <div className="form-grid two">
            <Form.Item name="name" label="Supplier name" rules={[{ required: true, max: 160 }]}>
              <Input autoFocus />
            </Form.Item>
            <Form.Item name="contactPerson" label="Contact person">
              <Input maxLength={120} />
            </Form.Item>
          </div>
          <div className="form-grid two">
            <Form.Item name="phone" label="Phone">
              <Input inputMode="tel" />
            </Form.Item>
            <Form.Item name="email" label="Email">
              <Input type="email" />
            </Form.Item>
          </div>
          <div className="form-grid two">
            <Form.Item name="gstin" label="GSTIN" extra="Only record a GSTIN supplied and verified by the supplier.">
              <Input maxLength={20} style={{ textTransform: 'uppercase' }} />
            </Form.Item>
            {modal.record ? (
              <Form.Item name="status" label="Status">
                <Select
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </Form.Item>
            ) : null}
          </div>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
