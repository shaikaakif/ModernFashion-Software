import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, DatePicker, Space, Table, Tabs, Tag } from 'antd';
import { DownloadOutlined, FileExcelOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, errorMessage } from '@/app/api';
import { useAsync } from '@/app/hooks';
import { useSession } from '@/app/SessionContext';
import BrandMark from '@/app/BrandMark';
import { formatDate, money, paymentLabel } from '@/app/format';
import { ErrorPanel, Kpi, LoadingPanel, PageHeader, SectionCard, StatusTag } from '@/app/components';

const { RangePicker } = DatePicker;

function Metric({ label, value, hint, tone }) {
  return <Kpi label={label} value={value} hint={hint} tone={tone} />;
}

export default function ReportsPage() {
  const { can } = useSession();
  const { message } = AntApp.useApp();
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [gstMonth, setGstMonth] = useState(dayjs());
  const [tab, setTab] = useState('sales');
  const [exporting, setExporting] = useState('');

  const from = range?.[0]?.format('YYYY-MM-DD') || null;
  const to = range?.[1]?.format('YYYY-MM-DD') || null;

  const canSales = can('reports.sales');
  const canProfit = can('reports.profit');
  const canPurchases = can('purchases.view');
  const canExpenses = can('expenses.view');
  const canInventory = can('inventory.view');

  const sales = useAsync(
    () => (canSales ? api('reports.salesSummary', { from, to }) : Promise.resolve(null)),
    [from, to]
  );
  const profit = useAsync(
    () => (canProfit ? api('reports.profitLoss', { from, to }) : Promise.resolve(null)),
    [from, to]
  );
  const products = useAsync(
    () => (canSales ? api('reports.productSales', { from, to }) : Promise.resolve(null)),
    [from, to]
  );
  const tax = useAsync(
    () => (canProfit ? api('reports.tax', { from, to }) : Promise.resolve(null)),
    [from, to]
  );
  const gst = useAsync(
    () =>
      canProfit
        ? api('reports.gstMonthly', { month: gstMonth.format('YYYY-MM') })
        : Promise.resolve(null),
    [canProfit, gstMonth]
  );
  const purchases = useAsync(
    () => (canPurchases ? api('reports.purchases', { from, to }) : Promise.resolve(null)),
    [from, to, canPurchases]
  );
  const expenses = useAsync(
    () => (canExpenses ? api('reports.expenses', { from, to }) : Promise.resolve(null)),
    [from, to, canExpenses]
  );
  const inventory = useAsync(
    () => (canInventory ? api('reports.inventory') : Promise.resolve(null)),
    [canInventory]
  );

  const tabKeys = [
    canSales ? 'sales' : null,
    canProfit ? 'profit' : null,
    canSales ? 'products' : null,
    canProfit ? 'tax' : null,
    canProfit ? 'gst' : null,
    canPurchases ? 'purchases' : null,
    canExpenses ? 'expenses' : null,
    canInventory ? 'inventory' : null,
  ]
    .filter(Boolean)
    .join('|');

  useEffect(() => {
    const keys = tabKeys ? tabKeys.split('|') : [];
    if (!keys.includes(tab)) setTab(keys[0] || 'sales');
  }, [tab, tabKeys]);

  function reloadAll() {
    sales.reload();
    profit.reload();
    products.reload();
    tax.reload();
    gst.reload();
    purchases.reload();
    expenses.reload();
    inventory.reload();
  }

  async function runExport(kind, method, payload) {
    setExporting(kind);
    try {
      const result = await api(method, payload);
      if (!result) return;
      if (result.folder) {
        message.success(`Accounting pack saved to ${result.folder} (${result.files.length} files).`, 6);
      } else {
        message.success(`Export saved: ${result.path}`, 5);
      }
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setExporting('');
    }
  }

  const salesData = sales.data;
  const profitData = profit.data;
  const productData = products.data;
  const taxData = tax.data;
  const gstData = gst.data;
  const purchaseData = purchases.data;
  const expenseData = expenses.data;
  const inventoryData = inventory.data;

  const salesPanel = sales.loading && !salesData ? (
    <LoadingPanel label="Building the sales summary…" />
  ) : sales.error ? (
    <ErrorPanel error={sales.error} onRetry={sales.reload} />
  ) : salesData ? (
    <div>
      <div className="kpi-grid four">
        <Metric label="Gross sales" value={money(salesData.sales.grossSalesPaise)} hint={`${salesData.sales.invoiceCount} invoices`} />
        <Metric label="Discounts" value={money(salesData.sales.discountTotalPaise)} hint="Manual and offers" />
        <Metric label="Net sales" value={money(salesData.sales.netSalesPaise)} hint="Excluding tax" tone="accent" />
        <Metric
          label="Average bill"
          value={money(salesData.sales.averageBillPaise)}
          hint={`${salesData.sales.units} units sold`}
        />
      </div>
      <div className="kpi-grid four">
        <Metric label="Tax collected" value={money(salesData.sales.taxTotalPaise)} hint="Recorded tax, not a GST return" />
        <Metric label="Amount collected" value={money(salesData.sales.amountPaidPaise)} hint="Payments on invoices" />
        <Metric
          label="Outstanding"
          value={money(salesData.sales.outstandingPaise)}
          hint="Credit balances"
          tone={salesData.sales.outstandingPaise > 0 ? 'warning' : 'success'}
        />
        {salesData.canSeeProfit ? (
          <Metric
            label="Gross profit"
            value={money(salesData.sales.grossProfitPaise)}
            hint={`COGS ${money(salesData.sales.cogsPaise)}`}
            tone="success"
          />
        ) : (
          <Metric label="Scope" value={salesData.scope === 'shop' ? 'Shop-wide' : 'Own invoices'} hint="Restricted by role" />
        )}
      </div>

      <div className="split-2">
        <SectionCard title="Payment methods" subtitle="Completed invoices in the period." bodyClassName="panel-body flush">
          <Table
            rowKey="method"
            size="small"
            pagination={false}
            dataSource={salesData.paymentMethods || []}
            locale={{ emptyText: 'No payments recorded.' }}
            columns={[
              { title: 'Method', dataIndex: 'method', render: paymentLabel },
              { title: 'Invoices', dataIndex: 'count', width: 100, align: 'right' },
              { title: 'Value', dataIndex: 'totalPaise', width: 150, align: 'right', render: money },
            ]}
          />
        </SectionCard>
        <SectionCard
          title="Daily sales"
          subtitle="Net sales excluding tax."
          bodyClassName="panel-body flush"
          className="span-scroll"
        >
          <div className="table-scroll-medium">
            <Table
              rowKey="date"
              size="small"
              pagination={false}
              dataSource={salesData.daily || []}
              columns={[
                { title: 'Date', dataIndex: 'date', render: formatDate },
                { title: 'Invoices', dataIndex: 'invoiceCount', width: 90, align: 'right' },
                { title: 'Net sales', dataIndex: 'netSalesPaise', width: 130, align: 'right', render: money },
                { title: 'Total', dataIndex: 'totalPaise', width: 130, align: 'right', render: money },
              ]}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Top products" subtitle="By units sold in the period." className="section-gap" bodyClassName="panel-body flush">
        <Table
          rowKey={(row) => `${row.sku}-${row.variantLabel}`}
          size="small"
          dataSource={salesData.topProducts || []}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'No products sold in this period.' }}
          columns={[
            {
              title: 'Product',
              dataIndex: 'productName',
              render: (value, row) => (
                <div>
                  <strong>{value}</strong>
                  <div className="muted small">
                    {row.variantLabel} · {row.sku}
                  </div>
                </div>
              ),
            },
            { title: 'Units', dataIndex: 'units', width: 80, align: 'right' },
            { title: 'Gross', dataIndex: 'grossPaise', width: 120, align: 'right', render: money },
            { title: 'Net', dataIndex: 'netSalesPaise', width: 120, align: 'right', render: money },
            ...(salesData.canSeeProfit
              ? [{ title: 'Profit', dataIndex: 'grossProfitPaise', width: 120, align: 'right', render: money }]
              : []),
          ]}
        />
      </SectionCard>

      {salesData.scope === 'shop' && (salesData.cashiers || []).length ? (
        <SectionCard title="Cashier performance" subtitle="Completed invoices in the period." className="section-gap" bodyClassName="panel-body flush">
          <Table
            rowKey="userId"
            size="small"
            dataSource={salesData.cashiers}
            pagination={false}
            columns={[
              { title: 'Cashier', dataIndex: 'userName' },
              { title: 'Invoices', dataIndex: 'invoiceCount', width: 100, align: 'right' },
              { title: 'Sales', dataIndex: 'totalPaise', width: 140, align: 'right', render: money },
              { title: 'Discounts', dataIndex: 'discountPaise', width: 140, align: 'right', render: money },
            ]}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Exports" subtitle="Files are saved where you choose. Figures remain local." className="section-gap">
        <Space wrap>
          {can('reports.export') ? (
            <>
              <Button
                icon={<FileExcelOutlined />}
                loading={exporting === 'sales'}
                onClick={() => runExport('sales', 'export.sales', { from, to })}
              >
                Sales register CSV
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                loading={exporting === 'pack'}
                onClick={() =>
                  runExport('pack', 'export.accountingPack', { month: (from || '').slice(0, 7) })
                }
              >
                Accounting pack for the selected month
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                loading={exporting === 'customers'}
                onClick={() => runExport('customers', 'export.customers', {})}
              >
                Customer list CSV
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                loading={exporting === 'catalogue'}
                onClick={() => runExport('catalogue', 'export.catalogue', {})}
              >
                Product catalogue CSV
              </Button>
            </>
          ) : (
            <span className="muted">Your role does not include report exports.</span>
          )}
        </Space>
        <p className="muted small">
          The accounting pack contains the sales register, purchase register, expense register and tax summary for
          the month. It is prepared for the client CA, not filed as a GST return.
        </p>
      </SectionCard>
    </div>
  ) : null;

  const profitPanel = profit.loading && !profitData ? (
    <LoadingPanel label="Calculating profit…" />
  ) : profit.error ? (
    <ErrorPanel error={profit.error} onRetry={profit.reload} />
  ) : profitData ? (
    <div>
      <div className="kpi-grid five">
        <Metric label="Net sales" value={money(profitData.netSalesPaise)} hint={`${profitData.invoiceCount} invoices`} />
        <Metric label="COGS" value={money(profitData.cogsPaise)} hint="Weighted-average cost captured on each sale" />
        <Metric label="Gross profit" value={money(profitData.grossProfitPaise)} tone="success" />
        <Metric label="Operating expenses" value={money(profitData.operatingExpensesPaise)} hint="Recorded expense entries" />
        <Metric
          label="Net operating result"
          value={money(profitData.netOperatingResultPaise)}
          hint="Gross profit minus operating expenses"
          tone={profitData.netOperatingResultPaise >= 0 ? 'success' : 'danger'}
        />
      </div>
      <div className="split-2">
        <SectionCard title="Expense breakdown" subtitle="Operating costs in the period." bodyClassName="panel-body flush">
          {(profitData.expenseBreakdown || []).length ? (
            <Table
              rowKey="categoryName"
              size="small"
              pagination={false}
              dataSource={profitData.expenseBreakdown}
              columns={[
                { title: 'Category', dataIndex: 'categoryName' },
                { title: 'Amount', dataIndex: 'totalPaise', width: 150, align: 'right', render: money },
              ]}
            />
          ) : (
            <p className="muted panel-pad">No operating expenses in this period.</p>
          )}
        </SectionCard>
        <SectionCard title="Profit & loss working" subtitle="How the result is calculated.">
          <div className="summary-rows">
            <div>
              <span>Net sales</span>
              <strong>{money(profitData.netSalesPaise)}</strong>
            </div>
            <div>
              <span>Cost of goods sold</span>
              <strong>− {money(profitData.cogsPaise)}</strong>
            </div>
            <div className="emphasis">
              <span>Gross profit</span>
              <strong>{money(profitData.grossProfitPaise)}</strong>
            </div>
            <div>
              <span>Operating expenses</span>
              <strong>− {money(profitData.operatingExpensesPaise)}</strong>
            </div>
            <div className="emphasis">
              <span>Net operating result</span>
              <strong>{money(profitData.netOperatingResultPaise)}</strong>
            </div>
            <div>
              <span>Tax collected (memo)</span>
              <strong>{money(profitData.taxCollectedPaise)}</strong>
            </div>
            <div>
              <span>Inventory purchases (memo)</span>
              <strong>{money(profitData.purchasesMemoPaise)}</strong>
            </div>
          </div>
          <p className="muted small">
            Inventory purchases are not operating expenses. They become COGS only when the goods are sold.
            Discounts and round-off are already reflected in net sales and invoice totals.
          </p>
        </SectionCard>
      </div>
    </div>
  ) : null;

  const productsPanel = products.loading && !productData ? (
    <LoadingPanel label="Building the product report…" />
  ) : products.error ? (
    <ErrorPanel error={products.error} onRetry={products.reload} />
  ) : productData ? (
    <SectionCard
      title="Product sales"
      subtitle="Net values exclude tax. Cost and profit appear only with profit permission."
      extra={
        can('reports.export') ? (
          <Button
            icon={<DownloadOutlined />}
            loading={exporting === 'product'}
            onClick={() => runExport('product', 'export.sales', { from, to })}
          >
            Export sales register
          </Button>
        ) : null
      }
      bodyClassName="panel-body flush"
    >
      <Table
        rowKey="variantId"
        size="small"
        dataSource={productData.rows || []}
        pagination={{ pageSize: 25 }}
        locale={{ emptyText: 'No products sold in this period.' }}
        scroll={{ x: 900 }}
        columns={[
          {
            title: 'Product',
            dataIndex: 'productName',
            render: (value, row) => (
              <div>
                <strong>{value}</strong>
                <div className="muted small">
                  {row.variantLabel} · {row.sku}
                </div>
              </div>
            ),
          },
          { title: 'Units', dataIndex: 'units', width: 80, align: 'right' },
          { title: 'Gross', dataIndex: 'grossPaise', width: 120, align: 'right', render: money },
          { title: 'Discount', dataIndex: 'discountPaise', width: 110, align: 'right', render: money },
          { title: 'Net', dataIndex: 'netSalesPaise', width: 120, align: 'right', render: money },
          { title: 'Tax', dataIndex: 'taxPaise', width: 100, align: 'right', render: money },
          ...(productData.canSeeProfit
            ? [
                { title: 'COGS', dataIndex: 'cogsPaise', width: 110, align: 'right', render: money },
                { title: 'Gross profit', dataIndex: 'grossProfitPaise', width: 130, align: 'right', render: money },
              ]
            : []),
        ]}
      />
    </SectionCard>
  ) : null;

  const taxPanel = tax.loading && !taxData ? (
    <LoadingPanel label="Building the tax summary…" />
  ) : tax.error ? (
    <ErrorPanel error={tax.error} onRetry={tax.reload} />
  ) : taxData ? (
    <div>
      <Alert
        type={taxData.taxEnabled ? 'warning' : 'info'}
        showIcon
        icon={<WarningOutlined />}
        className="detail-alert"
        message={taxData.taxEnabled ? 'Validate tax treatment with the client CA' : 'Tax is disabled in Settings'}
        description={taxData.warning}
      />
      <div className="split-2">
        <SectionCard title="Sales by tax rate" subtitle="Completed sales in the period." bodyClassName="panel-body flush">
          <Table
            rowKey="rateBp"
            size="small"
            dataSource={taxData.sales || []}
            pagination={false}
            locale={{ emptyText: 'No taxed sales in this period.' }}
            columns={[
              { title: 'Rate', dataIndex: 'ratePercent', width: 80, render: (value) => `${value}%` },
              { title: 'Invoices', dataIndex: 'invoiceCount', width: 90, align: 'right' },
              { title: 'Taxable', dataIndex: 'taxablePaise', width: 130, align: 'right', render: money },
              { title: 'Tax', dataIndex: 'taxPaise', width: 120, align: 'right', render: money },
              { title: 'Gross', dataIndex: 'grossPaise', width: 120, align: 'right', render: money },
            ]}
          />
        </SectionCard>
        <SectionCard title="Purchases by tax rate" subtitle="Posted purchases in the period." bodyClassName="panel-body flush">
          <Table
            rowKey="rateBp"
            size="small"
            dataSource={taxData.purchases || []}
            pagination={false}
            locale={{ emptyText: 'No purchased tax recorded.' }}
            columns={[
              { title: 'Rate', dataIndex: 'ratePercent', width: 80, render: (value) => `${value}%` },
              { title: 'Taxable', dataIndex: 'taxablePaise', width: 140, align: 'right', render: money },
              { title: 'Tax', dataIndex: 'taxPaise', width: 130, align: 'right', render: money },
            ]}
          />
        </SectionCard>
      </div>
      <SectionCard title="Tax exports" className="section-gap">
        <Button
          icon={<FileExcelOutlined />}
          loading={exporting === 'pack'}
          onClick={() => runExport('pack', 'export.accountingPack', { month: (from || '').slice(0, 7) })}
        >
          Accounting pack for the selected month
        </Button>
        <p className="muted small">
          Export formats are a working draft for the CA to validate. The application does not claim GST return
          filing, e-invoice compliance or a verified GSTIN.
        </p>
      </SectionCard>
    </div>
  ) : null;

  const purchasesPanel = purchases.loading && !purchaseData ? (
    <LoadingPanel label="Loading the purchase report…" />
  ) : purchases.error ? (
    <ErrorPanel error={purchases.error} onRetry={purchases.reload} />
  ) : purchaseData ? (
    <SectionCard
      title="Purchase register"
      subtitle="Inventory acquisitions, not operating expenses."
      extra={
        can('reports.export') ? (
          <Button
            icon={<DownloadOutlined />}
            loading={exporting === 'purchases'}
            onClick={() => runExport('purchases', 'export.purchases', { from, to })}
          >
            Export CSV
          </Button>
        ) : null
      }
      bodyClassName="panel-body flush"
    >
      <div className="panel-subtotal">
        Total posted purchases: <strong>{money(purchaseData.totalPaise)}</strong>
      </div>
      <Table
        rowKey="id"
        size="small"
        dataSource={purchaseData.rows || []}
        pagination={{ pageSize: 25 }}
        locale={{ emptyText: 'No purchases in this period.' }}
        scroll={{ x: 950 }}
        columns={[
          {
            title: 'Reference',
            dataIndex: 'reference',
            width: 150,
            render: (value, row) => (
              <div>
                <strong>{value}</strong>
                <div className="muted small">{formatDate(row.purchaseDate)}</div>
              </div>
            ),
          },
          { title: 'Supplier', dataIndex: 'supplierName', ellipsis: true },
          { title: 'Supplier invoice', dataIndex: 'supplierInvoiceRef', width: 140, render: (value) => value || '—' },
          { title: 'Subtotal', dataIndex: 'subtotalPaise', width: 120, align: 'right', render: money },
          { title: 'Tax', dataIndex: 'taxPaise', width: 100, align: 'right', render: money },
          { title: 'Total', dataIndex: 'totalPaise', width: 120, align: 'right', render: money },
          { title: 'Paid', dataIndex: 'amountPaidPaise', width: 120, align: 'right', render: money },
          { title: 'Balance', dataIndex: 'balancePaise', width: 120, align: 'right', render: money },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 90,
            render: (value) => <Tag color={value === 'posted' ? 'green' : 'default'}>{value}</Tag>,
          },
        ]}
      />
    </SectionCard>
  ) : null;

  const expensesPanel = expenses.loading && !expenseData ? (
    <LoadingPanel label="Loading the expense report…" />
  ) : expenses.error ? (
    <ErrorPanel error={expenses.error} onRetry={expenses.reload} />
  ) : expenseData ? (
    <SectionCard
      title="Expense register"
      subtitle="Active operating expenses in the period."
      extra={
        can('reports.export') ? (
          <Button
            icon={<DownloadOutlined />}
            loading={exporting === 'expenses'}
            onClick={() => runExport('expenses', 'export.expenses', { from, to })}
          >
            Export CSV
          </Button>
        ) : null
      }
      bodyClassName="panel-body flush"
    >
      <div className="panel-subtotal">
        Total expenses: <strong>{money(expenseData.totalPaise)}</strong>
      </div>
      <Table
        rowKey="id"
        size="small"
        dataSource={expenseData.rows || []}
        pagination={{ pageSize: 25 }}
        locale={{ emptyText: 'No expenses in this period.' }}
        columns={[
          { title: 'Date', dataIndex: 'expenseDate', width: 120, render: formatDate },
          { title: 'Category', dataIndex: 'categoryName', width: 170 },
          { title: 'Description', dataIndex: 'description', ellipsis: true },
          { title: 'Vendor', dataIndex: 'vendor', width: 150, ellipsis: true },
          { title: 'Method', dataIndex: 'paymentMethod', width: 120, render: paymentLabel },
          { title: 'Amount', dataIndex: 'amountPaise', width: 130, align: 'right', render: money },
        ]}
      />
    </SectionCard>
  ) : null;

  const inventoryPanel = inventory.loading && !inventoryData ? (
    <LoadingPanel label="Valuing inventory…" />
  ) : inventory.error ? (
    <ErrorPanel error={inventory.error} onRetry={inventory.reload} />
  ) : inventoryData ? (
    <div>
      <div className="kpi-grid three">
        <Metric label="Variants" value={Number(inventoryData.summary?.variants || 0)} hint={`${Number(inventoryData.summary?.units || 0)} units`} />
        <Metric label="Cost value" value={money(Number(inventoryData.summary?.cost_value || 0))} hint="Weighted average" />
        <Metric label="Retail value" value={money(Number(inventoryData.summary?.retail_value || 0))} hint="Current selling price" tone="accent" />
      </div>
      <SectionCard
        title="Valuation by category"
        subtitle="Costing method: weighted average."
        extra={
          can('reports.export') ? (
            <Button
              icon={<DownloadOutlined />}
              loading={exporting === 'inventory'}
              onClick={() => runExport('inventory', 'export.inventory', {})}
            >
              Export stock CSV
            </Button>
          ) : null
        }
        bodyClassName="panel-body flush"
      >
        <Table
          rowKey="name"
          size="small"
          dataSource={inventoryData.valuation || []}
          pagination={false}
          columns={[
            { title: 'Category', dataIndex: 'name' },
            { title: 'Units', dataIndex: 'units', width: 100, align: 'right' },
            { title: 'Cost value', dataIndex: 'cost_value', width: 150, align: 'right', render: (value) => money(Number(value)) },
            { title: 'Retail value', dataIndex: 'retail_value', width: 150, align: 'right', render: (value) => money(Number(value)) },
          ]}
        />
      </SectionCard>
      <SectionCard title="Low-stock variants" subtitle="At or below the reorder threshold." className="section-gap" bodyClassName="panel-body flush">
        <Table
          rowKey="variantId"
          size="small"
          dataSource={inventoryData.lowStock || []}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'No low-stock variants.' }}
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
            { title: 'Stock', dataIndex: 'stock', width: 90, align: 'right' },
            { title: 'Alert at', dataIndex: 'threshold', width: 100, align: 'right' },
          ]}
        />
      </SectionCard>
    </div>
  ) : null;

  const gstPanel = gst.loading && !gstData ? (
    <LoadingPanel label="Building the GST monthly report…" />
  ) : gst.error ? (
    <ErrorPanel error={gst.error} onRetry={gst.reload} />
  ) : gstData ? (
    <div>
      <div className="toolbar section-gap-sm">
        <DatePicker
          picker="month"
          value={gstMonth}
          onChange={(value) => setGstMonth(value || dayjs())}
          format="MMMM YYYY"
          allowClear={false}
        />
        {can('reports.export') ? (
          <Button
            icon={<FileExcelOutlined />}
            loading={exporting === 'gst'}
            onClick={() => runExport('gst', 'export.gstMonthly', { month: gstData.month })}
          >
            Export GST register CSV
          </Button>
        ) : null}
      </div>
      <Alert
        type="info"
        showIcon
        className="section-gap-sm"
        message={`GST monthly report · ${gstData.month}`}
        description={
          <div>
            {gstData.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        }
      />
      <div className="kpi-grid four">
        <Metric label="Invoices" value={gstData.totals.invoiceCount} hint={`${gstData.totals.b2bCount} B2B · ${gstData.totals.b2cCount} B2C`} />
        <Metric label="Taxable value" value={money(gstData.totals.taxablePaise)} hint="After discounts, excluding tax" tone="accent" />
        <Metric label="Tax" value={money(gstData.totals.taxPaise)} hint={`CGST ${money(gstData.totals.cgstPaise)} · SGST ${money(gstData.totals.sgstPaise)}`} />
        <Metric label="Invoice total" value={money(gstData.totals.totalPaise)} hint="Including tax and round-off" />
      </div>
      <div className="split-2">
        <SectionCard title="Sales by tax rate" bodyClassName="panel-body flush">
          <Table
            rowKey="rateBp"
            size="small"
            pagination={false}
            dataSource={gstData.byRate || []}
            locale={{ emptyText: 'No tax-rate sales in this month.' }}
            columns={[
              { title: 'Rate', dataIndex: 'ratePercent', width: 80, align: 'right', render: (value) => `${value}%` },
              { title: 'Invoices', dataIndex: 'invoiceCount', width: 90, align: 'right' },
              { title: 'Taxable', dataIndex: 'taxablePaise', align: 'right', render: money },
              { title: 'Tax', dataIndex: 'taxPaise', width: 120, align: 'right', render: money },
            ]}
          />
        </SectionCard>
        <SectionCard title="HSN summary" bodyClassName="panel-body flush">
          <Table
            rowKey={(row) => `${row.hsnCode}-${row.rateBp}`}
            size="small"
            pagination={false}
            dataSource={gstData.hsn || []}
            locale={{ emptyText: 'No HSN data recorded.' }}
            columns={[
              { title: 'HSN', dataIndex: 'hsnCode', render: (value) => value || '—' },
              { title: 'Rate', dataIndex: 'ratePercent', width: 80, align: 'right', render: (value) => `${value}%` },
              { title: 'Units', dataIndex: 'units', width: 80, align: 'right' },
              { title: 'Taxable', dataIndex: 'taxablePaise', align: 'right', render: money },
              { title: 'Tax', dataIndex: 'taxPaise', width: 110, align: 'right', render: money },
            ]}
          />
        </SectionCard>
      </div>
      <SectionCard title="Invoice register" subtitle="Completed invoices for the selected month." className="section-gap" bodyClassName="panel-body flush">
        <Table
          rowKey="invoiceNo"
          size="small"
          dataSource={gstData.register || []}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: 'No invoices in this month.' }}
          columns={[
            { title: 'Invoice', dataIndex: 'invoiceNo', render: (value) => <strong>{value}</strong> },
            { title: 'Date', dataIndex: 'businessDate', width: 120, render: formatDate },
            { title: 'Customer', dataIndex: 'customerName', ellipsis: true },
            { title: 'Customer GSTIN', dataIndex: 'customerGstin', ellipsis: true, render: (value) => value || 'B2C' },
            { title: 'Taxable', dataIndex: 'taxablePaise', width: 130, align: 'right', render: money },
            { title: 'Tax', dataIndex: 'taxPaise', width: 110, align: 'right', render: money },
            { title: 'Total', dataIndex: 'totalPaise', width: 120, align: 'right', render: money },
            { title: 'Payment', dataIndex: 'paymentStatus', width: 100, render: (value) => <StatusTag status={value} /> },
          ]}
        />
      </SectionCard>
    </div>
  ) : null;

  const items = [];
  if (canSales) items.push({ key: 'sales', label: 'Sales summary', children: salesPanel });
  if (canProfit) items.push({ key: 'profit', label: 'Profit & loss', children: profitPanel });
  if (canSales) items.push({ key: 'products', label: 'Product sales', children: productsPanel });
  if (canProfit) items.push({ key: 'tax', label: 'Tax summary', children: taxPanel });
  if (canProfit) items.push({ key: 'gst', label: 'GST monthly', children: gstPanel });
  if (canPurchases) items.push({ key: 'purchases', label: 'Purchases', children: purchasesPanel });
  if (canExpenses) items.push({ key: 'expenses', label: 'Expenses', children: expensesPanel });
  if (canInventory) items.push({ key: 'inventory', label: 'Inventory', children: inventoryPanel });

  return (
    <div>
      <PageHeader
        eyebrow="Local reporting"
        title="Reports"
        subtitle="Figures are computed from local invoices, stock movements, purchases and expenses. Nothing is uploaded."
        extra={
          <Space wrap>
            <BrandMark size={38} />
            <RangePicker value={range} onChange={(value) => setRange(value || [])} allowClear={false} format="DD MMM YYYY" />
            <Button icon={<ReloadOutlined />} onClick={reloadAll}>
              Refresh
            </Button>
          </Space>
        }
      />
      {items.length ? (
        <Tabs activeKey={tab} onChange={setTab} items={items} />
      ) : (
        <Alert type="warning" showIcon message="Your role does not include any report tabs." />
      )}
    </div>
  );
}
