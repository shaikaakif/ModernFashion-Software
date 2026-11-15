import { App as AntApp, ConfigProvider } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from '@/redux/store';
import RetailApp from '@/retail/RetailApp';
import './style/app.css';
import './style/retail.css';

export default function RootApp() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#e4602a',
          colorInfo: '#e4602a',
          colorSuccess: '#2f7d5b',
          colorWarning: '#b7791f',
          colorError: '#c4473a',
          colorText: '#25262a',
          colorTextSecondary: '#6f6e69',
          colorBorder: '#e5e1da',
          colorBgLayout: '#f4f3ef',
          borderRadius: 8,
          controlHeight: 36,
          fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif',
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: '#17181c', bodyBg: '#f4f3ef' },
          Menu: {
            darkItemBg: '#17181c',
            darkSubMenuItemBg: '#17181c',
            darkItemColor: '#b8b6b0',
            darkItemHoverBg: '#24252a',
            darkItemSelectedBg: '#e4602a',
            darkItemSelectedColor: '#ffffff',
            itemBorderRadius: 8,
          },
          Table: {
            headerBg: '#faf9f6',
            headerColor: '#716f69',
            rowHoverBg: '#fbf7f3',
            borderColor: '#eeeae3',
          },
          Button: { primaryShadow: 'none' },
          Segmented: { itemSelectedBg: '#ffffff' },
        },
      }}
    >
      <BrowserRouter>
        <Provider store={store}>
          <AntApp>
            <RetailApp />
          </AntApp>
        </Provider>
      </BrowserRouter>
    </ConfigProvider>
  );
}
