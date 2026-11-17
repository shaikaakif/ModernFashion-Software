import { useEffect, useState } from 'react';
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
} from 'antd';
import { EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDate, money, paymentLabel } from '@/app/format';
import { EmptyPanel, ErrorPanel, Kpi, LoadingPanel, PageHeader, SectionCard, StatusTag } from '@/app/components';

export default function CustomersPage() {
  const { can } = useSession();
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [modal, setModal] = useState({ open: false, record: null });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form] = Form.useForm();

  const customers = useAsync(() => api('customers.list', { query: debouncedQuery }), [debouncedQuery]);

  useEffect(() => {
    if (!modal.open) return;
    form.resetFields();
    if (modal.record) {
      form.setFieldsValue({
        name: modal.record.name,
        phone: modal.record.phone,
        email: modal.record.email || '',
        address: modal.record.address || '',
        notes: modal.record.notes || '',
      });
    }
  }, [modal, form]);

  async function submit(values) {
    setSaving(true);
    try {
      if (modal.record) {
        await api('customers.update', { ...values, id: modal.record.id });
        message.success('Customer updated.');
        if (detail?.id === modal.record.id) await openDetail(detail.id);
      } else {
        await api('customers.create', values);
        message.success('Customer added.');
      }
      setModal({ open: false, record: null });
      customers.reload();
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
      setDetail(await api('customers.get', { id }));
    } catch (error) {
      message.error(errorMessage(error));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const canManage = can('customers.manage');
  const rows = customers.data || [];
  const totalSpent = rows.reduce((sum, row) => sum + row.totalSpentPaise, 0);
  const outstanding = rows.reduce((sum, row) => sum + row.outstandingPaise, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Customer records"
        title="Customers"
        subtitle="Saved customers link to their invoices. Walk-in customers are recorded on the invoice without a customer record."
        extra={
          <Space wrap>
            {canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, record: null })}>
                New customer
              </Button>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={customers.reload} loading={customers.loading}>
              Refresh
            </Button>
          </Space>
        }
      />

      <div className="kpi-grid three">
        <Kpi label="Customers" value={rows.length} hint="Saved in the local database" />
        <Kpi label="Lifetime purchases" value={money(totalSpent)} hint="Completed invoices only" />
        <Kpi
          label="Outstanding balances"
          value={money(outstanding)}
          hint="Difference between invoice total and amount paid"
          tone={outstanding > 0 ? 'warning' : 'success'}
        />
      </div>

      <SectionCard bodyClassName="panel-body flush">
        <div className="filter-bar">
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search name, phone or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            allowClear
            style={{ maxWidth: 340 }}
          />
        </div>

        {customers.loading && !customers.data ? (
          <LoadingPanel label="Loading customers…" />
        ) : customers.error ? (
          <ErrorPanel error={customers.error} onRetry={customers.reload} />
        ) : rows.length === 0 ? (
          <EmptyPanel
            title="No customers yet"
            description={
              query
                ? 'No saved customer matches this search.'
                : 'Customers can be added here or attached during billing. No sample customers are pre-filled.'
            }
            action={
              canManage ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, record: null })}>
                  Add customer
                </Button>
              ) : null
            }
          />
        ) : (
          <Table
            rowKey="id"
            dataSource={rows}
            loading={customers.loading}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            onRow={(row) => ({ onClick: () => openDetail(row.id), className: 'clickable-row' })}
            columns={[
              {
                title: 'Customer',
                dataIndex: 'name',
                render: (value, row) => (
                  <div>
                    <strong>{value}</strong>
                    <div className="muted small">{row.email || 'No email recorded'}</div>
                  </div>
                ),
              },
              { title: 'Phone', dataIndex: 'phone', width: 140 },
              {
                title: 'Purchases',
                dataIndex: 'purchaseCount',
                width: 100,
                align: 'right',
              },
              {
                title: 'Total spent',
                dataIndex: 'totalSpentPaise',
                width: 130,
                align: 'right',
                render: money,
              },
              {
                title: 'Outstanding',
                dataIndex: 'outstandingPaise',
                width: 130,
                align: 'right',
                render: (value) => <span className={value > 0 ? 'text-warning' : ''}>{money(value)}</span>,
              },
              {
                title: 'Last purchase',
                dataIndex: 'lastPurchaseDate',
                width: 130,
                render: (value) => (value ? formatDate(value) : '—'),
              },
              {
                title: '',
                width: 100,
                render: (_, row) => (
                  <Space size={2}>
                    <Button
                      type="text"
                      icon={<EyeOutlined />}
                      aria-label={`View ${row.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openDetail(row.id);
                      }}
                    />
                    {canManage ? (
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        aria-label={`Edit ${row.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setModal({ open: true, record: row });
                        }}
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
        width={760}
        title={detail?.name || 'Customer'}
        destroyOnClose
        extra={
          detail && canManage ? (
            <Button icon={<EditOutlined />} onClick={() => setModal({ open: true, record: detail })}>
              Edit customer
            </Button>
          ) : null
        }
      >
        {detailLoading ? (
          <LoadingPanel label="Loading customer…" />
        ) : detail ? (
          <div>
            <div className="invoice-amount-hero">
              <div>
                <span className="eyebrow">Total spent</span>
                <strong>{money(detail.totalSpentPaise)}</strong>
                <span>
                  {detail.purchaseCount} completed invoices
                  {detail.outstandingPaise > 0 ? ` · ${money(detail.outstandingPaise)} outstanding` : ''}
                </span>
              </div>
              <div className="tag-row">
                {detail.outstandingPaise > 0 ? <Tag color="gold">Balance due</Tag> : <Tag color="green">Settled</Tag>}
              </div>
            </div>

            <Descriptions bordered size="small" column={2} className="detail-descriptions">
              <Descriptions.Item label="Phone">{detail.phone}</Descriptions.Item>
              <Descriptions.Item label="Email">{detail.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Last purchase">
                {detail.lastPurchaseDate ? formatDate(detail.lastPurchaseDate) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Added">{formatDate(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>
                {detail.address || '—'}
              </Descriptions.Item>
              {detail.notes ? (
                <Descriptions.Item label="Notes" span={2}>
                  {detail.notes}
                </Descriptions.Item>
              ) : null}
            </Descriptions>

            <SectionCard title="Invoice history" className="inner-panel" bodyClassName="panel-body flush">
              {(detail.sales || []).length ? (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={detail.sales}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: 'Invoice', dataIndex: 'invoiceNo', render: (value) => <strong>{value}</strong> },
                    { title: 'Date', dataIndex: 'businessDate', width: 120, render: formatDate },
                    { title: 'Lines', dataIndex: 'lineCount', width: 70, align: 'right' },
                    { title: 'Payment', dataIndex: 'paymentMethod', width: 120, render: paymentLabel },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      width: 110,
                      render: (value, row) => (
                        <Space direction="vertical" size={2}>
                          <StatusTag status={value} />
                          {row.status === 'completed' && row.balancePaise > 0 ? (
                            <span className="muted small">Due {money(row.balancePaise)}</span>
                          ) : null}
                        </Space>
                      ),
                    },
                    { title: 'Total', dataIndex: 'totalPaise', align: 'right', width: 120, render: money },
                  ]}
                />
              ) : (
                <p className="muted panel-pad">No invoices recorded for this customer.</p>
              )}
            </SectionCard>
          </div>
        ) : (
          <EmptyPanel title="Customer unavailable" />
        )}
      </Drawer>

      <Modal
        title={modal.record ? 'Edit customer' : 'New customer'}
        open={modal.open}
        onCancel={() => setModal({ open: false, record: null })}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={modal.record ? 'Save changes' : 'Add customer'}
        width={620}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
          <div className="form-grid two">
            <Form.Item name="name" label="Customer name" rules={[{ required: true, max: 160 }]}>
              <Input autoFocus />
            </Form.Item>
            <Form.Item
              name="phone"
              label="Mobile number"
              rules={[
                { required: true, message: 'Mobile number is required.' },
                { pattern: /^[0-9+\s-]{10,15}$/, message: 'Enter a valid mobile number.' },
              ]}
            >
              <Input inputMode="tel" />
            </Form.Item>
          </div>
          <Form.Item name="email" label="Email">
            <Input type="email" maxLength={160} />
          </Form.Item>
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
