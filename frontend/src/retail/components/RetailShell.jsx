import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, Drawer, Layout, Menu } from 'antd';
import {
  AppstoreOutlined,
  BarcodeOutlined,
  ContainerOutlined,
  DashboardOutlined,
  MenuOutlined,
  ReloadOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShopOutlined,
  TeamOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { demoDataService } from '@/retail/services/demoDataService';
import { useDemo } from '@/retail/hooks/useDemo';

const { Sider, Header, Content } = Layout;

const NAV_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/products', icon: <AppstoreOutlined />, label: 'Products' },
  { key: '/inventory', icon: <DatabaseOutlined />, label: 'Inventory' },
  { key: '/purchases', icon: <ShoppingCartOutlined />, label: 'Purchases' },
  { key: '/invoices', icon: <ContainerOutlined />, label: 'Invoices' },
  { key: '/customers', icon: <TeamOutlined />, label: 'Customers' },
  { key: '/barcode', icon: <BarcodeOutlined />, label: 'Barcode' },
];

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/purchases': 'Purchases',
  '/invoices': 'Invoices',
  '/customers': 'Customers',
  '/barcode': 'Barcode studio',
  '/settings/business': 'Business profile',
};

function selectedKey(pathname) {
  if (pathname === '/') return '/';
  const root = `/${pathname.split('/').filter(Boolean)[0]}`;
  return root || '/';
}

function pageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const root = selectedKey(pathname);
  return PAGE_TITLES[root] || 'Dashboard';
}

function BrandBlock() {
  return (
    <div className="brand-block">
      <div className="brand-mark">MF</div>
      <div>
        <strong>Modern Fashion</strong>
        <span>Brand Hub · Attapur</span>
      </div>
    </div>
  );
}

function SidebarContent({ pathname, onNavigate }) {
  return (
    <div className="sidebar-inner">
      <BrandBlock />
      <div className="sidebar-label">Workspace</div>
      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={[selectedKey(pathname)]}
        items={NAV_ITEMS}
        onClick={({ key }) => onNavigate(key)}
        className="retail-menu"
      />
      <div className="sidebar-bottom">
        <button
          type="button"
          className={`sidebar-settings ${pathname === '/settings/business' ? 'active' : ''}`}
          onClick={() => onNavigate('/settings/business')}
        >
          <SettingOutlined /> Business settings
        </button>
        <div className="sidebar-demo-card">
          <span className="demo-dot" />
          <div>
            <strong>Demo workspace</strong>
            <span>One shop · Attapur, Hyderabad</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RetailShell() {
  const { message, modal } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { db } = useDemo();
  const today = dayjs().format('ddd, DD MMM YYYY');

  const go = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const confirmReset = () => {
    modal.confirm({
      title: 'Reset demo data?',
      content:
        'This restores the original sample products, stock, customers, purchases and invoices. Any changes you made in this browser will be lost.',
      okText: 'Reset demo data',
      okButtonProps: { danger: true },
      onOk: () => {
        demoDataService.reset();
        message.success('Demo data restored to the original sample set.');
        navigate('/');
        window.scrollTo({ top: 0 });
      },
    });
  };

  return (
    <Layout className="retail-app">
      <Sider width={248} className="retail-sider" theme="dark">
        <SidebarContent pathname={location.pathname} onNavigate={go} />
      </Sider>

      <Drawer
        placement="left"
        width={264}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        className="mobile-nav-drawer"
        styles={{ body: { padding: 0, background: '#17181c' } }}
      >
        <SidebarContent pathname={location.pathname} onNavigate={go} />
      </Drawer>

      <Layout className="retail-main">
        <Header className="retail-header">
          <div className="header-left">
            <Button
              type="text"
              className="mobile-menu-btn"
              icon={<MenuOutlined />}
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            />
            <div className="header-context">
              <span>
                <ShopOutlined /> Modern Fashion (Brand Hub)
              </span>
              <strong>{pageTitle(location.pathname)}</strong>
            </div>
          </div>
          <div className="header-right">
            <span className="header-date">{today}</span>
            <span className="demo-pill">DEMO DATA</span>
            <span className="header-db-count">{db.products.length} products</span>
            <Button icon={<ReloadOutlined />} onClick={confirmReset} className="reset-btn">
              Reset demo
            </Button>
            <Link to="/settings/business" className="header-icon-btn" aria-label="Business settings">
              <SettingOutlined />
            </Link>
          </div>
        </Header>
        <Content className="retail-content">
          <Outlet />
          <footer className="retail-footer">
            <span>Modern Fashion (Brand Hub) · Attapur, Hyderabad</span>
            <span>Interactive demo · All transactions and stock are sample data</span>
          </footer>
        </Content>
      </Layout>
    </Layout>
  );
}
