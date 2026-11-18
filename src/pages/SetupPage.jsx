import BrandMark from '@/app/BrandMark';
import { useSession } from '@/app/SessionContext';
import SetupWizard from '@/pages/SetupWizard';

export default function SetupPage() {
  const { business } = useSession();

  return (
    <div className="auth-screen">
      <section className="auth-brand">
        <BrandMark size={58} />
        <div className="auth-brand-copy">
          <span className="eyebrow">First-time setup</span>
          <h1>{business?.name || 'MODERN FASHION'}</h1>
          <p className="auth-brand-note">
            Set up the owner account, business identity, GST, invoicing and backup in one guided flow. Everything stays
            on this computer. You can reopen this guide later from Settings.
          </p>
        </div>
        <div className="auth-brand-foot">
          <span>Billing and stock, on this computer</span>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-card setup-card">
          <SetupWizard firstRun />
        </div>
      </section>
    </div>
  );
}
