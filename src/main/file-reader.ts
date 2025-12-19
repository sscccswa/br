import * as fs from 'fs'
import * as path from 'path'
import { PageQuery, SearchQuery, PageResult, SearchResult, IndexMeta } from '../shared/types'
import { getDatabase, DatabaseManager } from './database'

// LRU Cache for file handles and buffers
class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private readonly maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value as K
      this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }

  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }
}

export class FileReader {
  private indexDir: string
  private db: DatabaseManager
  private positionsCache: LRUCache<string, Buffer> = new LRUCache(10)
  private metaCache: LRUCache<string, IndexMeta> = new LRUCache(20)
  private recordCache: LRUCache<string, Record<string, unknown>> = new LRUCache(1000)

  constructor(userDataPath: string) {
    this.indexDir = path.join(userDataPath, 'indexes')
    this.db = getDatabase(userDataPath)
  }

  private getMeta(fileId: string): IndexMeta {
    const cached = this.metaCache.get(fileId)
    if (cached) return cached

    // Try SQLite first
    const dbMeta = this.db.getFileMeta(fileId)
    if (dbMeta) {
      const meta: IndexMeta = {
        fileId: dbMeta.fileId,
        filePath: dbMeta.filePath,
        fileName: dbMeta.fileName,
        fileSize: dbMeta.fileSize,
        fileType: dbMeta.fileType as 'json' | 'csv' | 'vcf',
        indexedAt: dbMeta.indexedAt,
        totalRecords: dbMeta.totalRecords,
        columns: dbMeta.columns,
        searchableColumns: dbMeta.searchableColumns,
        format: dbMeta.format,
        delimiter: dbMeta.delimiter,
      } as IndexMeta & { format?: string; delimiter?: string }
      this.metaCache.set(fileId, meta)
      return meta
    }

    // Fallback to file
    const metaPath = path.join(this.indexDir, `${fileId}.meta.json`)
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    this.metaCache.set(fileId, meta)

    // Import to SQLite for future use
    this.importToSQLite(fileId, meta)

    return meta
  }

  private getPositions(fileId: string): Buffer {
    const cached = this.positionsCache.get(fileId)
    if (cached) return cached

    const indexPath = path.join(this.indexDir, `${fileId}.index.bin`)
    const buffer = fs.readFileSync(indexPath)
    this.positionsCache.set(fileId, buffer)
    return buffer
  }

  private getPosition(positions: Buffer, index: number): number {
    return positions.readUIntLE(index * 6, 6)
  }

  /**
   * Import legacy file data to SQLite
   */
  private importToSQLite(fileId: string, meta: IndexMeta): void {
    if (this.db.isIndexed(fileId)) return

    // Save meta
    this.db.saveFileMeta({
      fileId: meta.fileId,
      filePath: meta.filePath,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      fileType: meta.fileType,
      format: (meta as unknown as { format?: string }).format,
      delimiter: (meta as unknown as { delimiter?: string }).delimiter,
      indexedAt: meta.indexedAt,
      totalRecords: meta.totalRecords,
      columns: meta.columns,
      searchableColumns: meta.searchableColumns,
    })

    // Import search data
    const searchPath = path.join(this.indexDir, `${fileId}.search.txt`)
    const positionsPath = path.join(this.indexDir, `${fileId}.index.bin`)

    if (fs.existsSync(searchPath) && fs.existsSync(positionsPath)) {
      const searchContent = fs.readFileSync(searchPath, 'utf-8')
      const lines = searchContent.split('\n')
      const positions = fs.readFileSync(positionsPath)

      const batch = this.db.beginSearchInsert()

      for (let i = 0; i < lines.length; i++) {
        const cols = lines[i].split('|')
        const position = positions.readUIntLE(i * 6, 6)
        batch.insert(fileId, i, position, cols)
      }

      batch.commit()
    }

    // Import stats
    const statsPath = path.join(this.indexDir, `${fileId}.stats.json`)
    if (fs.existsSync(statsPath)) {
      const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'))
      this.db.saveFileStats(fileId, stats)
    }
  }

  private readRecordAt(fd: number, positions: Buffer, index: number, totalRecords: number, meta: IndexMeta & { format?: string; delimiter?: string }): Record<string, unknown> | null {
    // Check cache first
    const cacheKey = `${meta.fileId}:${index}`
    const cached = this.recordCache.get(cacheKey)
    if (cached) return cached

    const pos = this.getPosition(positions, index)
    const nextPos = index + 1 < totalRecords ? this.getPosition(positions, index + 1) : pos + 16384
    const maxLen = Math.min(nextPos - pos + 500, 32768)

    const buffer = Buffer.alloc(maxLen)
    try {
      fs.readSync(fd, buffer, 0, maxLen, pos)
      const str = buffer.toString('utf-8')

      let record: Record<string, unknown> | null = null

      if (meta.fileType === 'csv') {
        let endIdx = str.indexOf('\n')
        let line = endIdx !== -1 ? str.slice(0, endIdx) : str
        if (line.endsWith('\r')) {
          line = line.slice(0, -1)
        }
        const delimiter = meta.delimiter || ','
        const values = this.parseCSVLine(line, delimiter)

        record = {}
        meta.columns.forEach((col: string, i: number) => {
          record![col] = values[i] || ''
        })
      } else if (meta.format === 'json-array') {
        const obj = this.extractJSONObject(str)
        if (obj) {
          record = {}
          for (const [key, val] of Object.entries(obj)) {
            if (val === null || typeof val !== 'object') {
              record[key] = val
            } else if (Array.isArray(val)) {
              record[key] = JSON.stringify(val)
            }
          }
        }
      } else if (meta.format === 'vcf' || meta.fileType === 'vcf') {
        const endMarker = str.indexOf('END:VCARD')
        if (endMarker === -1) return null

        const vCardStr = str.slice(0, endMarker + 9)
        record = this.parseVCard(vCardStr)
      } else {
        // NDJSON format
        let endIdx = str.indexOf('\n')
        let line = endIdx !== -1 ? str.slice(0, endIdx) : str
        if (line.endsWith('\r')) {
          line = line.slice(0, -1)
        }
        line = line.trim()
        if (line.startsWith('{')) {
          const obj = JSON.parse(line)
          record = {}
          for (const [key, val] of Object.entries(obj)) {
            if (val === null || typeof val !== 'object') {
              record[key] = val
            } else if (Array.isArray(val)) {
              record[key] = JSON.stringify(val)
            }
          }
        }
      }

      if (record) {
        this.recordCache.set(cacheKey, record)
      }
      return record
    } catch (e) {
      console.error('Read error at index', index, 'pos', pos, e)
    }
    return null
  }

  private extractJSONObject(str: string): Record<string, unknown> | null {
    let depth = 0
    let inString = false
    let escapeNext = false
    let start = -1

    for (let i = 0; i < str.length; i++) {
      const char = str[i]

      if (escapeNext) {
        escapeNext = false
        continue
      }

      if (char === '\\' && inString) {
        escapeNext = true
        continue
      }

      if (char === '"' && !escapeNext) {
        inString = !inString
        continue
      }

      if (inString) continue

      if (char === '{') {
        if (depth === 0) start = i
        depth++
      } else if (char === '}') {
        depth--
        if (depth === 0 && start !== -1) {
          try {
            return JSON.parse(str.slice(start, i + 1))
          } catch {
            return null
          }
        }
      }
    }
    return null
  }

  private parseCSVLine(line: string, delimiter: string = ','): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    let i = 0

    while (i < line.length) {
      const char = line[i]

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"'
          i += 2
          continue
        }
        inQuotes = !inQuotes
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
      i++
    }
    result.push(current.trim())
    return result
  }

  private parseVCard(vCardStr: string): Record<string, unknown> {
    const record: Record<string, unknown> = {}

    const unfoldedStr = vCardStr.replace(/\r?\n[ \t]/g, '')
    const lines = unfoldedStr.split(/\r?\n/)

    for (const line of lines) {
      if (!line.includes(':') || line === 'BEGIN:VCARD' || line === 'END:VCARD' || line.startsWith('VERSION:')) continue

      const colonIdx = line.indexOf(':')
      let key = line.slice(0, colonIdx).toUpperCase()
      const value = line.slice(colonIdx + 1)

      if (key.includes(';')) {
        key = key.split(';')[0]
      }

      if (!record[key]) {
        record[key] = value
      } else if (key === 'EMAIL' || key === 'TEL') {
        record[key] = record[key] + ', ' + value
      }
    }

    return record
  }

  async getPage(query: PageQuery): Promise<PageResult> {
    // Ensure database is ready before querying
    await this.db.ensureReady()

    const meta = this.getMeta(query.fileId)
    const positions = this.getPositions(query.fileId)
    const { page, limit, filters } = query

    // Use SQLite for filtered/paginated queries
    const results = this.db.getPage(query.fileId, page, limit, filters)
    const total = this.db.countRecords(query.fileId, filters)

    const records: Record<string, unknown>[] = []
    const fd = fs.openSync(meta.filePath, 'r')

    for (const { rowIndex, position } of results) {
      const record = this.readRecordAt(fd, positions, rowIndex, meta.totalRecords, meta as IndexMeta & { format?: string; delimiter?: string })
      if (record) {
        records.push({ ...record, _index: rowIndex })
      }
    }

    fs.closeSync(fd)

    const start = (page - 1) * limit

    return {
      records,
      page,
      limit,
      totalRecords: total,
      totalPages: Math.ceil(total / limit),
      from: start + 1,
      to: Math.min(start + limit, total),
    }
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    // Ensure database is ready before querying
    await this.db.ensureReady()

    const startTime = Date.now()
    const meta = this.getMeta(query.fileId)
    const positions = this.getPositions(query.fileId)

    // Use SQLite for search
    const searchResult = this.db.search(
      query.fileId,
      query.fields,
      query.exact,
      query.page,
      query.limit
    )

    const records: Record<string, unknown>[] = []
    const fd = fs.openSync(meta.filePath, 'r')

    for (const { rowIndex, isExact } of searchResult.results) {
      const record = this.readRecordAt(fd, positions, rowIndex, meta.totalRecords, meta as IndexMeta & { format?: string; delimiter?: string })
      if (record) {
        records.push({
          ...record,
          _index: rowIndex,
          _exact: isExact,
        })
      }
    }

    fs.closeSync(fd)

    const start = (query.page - 1) * query.limit

    return {
      records,
      page: query.page,
      limit: query.limit,
      totalRecords: searchResult.total,
      totalPages: Math.ceil(searchResult.total / query.limit),
      from: start + 1,
      to: Math.min(start + query.limit, searchResult.total),
      exactCount: searchResult.exactCount,
      partialCount: searchResult.partialCount,
      searchTime: Date.now() - startTime,
    }
  }

  async getRecord(fileId: string, index: number): Promise<Record<string, unknown>> {
    // Ensure database is ready before querying
    await this.db.ensureReady()

    const meta = this.getMeta(fileId)
    const positions = this.getPositions(fileId)
    const fd = fs.openSync(meta.filePath, 'r')
    const record = this.readRecordAt(fd, positions, index, meta.totalRecords, meta as IndexMeta & { format?: string; delimiter?: string })
    fs.closeSync(fd)
    return record || {}
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.metaCache.clear()
    this.positionsCache.clear()
    this.recordCache.clear()
  }

  /**
   * Invalidate cache for a specific file
   */
  invalidateFile(fileId: string): void {
    this.metaCache.delete(fileId)
    this.positionsCache.delete(fileId)
    // Clear record cache entries for this file
    // (The LRU cache doesn't support prefix deletion, so we clear all)
    this.recordCache.clear()
  }
}
