import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { FileInfo, FileType, PageQuery, SearchQuery, IndexProgress, FileStats } from '../shared/types'
import { Indexer } from './indexer'
import { FileReader } from './file-reader'
import { Store } from './store'

let store: Store
let indexer: Indexer
let fileReader: FileReader

export function setupIpcHandlers(mainWindow: BrowserWindow) {
  const userDataPath = app.getPath('userData')
  store = new Store(userDataPath)
  indexer = new Indexer(userDataPath, (progress) => {
    mainWindow.webContents.send('index:progress', progress)
  })
  fileReader = new FileReader(userDataPath)

  // File dialog
  ipcMain.handle('file:open-dialog', async () => {
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
  })

  // Get file info
  ipcMain.handle('file:info', async (_, filePath: string): Promise<FileInfo> => {
    const stats = fs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase().slice(1)
    const fileId = generateFileId(filePath, stats.size, stats.mtimeMs)
    const indexed = store.isIndexed(fileId)
    const meta = indexed ? store.getMeta(fileId) : null

    const fileType: FileType = ext === 'json' ? 'json' : ext === 'vcf' ? 'vcf' : 'csv'

    return {
      id: fileId,
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      type: fileType,
      indexed,
      indexedAt: meta?.indexedAt,
      totalRecords: meta?.totalRecords,
      columns: meta?.columns,
    }
  })

  // Get recent files
  ipcMain.handle('file:recent', async (): Promise<FileInfo[]> => {
    return store.getRecentFiles()
  })

  // Start indexing
  ipcMain.handle('index:start', async (_, filePath: string) => {
    const stats = fs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase().slice(1)
    const fileId = generateFileId(filePath, stats.size, stats.mtimeMs)
    await indexer.indexFile(filePath, fileId)

    const fileType: FileType = ext === 'json' ? 'json' : ext === 'vcf' ? 'vcf' : 'csv'

    // Add to recent files after indexing
    const meta = store.getMeta(fileId)
    if (meta) {
      store.addRecentFile({
        id: fileId,
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        type: fileType,
        indexed: true,
        indexedAt: meta.indexedAt,
        totalRecords: meta.totalRecords,
        columns: meta.columns,
      })
    }
  })

  // Cancel indexing
  ipcMain.handle('index:cancel', async (_, fileId: string) => {
    indexer.cancel(fileId)
  })

  // Get page of data
  ipcMain.handle('data:page', async (_, query: PageQuery) => {
    return fileReader.getPage(query)
  })

  // Search
  ipcMain.handle('data:search', async (_, query: SearchQuery) => {
    return fileReader.search(query)
  })

  // Get single record
  ipcMain.handle('data:record', async (_, fileId: string, index: number) => {
    return fileReader.getRecord(fileId, index)
  })

  // Get stats
  ipcMain.handle('data:stats', async (_, fileId: string): Promise<FileStats> => {
    return store.getStats(fileId)
  })

  // App version
  ipcMain.handle('app:version', async () => {
    return app.getVersion()
  })

  // Window controls
  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    mainWindow.close()
  })
}

function generateFileId(filePath: string, size: number, mtime: number): string {
  const hash = crypto.createHash('md5')
  hash.update(`${filePath}:${size}:${mtime}`)
  return hash.digest('hex').slice(0, 16)
}
