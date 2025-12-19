import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { PageQuery, SearchQuery, PageResult, SearchResult, IndexMeta } from '../shared/types'

export class FileReader {
  private indexDir: string
  private metaCache: Map<string, IndexMeta> = new Map()
  private positionsCache: Map<string, Buffer> = new Map()
  private searchLinesCache: Map<string, string[]> = new Map()

  constructor(userDataPath: string) {
    this.indexDir = path.join(userDataPath, 'indexes')
  }

  private getMeta(fileId: string): IndexMeta {
    if (!this.metaCache.has(fileId)) {
      const metaPath = path.join(this.indexDir, `${fileId}.meta.json`)
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      this.metaCache.set(fileId, meta)
    }
    return this.metaCache.get(fileId)!
  }

  private getPositions(fileId: string): Buffer {
    if (!this.positionsCache.has(fileId)) {
      const indexPath = path.join(this.indexDir, `${fileId}.index.bin`)
      this.positionsCache.set(fileId, fs.readFileSync(indexPath))
    }
    return this.positionsCache.get(fileId)!
  }

  private async getSearchLines(fileId: string): Promise<string[]> {
    if (!this.searchLinesCache.has(fileId)) {
      const searchPath = path.join(this.indexDir, `${fileId}.search.txt`)
      const content = fs.readFileSync(searchPath, 'utf-8')
      this.searchLinesCache.set(fileId, content.split('\n'))
    }
    return this.searchLinesCache.get(fileId)!
  }

  private getPosition(positions: Buffer, index: number): number {
    return positions.readUIntLE(index * 6, 6)
  }

  private readRecordAt(fd: number, positions: Buffer, index: number, totalRecords: number, meta: any): Record<string, unknown> | null {
    const pos = this.getPosition(positions, index)
    const nextPos = index + 1 < totalRecords ? this.getPosition(positions, index + 1) : pos + 16384
    const maxLen = Math.min(nextPos - pos + 500, 32768)

    const buffer = Buffer.alloc(maxLen)
    try {
      fs.readSync(fd, buffer, 0, maxLen, pos)
      const str = buffer.toString('utf-8')

      if (meta.fileType === 'csv') {
        // Find end of line (handle both \n and \r\n)
        let endIdx = str.indexOf('\n')
        let line = endIdx !== -1 ? str.slice(0, endIdx) : str
        // Remove trailing \r if present
        if (line.endsWith('\r')) {
          line = line.slice(0, -1)
        }
        const delimiter = meta.delimiter || ','
        const values = this.parseCSVLine(line, delimiter)

        const record: Record<string, unknown> = {}
        meta.columns.forEach((col: string, i: number) => {
          record[col] = values[i] || ''
        })
        return record
      } else if (meta.format === 'json-array') {
        // JSON array format - need to find matching closing brace
        const obj = this.extractJSONObject(str)
        if (obj) {
          const record: Record<string, unknown> = {}
          for (const [key, val] of Object.entries(obj)) {
            if (val === null || typeof val !== 'object') {
              record[key] = val
            } else if (Array.isArray(val)) {
              record[key] = JSON.stringify(val)
            }
          }
          return record
        }
      } else if (meta.format === 'vcf' || meta.fileType === 'vcf') {
        // VCF format - read until END:VCARD
        const endMarker = str.indexOf('END:VCARD')
        if (endMarker === -1) return null

        const vCardStr = str.slice(0, endMarker + 9)
        return this.parseVCard(vCardStr)
      } else {
        // NDJSON format - one object per line
        let endIdx = str.indexOf('\n')
        let line = endIdx !== -1 ? str.slice(0, endIdx) : str
        if (line.endsWith('\r')) {
          line = line.slice(0, -1)
        }
        line = line.trim()
        if (line.startsWith('{')) {
          const obj = JSON.parse(line)
          const record: Record<string, unknown> = {}
          for (const [key, val] of Object.entries(obj)) {
            if (val === null || typeof val !== 'object') {
              record[key] = val
            } else if (Array.isArray(val)) {
              record[key] = JSON.stringify(val)
            }
          }
          return record
        }
      }
    } catch (e) {
      console.error('Read error at index', index, 'pos', pos, e)
    }
    return null
  }

  private extractJSONObject(str: string): Record<string, unknown> | null {
    // Find the JSON object starting at position 0
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

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  private parseVCard(vCardStr: string): Record<string, unknown> {
    const record: Record<string, unknown> = {}

    // Handle line folding (lines starting with space/tab are continuations)
    const unfoldedStr = vCardStr.replace(/\r?\n[ \t]/g, '')
    const lines = unfoldedStr.split(/\r?\n/)

    for (const line of lines) {
      if (!line.includes(':') || line === 'BEGIN:VCARD' || line === 'END:VCARD' || line.startsWith('VERSION:')) continue

      const colonIdx = line.indexOf(':')
      let key = line.slice(0, colonIdx).toUpperCase()
      const value = line.slice(colonIdx + 1)

      // Handle properties with parameters like "TEL;TYPE=CELL:"
      if (key.includes(';')) {
        key = key.split(';')[0]
      }

      // Store or append values
      if (!record[key]) {
        record[key] = value
      } else if (key === 'EMAIL' || key === 'TEL') {
        record[key] = record[key] + ', ' + value
      }
    }

    return record
  }

  async getPage(query: PageQuery): Promise<PageResult> {
    const meta = this.getMeta(query.fileId)
    const positions = this.getPositions(query.fileId)
    const totalRecords = meta.totalRecords
    const { page, limit, filters } = query

    let matchingIndexes: number[] = []

    // If filters active, search for matching indexes
    if (filters && Object.keys(filters).length > 0) {
      const searchLines = await this.getSearchLines(query.fileId)
      const searchableColumns = meta.searchableColumns

      for (let i = 0; i < searchLines.length; i++) {
        const parts = searchLines[i].split('|')
        let matches = true

        for (const [col, value] of Object.entries(filters)) {
          const colIndex = searchableColumns.indexOf(col)
          if (colIndex !== -1) {
            const fieldValue = parts[colIndex] || ''
            if (!fieldValue.includes(value.toLowerCase())) {
              matches = false
              break
            }
          }
        }

        if (matches) {
          matchingIndexes.push(i)
          if (matchingIndexes.length >= 10000) break
        }
      }
    } else {
      // No filters, use all indexes
      matchingIndexes = Array.from({ length: totalRecords }, (_, i) => i)
    }

    const total = matchingIndexes.length
    const start = (page - 1) * limit
    const pageIndexes = matchingIndexes.slice(start, start + limit)

    const records: Record<string, unknown>[] = []
    const fd = fs.openSync(meta.filePath, 'r')

    for (const idx of pageIndexes) {
      const record = this.readRecordAt(fd, positions, idx, totalRecords, meta)
      if (record) {
        records.push({ ...record, _index: idx })
      }
    }

    fs.closeSync(fd)

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
    const startTime = Date.now()
    const meta = this.getMeta(query.fileId)
    const positions = this.getPositions(query.fileId)
    const searchLines = await this.getSearchLines(query.fileId)
    const searchableColumns = meta.searchableColumns

    const exactMatches: number[] = []
    const partialMatches: number[] = []

    // Build search criteria
    const criteria: { colIndex: number; value: string }[] = []
    for (const [col, value] of Object.entries(query.fields)) {
      if (value && value.length >= 2) {
        const colIndex = searchableColumns.indexOf(col)
        if (colIndex !== -1) {
          criteria.push({ colIndex, value: value.toLowerCase() })
        }
      }
    }

    if (criteria.length === 0) {
      return {
        records: [],
        page: 1,
        limit: query.limit,
        totalRecords: 0,
        totalPages: 0,
        from: 0,
        to: 0,
        exactCount: 0,
        partialCount: 0,
        searchTime: Date.now() - startTime,
      }
    }

    // Search
    for (let i = 0; i < searchLines.length; i++) {
      const parts = searchLines[i].split('|')
      let allMatch = true
      let allExact = true

      for (const { colIndex, value } of criteria) {
        const fieldValue = parts[colIndex] || ''

        if (fieldValue === value) {
          // Exact match
        } else if (!query.exact && fieldValue.includes(value)) {
          allExact = false
        } else {
          allMatch = false
          break
        }
      }

      if (allMatch) {
        if (allExact) {
          exactMatches.push(i)
        } else {
          partialMatches.push(i)
        }
      }

      if (exactMatches.length + partialMatches.length >= 5000) break
    }

    // Combine results (exact first)
    const allMatches = [...exactMatches, ...partialMatches]
    const total = allMatches.length
    const start = (query.page - 1) * query.limit
    const pageIndexes = allMatches.slice(start, start + query.limit)

    const records: Record<string, unknown>[] = []
    const fd = fs.openSync(meta.filePath, 'r')

    for (const idx of pageIndexes) {
      const record = this.readRecordAt(fd, positions, idx, meta.totalRecords, meta)
      if (record) {
        records.push({
          ...record,
          _index: idx,
          _exact: exactMatches.includes(idx),
        })
      }
    }

    fs.closeSync(fd)

    return {
      records,
      page: query.page,
      limit: query.limit,
      totalRecords: total,
      totalPages: Math.ceil(total / query.limit),
      from: start + 1,
      to: Math.min(start + query.limit, total),
      exactCount: exactMatches.length,
      partialCount: partialMatches.length,
      searchTime: Date.now() - startTime,
    }
  }

  async getRecord(fileId: string, index: number): Promise<Record<string, unknown>> {
    const meta = this.getMeta(fileId)
    const positions = this.getPositions(fileId)
    const fd = fs.openSync(meta.filePath, 'r')
    const record = this.readRecordAt(fd, positions, index, meta.totalRecords, meta)
    fs.closeSync(fd)
    return record || {}
  }
}
