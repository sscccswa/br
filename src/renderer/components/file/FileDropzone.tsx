import { useState, useCallback } from 'react'
import { useAppStore } from '../../stores/app-store'
import { formatBytes, formatNumber, formatDuration } from '../../lib/utils'

interface FileDropzoneProps {
  file?: {
    info: import('../../../shared/types').FileInfo
    isIndexing: boolean
    indexProgress: import('../../../shared/types').IndexProgress | null
  }
}

export function FileDropzone({ file }: FileDropzoneProps) {
  const { addFile, setIndexing } = useAppStore()
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    for (const f of files) {
      if (f.name.endsWith('.json') || f.name.endsWith('.csv')) {
        const info = await window.electronAPI.getFileInfo(f.path)
        addFile(info)
      }
    }
  }, [addFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleOpenDialog = async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths && paths.length > 0) {
      for (const path of paths) {
        const info = await window.electronAPI.getFileInfo(path)
        addFile(info)
      }
    }
  }

  const handleStartIndexing = async () => {
    if (!file) return
    setIndexing(file.info.id, true)
    try {
      await window.electronAPI.startIndexing(file.info.path)
    } catch (error) {
      console.error('Indexing failed:', error)
      setIndexing(file.info.id, false)
    }
  }

  const handleCancelIndexing = async () => {
    if (!file) return
    await window.electronAPI.cancelIndexing(file.info.id)
  }

  // Show indexing progress
  if (file?.isIndexing && file.indexProgress) {
    const progress = file.indexProgress
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-slide-up">
          <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-[#fafafa]">Indexing...</h3>
                <p className="text-sm text-[#a1a1aa]">{file.info.name}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-[#a1a1aa]">
                  {formatNumber(progress.recordsProcessed)} records
                </span>
                <span className="text-[#fafafa] font-medium">{progress.percent}%</span>
              </div>

              {progress.eta > 0 && (
                <p className="text-xs text-[#71717a]">
                  Estimated time remaining: {formatDuration(progress.eta)}
                </p>
              )}

              <button
                onClick={handleCancelIndexing}
                className="w-full py-2 mt-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show file ready to index
  if (file && !file.info.indexed) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-slide-up">
          <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                file.info.type === 'json' ? 'bg-amber-500/20' : 'bg-emerald-500/20'
              }`}>
                <span className={`text-sm font-mono font-bold ${
                  file.info.type === 'json' ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {file.info.type.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-medium text-[#fafafa] truncate">{file.info.name}</h3>
                <p className="text-sm text-[#a1a1aa]">{formatBytes(file.info.size)}</p>
              </div>
            </div>

            <p className="text-sm text-[#71717a] mb-4">
              This file needs to be indexed before you can explore its contents.
              Indexing creates a search index for fast lookups.
            </p>

            <button
              onClick={handleStartIndexing}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
            >
              Start Indexing
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show dropzone
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`w-full max-w-xl aspect-video rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-4 ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-[#27272a] hover:border-[#3f3f46]'
        }`}
      >
        <div className="w-16 h-16 rounded-xl bg-[#18181b] flex items-center justify-center">
          <svg className="w-8 h-8 text-[#71717a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-[#fafafa] font-medium">
            Drop your JSON or CSV file here
          </p>
          <p className="text-sm text-[#71717a] mt-1">
            or{' '}
            <button
              onClick={handleOpenDialog}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              browse files
            </button>
          </p>
        </div>

        <div className="flex gap-2 mt-2">
          <span className="px-2 py-1 text-xs font-mono bg-amber-500/20 text-amber-400 rounded">
            .JSON
          </span>
          <span className="px-2 py-1 text-xs font-mono bg-emerald-500/20 text-emerald-400 rounded">
            .CSV
          </span>
        </div>
      </div>
    </div>
  )
}
