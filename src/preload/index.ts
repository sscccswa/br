import { contextBridge, ipcRenderer } from 'electron'
import { ElectronAPI, PageQuery, SearchQuery, IndexProgress, ExportOptions } from '../shared/types'

const api: ElectronAPI = {
  // File operations
  openFileDialog: () => ipcRenderer.invoke('file:open-dialog'),
  getFileInfo: (path) => ipcRenderer.invoke('file:info', path),
  getRecentFiles: () => ipcRenderer.invoke('file:recent'),
  removeRecentFile: (fileId) => ipcRenderer.invoke('file:remove-recent', fileId),
  clearAllData: () => ipcRenderer.invoke('file:clear-all'),

  // Indexing
  startIndexing: (path) => ipcRenderer.invoke('index:start', path),
  cancelIndexing: (fileId) => ipcRenderer.invoke('index:cancel', fileId),
  onIndexProgress: (callback) => {
    const handler = (_: unknown, progress: IndexProgress) => callback(progress)
    ipcRenderer.on('index:progress', handler)
    return () => ipcRenderer.removeListener('index:progress', handler)
  },

  // Data access
  getPage: (query) => ipcRenderer.invoke('data:page', query),
  search: (query) => ipcRenderer.invoke('data:search', query),
  getRecord: (fileId, index) => ipcRenderer.invoke('data:record', fileId, index),
  getStats: (fileId) => ipcRenderer.invoke('data:stats', fileId),

  // Export
  exportData: (options) => ipcRenderer.invoke('data:export', options),

  // App
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

  // Updates
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback: (status: { status: string; version?: string; percent?: number }) => void) => {
    const handler = (_: unknown, data: { status: string; version?: string; percent?: number }) => callback(data)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
