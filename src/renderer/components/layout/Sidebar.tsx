import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Download, Check, X, Trash2, Bug } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { formatBytes, formatNumber } from '../../lib/utils'
import { FileInfo } from '../../../shared/types'
import { notify } from '../../stores/notification-store'

type UpdateStatus = 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error' | 'dev' | null

export function Sidebar() {
  const { files, recentFiles, addFile, setActiveFile, removeRecentFile, removeFile } = useAppStore()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(null)
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('')
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion)
  }, [])

  // Filter out files that are currently open in tabs
  const openFileIds = new Set(files.keys())
  const filteredRecentFiles = recentFiles.filter(f => !openFileIds.has(f.id))

  useEffect(() => {
    const unsubscribe = window.electronAPI.onUpdateStatus((data) => {
      setUpdateStatus(data.status as UpdateStatus)
      if (data.version) setUpdateVersion(data.version)
      if (data.percent) setDownloadPercent(data.percent)

      // Show toast notifications for certain statuses
      if (data.status === 'up-to-date') {
        notify.success('No updates available', 'You are running the latest version')
        setIsCheckingUpdate(false)
        // Reset status after 3 seconds
        statusTimeoutRef.current = setTimeout(() => setUpdateStatus(null), 3000)
      } else if (data.status === 'available') {
        notify.info('Update available', `Version ${data.version} is ready to download`)
        setIsCheckingUpdate(false)
      } else if (data.status === 'error') {
        notify.error('Update check failed', 'Could not check for updates')
        setIsCheckingUpdate(false)
      } else if (data.status === 'dev') {
        notify.warning('Development mode', 'Updates are disabled in dev mode')
        setIsCheckingUpdate(false)
      }
    })
    return () => {
      unsubscribe()
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
    }
  }, [])

  const handleOpenFile = async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths && paths.length > 0) {
      for (const path of paths) {
        const info = await window.electronAPI.getFileInfo(path)
        addFile(info)
        if (info.indexed) {
          const stats = await window.electronAPI.getStats(info.id)
          useAppStore.getState().updateFileStats(info.id, stats)
        }
      }
    }
  }

  const handleRecentClick = async (file: FileInfo) => {
    const info = await window.electronAPI.getFileInfo(file.path)
    addFile(info)
    if (info.indexed) {
      const stats = await window.electronAPI.getStats(info.id)
      useAppStore.getState().updateFileStats(info.id, stats)
    }
  }

  const handleRemoveRecent = async (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation()
    await window.electronAPI.removeRecentFile(fileId)
    removeRecentFile(fileId)
    // Also close the tab if it's open
    if (openFileIds.has(fileId)) {
      removeFile(fileId)
    }
  }

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all recent files and delete all index caches? This action cannot be undone.')) {
      await window.electronAPI.clearAllData()
      useAppStore.getState().setRecentFiles([])
      // Close all open tabs
      for (const fileId of openFileIds) {
        removeFile(fileId)
      }
    }
  }

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true)
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)

    // Timeout after 5 seconds if no response
    const timeoutId = setTimeout(() => {
      setIsCheckingUpdate(false)
      setUpdateStatus(null)
    }, 5000)

    await window.electronAPI.checkForUpdate()
    clearTimeout(timeoutId)
  }

  return (
    <div
      className={`bg-[#18181b] border-r border-[#27272a] flex flex-col transition-all duration-200 ${
        isCollapsed ? 'w-12' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-[#27272a]">
        {!isCollapsed && (
          <span className="text-sm font-medium text-[#fafafa]">Breach Explorer</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded hover:bg-[#27272a] text-[#a1a1aa]"
        >
          <svg
            className={`w-4 h-4 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Open file button */}
          <div className="p-3">
            <button
              onClick={handleOpenFile}
              className="w-full py-2 px-3 bg-[#27272a] hover:bg-[#3f3f46] rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Open File
            </button>
          </div>

          {/* Recent files */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Recent Files</span>
              {(recentFiles.length > 0 || openFileIds.size > 0) && (
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-1 text-xs text-[#71717a] hover:text-red-400 transition-colors"
                  title="Clear all recent files and index caches"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {filteredRecentFiles.map((file) => (
                <div
                  key={file.id}
                  className="w-full px-3 py-2 hover:bg-[#27272a] transition-colors group relative"
                >
                  <button
                    onClick={() => handleRecentClick(file)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2 pr-6">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        file.type === 'json' ? 'bg-amber-500/20 text-amber-400' :
                        file.type === 'vcf' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {file.type.toUpperCase()}
                      </span>
                      <span className="text-sm text-[#fafafa] truncate flex-1">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[#71717a]">
                      <span>{formatBytes(file.size)}</span>
                      {file.totalRecords && <span>{formatNumber(file.totalRecords)} records</span>}
                    </div>
                  </button>
                  <button
                    onClick={(e) => handleRemoveRecent(e, file.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#3f3f46] text-[#71717a] hover:text-red-400 transition-all"
                    title="Remove from recent files"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {filteredRecentFiles.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-[#71717a]">
                  No recent files
                </div>
              )}
            </div>
          </div>

          {/* Update check & version */}
          <div className="border-t border-[#27272a] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                {(updateStatus === 'checking' || isCheckingUpdate) && (
                  <div className="flex items-center gap-2 text-xs text-[#71717a]">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                    <span className="truncate">Checking...</span>
                  </div>
                )}
                {updateStatus === 'up-to-date' && !isCheckingUpdate && (
                  <div className="flex items-center gap-2 text-xs text-emerald-500/80">
                    <Check className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">Up to date</span>
                  </div>
                )}
                {updateStatus === 'available' && !isCheckingUpdate && (
                  <button
                    onClick={() => window.electronAPI.downloadUpdate()}
                    className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">Download v{updateVersion}</span>
                  </button>
                )}
                {updateStatus === 'downloading' && (
                  <div className="flex items-center gap-2 text-xs text-blue-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                    <span className="truncate">{Math.round(downloadPercent)}%</span>
                  </div>
                )}
                {updateStatus === 'ready' && (
                  <button
                    onClick={() => window.electronAPI.installUpdate()}
                    className="flex items-center gap-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">Install & restart</span>
                  </button>
                )}
                {!isCheckingUpdate && (updateStatus === null || updateStatus === 'error') && (
                  <button
                    onClick={handleCheckUpdate}
                    className="flex items-center gap-2 text-xs text-[#71717a] hover:text-[#a1a1aa] transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">Check for updates</span>
                  </button>
                )}
              </div>

              {/* Report bug */}
              <button
                onClick={() => window.electronAPI.openExternal('https://github.com/sscccswa/br/issues')}
                className="p-1 text-[#52525b] hover:text-[#a1a1aa] transition-colors flex-shrink-0"
                title="Report a bug"
              >
                <Bug className="w-3.5 h-3.5" />
              </button>

              {appVersion && (
                <span className="text-xs text-[#52525b] font-mono flex-shrink-0">v{appVersion}</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
