import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Descriptions, Progress, Space, Tag } from 'antd';
import {
  CloudDownloadOutlined,
  DownloadOutlined,
  GithubOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { api, errorMessage } from '@/app/api';
import { useAsync } from '@/app/hooks';
import { formatDateTime } from '@/app/format';
import { LoadingPanel, PageHeader, SectionCard } from '@/app/components';

function stateTag(status) {
  if (!status) return <Tag>Loading</Tag>;
  if (!status.supported) return <Tag>Installed build only</Tag>;
  if (status.downloaded) return <Tag color="green">Ready to install</Tag>;
  if (status.downloading) return <Tag color="blue">Downloading</Tag>;
  if (status.checking) return <Tag color="blue">Checking</Tag>;
  if (status.updateAvailable) return <Tag color="gold">Update available</Tag>;
  if (status.lastCheckedAt) return <Tag color="green">Up to date</Tag>;
  return <Tag>Not checked</Tag>;
}

export default function ReleasesPage() {
  const { message, modal } = AntApp.useApp();
  const initial = useAsync(() => api('app.updateStatus'), []);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    if (initial.data) setStatus(initial.data);
  }, [initial.data]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.mf?.onUpdateStatus?.((next) => setStatus(next));
    return () => unsubscribe?.();
  }, []);

  async function checkNow() {
    setBusy('check');
    try {
      setStatus(await api('app.checkUpdates'));
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy('');
    }
  }

  async function downloadNow() {
    setBusy('download');
    try {
      setStatus(await api('app.downloadUpdate'));
      message.success('Update downloaded. You can now restart and install it.');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy('');
    }
  }

  function installNow() {
    modal.confirm({
      title: 'Restart and install this update?',
      icon: <SafetyCertificateOutlined />,
      okText: 'Back up & install',
      cancelText: 'Cancel',
      content: (
        <div className="release-install-copy">
          <p>
            A verified backup of the live database is created first. If the backup fails, the update does not start.
          </p>
          <p>
            The Windows installer replaces program files only. Sales, stock, customers, backups, exports, documents and
            settings stay in the local application data folder.
          </p>
          <p>
            The application closes and reopens automatically. Do not switch off the computer while the installer is
            running.
          </p>
        </div>
      ),
      onOk: async () => {
        try {
          const result = await api('app.installUpdate');
          message.success(`Backup created at ${result.backupPath}. Installing version ${result.version}…`, 8);
        } catch (error) {
          message.error(errorMessage(error));
          throw error;
        }
      },
    });
  }

  if (initial.loading && !status) return <LoadingPanel label="Reading update status…" />;
  if (initial.error && !status) {
    return (
      <div>
        <PageHeader
          eyebrow="Software updates"
          title="Releases"
          subtitle="GitHub Releases and the installed application version."
        />
        <Alert
          type="error"
          showIcon
          message="Update status could not be loaded"
          description={errorMessage(initial.error)}
        />
      </div>
    );
  }

  const packaged = Boolean(status?.supported);
  const canDownload = packaged && status?.updateAvailable && !status.downloaded && !status.downloading;
  const canInstall = packaged && status?.downloaded && !busy;
  const checking = Boolean(status?.checking) || busy === 'check';
  const downloading = Boolean(status?.downloading) || busy === 'download';

  return (
    <div>
      <PageHeader
        eyebrow="Software updates"
        title="Releases"
        subtitle="Check GitHub Releases, download the installer package and restart without touching business data."
        extra={
          <Space wrap>
            <Tag color={online ? 'green' : 'red'}>{online ? 'Internet available' : 'Offline'}</Tag>
            <Button icon={<ReloadOutlined />} onClick={checkNow} loading={checking}>
              Check now
            </Button>
          </Space>
        }
      />

      <div className="settings-stack">
        {!packaged ? (
          <Alert
            type="info"
            showIcon
            message="Update checks run in the installed EXE, not in development."
            description="Build the NSIS installer with npm run dist, publish it to GitHub Releases, then install it on the counter PC. This page will then read the public release feed."
          />
        ) : null}

        {!online ? (
          <Alert
            type="warning"
            showIcon
            message="No internet connection."
            description="Sales, stock, printing and reports keep working offline. Update checks and downloads resume when the connection returns."
          />
        ) : null}

        {status?.error ? (
          <Alert
            type="warning"
            showIcon
            message="The update feed could not be read"
            description={status.error}
          />
        ) : null}

        <SectionCard
          title="Installed version"
          subtitle="The updater compares this installed build with the newest published GitHub Release."
          extra={stateTag(status)}
        >
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Current version">
              <strong>{status?.currentVersion || '—'}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Latest release">
              {status?.version ? <strong>{status.version}</strong> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Release">{status?.releaseName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Published">
              {status?.releaseDate ? formatDateTime(status.releaseDate) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Last checked">
              {status?.lastCheckedAt ? formatDateTime(status.lastCheckedAt) : 'Not checked yet'}
            </Descriptions.Item>
            <Descriptions.Item label="Update channel">Stable · GitHub Releases</Descriptions.Item>
          </Descriptions>
          <p className="muted small release-status-line">{status?.message || 'Waiting for the first check.'}</p>

          {downloading ? (
            <div className="release-progress">
              <Progress percent={status?.progressPercent || 0} status="active" />
              <span className="muted small">Keep the application open while the update downloads.</span>
            </div>
          ) : null}

          <Space wrap className="section-gap-sm">
            <Button
              type={canInstall ? 'primary' : 'default'}
              icon={canInstall ? <SyncOutlined /> : <DownloadOutlined />}
              disabled={!canDownload && !canInstall}
              loading={downloading}
              onClick={canInstall ? installNow : downloadNow}
            >
              {canInstall ? 'Restart & install' : 'Download update'}
            </Button>
            <Button icon={<GithubOutlined />} onClick={() => api('app.openReleases').catch((error) => message.error(errorMessage(error)))}>
              Open GitHub Releases
            </Button>
          </Space>
        </SectionCard>

        {status?.version || status?.releaseNotes ? (
          <SectionCard
            title={status?.version ? `What's new in ${status.version}` : "What's new"}
            subtitle="Release notes come from the GitHub Release body. They are displayed as plain text."
          >
            <pre className="release-notes">{status?.releaseNotes || 'This release did not include notes.'}</pre>
          </SectionCard>
        ) : null}

        <SectionCard
          title="How updates protect your data"
          subtitle="The updater replaces code, never the database."
        >
          <div className="release-safety-grid">
            <div>
              <h3><SafetyCertificateOutlined /> Backup first</h3>
              <p>
                Restart &amp; install creates a verified SQLite backup before the installer starts. If that backup fails,
                the installation is blocked.
              </p>
            </div>
            <div>
              <h3><CloudDownloadOutlined /> Program files only</h3>
              <p>
                The NSIS installer replaces the application in Program Files. Sales, stock, customers, settings,
                backups, exports and documents remain in the local user-data folder.
              </p>
            </div>
            <div>
              <h3><SyncOutlined /> Clean restart</h3>
              <p>
                The database is closed cleanly before the installer runs. The application reopens automatically after
                the update.
              </p>
            </div>
          </div>
          <Alert
            className="section-gap-sm"
            type="info"
            showIcon
            message="Offline-first still applies."
            description="An internet connection is needed only to check for and download releases. Billing, inventory, printing and reports never depend on GitHub or any cloud service."
          />
        </SectionCard>

        <SectionCard title="Release procedure for the owner" subtitle="Repo, installer and metadata must be published together.">
          <ol className="release-steps">
            <li>Bump the version in package.json.</li>
            <li>Run npm run verify and npm run dist.</li>
            <li>Publish the installer, latest.yml and blockmap to a GitHub Release tagged v&lt;version&gt;.</li>
            <li>Keep the release public. The installed app reads it without a token.</li>
            <li>Install once on the counter PC. Later releases are offered here automatically.</li>
          </ol>
          <p className="muted small">
            Repository: <span className="mono">{status?.repo || 'shaikaakif/ModernFashion-Software'}</span>. Publishing
            requires the owner&apos;s GitHub token and is never done from the installed application.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
