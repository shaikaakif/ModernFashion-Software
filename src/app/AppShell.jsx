import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp, Avatar, Button, Dropdown, Form, Input, InputNumber, Layout, Menu, Modal, Tag, Tooltip } from 'antd';
import {
  AuditOutlined,
  BarcodeOutlined,
  BarChartOutlined,
  CloudDownloadOutlined,
  DashboardOutlined,
  DollarOutlined,
  DownOutlined,
  FileTextOutlined,
  ImportOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PercentageOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useSession } from '@/app/SessionContext';
import BrandMark from '@/app/BrandMark';
import { api, errorMessage } from '@/app/api';
import { businessToday, formatDate, money, roleLabel } from '@/app/format';
import { AccessDenied } from '@/app/components';
import { toPaise } from '@shared/money.js';
import DashboardPage from '@/pages/DashboardPage';
import PosPage from '@/pages/PosPage';
import SalesPage from '@/pages/SalesPage';
import InventoryPage from '@/pages/InventoryPage';
import BarcodesPage from '@/pages/BarcodesPage';
import ImportPage from '@/pages/ImportPage';
import PurchasesPage from '@/pages/PurchasesPage';
import SuppliersPage from '@/pages/SuppliersPage';
import CustomersPage from '@/pages/CustomersPage';
import ExpensesPage from '@/pages/ExpensesPage';
import ReportsPage from '@/pages/ReportsPage';
import UsersPage from '@/pages/UsersPage';
import SettingsPage from '@/pages/SettingsPage';
import ReleasesPage from '@/pages/ReleasesPage';
import AuditPage from '@/pages/AuditPage';

const { Sider, Header, Content } = Layout;

const NAV = [
  { key: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined />, any: ['dashboard.view'] },
  { key: '/pos', label: 'New Sale', icon: <ShoppingCartOutlined />, any: ['pos.use'] },
  { key: '/sales', label: 'Invoices', icon: <FileTextOutlined />, any: ['sales.view.all', 'sales.view.own'] },
  { key: '/inventory', label: 'Inventory', icon: <ShopOutlined />, any: ['inventory.view', 'products.view'] },
  { key: '/barcodes', label: 'Barcodes', icon: <BarcodeOutlined />, any: ['products.manage'] },
  { key: '/import', label: 'Import data', icon: <ImportOutlined />, any: ['products.manage'] },
  { key: '/purchases', label: 'Purchases', icon: <WalletOutlined />, any: ['purchases.view'] },
  { key: '/suppliers', label: 'Suppliers', icon: <TeamOutlined />, any: ['purchases.view'] },
  { key: '/customers', label: 'Customers', icon: <UserOutlined />, any: ['customers.view'] },
  { key: '/expenses', label: 'Expenses', icon: <DollarOutlined />, any: ['expenses.view'] },
  { key: '/reports', label: 'Reports', icon: <BarChartOutlined />, any: ['reports.sales', 'reports.profit'] },
  { key: '/users', label: 'Users & shifts', icon: <PercentageOutlined />, any: ['users.manage'] },
  { key: '/settings', label: 'Settings', icon: <SettingOutlined />, any: ['settings.manage'] },
  { key: '/releases', label: 'Updates', icon: <CloudDownloadOutlined />, any: ['settings.manage'] },
  { key: '/audit', label: 'Activity log', icon: <AuditOutlined />, any: ['audit.view'] },
];

function Protected({ any, children }) {
  const { can } = useSession();
  const allowed = any.some((permission) => can(permission));
  return allowed ? children : <AccessDenied />;
}

function HomeRedirect() {
  const { can } = useSession();
  const target = NAV.find((item) => item.any.some((permission) => can(permission)))?.key || '/pos';
  return <Navigate to={target} replace />;
}

export default function AppShell() {
  const { session, user, business, branding, logout, lock } = useSession();
  const { message, notification } = AntApp.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const announcedVersion = useRef('');
  const [passwordForm] = Form.useForm();
  const [logoutForm] = Form.useForm();

  const allowedNav = useMemo(
    () => NAV.filter((item) => item.any.some((permission) => session?.permissions?.includes(permission))),
    [session]
  );

  useEffect(() => {
    if (!session?.permissions?.includes('settings.manage')) return undefined;
    let active = true;
    api('app.updateStatus')
      .then((status) => {
        if (active) setUpdateStatus(status);
      })
      .catch(() => {
        // Update status is secondary to billing; never block the shell.
      });
    const unsubscribe = window.mf?.onUpdateStatus?.((next) => {
      if (!active) return;
      setUpdateStatus(next);
      if (next.updateAvailable && next.version && announcedVersion.current !== next.version) {
        announcedVersion.current = next.version;
        notification.info({
          message: next.downloaded ? 'Update ready to install' : 'Update available',
          description: next.downloaded
            ? `Version ${next.version} is downloaded. Restart to install it.`
            : `Version ${next.version} is ready to download.`,
          btn: (
            <Button
              type="primary"
              size="small"
              onClick={() => {
                notification.destroy();
                navigate('/releases');
              }}
            >
              View update
            </Button>
          ),
          duration: 10,
        });
      }
    });
    const checkWhenOnline = () => {
      api('app.checkUpdates')
        .then((status) => {
          if (active) setUpdateStatus(status);
        })
        .catch(() => {});
    };
    window.addEventListener('online', checkWhenOnline);
    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener('online', checkWhenOnline);
    };
  }, [session, notification, navigate]);

  const selected = useMemo(() => {
    const match = NAV.filter((item) => location.pathname.startsWith(item.key)).sort(
      (a, b) => b.key.length - a.key.length
    )[0];
    return match?.key || '/dashboard';
  }, [location.pathname]);

  async function submitPassword(values) {
    setBusy(true);
    try {
      await api('auth.changePassword', values);
      message.success('Password changed.');
      setPasswordOpen(false);
      passwordForm.resetFields();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitLogout(values) {
    setBusy(true);
    try {
      const counted =
        session?.shift && values.countedCash !== undefined && values.countedCash !== null
          ? toPaise(values.countedCash)
          : null;
      const result = await logout({ countedCashPaise: counted, notes: values.notes || '' });
      setLogoutOpen(false);
      if (result?.closedShift) {
        message.info(
          `Shift closed. Expected ${money(result.closedShift.expectedCashPaise)}, counted ${money(
            result.closedShift.countedCashPaise
          )}, variance ${money(result.closedShift.variancePaise)}.`
        );
      } else {
        message.success('Signed out.');
      }
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openLogout() {
    logoutForm.resetFields();
    setLogoutOpen(true);
  }

  const menuItems = allowedNav.map((item) => ({ key: item.key, label: item.label, icon: item.icon }));

  const userMenu = {
    items: [
      { key: 'identity', label: <span className="menu-identity">{user?.name}<small>{roleLabel(user?.roleCode)}</small></span>, disabled: true },
      { type: 'divider' },
      { key: 'password', label: 'Change password', icon: <LockOutlined /> },
      { key: 'lock', label: 'Lock screen', icon: <LockOutlined /> },
      { key: 'logout', label: session?.shiftId ? 'Sign out & close shift' : 'Sign out', icon: <LogoutOutlined />, danger: true },
    ],
    onClick: async ({ key }) => {
      if (key === 'password') setPasswordOpen(true);
      if (key === 'lock') {
        try {
          await lock();
        } catch (error) {
          message.error(errorMessage(error));
        }
      }
      if (key === 'logout') openLogout();
    },
  };

  return (
    <Layout className="app-layout">
      <Sider
        width={238}
        collapsedWidth={72}
        collapsed={collapsed}
        className="app-sider"
        theme="dark"
        trigger={null}
      >
        <div className="brand-block">
          <BrandMark size={38} />
          {!collapsed ? (
            <div className="brand-copy">
              <strong>{branding?.name || business?.name || 'MODERN FASHION'}</strong>
              <span>Retail POS</span>
            </div>
          ) : null}
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[selected]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
        <div className="sider-foot">
          {!collapsed ? <span>Saved on this computer</span> : null}
          <Button
            type="text"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
          />
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-store">
            <strong>{business?.name || 'MODERN FASHION'}</strong>
            <span>
              {business?.city || 'Hyderabad'} · {formatDate(businessToday())}
            </span>
          </div>
          <div className="header-actions">
            {updateStatus?.updateAvailable ? (
              <Tooltip
                title={
                  updateStatus.downloaded
                    ? `Version ${updateStatus.version} is downloaded. Restart and install it.`
                    : `Version ${updateStatus.version} is available. Open Updates to review it.`
                }
              >
                <Button
                  type="text"
                  size="small"
                  className="header-update"
                  icon={<CloudDownloadOutlined />}
                  onClick={() => navigate('/releases')}
                >
                  {updateStatus.downloaded ? 'Install update' : `v${updateStatus.version}`}
                </Button>
              </Tooltip>
            ) : null}
            <Tooltip title={session?.shift ? 'Cash shift is open' : 'No cash shift is open'}>
              <Tag color={session?.shift ? 'green' : session?.user?.roleCode === 'owner' ? 'default' : 'gold'} className="shift-tag">
                {session?.shift ? `Shift open · ${money(session.shift.expectedCashPaise)}` : session?.user?.roleCode === 'owner' ? 'Owner session' : 'No shift'}
              </Tag>
            </Tooltip>
            <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
              <button type="button" className="user-button">
                <Avatar size={32} style={{ background: '#e87532' }}>
                  {user?.name?.slice(0, 1)?.toUpperCase() || 'M'}
                </Avatar>
                <span className="user-copy">
                  <strong>{user?.name}</strong>
                  <small>{roleLabel(user?.roleCode)}</small>
                </span>
                <DownOutlined />
              </button>
            </Dropdown>
          </div>
        </Header>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/dashboard" element={<Protected any={['dashboard.view']}><DashboardPage /></Protected>} />
            <Route path="/pos" element={<Protected any={['pos.use']}><PosPage /></Protected>} />
            <Route path="/sales" element={<Protected any={['sales.view.all', 'sales.view.own']}><SalesPage /></Protected>} />
            <Route path="/sales/:id" element={<Protected any={['sales.view.all', 'sales.view.own']}><SalesPage /></Protected>} />
            <Route path="/inventory" element={<Protected any={['inventory.view', 'products.view']}><InventoryPage /></Protected>} />
            <Route path="/barcodes" element={<Protected any={['products.manage']}><BarcodesPage /></Protected>} />
            <Route path="/import" element={<Protected any={['products.manage']}><ImportPage /></Protected>} />
            <Route path="/products" element={<Navigate to="/inventory" replace />} />
            <Route path="/purchases" element={<Protected any={['purchases.view']}><PurchasesPage /></Protected>} />
            <Route path="/suppliers" element={<Protected any={['purchases.view']}><SuppliersPage /></Protected>} />
            <Route path="/customers" element={<Protected any={['customers.view']}><CustomersPage /></Protected>} />
            <Route path="/expenses" element={<Protected any={['expenses.view']}><ExpensesPage /></Protected>} />
            <Route path="/reports" element={<Protected any={['reports.sales', 'reports.profit']}><ReportsPage /></Protected>} />
            <Route path="/users" element={<Protected any={['users.manage']}><UsersPage /></Protected>} />
            <Route path="/settings" element={<Protected any={['settings.manage']}><SettingsPage /></Protected>} />
            <Route path="/releases" element={<Protected any={['settings.manage']}><ReleasesPage /></Protected>} />
            <Route path="/audit" element={<Protected any={['audit.view']}><AuditPage /></Protected>} />
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </Content>
      </Layout>

      <Modal
        title="Change password"
        open={passwordOpen}
        onCancel={() => setPasswordOpen(false)}
        onOk={() => passwordForm.submit()}
        confirmLoading={busy}
        okText="Change password"
        destroyOnClose
      >
        <Form form={passwordForm} layout="vertical" onFinish={submitPassword} requiredMark={false}>
          <Form.Item name="currentPassword" label="Current password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="newPassword" label="New password / PIN" rules={[{ required: true, min: 6 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm new password"
            dependencies={['newPassword']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return !value || getFieldValue('newPassword') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('Passwords do not match.'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={session?.shift ? 'Sign out and close shift' : 'Sign out'}
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        onOk={() => logoutForm.submit()}
        confirmLoading={busy}
        okText={session?.shift ? 'Close shift & sign out' : 'Sign out'}
        okButtonProps={{ danger: Boolean(session?.shift) }}
        destroyOnClose
      >
        {session?.shift ? (
          <p className="modal-note">
            Expected cash in the drawer is <strong>{money(session.shift.expectedCashPaise)}</strong>. Count the
            drawer and enter the actual amount. The variance is recorded in the shift report.
          </p>
        ) : (
          <p className="modal-note">Any unsaved cart will be lost. Completed invoices are already saved.</p>
        )}
        <Form form={logoutForm} layout="vertical" onFinish={submitLogout} requiredMark={false}>
          {session?.shift ? (
            <Form.Item name="countedCash" label="Counted cash (₹)" extra="Leave blank to use the expected amount.">
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder={money(session.shift.expectedCashPaise)} />
            </Form.Item>
          ) : null}
          <Form.Item name="notes" label="Shift notes">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
