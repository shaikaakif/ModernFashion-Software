import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import RetailShell from '@/retail/components/RetailShell';
import DashboardPage from '@/retail/pages/DashboardPage';
import ProductsPage from '@/retail/pages/ProductsPage';
import ProductDetailPage from '@/retail/pages/ProductDetailPage';
import InventoryPage from '@/retail/pages/InventoryPage';
import PurchasesPage from '@/retail/pages/PurchasesPage';
import PurchaseCreatePage from '@/retail/pages/PurchaseCreatePage';
import PurchaseDetailPage from '@/retail/pages/PurchaseDetailPage';
import InvoicesPage from '@/retail/pages/InvoicesPage';
import InvoiceCreatePage from '@/retail/pages/InvoiceCreatePage';
import InvoiceDetailPage from '@/retail/pages/InvoiceDetailPage';
import CustomersPage from '@/retail/pages/CustomersPage';
import CustomerDetailPage from '@/retail/pages/CustomerDetailPage';
import BarcodePage from '@/retail/pages/BarcodePage';
import BusinessSettingsPage from '@/retail/pages/BusinessSettingsPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export default function RetailApp() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<RetailShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="purchases" element={<PurchasesPage />} />
          <Route path="purchases/new" element={<PurchaseCreatePage />} />
          <Route path="purchases/:id" element={<PurchaseDetailPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/new" element={<InvoiceCreatePage />} />
          <Route path="invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="barcode" element={<BarcodePage />} />
          <Route path="settings/business" element={<BusinessSettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
