import { App as AntApp, ConfigProvider } from 'antd';
import { HashRouter } from 'react-router-dom';
import { SessionProvider } from '@/app/SessionContext';
import { theme } from '@/app/theme';
import SessionGate from '@/app/SessionGate';
import './style/app.css';

export default function RootApp() {
  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <SessionProvider>
          <HashRouter>
            <SessionGate />
          </HashRouter>
        </SessionProvider>
      </AntApp>
    </ConfigProvider>
  );
}
