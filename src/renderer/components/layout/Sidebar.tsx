import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'
import { formatBytes, formatNumber } from '../../lib/utils'
import { FileInfo } from '../../../shared/types'

type UpdateStatus = 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error' | 'dev' | null

export function Sidebar() {
  const { recentFiles, addFile, setActiveFile } = useAppStore()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(null)
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [downloadPercent, setDownloadPercent] = useState(0)

  useEffect(() => {
    const unsubscribe = window.electronAPI.onUpdateStatus((data) => {
      setUpdateStatus(data.status as UpdateStatus)
      if (data.version) setUpdateVersion(data.version)
      if (data.percent) setDownloadPercent(data.percent)
    })
    return unsubscribe
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
            <div className="px-3 py-2">
              <span className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Recent Files</span>
            </div>
            <div className="space-y-0.5">
              {recentFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => handleRecentClick(file)}
                  className="w-full px-3 py-2 text-left hover:bg-[#27272a] transition-colors group"
                >
                  <div className="flex items-center gap-2">
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
              ))}
              {recentFiles.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-[#71717a]">
                  No recent files
                </div>
              )}
            </div>
          </div>

          {/* Update status */}
          <div className="border-t border-[#27272a] p-3">
            {updateStatus === 'checking' && (
              <div className="flex items-center gap-2 text-xs text-[#71717a]">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Recherche de mises à jour...</span>
              </div>
            )}
            {updateStatus === 'up-to-date' && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>À jour</span>
              </div>
            )}
            {updateStatus === 'available' && (
              <button
                onClick={() => window.electronAPI.downloadUpdate()}
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Mise à jour disponible {updateVersion && `(${updateVersion})`}</span>
              </button>
            )}
            {updateStatus === 'downloading' && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Téléchargement... {Math.round(downloadPercent)}%</span>
                </div>
                <div className="h-1 bg-[#27272a] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${downloadPercent}%` }} />
                </div>
              </div>
            )}
            {updateStatus === 'ready' && (
              <button
                onClick={() => window.electronAPI.installUpdate()}
                className="flex items-center gap-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Redémarrer pour installer</span>
              </button>
            )}
            {(updateStatus === null || updateStatus === 'error' || updateStatus === 'dev') && (
              <div className="flex items-center gap-2 text-xs text-[#52525b]">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>v1.0.0</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
