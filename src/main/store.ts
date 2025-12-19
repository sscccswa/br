import * as fs from 'fs'
import * as path from 'path'
import { FileInfo, IndexMeta, FileStats } from '../shared/types'
import { getDatabase, DatabaseManager } from './database'

export class Store {
  private indexDir: string
  private recentPath: string
  private recentFiles: FileInfo[] = []
  private db: DatabaseManager

  constructor(userDataPath: string) {
    this.indexDir = path.join(userDataPath, 'indexes')
    this.recentPath = path.join(userDataPath, 'recent.json')
    this.db = getDatabase(userDataPath)

    if (!fs.existsSync(this.indexDir)) {
      fs.mkdirSync(this.indexDir, { recursive: true })
    }

    this.loadRecent()
  }

  private loadRecent() {
    try {
      if (fs.existsSync(this.recentPath)) {
        this.recentFiles = JSON.parse(fs.readFileSync(this.recentPath, 'utf-8'))
        // Filter out files that no longer exist
        this.recentFiles = this.recentFiles.filter(f => fs.existsSync(f.path))
      }
    } catch {
      this.recentFiles = []
    }
  }

  private saveRecent() {
    fs.writeFileSync(this.recentPath, JSON.stringify(this.recentFiles, null, 2))
  }

  isIndexed(fileId: string): boolean {
    // Check if index files actually exist
    const indexPath = path.join(this.indexDir, `${fileId}.index.bin`)
    if (!fs.existsSync(indexPath)) {
      // Index files don't exist - clean up any stale DB entries
      this.db.deleteFile(fileId).catch(() => {})
      return false
    }

    // Check SQLite
    if (this.db.isIndexed(fileId)) {
      return true
    }

    // Fallback to meta file check
    const metaPath = path.join(this.indexDir, `${fileId}.meta.json`)
    return fs.existsSync(metaPath)
  }

  getMeta(fileId: string): IndexMeta | null {
    // Try SQLite first
    const dbMeta = this.db.getFileMeta(fileId)
    if (dbMeta) {
      return {
        fileId: dbMeta.fileId,
        filePath: dbMeta.filePath,
        fileName: dbMeta.fileName,
        fileSize: dbMeta.fileSize,
        fileType: dbMeta.fileType as 'json' | 'csv' | 'vcf',
        indexedAt: dbMeta.indexedAt,
        totalRecords: dbMeta.totalRecords,
        columns: dbMeta.columns,
        searchableColumns: dbMeta.searchableColumns,
      }
    }

    // Fallback to file
    try {
      const metaPath = path.join(this.indexDir, `${fileId}.meta.json`)
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    } catch {
      return null
    }
  }

  getStats(fileId: string): FileStats {
    // Try SQLite first
    const dbStats = this.db.getFileStats(fileId)
    if (dbStats) {
      return dbStats as FileStats
    }

    // Fallback to file
    try {
      const statsPath = path.join(this.indexDir, `${fileId}.stats.json`)
      return JSON.parse(fs.readFileSync(statsPath, 'utf-8'))
    } catch {
      return { total: 0, columns: {} }
    }
  }

  addRecentFile(file: FileInfo) {
    // Remove if already exists
    this.recentFiles = this.recentFiles.filter(f => f.id !== file.id)

    // Add at beginning
    this.recentFiles.unshift(file)

    // Keep only last 20
    this.recentFiles = this.recentFiles.slice(0, 20)

    this.saveRecent()
  }

  getRecentFiles(): FileInfo[] {
    return this.recentFiles
  }

  async removeRecentFile(fileId: string) {
    this.recentFiles = this.recentFiles.filter(f => f.id !== fileId)
    this.saveRecent()
    // Also delete the index data
    await this.deleteIndex(fileId)
  }

  async clearIndexes() {
    const files = fs.readdirSync(this.indexDir)
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(this.indexDir, file))
      } catch (e) {
        console.error(`Failed to delete ${file}:`, e)
      }
    }
    this.recentFiles = []
    this.saveRecent()

    // Clear all data from the database
    await this.db.clearAll()
  }

  async deleteIndex(fileId: string) {
    // Delete from SQLite
    await this.db.deleteFile(fileId)

    // Delete legacy files
    const extensions = ['.meta.json', '.index.bin', '.search.txt', '.stats.json']
    for (const ext of extensions) {
      const filePath = path.join(this.indexDir, `${fileId}${ext}`)
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath)
        } catch (e) {
          console.error(`Failed to delete ${filePath}:`, e)
        }
      }
    }
  }
}
