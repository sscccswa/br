/**
 * SQLite Database Manager using sql.js (WebAssembly-based, no native compilation needed)
 * Provides efficient indexed search with automatic memory management
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import * as path from 'path'
import * as fs from 'fs'

export interface SearchRecord {
  rowIndex: number
  position: number
  searchData: string
}

export class DatabaseManager {
  private dbPath: string
  private db: SqlJsDatabase | null = null
  private indexDir: string
  private sqlPromise: Promise<void> | null = null

  constructor(userDataPath: string) {
    this.indexDir = path.join(userDataPath, 'indexes')
    this.dbPath = path.join(userDataPath, 'search.db')

    if (!fs.existsSync(this.indexDir)) {
      fs.mkdirSync(this.indexDir, { recursive: true })
    }
  }

  private async initDatabase(): Promise<SqlJsDatabase> {
    if (this.db) return this.db

    if (this.sqlPromise) {
      await this.sqlPromise
      return this.db!
    }

    this.sqlPromise = (async () => {
      const SQL = await initSqlJs()

      // Try to load existing database
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath)
        this.db = new SQL.Database(buffer)
      } else {
        this.db = new SQL.Database()
      }

      // Create tables
      this.db.run(`
        CREATE TABLE IF NOT EXISTS file_indexes (
          file_id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          file_type TEXT NOT NULL,
          format TEXT,
          delimiter TEXT,
          indexed_at INTEGER NOT NULL,
          total_records INTEGER NOT NULL,
          columns TEXT NOT NULL,
          searchable_columns TEXT NOT NULL
        )
      `)

      this.db.run(`
        CREATE TABLE IF NOT EXISTS file_stats (
          file_id TEXT PRIMARY KEY,
          stats_json TEXT NOT NULL
        )
      `)

      this.db.run(`
        CREATE TABLE IF NOT EXISTS search_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_id TEXT NOT NULL,
          row_index INTEGER NOT NULL,
          position INTEGER NOT NULL,
          col0 TEXT,
          col1 TEXT,
          col2 TEXT,
          col3 TEXT,
          col4 TEXT,
          col5 TEXT
        )
      `)

      this.db.run(`CREATE INDEX IF NOT EXISTS idx_search_file_id ON search_data(file_id)`)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_search_col0 ON search_data(col0)`)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_search_col1 ON search_data(col1)`)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_search_col2 ON search_data(col2)`)

      this.saveToFile()
    })()

    await this.sqlPromise
    return this.db!
  }

  private saveToFile(): void {
    if (this.db) {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(this.dbPath, buffer)
    }
  }

  private getDbSync(): SqlJsDatabase | null {
    return this.db
  }

  async ensureReady(): Promise<void> {
    await this.initDatabase()
  }

  /**
   * Store file metadata
   */
  async saveFileMeta(meta: {
    fileId: string
    filePath: string
    fileName: string
    fileSize: number
    fileType: string
    format?: string
    delimiter?: string
    indexedAt: number
    totalRecords: number
    columns: string[]
    searchableColumns: string[]
  }): Promise<void> {
    const db = await this.initDatabase()

    db.run(
      `INSERT OR REPLACE INTO file_indexes
      (file_id, file_path, file_name, file_size, file_type, format, delimiter, indexed_at, total_records, columns, searchable_columns)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        meta.fileId,
        meta.filePath,
        meta.fileName,
        meta.fileSize,
        meta.fileType,
        meta.format || null,
        meta.delimiter || null,
        meta.indexedAt,
        meta.totalRecords,
        JSON.stringify(meta.columns),
        JSON.stringify(meta.searchableColumns),
      ]
    )

    this.saveToFile()
  }

  /**
   * Get file metadata
   */
  getFileMeta(fileId: string): {
    fileId: string
    filePath: string
    fileName: string
    fileSize: number
    fileType: string
    format?: string
    delimiter?: string
    indexedAt: number
    totalRecords: number
    columns: string[]
    searchableColumns: string[]
  } | null {
    const db = this.getDbSync()
    if (!db) return null

    const stmt = db.prepare('SELECT * FROM file_indexes WHERE file_id = ?')
    stmt.bind([fileId])

    if (stmt.step()) {
      const row = stmt.getAsObject()
      stmt.free()

      return {
        fileId: row.file_id as string,
        filePath: row.file_path as string,
        fileName: row.file_name as string,
        fileSize: row.file_size as number,
        fileType: row.file_type as string,
        format: (row.format as string) || undefined,
        delimiter: (row.delimiter as string) || undefined,
        indexedAt: row.indexed_at as number,
        totalRecords: row.total_records as number,
        columns: JSON.parse(row.columns as string),
        searchableColumns: JSON.parse(row.searchable_columns as string),
      }
    }

    stmt.free()
    return null
  }

  /**
   * Check if file is indexed
   */
  isIndexed(fileId: string): boolean {
    const db = this.getDbSync()
    if (!db) return false

    const stmt = db.prepare('SELECT 1 FROM file_indexes WHERE file_id = ?')
    stmt.bind([fileId])
    const exists = stmt.step()
    stmt.free()
    return exists
  }

  /**
   * Save file statistics
   */
  async saveFileStats(fileId: string, stats: object): Promise<void> {
    const db = await this.initDatabase()

    db.run(
      `INSERT OR REPLACE INTO file_stats (file_id, stats_json) VALUES (?, ?)`,
      [fileId, JSON.stringify(stats)]
    )

    this.saveToFile()
  }

  /**
   * Get file statistics
   */
  getFileStats(fileId: string): object | null {
    const db = this.getDbSync()
    if (!db) return null

    const stmt = db.prepare('SELECT stats_json FROM file_stats WHERE file_id = ?')
    stmt.bind([fileId])

    if (stmt.step()) {
      const row = stmt.getAsObject()
      stmt.free()
      return JSON.parse(row.stats_json as string)
    }

    stmt.free()
    return null
  }

  /**
   * Batch insert search data
   */
  async insertSearchData(
    fileId: string,
    data: Array<{ rowIndex: number; position: number; columns: string[] }>
  ): Promise<void> {
    const db = await this.initDatabase()

    db.run('BEGIN TRANSACTION')

    try {
      for (const item of data) {
        const cols = item.columns
        db.run(
          `INSERT INTO search_data (file_id, row_index, position, col0, col1, col2, col3, col4, col5)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fileId,
            item.rowIndex,
            item.position,
            cols[0]?.toLowerCase() || null,
            cols[1]?.toLowerCase() || null,
            cols[2]?.toLowerCase() || null,
            cols[3]?.toLowerCase() || null,
            cols[4]?.toLowerCase() || null,
            cols[5]?.toLowerCase() || null,
          ]
        )
      }

      db.run('COMMIT')
      this.saveToFile()
    } catch (error) {
      db.run('ROLLBACK')
      throw error
    }
  }

  /**
   * Begin batch insert for search data
   */
  beginSearchInsert(): {
    insert: (fileId: string, rowIndex: number, position: number, columns: string[]) => void
    commit: () => void
    rollback: () => void
  } {
    const buffer: Array<{
      fileId: string
      rowIndex: number
      position: number
      columns: string[]
    }> = []

    return {
      insert: (fileId, rowIndex, position, columns) => {
        buffer.push({ fileId, rowIndex, position, columns })
      },
      commit: () => {
        if (buffer.length > 0 && buffer[0]) {
          this.insertSearchData(buffer[0].fileId, buffer)
        }
      },
      rollback: () => {
        buffer.length = 0
      },
    }
  }

  /**
   * Get a page of row indices
   */
  getPage(
    fileId: string,
    page: number,
    limit: number,
    filters?: Record<string, string>
  ): { rowIndex: number; position: number }[] {
    const db = this.getDbSync()
    if (!db) return []

    const meta = this.getFileMeta(fileId)
    if (!meta) return []

    const offset = (page - 1) * limit
    let query = 'SELECT row_index, position FROM search_data WHERE file_id = ?'
    const params: (string | number)[] = [fileId]

    if (filters && Object.keys(filters).length > 0) {
      const searchableCols = meta.searchableColumns
      for (const [col, value] of Object.entries(filters)) {
        const colIndex = searchableCols.indexOf(col)
        if (colIndex >= 0 && colIndex < 6 && value) {
          query += ` AND col${colIndex} LIKE ?`
          params.push(`%${value.toLowerCase()}%`)
        }
      }
    }

    query += ' ORDER BY row_index LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const stmt = db.prepare(query)
    stmt.bind(params)

    const results: { rowIndex: number; position: number }[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject()
      results.push({
        rowIndex: row.row_index as number,
        position: row.position as number,
      })
    }
    stmt.free()

    return results
  }

  /**
   * Count matching records
   */
  countRecords(fileId: string, filters?: Record<string, string>): number {
    const db = this.getDbSync()
    if (!db) return 0

    const meta = this.getFileMeta(fileId)
    if (!meta) return 0

    let query = 'SELECT COUNT(*) as count FROM search_data WHERE file_id = ?'
    const params: (string | number)[] = [fileId]

    if (filters && Object.keys(filters).length > 0) {
      const searchableCols = meta.searchableColumns
      for (const [col, value] of Object.entries(filters)) {
        const colIndex = searchableCols.indexOf(col)
        if (colIndex >= 0 && colIndex < 6 && value) {
          query += ` AND col${colIndex} LIKE ?`
          params.push(`%${value.toLowerCase()}%`)
        }
      }
    }

    const stmt = db.prepare(query)
    stmt.bind(params)
    stmt.step()
    const row = stmt.getAsObject()
    stmt.free()

    return row.count as number
  }

  /**
   * Search records with advanced operators
   */
  search(
    fileId: string,
    fields: Record<string, string | { value: string; operator: string }>,
    exact: boolean,
    page: number,
    limit: number
  ): {
    results: Array<{ rowIndex: number; position: number; isExact: boolean }>
    exactCount: number
    partialCount: number
    total: number
  } {
    const db = this.getDbSync()
    if (!db) return { results: [], exactCount: 0, partialCount: 0, total: 0 }

    const meta = this.getFileMeta(fileId)
    if (!meta) return { results: [], exactCount: 0, partialCount: 0, total: 0 }

    const searchableCols = meta.searchableColumns
    const offset = (page - 1) * limit

    // Build search conditions
    const conditions: string[] = []
    const params: (string | number)[] = []

    for (const [col, fieldValue] of Object.entries(fields)) {
      let value: string
      let operator: string

      if (typeof fieldValue === 'string') {
        value = fieldValue
        operator = 'contains'
      } else {
        value = fieldValue.value
        operator = fieldValue.operator || 'contains'
      }

      if (!value || value.length < 1) continue

      const colIndex = searchableCols.indexOf(col)
      if (colIndex < 0 || colIndex >= 6) continue

      const colName = `col${colIndex}`
      const lowerValue = value.toLowerCase()

      switch (operator) {
        case 'equals':
          conditions.push(`${colName} = ?`)
          params.push(lowerValue)
          break

        case 'startsWith':
          conditions.push(`${colName} LIKE ?`)
          params.push(`${lowerValue}%`)
          break

        case 'endsWith':
          conditions.push(`${colName} LIKE ?`)
          params.push(`%${lowerValue}`)
          break

        case 'not':
          conditions.push(`(${colName} IS NULL OR ${colName} NOT LIKE ?)`)
          params.push(`%${lowerValue}%`)
          break

        case 'regex':
          const likePattern = this.regexToLike(value)
          conditions.push(`${colName} LIKE ?`)
          params.push(likePattern)
          break

        case 'contains':
        default:
          conditions.push(`${colName} LIKE ?`)
          params.push(`%${lowerValue}%`)
          break
      }
    }

    if (conditions.length === 0) {
      return { results: [], exactCount: 0, partialCount: 0, total: 0 }
    }

    // Count total matches
    const countQuery = `SELECT COUNT(*) as count FROM search_data WHERE file_id = ? AND ${conditions.join(' AND ')}`
    const countStmt = db.prepare(countQuery)
    countStmt.bind([fileId, ...params])
    countStmt.step()
    const countRow = countStmt.getAsObject()
    countStmt.free()
    const total = countRow.count as number

    // Get paginated results
    const searchQuery = `
      SELECT row_index, position FROM search_data
      WHERE file_id = ? AND ${conditions.join(' AND ')}
      ORDER BY row_index
      LIMIT ? OFFSET ?
    `
    const searchStmt = db.prepare(searchQuery)
    searchStmt.bind([fileId, ...params, limit, offset])

    const results: Array<{ rowIndex: number; position: number; isExact: boolean }> = []
    while (searchStmt.step()) {
      const row = searchStmt.getAsObject()
      results.push({
        rowIndex: row.row_index as number,
        position: row.position as number,
        isExact: exact,
      })
    }
    searchStmt.free()

    return {
      results,
      exactCount: exact ? total : 0,
      partialCount: exact ? 0 : total,
      total,
    }
  }

  /**
   * Convert simple regex patterns to SQLite LIKE patterns
   */
  private regexToLike(regex: string): string {
    let pattern = regex
      .toLowerCase()
      .replace(/\.\*/g, '%')
      .replace(/\./g, '_')
      .replace(/\^/g, '')
      .replace(/\$/g, '')

    if (!pattern.includes('%') && !pattern.includes('_')) {
      pattern = `%${pattern}%`
    }

    return pattern
  }

  /**
   * Delete all data for a file
   */
  async deleteFile(fileId: string): Promise<void> {
    const db = await this.initDatabase()

    db.run('DELETE FROM search_data WHERE file_id = ?', [fileId])
    db.run('DELETE FROM file_stats WHERE file_id = ?', [fileId])
    db.run('DELETE FROM file_indexes WHERE file_id = ?', [fileId])

    this.saveToFile()
  }

  /**
   * Get position by row index
   */
  getPosition(fileId: string, rowIndex: number): number | null {
    const db = this.getDbSync()
    if (!db) return null

    const stmt = db.prepare(
      'SELECT position FROM search_data WHERE file_id = ? AND row_index = ?'
    )
    stmt.bind([fileId, rowIndex])

    if (stmt.step()) {
      const row = stmt.getAsObject()
      stmt.free()
      return row.position as number
    }

    stmt.free()
    return null
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.saveToFile()
      this.db.close()
      this.db = null
    }
  }

  /**
   * Vacuum the database to reclaim space
   */
  async vacuum(): Promise<void> {
    const db = await this.initDatabase()
    db.run('VACUUM')
    this.saveToFile()
  }

  /**
   * Clear all data from the database
   */
  async clearAll(): Promise<void> {
    const db = await this.initDatabase()
    db.run('DELETE FROM search_data')
    db.run('DELETE FROM file_stats')
    db.run('DELETE FROM file_indexes')
    db.run('VACUUM')
    this.saveToFile()
  }
}

// Singleton instance
let dbInstance: DatabaseManager | null = null

export function getDatabase(userDataPath: string): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager(userDataPath)
  }
  return dbInstance
}
