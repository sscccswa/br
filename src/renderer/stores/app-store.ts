import { create } from 'zustand'
import { FileInfo, IndexProgress, FileStats } from '../../shared/types'

interface OpenFile {
  info: FileInfo
  stats: FileStats | null
  isIndexing: boolean
  indexProgress: IndexProgress | null
}

interface AppState {
  files: Map<string, OpenFile>
  activeFileId: string | null
  recentFiles: FileInfo[]

  // Actions
  setActiveFile: (fileId: string | null) => void
  addFile: (info: FileInfo) => void
  removeFile: (fileId: string) => void
  updateFileStats: (fileId: string, stats: FileStats) => void
  setIndexing: (fileId: string, isIndexing: boolean) => void
  setIndexProgress: (fileId: string, progress: IndexProgress | null) => void
  setRecentFiles: (files: FileInfo[]) => void
  removeRecentFile: (fileId: string) => void
  updateFileInfo: (fileId: string, info: Partial<FileInfo>) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  files: new Map(),
  activeFileId: null,
  recentFiles: [],

  setActiveFile: (fileId) => set({ activeFileId: fileId }),

  addFile: (info) => set((state) => {
    const files = new Map(state.files)
    if (!files.has(info.id)) {
      files.set(info.id, {
        info,
        stats: null,
        isIndexing: false,
        indexProgress: null,
      })
    }
    return { files, activeFileId: info.id }
  }),

  removeFile: (fileId) => set((state) => {
    const files = new Map(state.files)
    files.delete(fileId)
    const activeFileId = state.activeFileId === fileId
      ? (files.size > 0 ? files.keys().next().value : null)
      : state.activeFileId
    return { files, activeFileId }
  }),

  updateFileStats: (fileId, stats) => set((state) => {
    const files = new Map(state.files)
    const file = files.get(fileId)
    if (file) {
      files.set(fileId, { ...file, stats })
    }
    return { files }
  }),

  setIndexing: (fileId, isIndexing) => set((state) => {
    const files = new Map(state.files)
    const file = files.get(fileId)
    if (file) {
      files.set(fileId, { ...file, isIndexing })
    }
    return { files }
  }),

  setIndexProgress: (fileId, progress) => set((state) => {
    const files = new Map(state.files)
    const file = files.get(fileId)
    if (file) {
      files.set(fileId, { ...file, indexProgress: progress })
    }
    return { files }
  }),

  setRecentFiles: (files) => set({ recentFiles: files }),

  removeRecentFile: (fileId) => set((state) => ({
    recentFiles: state.recentFiles.filter(f => f.id !== fileId)
  })),

  updateFileInfo: (fileId, info) => set((state) => {
    const files = new Map(state.files)
    const file = files.get(fileId)
    if (file) {
      files.set(fileId, { ...file, info: { ...file.info, ...info } })
    }
    return { files }
  }),
}))
