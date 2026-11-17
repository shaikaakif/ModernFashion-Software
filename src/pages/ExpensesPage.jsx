import { useEffect, useState } from 'react';
import {
  App as AntApp,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
} from 'antd';
import {
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, errorMessage } from '@/app/api';
import { useAsync, useDebouncedValue } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDate, money, paymentLabel } from '@/app/format';
import {
  EmptyPanel,
  ErrorPanel,
  Kpi,
  LoadingPanel,
  MoneyInput,
  PageHeader,
  SectionCard,
  StatusTag,
} from '@/app/components';

const { RangePicker } = DatePicker;

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
];

export default function ExpensesPage() {
  const { can } = useSession();
  const { message } = AntApp.useApp();
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [status, setStatus] = useState('active');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [modal, setModal] = useState({ open: false, record: null });
  const [saving, setSaving] = useState(false);
  const [voidRecord, setVoidRecord] = useState(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form] = Form.useForm();
  const [voidForm] = Form.useForm();
  const [categoryForm] = Form.useForm();

  const from = range?.[0]?.format('YYYY-MM-DD') || null;
  const to = range?.[1]?.format('YYYY-MM-DD') || null;

  const categories = useAsync(() => api('expenses.categories', { includeInactive: true }), []);
  const expenses = useAsync(
    () =>
      api('expenses.list', {
        from,
        to,
        categoryId,
        query: debouncedQuery,
        status: status === 'all' ? null : status,
      }),
    [from, to, categoryId, debouncedQuery, status]
  );
  const summary = useAsync(() => api('expenses.summary', { from, to }), [from, to]);

  useEffect(() => {
    if (!modal.open) return;
    form.resetFields();
    if (modal.record) {
      form.setFieldsValue({
        expenseDate: dayjs(modal.record.businessDate),
        categoryId: modal.record.categoryId,
        amountPaise: modal.record.amountPaise,
        paymentMethod: modal.record.paymentMethod,
        description: modal.record.description,
        reference: modal.record.reference || '',
        vendor: modal.record.vendor || '',
      });
    } else {
      form.setFieldsValue({ expenseDate: dayjs(), paymentMethod: 'cash', amountPaise: 0 });
    }
  }, [modal, form]);

  useEffect(() => {
    if (voidRecord) voidForm.resetFields();
  }, [voidRecord, voidForm]);

  useEffect(() => {
    if (categoryModal) categoryForm.resetFields();
  }, [categoryModal, categoryForm]);

  const canManage = can('expenses.manage');
  const rows = expenses.data || [];
  const activeRows = rows.filter((row) => row.status === 'active');
  const total = activeRows.reduce((sum, row) => sum + row.amountPaise, 0);

  async function submit(values) {
    setSaving(true);
    try {
      const payload = {
        expenseDate: values.expenseDate?.format('YYYY-MM-DD'),
        categoryId: values.categoryId,
        amountPaise: values.amountPaise,
        paymentMethod: values.paymentMethod,
        description: values.description,
        reference: values.reference || '',
        vendor: values.vendor || '',
      };
      if (modal.record) {
        await api('expenses.update', { ...payload, id: modal.record.id });
        message.success('Expense updated.');
      } else {
        await api('expenses.create', payload);
        message.success('Expense recorded.');
      }
      setModal({ open: false, record: null });
      expenses.reload();
      summary.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function submitVoid(values) {
    if (!voidRecord) return;
    setSaving(true);
    try {
      await api('expenses.void', { id: voidRecord.id, reason: values.reason });
      message.success('Expense voided. The record remains in the audit trail.');
      setVoidRecord(null);
      expenses.reload();
      summary.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function submitCategory(values) {
    setSaving(true);
    try {
      await api('expenses.createCategory', values);
      message.success('Expense category added.');
      setCategoryModal(false);
      categories.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function exportExpenses() {
    setExporting(true);
    try {
      const result = await api('export.expenses', { from, to });
      if (result) message.success(`Expense register saved: ${result.path}`, 5);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operating costs"
        title="Expenses"
        subtitle="Salary, rent, utilities and other running costs. Supplier purchases are tracked separately as inventory."
        extra={
          <Space wrap>
            {can('reports.export') ? (
              <Button icon={<DownloadOutlined />} onClick={exportExpenses} loading={exporting}>
                Export CSV
              </Button>
            ) : null}
            {canManage ? (
              <>
                <Button icon={<TagsOutlined />} onClick={() => setCategoryModal(true)}>
                  Add category
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, record: null })}>
                  New expense
                </Button>
              </>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={() => { expenses.reload(); summary.reload(); }} loading={expenses.loading}>
              Refresh
            </Button>
          </Space>
        }
      />

      <div className="kpi-grid three">
        <Kpi label="Expenses in view" value={money(total)} hint={`${activeRows.length} active entries`} tone="accent" />
        <Kpi
          label="Largest category"
          value={summary.data?.categories?.[0]?.categoryName || '—'}
          hint={summary.data?.categories?.[0] ? money(summary.data.categories[0].totalPaise) : 'No expenses recorded'}
        />
        <Kpi
          label="Average entry"
          value={activeRows.length ? money(Math.round(total / activeRows.length)) : money(0)}
          hint="Across active expenses in view"
        />
      </div>

      <SectionCard bodyClassName="panel-body flush">
        <div className="filter-bar">
          <RangePicker value={range} onChange={(value) => setRange(value || [])} allowClear={false} format="DD MMM YYYY" />
          <Input
            prefix={<SearchOutlined />}
            placeholder="Description, vendor or reference"
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
            options={(categories.data || []).map((category) => ({ value: category.id, label: category.name }))}
            style={{ width: 190 }}
          />
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: 'Active only' },
              { value: 'void', label: 'Voided only' },
              { value: 'all', label: 'All statuses' },
            ]}
            style={{ width: 150 }}
          />
        </div>

        {expenses.loading && !expenses.data ? (
          <LoadingPanel label="Loading expenses…" />
        ) : expenses.error ? (
          <ErrorPanel error={expenses.error} onRetry={expenses.reload} />
        ) : rows.length === 0 ? (
          <EmptyPanel
            title="No expenses in this period"
            description="Record real operating costs such as salary, rent, electricity or transport."
            action={
              canManage ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, record: null })}>
                  Record expense
                </Button>
              ) : null
            }
          />
        ) : (
          <Table
            rowKey="id"
            dataSource={rows}
            loading={expenses.loading}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            columns={[
              {
                title: 'Date',
                dataIndex: 'businessDate',
                width: 120,
                render: formatDate,
              },
              {
                title: 'Expense',
                dataIndex: 'description',
                render: (value, row) => (
                  <div>
                    <strong>{value}</strong>
                    <div className="muted small">
                      {row.categoryName}
                      {row.vendor ? ` · ${row.vendor}` : ''}
                    </div>
                  </div>
                ),
              },
              { title: 'Method', dataIndex: 'paymentMethod', width: 130, render: paymentLabel },
              { title: 'Reference', dataIndex: 'reference', width: 140, render: (value) => value || '—' },
              {
                title: 'Amount',
                dataIndex: 'amountPaise',
                width: 130,
                align: 'right',
                render: (value) => <strong>{money(value)}</strong>,
              },
              {
                title: 'Status',
                dataIndex: 'status',
                width: 100,
                render: (value) => <StatusTag status={value} />,
              },
              { title: 'Recorded by', dataIndex: 'createdByName', width: 140, ellipsis: true },
              ...(canManage
                ? [
                    {
                      title: '',
                      width: 100,
                      render: (_, row) =>
                        row.status === 'active' ? (
                          <Space size={2}>
                            <Button
                              type="text"
                              icon={<EditOutlined />}
                              aria-label={`Edit ${row.description}`}
                              onClick={() => setModal({ open: true, record: row })}
                            />
                            <Button
                              type="text"
                              danger
                              icon={<StopOutlined />}
                              aria-label={`Void ${row.description}`}
                              onClick={() => setVoidRecord(row)}
                            />
                          </Space>
                        ) : null,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Spend by category"
        subtitle="Active expenses in the selected period."
        className="section-gap"
        bodyClassName="panel-body flush"
      >
        {(summary.data?.categories || []).length ? (
          <Table
            rowKey="categoryName"
            size="small"
            pagination={false}
            dataSource={summary.data.categories}
            columns={[
              { title: 'Category', dataIndex: 'categoryName' },
              { title: 'Entries', dataIndex: 'count', width: 100, align: 'right' },
              { title: 'Total', dataIndex: 'totalPaise', width: 160, align: 'right', render: money },
              {
                title: 'Share',
                width: 90,
                align: 'right',
                render: (_, row) =>
                  summary.data.totalPaise > 0
                    ? `${Math.round((row.totalPaise / summary.data.totalPaise) * 100)}%`
                    : '—',
              },
            ]}
            summary={() => (
              <Table.Summary>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    {summary.data.categories.reduce((sum, row) => sum + row.count, 0)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <strong>{money(summary.data.totalPaise)}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        ) : (
          <p className="muted panel-pad">No active expense categories in this period.</p>
        )}
      </SectionCard>

      <Modal
        title={modal.record ? 'Edit expense' : 'New expense'}
        open={modal.open}
        onCancel={() => setModal({ open: false, record: null })}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={modal.record ? 'Save changes' : 'Record expense'}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
          <div className="form-grid two">
            <Form.Item name="expenseDate" label="Expense date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="categoryId" label="Category" rules={[{ required: true, message: 'Choose a category.' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={(categories.data || [])
                  .filter((category) => category.status === 'active')
                  .map((category) => ({ value: category.id, label: category.name }))}
              />
            </Form.Item>
          </div>
          <div className="form-grid two">
            <Form.Item name="amountPaise" label="Amount (₹)" rules={[{ required: true, message: 'Enter an amount.' }]}>
              <MoneyInput />
            </Form.Item>
            <Form.Item name="paymentMethod" label="Paid by" rules={[{ required: true }]}>
              <Select options={METHODS} />
            </Form.Item>
          </div>
          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Describe the expense.' }, { max: 300 }]}
          >
            <Input placeholder="e.g. July electricity bill" />
          </Form.Item>
          <div className="form-grid two">
            <Form.Item name="vendor" label="Vendor / payee">
              <Input maxLength={160} />
            </Form.Item>
            <Form.Item name="reference" label="Bill / reference number">
              <Input maxLength={120} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Void expense"
        open={Boolean(voidRecord)}
        onCancel={() => setVoidRecord(null)}
        onOk={() => voidForm.submit()}
        confirmLoading={saving}
        okText="Void expense"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        {voidRecord ? (
          <p className="modal-note">
            Void <strong>{voidRecord.description}</strong> for <strong>{money(voidRecord.amountPaise)}</strong>? The
            entry stays in the database and audit log but is excluded from totals.
          </p>
        ) : null}
        <Form form={voidForm} layout="vertical" onFinish={submitVoid} requiredMark={false}>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Record a reason.' }, { max: 300 }]}>
            <Input.TextArea rows={3} maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add expense category"
        open={categoryModal}
        onCancel={() => setCategoryModal(false)}
        onOk={() => categoryForm.submit()}
        confirmLoading={saving}
        okText="Add category"
        destroyOnClose
      >
        <Form form={categoryForm} layout="vertical" onFinish={submitCategory} requiredMark={false}>
          <Form.Item name="name" label="Category name" rules={[{ required: true, max: 80 }]}>
            <Input placeholder="e.g. Marketing" autoFocus />
          </Form.Item>
          <p className="muted small">
            Existing categories: {(categories.data || []).map((category) => category.name).join(', ') || 'none'}.
          </p>
        </Form>
      </Modal>
    </div>
  );
}
