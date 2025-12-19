/**
 * IPC Input Validation Module
 * Provides security validation for all IPC handler inputs
 */

import * as path from 'path'
import * as fs from 'fs'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Validates that a file path is safe and exists
 */
export function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string') {
    throw new ValidationError('File path must be a string')
  }

  if (filePath.length === 0) {
    throw new ValidationError('File path cannot be empty')
  }

  if (filePath.length > 4096) {
    throw new ValidationError('File path too long')
  }

  // Normalize the path to prevent directory traversal
  const normalizedPath = path.normalize(filePath)

  // Check for path traversal attempts
  if (normalizedPath.includes('..')) {
    throw new ValidationError('Path traversal not allowed')
  }

  // Verify the file exists and is a file (not a directory)
  if (!fs.existsSync(normalizedPath)) {
    throw new ValidationError('File does not exist')
  }

  const stats = fs.statSync(normalizedPath)
  if (!stats.isFile()) {
    throw new ValidationError('Path is not a file')
  }

  return normalizedPath
}

/**
 * Validates a file ID (MD5 hash prefix)
 */
export function validateFileId(fileId: unknown): string {
  if (typeof fileId !== 'string') {
    throw new ValidationError('File ID must be a string')
  }

  // File IDs are 16-character hex strings (MD5 hash prefix)
  if (!/^[a-f0-9]{16}$/.test(fileId)) {
    throw new ValidationError('Invalid file ID format')
  }

  return fileId
}

/**
 * Validates a page number
 */
export function validatePage(page: unknown): number {
  if (typeof page !== 'number') {
    throw new ValidationError('Page must be a number')
  }

  if (!Number.isInteger(page) || page < 1) {
    throw new ValidationError('Page must be a positive integer')
  }

  if (page > 1000000) {
    throw new ValidationError('Page number too large')
  }

  return page
}

/**
 * Validates a limit/page size
 */
export function validateLimit(limit: unknown): number {
  if (typeof limit !== 'number') {
    throw new ValidationError('Limit must be a number')
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new ValidationError('Limit must be a positive integer')
  }

  if (limit > 1000) {
    throw new ValidationError('Limit too large (max 1000)')
  }

  return limit
}

/**
 * Validates a record index
 */
export function validateIndex(index: unknown): number {
  if (typeof index !== 'number') {
    throw new ValidationError('Index must be a number')
  }

  if (!Number.isInteger(index) || index < 0) {
    throw new ValidationError('Index must be a non-negative integer')
  }

  return index
}

/**
 * Validates filter/search fields object
 */
export function validateFields(fields: unknown): Record<string, string> {
  if (fields === undefined || fields === null) {
    return {}
  }

  if (typeof fields !== 'object' || Array.isArray(fields)) {
    throw new ValidationError('Fields must be an object')
  }

  const result: Record<string, string> = {}
  const fieldsObj = fields as Record<string, unknown>

  for (const [key, value] of Object.entries(fieldsObj)) {
    // Validate key
    if (typeof key !== 'string' || key.length === 0 || key.length > 256) {
      throw new ValidationError('Field key must be a non-empty string (max 256 chars)')
    }

    // Validate value
    if (typeof value !== 'string') {
      throw new ValidationError('Field value must be a string')
    }

    if (value.length > 1000) {
      throw new ValidationError('Field value too long (max 1000 chars)')
    }

    result[key] = value
  }

  // Limit number of fields
  if (Object.keys(result).length > 50) {
    throw new ValidationError('Too many fields (max 50)')
  }

  return result
}

/**
 * Validates a boolean value
 */
export function validateBoolean(value: unknown, defaultValue: boolean = false): boolean {
  if (value === undefined || value === null) {
    return defaultValue
  }

  if (typeof value !== 'boolean') {
    throw new ValidationError('Value must be a boolean')
  }

  return value
}

/**
 * Validates a PageQuery object
 */
export function validatePageQuery(query: unknown): {
  fileId: string
  page: number
  limit: number
  filters?: Record<string, string>
} {
  if (!query || typeof query !== 'object') {
    throw new ValidationError('Query must be an object')
  }

  const q = query as Record<string, unknown>

  return {
    fileId: validateFileId(q.fileId),
    page: validatePage(q.page),
    limit: validateLimit(q.limit),
    filters: q.filters ? validateFields(q.filters) : undefined,
  }
}

/**
 * Validates a SearchQuery object
 */
export function validateSearchQuery(query: unknown): {
  fileId: string
  fields: Record<string, string>
  exact: boolean
  page: number
  limit: number
} {
  if (!query || typeof query !== 'object') {
    throw new ValidationError('Query must be an object')
  }

  const q = query as Record<string, unknown>

  return {
    fileId: validateFileId(q.fileId),
    fields: validateFields(q.fields),
    exact: validateBoolean(q.exact, false),
    page: validatePage(q.page),
    limit: validateLimit(q.limit),
  }
}

/**
 * Sanitizes a string for safe display (prevents XSS in Electron)
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * Validates file extension against allowed types
 */
export function validateFileExtension(filePath: string): boolean {
  const allowedExtensions = ['.json', '.csv', '.vcf']
  const ext = path.extname(filePath).toLowerCase()
  return allowedExtensions.includes(ext)
}
