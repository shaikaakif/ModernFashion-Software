import electronUpdater from 'electron-updater';
import { AppError } from '../core/errors.js';

const { autoUpdater } = electronUpdater;

const REPO = 'shaikaakif/ModernFashion-Software';
const RELEASES_URL = `https://github.com/${REPO}/releases`;

function stripHtml(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeNotes(value) {
  if (!value) return '';
  if (typeof value === 'string') return stripHtml(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return stripHtml(entry);
        if (!entry || typeof entry !== 'object') return '';
        const heading = entry.version ? `Version ${entry.version}` : '';
        const note = normalizeNotes(entry.note ?? entry.notes ?? '');
        return [heading, note].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
  }
  if (typeof value === 'object') return normalizeNotes(value.note ?? value.notes ?? '');
  return '';
}

function friendlyError(error) {
  const message = String(error?.message || error || 'Unknown update error');
  if (/404|latest\.yml|app-update\.yml|cannot find|no published (versions|release)|no releases/i.test(message)) {
    return 'No published release was found for this build yet. Publish a GitHub Release with the installer and latest.yml, then check again.';
  }
  if (/net::|ENOTFOUND|ECONN|ETIMEDOUT|network|internet|offline/i.test(message)) {
    return 'Could not reach GitHub Releases. Check the internet connection and try again. Sales and reports keep working offline.';
  }
  return message.slice(0, 500);
}

/**
 * Auto-update runs only in the installed build. Business data lives in the
 * Electron user-data folder, so replacing program files does not touch the
 * database, backups, exports or documents. The renderer asks for an explicit
 * safety backup before it calls install().
 */
export function createUpdateService({ app, logger, broadcast = () => {} }) {
  let state = {
    supported: Boolean(app.isPackaged),
    checking: false,
    downloading: false,
    downloaded: false,
    updateAvailable: false,
    version: '',
    releaseName: '',
    releaseDate: '',
    releaseNotes: '',
    progressPercent: 0,
    error: '',
    message: app.isPackaged ? 'Not checked yet.' : 'Update checks run only in the installed application.',
    lastCheckedAt: '',
  };
  let listenersReady = false;

  function getStatus() {
    return {
      ...state,
      currentVersion: app.getVersion(),
      repo: REPO,
      releaseUrl: RELEASES_URL,
    };
  }

  function emit() {
    try {
      broadcast(getStatus());
    } catch (error) {
      logger?.warn('Could not broadcast update status', { message: error?.message });
    }
  }

  function set(partial) {
    state = { ...state, ...partial };
    emit();
  }

  function init() {
    if (listenersReady) return;
    listenersReady = true;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on('checking-for-update', () => {
      set({ checking: true, error: '', message: 'Checking GitHub Releases…' });
    });

    autoUpdater.on('update-available', (info) => {
      set({
        checking: false,
        downloading: false,
        updateAvailable: true,
        version: info?.version || '',
        releaseName: info?.releaseName || (info?.version ? `v${info.version}` : ''),
        releaseDate: info?.releaseDate || '',
        releaseNotes: normalizeNotes(info?.releaseNotes),
        progressPercent: 0,
        error: '',
        lastCheckedAt: new Date().toISOString(),
        message: info?.version ? `Version ${info.version} is available.` : 'An update is available.',
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      set({
        checking: false,
        downloading: false,
        downloaded: false,
        updateAvailable: false,
        version: info?.version || '',
        releaseName: info?.releaseName || (info?.version ? `v${info.version}` : ''),
        releaseDate: info?.releaseDate || '',
        releaseNotes: normalizeNotes(info?.releaseNotes),
        progressPercent: 0,
        error: '',
        lastCheckedAt: new Date().toISOString(),
        message: info?.version
          ? `You are on the latest version (${info.version}).`
          : 'You are on the latest version.',
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.min(100, Math.max(0, Math.round(Number(progress?.percent) || 0)));
      set({
        downloading: true,
        progressPercent: percent,
        message: `Downloading update… ${percent}%`,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      set({
        checking: false,
        downloading: false,
        downloaded: true,
        updateAvailable: true,
        version: info?.version || state.version,
        releaseName: info?.releaseName || state.releaseName,
        releaseDate: info?.releaseDate || state.releaseDate,
        releaseNotes: normalizeNotes(info?.releaseNotes) || state.releaseNotes,
        progressPercent: 100,
        error: '',
        lastCheckedAt: new Date().toISOString(),
        message: 'Update downloaded. Restart the application to install it.',
      });
    });

    autoUpdater.on('error', (error) => {
      const message = friendlyError(error);
      logger?.warn('Update error', { message: error?.message });
      set({
        checking: false,
        downloading: false,
        progressPercent: 0,
        error: message,
        message,
      });
    });
  }

  async function check({ automatic = false } = {}) {
    init();
    if (!app.isPackaged) {
      set({
        supported: false,
        checking: false,
        message: 'Update checks run only in the installed application. Use npm run dist to build the EXE.',
      });
      return getStatus();
    }
    if (state.checking || state.downloading) return getStatus();
    if (!automatic) set({ message: 'Checking GitHub Releases…' });
    set({ checking: true, error: '' });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const message = friendlyError(error);
      logger?.warn('Update check failed', { message: error?.message, automatic });
      set({ checking: false, error: message, message });
    }
    return getStatus();
  }

  async function download() {
    init();
    if (!app.isPackaged) {
      throw new AppError('Updates can only be downloaded by the installed application.', 'UPDATE_UNSUPPORTED');
    }
    if (state.downloaded) return getStatus();
    if (!state.updateAvailable) {
      throw new AppError('Check for updates before downloading.', 'UPDATE_NOT_AVAILABLE');
    }
    if (state.downloading) return getStatus();
    set({ downloading: true, progressPercent: 0, error: '', message: 'Starting download…' });
    try {
      await autoUpdater.downloadUpdate();
      return getStatus();
    } catch (error) {
      const message = friendlyError(error);
      logger?.error('Update download failed', { message: error?.message });
      set({ downloading: false, error: message, message });
      throw new AppError(message, 'UPDATE_DOWNLOAD_FAILED');
    }
  }

  function install({ backupPath = '' } = {}) {
    init();
    if (!state.downloaded) {
      throw new AppError('Download the update before restarting to install it.', 'UPDATE_NOT_DOWNLOADED');
    }
    logger?.info('Update install requested', { version: state.version, backupPath });
    set({ message: 'Closing safely and installing the update…' });
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (error) {
        logger?.error('Could not quit and install the update', { message: error?.message });
      }
    }, 700);
    return { installing: true, version: state.version, backupPath, releaseUrl: RELEASES_URL };
  }

  return {
    init,
    getStatus,
    check,
    download,
    install,
  };
}
