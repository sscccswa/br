import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { FileInfo, FileType, PageQuery, SearchQuery, IndexProgress, FileStats, ExportOptions } from '../shared/types'
import { Indexer } from './indexer'
import { FileReader } from './file-reader'
import { Store } from './store'
import {
  ValidationError,
  validateFilePath,
  validateFileId,
  validatePageQuery,
  validateSearchQuery,
  validateIndex,
  validateFileExtension,
} from './ipc-validator'

let store: Store
let indexer: Indexer
let fileReader: FileReader

/**
 * Wraps an IPC handler with error handling
 */
function safeHandler<T>(
  handler: (...args: unknown[]) => Promise<T> | T
): (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<T | { error: string }> {
  return async (event, ...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('[IPC Error]', message)

      // For validation errors, return a structured error
      if (error instanceof ValidationError) {
        return { error: `Validation error: ${message}` } as unknown as T
      }

      // For other errors, return a generic error
      return { error: message } as unknown as T
    }
  }
}

export function setupIpcHandlers(mainWindow: BrowserWindow) {
  const userDataPath = app.getPath('userData')
  store = new Store(userDataPath)
  indexer = new Indexer(userDataPath, (progress) => {
    mainWindow.webContents.send('index:progress', progress)
  })
  fileReader = new FileReader(userDataPath)

  // File dialog
  ipcMain.handle('file:open-dialog', safeHandler(async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Data Files', extensions: ['json', 'csv', 'vcf'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: 'vCard', extensions: ['vcf'] },
      ],
    })
    return result.canceled ? null : result.filePaths
  }))

  // Get file info
  ipcMain.handle('file:info', safeHandler(async (filePath: unknown): Promise<FileInfo> => {
    const validPath = validateFilePath(filePath)

    // Additional validation for allowed extensions
    if (!validateFileExtension(validPath)) {
      throw new ValidationError('File type not supported. Allowed: .json, .csv, .vcf')
    }

    const stats = fs.statSync(validPath)
    const ext = path.extname(validPath).toLowerCase().slice(1)
    const fileId = generateFileId(validPath, stats.size, stats.mtimeMs)
    const indexed = store.isIndexed(fileId)
    const meta = indexed ? store.getMeta(fileId) : null

    const fileType: FileType = ext === 'json' ? 'json' : ext === 'vcf' ? 'vcf' : 'csv'

    return {
      id: fileId,
      path: validPath,
      name: path.basename(validPath),
      size: stats.size,
      type: fileType,
      indexed,
      indexedAt: meta?.indexedAt,
      totalRecords: meta?.totalRecords,
      columns: meta?.columns,
    }
  }))

  // Get recent files
  ipcMain.handle('file:recent', safeHandler(async (): Promise<FileInfo[]> => {
    return store.getRecentFiles()
  }))

  // Remove recent file
  ipcMain.handle('file:remove-recent', safeHandler(async (fileId: unknown) => {
    const validFileId = validateFileId(fileId)
    await store.removeRecentFile(validFileId)
  }))

  // Clear all recent files and indexes
  ipcMain.handle('file:clear-all', safeHandler(async () => {
    await store.clearIndexes()
  }))

  // Start indexing
  ipcMain.handle('index:start', safeHandler(async (filePath: unknown) => {
    const validPath = validateFilePath(filePath)

    if (!validateFileExtension(validPath)) {
      throw new ValidationError('File type not supported. Allowed: .json, .csv, .vcf')
    }

    const stats = fs.statSync(validPath)
    const ext = path.extname(validPath).toLowerCase().slice(1)
    const fileId = generateFileId(validPath, stats.size, stats.mtimeMs)
    await indexer.indexFile(validPath, fileId)

    const fileType: FileType = ext === 'json' ? 'json' : ext === 'vcf' ? 'vcf' : 'csv'

    // Add to recent files after indexing
    const meta = store.getMeta(fileId)
    if (meta) {
      store.addRecentFile({
        id: fileId,
        path: validPath,
        name: path.basename(validPath),
        size: stats.size,
        type: fileType,
        indexed: true,
        indexedAt: meta.indexedAt,
        totalRecords: meta.totalRecords,
        columns: meta.columns,
      })
    }
  }))

  // Cancel indexing
  ipcMain.handle('index:cancel', safeHandler(async (fileId: unknown) => {
    const validFileId = validateFileId(fileId)
    indexer.cancel(validFileId)
  }))

  // Get page of data
  ipcMain.handle('data:page', safeHandler(async (query: unknown) => {
    const validQuery = validatePageQuery(query)
    return fileReader.getPage(validQuery)
  }))

  // Search
  ipcMain.handle('data:search', safeHandler(async (query: unknown) => {
    const validQuery = validateSearchQuery(query)
    return fileReader.search(validQuery)
  }))

  // Get single record
  ipcMain.handle('data:record', safeHandler(async (fileId: unknown, index: unknown) => {
    const validFileId = validateFileId(fileId)
    const validIndex = validateIndex(index)
    return fileReader.getRecord(validFileId, validIndex)
  }))

  // Get stats
  ipcMain.handle('data:stats', safeHandler(async (fileId: unknown): Promise<FileStats> => {
    const validFileId = validateFileId(fileId)
    return store.getStats(validFileId)
  }))

  // Export data
  ipcMain.handle('data:export', safeHandler(async (options: unknown): Promise<{ success: boolean; path?: string; error?: string }> => {
    const opts = options as ExportOptions
    const validFileId = validateFileId(opts.fileId)

    // Show save dialog
    const meta = store.getMeta(validFileId)
    if (!meta) {
      throw new ValidationError('File not found')
    }

    const defaultName = `${meta.fileName.replace(/\.[^.]+$/, '')}_export`
    const extension = opts.format === 'json' ? 'json' : 'csv'

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${defaultName}.${extension}`,
      filters: [
        opts.format === 'json'
          ? { name: 'JSON', extensions: ['json'] }
          : { name: 'CSV', extensions: ['csv'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Export cancelled' }
    }

    // Get data to export
    const allRecords: Record<string, unknown>[] = []
    const pageSize = 1000
    let page = 1
    let hasMore = true
    const maxRecords = opts.limit || Infinity

    while (hasMore && allRecords.length < maxRecords) {
      let pageResult

      if (opts.searchFields && Object.keys(opts.searchFields).length > 0) {
        // Search mode
        pageResult = await fileReader.search({
          fileId: validFileId,
          fields: opts.searchFields,
          exact: opts.searchExact || false,
          page,
          limit: Math.min(pageSize, maxRecords - allRecords.length),
        })
      } else {
        // Browse mode (with optional filters)
        pageResult = await fileReader.getPage({
          fileId: validFileId,
          page,
          limit: Math.min(pageSize, maxRecords - allRecords.length),
          filters: opts.filters,
        })
      }

      for (const record of pageResult.records) {
        // Remove internal fields
        const cleanRecord = { ...record }
        delete cleanRecord._index
        delete cleanRecord._exact
        allRecords.push(cleanRecord)
      }

      hasMore = page < pageResult.totalPages
      page++
    }

    // Write file
    if (opts.format === 'json') {
      fs.writeFileSync(result.filePath, JSON.stringify(allRecords, null, 2))
    } else {
      // CSV format
      if (allRecords.length === 0) {
        fs.writeFileSync(result.filePath, '')
      } else {
        const headers = Object.keys(allRecords[0])
        const csvLines = [headers.join(',')]

        for (const record of allRecords) {
          const values = headers.map(h => {
            const val = record[h]
            if (val === null || val === undefined) return ''
            const str = String(val)
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          csvLines.push(values.join(','))
        }

        fs.writeFileSync(result.filePath, csvLines.join('\n'))
      }
    }

    return { success: true, path: result.filePath }
  }))

  // App version
  ipcMain.handle('app:version', safeHandler(async () => {
    return app.getVersion()
  }))

  // Window controls
  ipcMain.handle('window:minimize', safeHandler(() => {
    mainWindow.minimize()
  }))

  ipcMain.handle('window:maximize', safeHandler(() => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }))

  ipcMain.handle('window:close', safeHandler(() => {
    mainWindow.close()
  }))
}

function generateFileId(filePath: string, size: number, mtime: number): string {
  const hash = crypto.createHash('md5')
  hash.update(`${filePath}:${size}:${mtime}`)
  return hash.digest('hex').slice(0, 16)
}
