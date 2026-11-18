import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Descriptions, Progress, Space, Tag } from 'antd';
import {
  CloudDownloadOutlined,
  DownloadOutlined,
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
  if (!status.supported) return <Tag>Installed app only</Tag>;
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

  useEffect(() => {
    if (initial.data) setStatus(initial.data);
  }, [initial.data]);

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
      message.success('Update downloaded. Restart when you are ready.');
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
          <p>A verified backup is created first. If the backup fails, the update does not start.</p>
          <p>Sales, stock, customers, settings, backups and documents are not changed.</p>
          <p>The app closes and reopens automatically.</p>
        </div>
      ),
      onOk: async () => {
        try {
          const result = await api('app.installUpdate');
          message.success(`Backup created. Installing version ${result.version}.`, 8);
        } catch (error) {
          message.error(errorMessage(error));
          throw error;
        }
      },
    });
  }

  if (initial.loading && !status) return <LoadingPanel label="Checking for updates…" />;
  if (initial.error && !status) {
    return (
      <div>
        <PageHeader eyebrow="Software updates" title="Updates" subtitle="Check for a newer version of this software." />
        <Alert
          type="error"
          showIcon
          message="Updates could not be checked"
          description="Check the internet connection and try again. Billing and reports keep working."
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
        title="Updates"
        subtitle="Check for a newer version and install it safely."
        extra={
          <Button icon={<ReloadOutlined />} onClick={checkNow} loading={checking}>
            Check now
          </Button>
        }
      />

      <div className="settings-stack">
        {!packaged ? (
          <Alert
            type="info"
            showIcon
            message="Update checks are available in the installed application."
            description="Open the installed Modern Fashion POS to check for updates."
          />
        ) : null}

        {status?.error ? (
          <Alert
            type="warning"
            showIcon
            message="Updates could not be checked"
            description="Check the internet connection and try again. Billing and reports keep working."
          />
        ) : null}

        <SectionCard
          title="Current version"
          subtitle="The installed version and the newest available version."
          extra={stateTag(status)}
        >
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Installed version">
              <strong>{status?.currentVersion || '—'}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Latest version">
              {status?.version ? <strong>{status.version}</strong> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Last checked">
              {status?.lastCheckedAt ? formatDateTime(status.lastCheckedAt) : 'Not checked yet'}
            </Descriptions.Item>
            <Descriptions.Item label="Status">{status?.message || 'Waiting for the first check.'}</Descriptions.Item>
          </Descriptions>

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
            <Button icon={<CloudDownloadOutlined />} onClick={checkNow} loading={checking}>
              Check again
            </Button>
          </Space>
        </SectionCard>

        {status?.version && status?.releaseNotes ? (
          <SectionCard title={`What's new in ${status.version}`} subtitle="Changes in this update.">
            <pre className="release-notes">{status.releaseNotes}</pre>
          </SectionCard>
        ) : null}

        <SectionCard title="Safe update" subtitle="Your shop data is protected.">
          <div className="release-safety-grid">
            <div>
              <h3>
                <SafetyCertificateOutlined /> Backup first
              </h3>
              <p>A verified backup is created before installation. If it fails, the update does not start.</p>
            </div>
            <div>
              <h3>
                <CloudDownloadOutlined /> Your data stays
              </h3>
              <p>Sales, stock, customers, settings, backups and documents are not changed.</p>
            </div>
            <div>
              <h3>
                <SyncOutlined /> Clean restart
              </h3>
              <p>The app closes and reopens on the new version automatically.</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
