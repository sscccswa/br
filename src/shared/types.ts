// File types
export type FileType = 'json' | 'csv' | 'vcf'

export interface FileInfo {
  id: string
  path: string
  name: string
  size: number
  type: FileType
  indexed: boolean
  indexedAt?: number
  totalRecords?: number
  columns?: string[]
}

export interface IndexProgress {
  fileId: string
  percent: number
  recordsProcessed: number
  totalEstimate: number
  eta: number // seconds remaining
  status: 'pending' | 'indexing' | 'complete' | 'error' | 'cancelled'
  error?: string
}

export interface IndexMeta {
  fileId: string
  filePath: string
  fileName: string
  fileSize: number
  fileType: FileType
  indexedAt: number
  totalRecords: number
  columns: string[]
  searchableColumns: string[]
}

export interface FileStats {
  total: number
  columns: Record<string, ColumnStats>
}

export interface ColumnStats {
  name: string
  type: 'string' | 'number' | 'date' | 'boolean'
  unique: number
  distribution?: Record<string, number> // top values
}

// Query types
export interface PageQuery {
  fileId: string
  page: number
  limit: number
  filters?: Record<string, string>
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface SearchQuery {
  fileId: string
  fields: Record<string, string>
  exact: boolean
  page: number
  limit: number
}

export interface PageResult {
  records: Record<string, unknown>[]
  page: number
  limit: number
  totalRecords: number
  totalPages: number
  from: number
  to: number
}

export interface SearchResult extends PageResult {
  exactCount: number
  partialCount: number
  searchTime: number
}

// Tab state
export interface Tab {
  id: string
  fileId: string
  fileName: string
  view: 'dashboard' | 'explorer'
  searchState?: SearchState
}

export interface SearchState {
  fields: Record<string, string>
  exact: boolean
  filters: Record<string, string>
  page: number
}

// IPC API exposed to renderer
export interface ElectronAPI {
  // File operations
  openFileDialog: () => Promise<string[] | null>
  getFileInfo: (path: string) => Promise<FileInfo>
  getRecentFiles: () => Promise<FileInfo[]>

  // Indexing
  startIndexing: (path: string) => Promise<void>
  cancelIndexing: (fileId: string) => Promise<void>
  onIndexProgress: (callback: (progress: IndexProgress) => void) => () => void

  // Data access
  getPage: (query: PageQuery) => Promise<PageResult>
  search: (query: SearchQuery) => Promise<SearchResult>
  getRecord: (fileId: string, index: number) => Promise<Record<string, unknown>>
  getStats: (fileId: string) => Promise<FileStats>

  // App
  getAppVersion: () => Promise<string>

  // Window controls
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>

  // Updates
  checkForUpdate: () => Promise<{ status: string; version?: string }>
  downloadUpdate: () => Promise<{ status: string }>
  installUpdate: () => Promise<void>
  onUpdateStatus: (callback: (status: { status: string; version?: string; percent?: number }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
