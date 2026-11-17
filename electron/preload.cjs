const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mf', {
  invoke: async (method, payload) => {
    if (typeof method !== 'string' || !method) throw new Error('Invalid application action.');
    const result = await ipcRenderer.invoke('mf:invoke', method, payload);
    if (!result || result.ok !== true) {
      const error = new Error(result?.error?.message || 'The operation failed.');
      error.code = result?.error?.code || 'INTERNAL_ERROR';
      error.details = result?.error?.details || null;
      throw error;
    }
    return result.data;
  },
  platform: process.platform,
  onUpdateStatus: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const wrapped = (_event, status) => listener(status);
    ipcRenderer.on('mf:update-status', wrapped);
    return () => ipcRenderer.removeListener('mf:update-status', wrapped);
  },
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
