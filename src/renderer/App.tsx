import { useEffect, useCallback } from 'react'
import { useAppStore } from './stores/app-store'
import { notify } from './stores/notification-store'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { Sidebar } from './components/layout/Sidebar'
import { TabBar } from './components/layout/TabBar'
import { FileDropzone } from './components/file/FileDropzone'
import { DataExplorer } from './components/explorer/DataExplorer'
import { ToastContainer } from './components/ui/Toast'

declare global {
  interface Window {
    electronAPI: typeof import('../shared/types').ElectronAPI extends infer T ? T : never
  }
}

export default function App() {
  const { files, activeFileId, setRecentFiles, setIndexProgress, updateFileInfo, setIndexing } = useAppStore()
  const activeFile = activeFileId ? files.get(activeFileId) : null

  // Enable keyboard shortcuts
  useKeyboardShortcuts()

  useEffect(() => {
    // Load recent files on mount
    window.electronAPI.getRecentFiles().then(setRecentFiles)

    // Subscribe to index progress
    const unsubscribe = window.electronAPI.onIndexProgress(async (progress) => {
      const store = useAppStore.getState()
      store.setIndexProgress(progress.fileId, progress)

      if (progress.status === 'complete') {
        store.setIndexing(progress.fileId, false)
        // Reload file info to get updated columns
        const file = store.files.get(progress.fileId)
        if (file) {
          const info = await window.electronAPI.getFileInfo(file.info.path)
          useAppStore.getState().updateFileInfo(progress.fileId, info)
          const stats = await window.electronAPI.getStats(progress.fileId)
          useAppStore.getState().updateFileStats(progress.fileId, stats)
          // Also refresh recent files
          const recentFiles = await window.electronAPI.getRecentFiles()
          useAppStore.getState().setRecentFiles(recentFiles)

          // Show success notification
          notify.success(
            'Indexation complete',
            `${file.info.name} - ${info.totalRecords?.toLocaleString()} records indexed`
          )
        }
      } else if (progress.status === 'error') {
        store.setIndexing(progress.fileId, false)
        notify.error('Indexation error', progress.error || 'An unknown error occurred')
      } else if (progress.status === 'cancelled') {
        store.setIndexing(progress.fileId, false)
        notify.warning('Indexation cancelled')
      }
    })

    return unsubscribe
  }, [])

  return (
    <div className="flex h-screen bg-[#09090b]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Drag region for window */}
        <div className="h-9 w-full" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {/* Tab bar */}
        <TabBar />

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {activeFile ? (
            activeFile.info.indexed ? (
              <DataExplorer
                key={`${activeFile.info.id}-${activeFile.info.indexed}-${activeFile.info.totalRecords}-${activeFile.info.indexedAt}`}
                file={activeFile}
              />
            ) : (
              <FileDropzone file={activeFile} />
            )
          ) : (
            <FileDropzone />
          )}
        </div>
      </div>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  )
}
