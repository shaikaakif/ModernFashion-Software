import { useEffect, useState } from 'react';
import {
  App as AntApp,
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import {
  EditOutlined,
  EyeOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, errorMessage } from '@/app/api';
import { useAsync } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import { formatDate, formatDateTime, money, roleLabel } from '@/app/format';
import {
  EmptyPanel,
  ErrorPanel,
  Kpi,
  LoadingPanel,
  PageHeader,
  SectionCard,
  StatusTag,
} from '@/app/components';

const { RangePicker } = DatePicker;

const ROLES = [
  { value: 'owner', label: roleLabel('owner') },
  { value: 'manager', label: roleLabel('manager') },
  { value: 'cashier', label: roleLabel('cashier') },
];

function actionText(value) {
  return String(value || '')
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function UsersPage() {
  const { user: currentUser } = useSession();
  const { message } = AntApp.useApp();
  const [tab, setTab] = useState('staff');
  const [staffModal, setStaffModal] = useState({ open: false, record: null });
  const [passwordRecord, setPasswordRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [shiftRange, setShiftRange] = useState([dayjs().subtract(29, 'day'), dayjs()]);
  const [shiftUser, setShiftUser] = useState(null);
  const [activityRange, setActivityRange] = useState([dayjs().subtract(29, 'day'), dayjs()]);
  const [activityUser, setActivityUser] = useState(null);
  const [activityData, setActivityData] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [staffForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const staff = useAsync(() => api('users.list'), []);
  const shifts = useAsync(
    () =>
      api('users.shifts', {
        from: shiftRange?.[0]?.format('YYYY-MM-DD') || null,
        to: shiftRange?.[1]?.format('YYYY-MM-DD') || null,
        userId: shiftUser,
      }),
    [shiftRange, shiftUser]
  );
  const cashierActivity = useAsync(
    () =>
      api('users.cashierActivity', {
        from: activityRange?.[0]?.format('YYYY-MM-DD') || null,
        to: activityRange?.[1]?.format('YYYY-MM-DD') || null,
      }),
    [activityRange]
  );

  useEffect(() => {
    if (!staffModal.open) return;
    staffForm.resetFields();
    if (staffModal.record) {
      staffForm.setFieldsValue({
        name: staffModal.record.name,
        roleCode: staffModal.record.roleCode,
        status: staffModal.record.status,
      });
    } else {
      staffForm.setFieldsValue({ roleCode: 'cashier' });
    }
  }, [staffModal, staffForm]);

  useEffect(() => {
    if (passwordRecord) passwordForm.resetFields();
  }, [passwordRecord, passwordForm]);

  async function submitStaff(values) {
    setSaving(true);
    try {
      if (staffModal.record) {
        await api('users.update', {
          id: staffModal.record.id,
          name: values.name,
          roleCode: values.roleCode,
          status: values.status,
        });
        message.success('Staff account updated.');
      } else {
        await api('users.create', values);
        message.success('Staff account created. Share the password in person and ask them to change it.');
      }
      setStaffModal({ open: false, record: null });
      staff.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function submitPassword(values) {
    if (!passwordRecord) return;
    setSaving(true);
    try {
      await api('users.resetPassword', { id: passwordRecord.id, password: values.password });
      message.success(`Password reset for ${passwordRecord.name}. Failed sign-ins and lockout were cleared.`);
      setPasswordRecord(null);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function openActivity(id) {
    setActivityLoading(true);
    setActivityUser(id);
    try {
      setActivityData(
        await api('users.activity', {
          id,
          from: activityRange?.[0]?.format('YYYY-MM-DD') || null,
          to: activityRange?.[1]?.format('YYYY-MM-DD') || null,
        })
      );
    } catch (error) {
      message.error(errorMessage(error));
      setActivityData(null);
    } finally {
      setActivityLoading(false);
    }
  }

  const staffRows = staff.data || [];

  const staffPanel = staff.loading && !staff.data ? (
    <LoadingPanel label="Loading staff…" />
  ) : staff.error ? (
    <ErrorPanel error={staff.error} onRetry={staff.reload} />
  ) : (
    <SectionCard bodyClassName="panel-body flush">
      <div className="filter-bar">
        <span className="muted">
          {staffRows.length} accounts · {staffRows.filter((row) => row.status === 'active').length} active
        </span>
        <div className="filter-summary">
          <Button icon={<ReloadOutlined />} onClick={staff.reload} loading={staff.loading}>
            Refresh
          </Button>
        </div>
      </div>
      <Table
        rowKey="id"
        dataSource={staffRows}
        loading={staff.loading}
        pagination={false}
        scroll={{ x: 950 }}
        locale={{ emptyText: 'No staff accounts yet.' }}
        columns={[
          {
            title: 'Staff',
            dataIndex: 'name',
            render: (value, row) => (
              <div>
                <strong>{value}</strong>
                <div className="muted small">
                  {row.mobile}
                  {row.id === currentUser?.id ? ' · you' : ''}
                </div>
              </div>
            ),
          },
          { title: 'Role', dataIndex: 'roleCode', width: 190, render: roleLabel },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 110,
            render: (value, row) => (
              <Space direction="vertical" size={2}>
                <StatusTag status={value} />
                {row.openShift ? <Tag color="green">Shift open</Tag> : null}
              </Space>
            ),
          },
          { title: 'Invoices', dataIndex: 'saleCount', width: 90, align: 'right' },
          { title: 'Sales', dataIndex: 'saleTotalPaise', width: 130, align: 'right', render: money },
          { title: 'Last sign-in', dataIndex: 'lastLoginAt', width: 170, render: formatDateTime },
          {
            title: '',
            width: 130,
            render: (_, row) => (
              <Space size={2}>
                <Button
                  type="text"
                  icon={<EyeOutlined />}
                  aria-label={`Activity for ${row.name}`}
                  onClick={() => openActivity(row.id)}
                />
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  aria-label={`Edit ${row.name}`}
                  onClick={() => setStaffModal({ open: true, record: row })}
                />
                <Button
                  type="text"
                  icon={<KeyOutlined />}
                  aria-label={`Reset password for ${row.name}`}
                  onClick={() => setPasswordRecord(row)}
                />
              </Space>
            ),
          },
        ]}
      />
      <div className="panel-note">
        Roles are fixed permission sets enforced by the main process. Cashiers cannot open products, inventory,
        costs, expenses, reports, staff, settings or backups, even through a direct request.
      </div>
    </SectionCard>
  );

  const shiftsPanel = (
    <SectionCard
      title="Cash shifts"
      subtitle="A cashier's shift opens at sign-in and closes at sign-out with a counted-cash variance."
      extra={
        <Space wrap>
          <RangePicker value={shiftRange} onChange={(value) => setShiftRange(value || [])} allowClear={false} format="DD MMM YYYY" />
          <Select
            allowClear
            placeholder="All staff"
            value={shiftUser}
            onChange={setShiftUser}
            options={staffRows.map((row) => ({ value: row.id, label: row.name }))}
            style={{ width: 160 }}
          />
          <Button icon={<ReloadOutlined />} onClick={shifts.reload} loading={shifts.loading}>
            Refresh
          </Button>
        </Space>
      }
      bodyClassName="panel-body flush"
    >
      {shifts.loading && !shifts.data ? (
        <LoadingPanel label="Loading shifts…" />
      ) : shifts.error ? (
        <ErrorPanel error={shifts.error} onRetry={shifts.reload} />
      ) : (shifts.data?.shifts || []).length === 0 ? (
        <EmptyPanel title="No shifts in this period" description="Shifts appear here for non-owner accounts after they sign in." />
      ) : (
        <Table
          rowKey="id"
          dataSource={shifts.data.shifts}
          loading={shifts.loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1000 }}
          columns={[
            { title: 'Staff', dataIndex: 'userName', width: 150 },
            { title: 'Opened', dataIndex: 'openedAt', width: 170, render: formatDateTime },
            { title: 'Closed', dataIndex: 'closedAt', width: 170, render: (value) => (value ? formatDateTime(value) : '—') },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 100,
              render: (value) => <Tag color={value === 'open' ? 'green' : 'default'}>{value}</Tag>,
            },
            { title: 'Invoices', dataIndex: 'saleCount', width: 90, align: 'right' },
            { title: 'Sales', dataIndex: 'salesTotalPaise', width: 130, align: 'right', render: money },
            { title: 'Opening cash', dataIndex: 'openingCashPaise', width: 130, align: 'right', render: money },
            { title: 'Expected', dataIndex: 'expectedCashPaise', width: 130, align: 'right', render: money },
            {
              title: 'Counted',
              dataIndex: 'countedCashPaise',
              width: 130,
              align: 'right',
              render: (value) => (value === null || value === undefined ? '—' : money(value)),
            },
            {
              title: 'Variance',
              dataIndex: 'variancePaise',
              width: 110,
              align: 'right',
              render: (value) =>
                value === null || value === undefined ? (
                  '—'
                ) : (
                  <span className={value === 0 ? 'text-success' : value > 0 ? 'text-warning' : 'text-danger'}>
                    {money(value)}
                  </span>
                ),
            },
          ]}
        />
      )}
    </SectionCard>
  );

  const activityPanel = (
    <SectionCard
      title="Cashier activity"
      subtitle="Completed invoices and discounts per staff member."
      extra={
        <Space wrap>
          <RangePicker value={activityRange} onChange={(value) => setActivityRange(value || [])} allowClear={false} format="DD MMM YYYY" />
          <Button icon={<ReloadOutlined />} onClick={cashierActivity.reload} loading={cashierActivity.loading}>
            Refresh
          </Button>
        </Space>
      }
      bodyClassName="panel-body flush"
    >
      {cashierActivity.loading && !cashierActivity.data ? (
        <LoadingPanel label="Calculating activity…" />
      ) : cashierActivity.error ? (
        <ErrorPanel error={cashierActivity.error} onRetry={cashierActivity.reload} />
      ) : (
        <Table
          rowKey="id"
          dataSource={cashierActivity.data?.cashiers || []}
          loading={cashierActivity.loading}
          pagination={false}
          locale={{ emptyText: 'No staff activity in this period.' }}
          columns={[
            { title: 'Staff', dataIndex: 'name', render: (value, row) => <div><strong>{value}</strong><div className="muted small">{roleLabel(row.roleCode)}</div></div> },
            { title: 'Invoices', dataIndex: 'invoiceCount', width: 100, align: 'right' },
            { title: 'Sales', dataIndex: 'salesTotalPaise', width: 140, align: 'right', render: money },
            { title: 'Discounts', dataIndex: 'discountTotalPaise', width: 140, align: 'right', render: money },
            {
              title: '',
              width: 80,
              render: (_, row) => (
                <Button type="link" onClick={() => openActivity(row.id)}>
                  Details
                </Button>
              ),
            },
          ]}
        />
      )}
    </SectionCard>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Access & accountability"
        title="Users & shifts"
        subtitle="Create staff accounts with a mobile number and password/PIN. The owner remains the only full administrator."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setStaffModal({ open: true, record: null })}>
            New staff account
          </Button>
        }
      />

      <div className="kpi-grid three">
        <Kpi label="Staff accounts" value={staffRows.length} hint={`${staffRows.filter((row) => row.status === 'active').length} active`} />
        <Kpi label="Open shifts" value={staffRows.filter((row) => row.openShift).length} hint="Cash drawers currently open" tone={staffRows.some((row) => row.openShift) ? 'warning' : 'default'} />
        <Kpi label="Owner accounts" value={staffRows.filter((row) => row.roleCode === 'owner').length} hint="At least one active owner is required" />
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'staff', label: 'Staff', children: staffPanel },
          { key: 'shifts', label: 'Cash shifts', children: shiftsPanel },
          { key: 'activity', label: 'Activity', children: activityPanel },
        ]}
      />

      <Modal
        title={staffModal.record ? 'Edit staff account' : 'New staff account'}
        open={staffModal.open}
        onCancel={() => setStaffModal({ open: false, record: null })}
        onOk={() => staffForm.submit()}
        confirmLoading={saving}
        okText={staffModal.record ? 'Save changes' : 'Create account'}
        destroyOnClose
      >
        <Form form={staffForm} layout="vertical" onFinish={submitStaff} requiredMark={false}>
          <Form.Item name="name" label="Staff name" rules={[{ required: true, max: 120 }]}>
            <Input autoFocus />
          </Form.Item>
          {!staffModal.record ? (
            <>
              <Form.Item
                name="mobile"
                label="Mobile number (sign-in name)"
                rules={[
                  { required: true, message: 'Enter a mobile number.' },
                  { pattern: /^[0-9+\s-]{10,15}$/, message: 'Enter a valid mobile number.' },
                ]}
              >
                <Input inputMode="tel" />
              </Form.Item>
              <Form.Item
                name="password"
                label="Temporary password or PIN"
                rules={[{ required: true, min: 6, message: 'Use at least 6 characters.' }]}
                extra="Share it in person. The staff member can change it after signing in."
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </>
          ) : null}
          <div className="form-grid two">
            <Form.Item name="roleCode" label="Role" rules={[{ required: true }]}>
              <Select options={ROLES} />
            </Form.Item>
            {staffModal.record ? (
              <Form.Item name="status" label="Status">
                <Select
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'disabled', label: 'Disabled' },
                  ]}
                />
              </Form.Item>
            ) : null}
          </div>
          <Alert
            type="info"
            showIcon
            message="Role access is enforced in the backend"
            description="A cashier can bill, print their own receipts and manage customers. Product edits, stock adjustments, costs, expenses, reports, staff and settings are refused by the service layer."
          />
        </Form>
      </Modal>

      <Modal
        title={passwordRecord ? `Reset password for ${passwordRecord.name}` : 'Reset password'}
        open={Boolean(passwordRecord)}
        onCancel={() => setPasswordRecord(null)}
        onOk={() => passwordForm.submit()}
        confirmLoading={saving}
        okText="Reset password"
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          className="detail-alert"
          message="This signs the account out of future requests."
          description="Failed sign-in counters and any temporary lockout are cleared. The new password is not shown again."
        />
        <Form form={passwordForm} layout="vertical" onFinish={submitPassword} requiredMark={false}>
          <Form.Item
            name="password"
            label="New password or PIN"
            rules={[{ required: true, min: 6, message: 'Use at least 6 characters.' }]}
          >
            <Input.Password autoComplete="new-password" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        open={Boolean(activityUser)}
        onClose={() => {
          setActivityUser(null);
          setActivityData(null);
        }}
        width={780}
        title={activityData?.user ? `${activityData.user.name} · activity` : 'Staff activity'}
        destroyOnClose
      >
        {activityLoading ? (
          <LoadingPanel label="Loading activity…" />
        ) : activityData ? (
          <div>
            <Descriptions bordered size="small" column={2} className="detail-descriptions">
              <Descriptions.Item label="Mobile">{activityData.user.mobile}</Descriptions.Item>
              <Descriptions.Item label="Role">{roleLabel(activityData.user.roleCode)}</Descriptions.Item>
              <Descriptions.Item label="Status">{activityData.user.status}</Descriptions.Item>
              <Descriptions.Item label="Period">
                {formatDate(activityData.sales[0]?.businessDate || activityRange?.[0]?.format('YYYY-MM-DD'))}
              </Descriptions.Item>
            </Descriptions>

            <SectionCard title="Invoices" className="inner-panel" bodyClassName="panel-body flush">
              <Table
                rowKey="id"
                size="small"
                dataSource={activityData.sales}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: 'No invoices in this period.' }}
                columns={[
                  { title: 'Invoice', dataIndex: 'invoiceNo' },
                  { title: 'Date', dataIndex: 'businessDate', width: 120, render: formatDate },
                  { title: 'Payment', dataIndex: 'paymentMethod', width: 120 },
                  { title: 'Total', dataIndex: 'totalPaise', width: 120, align: 'right', render: money },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    width: 100,
                    render: (value) => <StatusTag status={value} />,
                  },
                ]}
              />
            </SectionCard>

            <SectionCard title="Activity entries" className="inner-panel" bodyClassName="panel-body flush">
              <Table
                rowKey={(row, index) => `${row.action}-${row.createdAt}-${index}`}
                size="small"
                dataSource={activityData.audit}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: 'No activity entries for this account.' }}
                columns={[
                  { title: 'When', dataIndex: 'createdAt', width: 170, render: formatDateTime },
                  { title: 'Action', dataIndex: 'action', render: actionText },
                ]}
              />
            </SectionCard>
          </div>
        ) : (
          <EmptyPanel title="No activity loaded" />
        )}
      </Drawer>
    </div>
  );
}
