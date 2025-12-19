import * as fs from 'fs'
import * as path from 'path'
import { FileInfo, IndexMeta, FileStats } from '../shared/types'

export class Store {
  private indexDir: string
  private recentPath: string
  private recentFiles: FileInfo[] = []

  constructor(userDataPath: string) {
    this.indexDir = path.join(userDataPath, 'indexes')
    this.recentPath = path.join(userDataPath, 'recent.json')

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
    const metaPath = path.join(this.indexDir, `${fileId}.meta.json`)
    return fs.existsSync(metaPath)
  }

  getMeta(fileId: string): IndexMeta | null {
    try {
      const metaPath = path.join(this.indexDir, `${fileId}.meta.json`)
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    } catch {
      return null
    }
  }

  getStats(fileId: string): FileStats {
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

  removeRecentFile(fileId: string) {
    this.recentFiles = this.recentFiles.filter(f => f.id !== fileId)
    this.saveRecent()
  }

  clearIndexes() {
    const files = fs.readdirSync(this.indexDir)
    for (const file of files) {
      fs.unlinkSync(path.join(this.indexDir, file))
    }
    this.recentFiles = []
    this.saveRecent()
  }
}
