import { parentPort, workerData } from 'worker_threads'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { IndexMeta, FileStats, FileType } from '../shared/types'

interface WorkerData {
  filePath: string
  fileId: string
  indexDir: string
}

interface ProgressMessage {
  type: 'progress'
  percent: number
  recordsProcessed: number
  eta: number
  warnings?: number
}

interface CompleteMessage {
  type: 'complete'
  totalRecords: number
  warnings: number
  skippedLines: number
}

interface ErrorMessage {
  type: 'error'
  error: string
}

interface WarningMessage {
  type: 'warning'
  message: string
  line: number
}

type WorkerMessage = ProgressMessage | CompleteMessage | ErrorMessage | WarningMessage

// Track indexing warnings
let warningCount = 0
let skippedLines = 0
const MAX_WARNINGS_TO_REPORT = 10

function sendMessage(msg: WorkerMessage) {
  parentPort?.postMessage(msg)
}

async function indexFile() {
  const { filePath, fileId, indexDir } = workerData as WorkerData
  const ext = path.extname(filePath).toLowerCase()
  const fileType: FileType = ext === '.json' ? 'json' : ext === '.vcf' ? 'vcf' : 'csv'

  try {
    if (fileType === 'csv') {
      await indexCSV(filePath, fileId, indexDir)
    } else if (fileType === 'vcf') {
      await indexVCF(filePath, fileId, indexDir)
    } else {
      await indexJSON(filePath, fileId, indexDir)
    }
  } catch (error) {
    sendMessage({ type: 'error', error: String(error) })
  }
}

function detectDelimiter(firstLine: string): string {
  const delimiters = [',', ';', '\t', '|']
  const counts = delimiters.map(d => ({
    delimiter: d,
    count: (firstLine.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length
  }))
  counts.sort((a, b) => b.count - a.count)
  return counts[0].count > 0 ? counts[0].delimiter : ','
}

async function indexCSV(filePath: string, fileId: string, indexDir: string) {
  const fileStats = fs.statSync(filePath)
  const fileSize = fileStats.size

  // Peek first line to detect delimiter
  const peekFd = fs.openSync(filePath, 'r')
  const peekBuffer = Buffer.alloc(4096)
  fs.readSync(peekFd, peekBuffer, 0, 4096, 0)
  const peekStr = peekBuffer.toString('utf-8')
  const firstLineEnd = peekStr.indexOf('\n')
  const firstLine = firstLineEnd > 0 ? peekStr.slice(0, firstLineEnd) : peekStr
  fs.closeSync(peekFd)

  const delimiter = detectDelimiter(firstLine)

  const positions: number[] = []
  const searchLines: string[] = []
  const stats: Record<string, Record<string, number>> = {}
  let headers: string[] = []
  let totalRecords = 0
  const startTime = Date.now()
  let lastProgressUpdate = 0

  // Read raw bytes to track exact positions
  const CHUNK_SIZE = 32 * 1024 * 1024 // 32MB chunks
  const fd = fs.openSync(filePath, 'r')
  const buffer = Buffer.alloc(CHUNK_SIZE)

  let leftoverBytes = Buffer.alloc(0)
  let globalByteOffset = 0
  let isFirstLine = true
  let currentLineStart = 0

  while (true) {
    const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, globalByteOffset)
    if (bytesRead === 0 && leftoverBytes.length === 0) break

    // Combine leftover with new chunk
    const chunk = Buffer.concat([leftoverBytes, buffer.subarray(0, bytesRead)])
    const chunkStartOffset = globalByteOffset - leftoverBytes.length
    leftoverBytes = Buffer.alloc(0)

    let searchStart = 0

    // Find newlines in chunk
    for (let i = 0; i < chunk.length; i++) {
      // Check for \n (0x0A)
      if (chunk[i] === 0x0A) {
        // Line ends at i (excluding \n and optional \r)
        let lineEnd = i
        if (i > 0 && chunk[i - 1] === 0x0D) {
          lineEnd = i - 1
        }

        const lineBytes = chunk.subarray(searchStart, lineEnd)
        const line = lineBytes.toString('utf-8')
        const lineStartPos = chunkStartOffset + searchStart

        if (isFirstLine) {
          headers = parseCSVLine(line, delimiter)
          isFirstLine = false
        } else {
          positions.push(lineStartPos)
          const values = parseCSVLine(line, delimiter)
          const searchFields = extractSearchFields(headers, values)
          searchLines.push(searchFields.join('|').toLowerCase())
          updateStats(stats, headers, values)
          totalRecords++
        }

        searchStart = i + 1
      }
    }

    // Keep remaining bytes for next iteration
    if (searchStart < chunk.length) {
      leftoverBytes = Buffer.from(chunk.subarray(searchStart))
    }

    globalByteOffset += bytesRead

    // Progress update
    const now = Date.now()
    if (now - lastProgressUpdate > 100) {
      const percent = Math.round((globalByteOffset / fileSize) * 100)
      const elapsed = (now - startTime) / 1000
      const rate = globalByteOffset / elapsed
      const remaining = (fileSize - globalByteOffset) / rate
      sendMessage({ type: 'progress', percent, recordsProcessed: totalRecords, eta: remaining })
      lastProgressUpdate = now
    }
  }

  // Handle last line without newline
  if (leftoverBytes.length > 0 && !isFirstLine) {
    let lineBytes = leftoverBytes
    // Remove trailing \r if present
    if (lineBytes[lineBytes.length - 1] === 0x0D) {
      lineBytes = lineBytes.subarray(0, lineBytes.length - 1)
    }

    const line = lineBytes.toString('utf-8')
    const lineStartPos = globalByteOffset - leftoverBytes.length

    positions.push(lineStartPos)
    const values = parseCSVLine(line, delimiter)
    const searchFields = extractSearchFields(headers, values)
    searchLines.push(searchFields.join('|').toLowerCase())
    updateStats(stats, headers, values)
    totalRecords++
  }

  fs.closeSync(fd)

  await writeIndexFiles(fileId, filePath, positions, searchLines, headers, stats, totalRecords, indexDir, 'csv', delimiter)
  sendMessage({ type: 'complete', totalRecords, warnings: warningCount, skippedLines })
}

async function indexJSON(filePath: string, fileId: string, indexDir: string) {
  const fileStats = fs.statSync(filePath)
  const fileSize = fileStats.size

  // Detect JSON format: array or NDJSON
  const fd = fs.openSync(filePath, 'r')
  const peekBuffer = Buffer.alloc(1024)
  fs.readSync(fd, peekBuffer, 0, 1024, 0)
  const peek = peekBuffer.toString('utf-8').trim()
  fs.closeSync(fd)

  const isArray = peek.startsWith('[')

  if (isArray) {
    await indexJSONArray(filePath, fileId, indexDir, fileSize)
  } else {
    await indexNDJSON(filePath, fileId, indexDir, fileSize)
  }
}

async function indexJSONArray(filePath: string, fileId: string, indexDir: string, fileSize: number) {
  const positions: number[] = []
  const searchLines: string[] = []
  const stats: Record<string, Record<string, number>> = {}
  let headers: string[] = []
  let totalRecords = 0
  const startTime = Date.now()
  let lastProgressUpdate = 0

  // For JSON arrays, we need to find each object's position
  // We'll scan for `{` at depth 1 (inside the main array)
  const CHUNK_SIZE = 32 * 1024 * 1024
  const fd = fs.openSync(filePath, 'r')
  const buffer = Buffer.alloc(CHUNK_SIZE)

  let globalByteOffset = 0
  let depth = 0
  let inString = false
  let escapeNext = false
  let objectStart = -1
  let objectBuffer = ''
  let isFirstRecord = true

  while (true) {
    const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, globalByteOffset)
    if (bytesRead === 0) break

    for (let i = 0; i < bytesRead; i++) {
      const byte = buffer[i]
      const char = String.fromCharCode(byte)
      const currentPos = globalByteOffset + i

      if (escapeNext) {
        escapeNext = false
        if (objectStart !== -1) objectBuffer += char
        continue
      }

      if (char === '\\' && inString) {
        escapeNext = true
        if (objectStart !== -1) objectBuffer += char
        continue
      }

      if (char === '"' && !escapeNext) {
        inString = !inString
        if (objectStart !== -1) objectBuffer += char
        continue
      }

      if (inString) {
        if (objectStart !== -1) objectBuffer += char
        continue
      }

      if (char === '{') {
        if (depth === 1) {
          // Start of an object in the array
          objectStart = currentPos
          objectBuffer = '{'
        } else if (depth > 1 && objectStart !== -1) {
          objectBuffer += char
        }
        depth++
      } else if (char === '}') {
        depth--
        if (depth === 1 && objectStart !== -1) {
          // End of an object
          objectBuffer += '}'
          try {
            const obj = JSON.parse(objectBuffer)
            positions.push(objectStart)

            if (isFirstRecord) {
              headers = Object.keys(obj).filter(k => {
                const val = obj[k]
                return val === null || typeof val !== 'object' || Array.isArray(val)
              }).slice(0, 20)
              isFirstRecord = false
            }

            const searchFields = headers.slice(0, 6).map(h => {
              const val = obj[h]
              if (val === null || val === undefined) return ''
              if (typeof val === 'object') return JSON.stringify(val)
              return String(val)
            })
            searchLines.push(searchFields.join('|').toLowerCase())

            const values = headers.map(h => {
              const val = obj[h]
              if (val === null || val === undefined) return ''
              if (typeof val === 'object') return JSON.stringify(val)
              return String(val)
            })
            updateStats(stats, headers, values)

            totalRecords++
          } catch {
            // Skip malformed object
          }
          objectStart = -1
          objectBuffer = ''
        } else if (objectStart !== -1) {
          objectBuffer += char
        }
      } else if (char === '[') {
        if (depth === 0) {
          depth = 1 // Entering main array
        } else {
          depth++
          if (objectStart !== -1) objectBuffer += char
        }
      } else if (char === ']') {
        if (depth === 1) {
          depth = 0 // End of main array
        } else {
          depth--
          if (objectStart !== -1) objectBuffer += char
        }
      } else if (objectStart !== -1) {
        objectBuffer += char
      }
    }

    globalByteOffset += bytesRead

    const now = Date.now()
    if (now - lastProgressUpdate > 100) {
      const percent = Math.round((globalByteOffset / fileSize) * 100)
      const elapsed = (now - startTime) / 1000
      const rate = globalByteOffset / elapsed
      const remaining = (fileSize - globalByteOffset) / rate
      sendMessage({ type: 'progress', percent, recordsProcessed: totalRecords, eta: remaining })
      lastProgressUpdate = now
    }
  }

  fs.closeSync(fd)

  await writeIndexFiles(fileId, filePath, positions, searchLines, headers, stats, totalRecords, indexDir, 'json-array')
  sendMessage({ type: 'complete', totalRecords, warnings: warningCount, skippedLines })
}

async function indexNDJSON(filePath: string, fileId: string, indexDir: string, fileSize: number) {
  const positions: number[] = []
  const searchLines: string[] = []
  const stats: Record<string, Record<string, number>> = {}
  let headers: string[] = []
  let totalRecords = 0
  const startTime = Date.now()
  let lastProgressUpdate = 0

  const CHUNK_SIZE = 32 * 1024 * 1024
  const fd = fs.openSync(filePath, 'r')
  const buffer = Buffer.alloc(CHUNK_SIZE)

  let leftoverBytes = Buffer.alloc(0)
  let globalByteOffset = 0
  let isFirstRecord = true

  while (true) {
    const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, globalByteOffset)
    if (bytesRead === 0 && leftoverBytes.length === 0) break

    const chunk = Buffer.concat([leftoverBytes, buffer.subarray(0, bytesRead)])
    const chunkStartOffset = globalByteOffset - leftoverBytes.length
    leftoverBytes = Buffer.alloc(0)

    let searchStart = 0

    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === 0x0A) {
        let lineEnd = i
        if (i > 0 && chunk[i - 1] === 0x0D) {
          lineEnd = i - 1
        }

        const lineBytes = chunk.subarray(searchStart, lineEnd)
        const line = lineBytes.toString('utf-8').trim()
        const lineStartPos = chunkStartOffset + searchStart

        if (line.length > 0 && line[0] === '{') {
          try {
            const obj = JSON.parse(line)
            positions.push(lineStartPos)

            if (isFirstRecord) {
              headers = Object.keys(obj).filter(k => {
                const val = obj[k]
                return val === null || typeof val !== 'object' || Array.isArray(val)
              }).slice(0, 20)
              isFirstRecord = false
            }

            const searchFields = headers.slice(0, 6).map(h => {
              const val = obj[h]
              if (val === null || val === undefined) return ''
              if (typeof val === 'object') return JSON.stringify(val)
              return String(val)
            })
            searchLines.push(searchFields.join('|').toLowerCase())

            const values = headers.map(h => {
              const val = obj[h]
              if (val === null || val === undefined) return ''
              if (typeof val === 'object') return JSON.stringify(val)
              return String(val)
            })
            updateStats(stats, headers, values)

            totalRecords++
          } catch {
            // Skip malformed JSON lines
          }
        }

        searchStart = i + 1
      }
    }

    if (searchStart < chunk.length) {
      leftoverBytes = Buffer.from(chunk.subarray(searchStart))
    }

    globalByteOffset += bytesRead

    const now = Date.now()
    if (now - lastProgressUpdate > 100) {
      const percent = Math.round((globalByteOffset / fileSize) * 100)
      const elapsed = (now - startTime) / 1000
      const rate = globalByteOffset / elapsed
      const remaining = (fileSize - globalByteOffset) / rate
      sendMessage({ type: 'progress', percent, recordsProcessed: totalRecords, eta: remaining })
      lastProgressUpdate = now
    }
  }

  if (leftoverBytes.length > 0) {
    const line = leftoverBytes.toString('utf-8').trim()
    const lineStartPos = globalByteOffset - leftoverBytes.length

    if (line.length > 0 && line[0] === '{') {
      try {
        const obj = JSON.parse(line)
        positions.push(lineStartPos)

        if (isFirstRecord) {
          headers = Object.keys(obj).filter(k => {
            const val = obj[k]
            return val === null || typeof val !== 'object' || Array.isArray(val)
          }).slice(0, 20)
        }

        const searchFields = headers.slice(0, 6).map(h => {
          const val = obj[h]
          if (val === null || val === undefined) return ''
          if (typeof val === 'object') return JSON.stringify(val)
          return String(val)
        })
        searchLines.push(searchFields.join('|').toLowerCase())

        const values = headers.map(h => {
          const val = obj[h]
          if (val === null || val === undefined) return ''
          if (typeof val === 'object') return JSON.stringify(val)
          return String(val)
        })
        updateStats(stats, headers, values)

        totalRecords++
      } catch {
        // Skip
      }
    }
  }

  fs.closeSync(fd)

  await writeIndexFiles(fileId, filePath, positions, searchLines, headers, stats, totalRecords, indexDir, 'ndjson')
  sendMessage({ type: 'complete', totalRecords, warnings: warningCount, skippedLines })
}

async function indexVCF(filePath: string, fileId: string, indexDir: string) {
  const fileStats = fs.statSync(filePath)
  const fileSize = fileStats.size

  const positions: number[] = []
  const searchLines: string[] = []
  const stats: Record<string, Record<string, number>> = {}
  const headers = ['FN', 'N', 'EMAIL', 'TEL', 'ORG', 'ADR', 'NOTE', 'URL', 'BDAY', 'TITLE']
  let totalRecords = 0
  const startTime = Date.now()
  let lastProgressUpdate = 0

  // Read file and find BEGIN:VCARD positions
  const CHUNK_SIZE = 32 * 1024 * 1024
  const fd = fs.openSync(filePath, 'r')
  const buffer = Buffer.alloc(CHUNK_SIZE)

  let leftoverBytes = Buffer.alloc(0)
  let globalByteOffset = 0
  let currentVCardStart = -1
  let currentVCard: Record<string, string> = {}
  let lastKey = ''

  while (true) {
    const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, globalByteOffset)
    if (bytesRead === 0 && leftoverBytes.length === 0) break

    const chunk = Buffer.concat([leftoverBytes, buffer.subarray(0, bytesRead)])
    const chunkStartOffset = globalByteOffset - leftoverBytes.length
    leftoverBytes = Buffer.alloc(0)

    let searchStart = 0

    // Process line by line
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === 0x0A) { // \n
        let lineEnd = i
        if (i > 0 && chunk[i - 1] === 0x0D) {
          lineEnd = i - 1
        }

        const lineBytes = chunk.subarray(searchStart, lineEnd)
        const line = lineBytes.toString('utf-8')
        const lineStartPos = chunkStartOffset + searchStart

        // Handle line folding (continuation lines start with space or tab)
        if (currentVCardStart !== -1 && (line.startsWith(' ') || line.startsWith('\t'))) {
          // Append to previous field
          if (lastKey && currentVCard[lastKey]) {
            currentVCard[lastKey] += line.slice(1)
          }
        } else if (line.trim() === 'BEGIN:VCARD') {
          currentVCardStart = lineStartPos
          currentVCard = {}
          lastKey = ''
        } else if (line.trim() === 'END:VCARD' && currentVCardStart !== -1) {
          // Save this vCard
          positions.push(currentVCardStart)

          const searchFields = headers.slice(0, 6).map(h => currentVCard[h] || '')
          searchLines.push(searchFields.join('|').toLowerCase())

          const values = headers.map(h => currentVCard[h] || '')
          updateStats(stats, headers, values)

          totalRecords++
          currentVCardStart = -1
          currentVCard = {}
          lastKey = ''
        } else if (currentVCardStart !== -1 && line.includes(':')) {
          // Parse vCard property
          const colonIdx = line.indexOf(':')
          let key = line.slice(0, colonIdx).toUpperCase()
          const value = line.slice(colonIdx + 1)

          // Handle properties with parameters like "TEL;TYPE=CELL:"
          if (key.includes(';')) {
            key = key.split(';')[0]
          }

          lastKey = key

          // Store first occurrence of each field
          if (!currentVCard[key]) {
            currentVCard[key] = value
          } else if (key === 'EMAIL' || key === 'TEL') {
            // Append multiple emails/phones
            currentVCard[key] += ', ' + value
          }
        }

        searchStart = i + 1
      }
    }

    if (searchStart < chunk.length) {
      leftoverBytes = Buffer.from(chunk.subarray(searchStart))
    }

    globalByteOffset += bytesRead

    const now = Date.now()
    if (now - lastProgressUpdate > 100) {
      const percent = Math.round((globalByteOffset / fileSize) * 100)
      const elapsed = (now - startTime) / 1000
      const rate = globalByteOffset / elapsed
      const remaining = (fileSize - globalByteOffset) / rate
      sendMessage({ type: 'progress', percent, recordsProcessed: totalRecords, eta: remaining })
      lastProgressUpdate = now
    }
  }

  fs.closeSync(fd)

  await writeIndexFiles(fileId, filePath, positions, searchLines, headers, stats, totalRecords, indexDir, 'vcf')
  sendMessage({ type: 'complete', totalRecords, warnings: warningCount, skippedLines })
}

/**
 * Parse a CSV line following RFC 4180 rules:
 * - Fields may be enclosed in double quotes
 * - Double quotes inside quoted fields are escaped by doubling them ("")
 * - Fields containing the delimiter, newlines, or quotes must be quoted
 */
function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes) {
        // Check if this is an escaped quote (double quote)
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i += 2
          continue
        }
        // End of quoted field
        inQuotes = false
      } else {
        // Start of quoted field (only valid at start of field or after delimiter)
        inQuotes = true
      }
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

/**
 * Validate CSV structure and detect potential issues
 */
function validateCSVLine(line: string, delimiter: string, expectedColumns: number): {
  valid: boolean
  issue?: string
} {
  const values = parseCSVLine(line, delimiter)

  if (values.length !== expectedColumns) {
    return {
      valid: false,
      issue: `Expected ${expectedColumns} columns, got ${values.length}`,
    }
  }

  // Check for unbalanced quotes
  let quoteCount = 0
  for (const char of line) {
    if (char === '"') quoteCount++
  }
  if (quoteCount % 2 !== 0) {
    return {
      valid: false,
      issue: 'Unbalanced quotes',
    }
  }

  return { valid: true }
}

function extractSearchFields(headers: string[], values: string[]): string[] {
  return values.slice(0, 6).map(v => v.replace(/\|/g, ' '))
}

function updateStats(stats: Record<string, Record<string, number>>, headers: string[], values: string[]) {
  for (let i = 0; i < Math.min(headers.length, 10); i++) {
    const header = headers[i]
    const value = values[i] || ''

    if (!stats[header]) stats[header] = {}

    if (Object.keys(stats[header]).length < 100 || stats[header][value]) {
      stats[header][value] = (stats[header][value] || 0) + 1
    }
  }
}

async function writeIndexFiles(
  fileId: string,
  filePath: string,
  positions: number[],
  searchLines: string[],
  headers: string[],
  stats: Record<string, Record<string, number>>,
  totalRecords: number,
  indexDir: string,
  format: 'csv' | 'ndjson' | 'json-array' | 'vcf' = 'csv',
  delimiter: string = ','
) {
  const basePath = path.join(indexDir, fileId)

  // Write binary position index
  const posBuffer = Buffer.alloc(positions.length * 6)
  for (let i = 0; i < positions.length; i++) {
    posBuffer.writeUIntLE(positions[i], i * 6, 6)
  }
  fs.writeFileSync(`${basePath}.index.bin`, posBuffer)

  // Write search index
  fs.writeFileSync(`${basePath}.search.txt`, searchLines.join('\n'))

  // Write meta
  const ext = path.extname(filePath).toLowerCase()
  const fileType = ext === '.json' ? 'json' : ext === '.vcf' ? 'vcf' : 'csv'

  const meta = {
    fileId,
    filePath,
    fileName: path.basename(filePath),
    fileSize: fs.statSync(filePath).size,
    fileType,
    format, // 'csv', 'ndjson', 'json-array', or 'vcf'
    delimiter, // for CSV files
    indexedAt: Date.now(),
    totalRecords,
    columns: headers,
    searchableColumns: headers.slice(0, 6),
  }
  fs.writeFileSync(`${basePath}.meta.json`, JSON.stringify(meta, null, 2))

  // Write stats
  const fileStats: FileStats = {
    total: totalRecords,
    columns: {},
  }
  for (const [col, dist] of Object.entries(stats)) {
    const sortedDist = Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
    fileStats.columns[col] = {
      name: col,
      type: 'string',
      unique: Object.keys(dist).length,
      distribution: Object.fromEntries(sortedDist),
    }
  }
  fs.writeFileSync(`${basePath}.stats.json`, JSON.stringify(fileStats, null, 2))
}

// Start indexing
indexFile()
