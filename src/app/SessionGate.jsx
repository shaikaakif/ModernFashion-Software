import { Result, Spin } from 'antd';
import { useSession } from '@/app/SessionContext';
import AppShell from '@/app/AppShell';
import LoginPage from '@/pages/LoginPage';
import SetupPage from '@/pages/SetupPage';

export default function SessionGate() {
  const { booting, bootError, needsSetup, session } = useSession();

  if (booting) {
    return (
      <div className="boot-screen">
        <div className="brand-mark brand-mark-large">MF</div>
        <Spin />
        <p>Opening the local store database…</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <Result
        status="error"
        title="The application could not start"
        subTitle={bootError.message || 'The local database is unavailable.'}
        extra={<p>Close the app and try again. If the problem continues, restore a verified backup.</p>}
      />
    );
  }

  if (needsSetup) return <SetupPage />;
  if (!session) return <LoginPage />;
  return <AppShell />;
}
