import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import {
  ValidationError,
  validateFilePath,
  validateFileId,
  validatePage,
  validateLimit,
  validateIndex,
  validateFields,
  validateBoolean,
  validatePageQuery,
  validateSearchQuery,
  sanitizeString,
  validateFileExtension,
} from '../main/ipc-validator'

// Mock fs module
const fs = await vi.hoisted(() => {
  return {
    existsSync: vi.fn(),
    statSync: vi.fn(),
  }
})

vi.mock('fs', () => fs)

describe('ValidationError', () => {
  it('should create error with correct name and message', () => {
    const error = new ValidationError('test error')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ValidationError')
    expect(error.message).toBe('test error')
  })
})

describe('validateFilePath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should reject non-string values', () => {
    expect(() => validateFilePath(123)).toThrow('File path must be a string')
    expect(() => validateFilePath(null)).toThrow('File path must be a string')
    expect(() => validateFilePath(undefined)).toThrow('File path must be a string')
    expect(() => validateFilePath({})).toThrow('File path must be a string')
  })

  it('should reject empty string', () => {
    expect(() => validateFilePath('')).toThrow('File path cannot be empty')
  })

  it('should reject path that is too long', () => {
    const longPath = 'a'.repeat(4097)
    expect(() => validateFilePath(longPath)).toThrow('File path too long')
  })

  it('should reject path traversal attempts', () => {
    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ isFile: () => true } as any)

    expect(() => validateFilePath('../test.json')).toThrow('Path traversal not allowed')
    expect(() => validateFilePath('test/../../../etc/passwd')).toThrow(
      'Path traversal not allowed'
    )
  })

  it('should reject non-existent files', () => {
    fs.existsSync.mockReturnValue(false)

    expect(() => validateFilePath('/path/to/nonexistent.json')).toThrow('File does not exist')
  })

  it('should reject directories', () => {
    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ isFile: () => false } as any)

    expect(() => validateFilePath('/path/to/directory')).toThrow('Path is not a file')
  })

  it('should accept valid file path', () => {
    const testPath = '/path/to/file.json'
    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ isFile: () => true } as any)

    const result = validateFilePath(testPath)
    expect(result).toBe(path.normalize(testPath))
  })
})

describe('validateFileId', () => {
  it('should reject non-string values', () => {
    expect(() => validateFileId(123)).toThrow('File ID must be a string')
    expect(() => validateFileId(null)).toThrow('File ID must be a string')
    expect(() => validateFileId({})).toThrow('File ID must be a string')
  })

  it('should reject invalid format', () => {
    expect(() => validateFileId('invalid')).toThrow('Invalid file ID format')
    expect(() => validateFileId('12345')).toThrow('Invalid file ID format')
    expect(() => validateFileId('xyz123abc456def7')).toThrow('Invalid file ID format')
    expect(() => validateFileId('abcd1234567890')).toThrow('Invalid file ID format') // too short
    expect(() => validateFileId('abcd12345678901234')).toThrow('Invalid file ID format') // too long
  })

  it('should accept valid 16-character hex string', () => {
    const validId = 'abcd1234567890ef'
    expect(validateFileId(validId)).toBe(validId)
    expect(validateFileId('0123456789abcdef')).toBe('0123456789abcdef')
  })
})

describe('validatePage', () => {
  it('should reject non-number values', () => {
    expect(() => validatePage('1')).toThrow('Page must be a number')
    expect(() => validatePage(null)).toThrow('Page must be a number')
    expect(() => validatePage(undefined)).toThrow('Page must be a number')
  })

  it('should reject non-integer values', () => {
    expect(() => validatePage(1.5)).toThrow('Page must be a positive integer')
    expect(() => validatePage(NaN)).toThrow('Page must be a positive integer')
  })

  it('should reject zero and negative numbers', () => {
    expect(() => validatePage(0)).toThrow('Page must be a positive integer')
    expect(() => validatePage(-1)).toThrow('Page must be a positive integer')
  })

  it('should reject page numbers that are too large', () => {
    expect(() => validatePage(1000001)).toThrow('Page number too large')
  })

  it('should accept valid page numbers', () => {
    expect(validatePage(1)).toBe(1)
    expect(validatePage(100)).toBe(100)
    expect(validatePage(1000000)).toBe(1000000)
  })
})

describe('validateLimit', () => {
  it('should reject non-number values', () => {
    expect(() => validateLimit('10')).toThrow('Limit must be a number')
    expect(() => validateLimit(null)).toThrow('Limit must be a number')
  })

  it('should reject non-integer values', () => {
    expect(() => validateLimit(10.5)).toThrow('Limit must be a positive integer')
  })

  it('should reject zero and negative numbers', () => {
    expect(() => validateLimit(0)).toThrow('Limit must be a positive integer')
    expect(() => validateLimit(-10)).toThrow('Limit must be a positive integer')
  })

  it('should reject limits that are too large', () => {
    expect(() => validateLimit(1001)).toThrow('Limit too large (max 1000)')
  })

  it('should accept valid limits', () => {
    expect(validateLimit(1)).toBe(1)
    expect(validateLimit(100)).toBe(100)
    expect(validateLimit(1000)).toBe(1000)
  })
})

describe('validateIndex', () => {
  it('should reject non-number values', () => {
    expect(() => validateIndex('0')).toThrow('Index must be a number')
    expect(() => validateIndex(null)).toThrow('Index must be a number')
  })

  it('should reject non-integer values', () => {
    expect(() => validateIndex(1.5)).toThrow('Index must be a non-negative integer')
  })

  it('should reject negative numbers', () => {
    expect(() => validateIndex(-1)).toThrow('Index must be a non-negative integer')
  })

  it('should accept zero and positive integers', () => {
    expect(validateIndex(0)).toBe(0)
    expect(validateIndex(1)).toBe(1)
    expect(validateIndex(1000)).toBe(1000)
  })
})

describe('validateFields', () => {
  it('should return empty object for undefined or null', () => {
    expect(validateFields(undefined)).toEqual({})
    expect(validateFields(null)).toEqual({})
  })

  it('should reject non-object values', () => {
    expect(() => validateFields('string')).toThrow('Fields must be an object')
    expect(() => validateFields(123)).toThrow('Fields must be an object')
    expect(() => validateFields([])).toThrow('Fields must be an object')
  })

  it('should reject invalid field keys', () => {
    expect(() => validateFields({ '': 'value' })).toThrow(
      'Field key must be a non-empty string (max 256 chars)'
    )
    expect(() => validateFields({ ['a'.repeat(257)]: 'value' })).toThrow(
      'Field key must be a non-empty string (max 256 chars)'
    )
  })

  it('should reject non-string field values', () => {
    expect(() => validateFields({ key: 123 })).toThrow('Field value must be a string')
    expect(() => validateFields({ key: null })).toThrow('Field value must be a string')
    expect(() => validateFields({ key: {} })).toThrow('Field value must be a string')
  })

  it('should reject field values that are too long', () => {
    expect(() => validateFields({ key: 'a'.repeat(1001) })).toThrow(
      'Field value too long (max 1000 chars)'
    )
  })

  it('should reject too many fields', () => {
    const manyFields: Record<string, string> = {}
    for (let i = 0; i < 51; i++) {
      manyFields[`field${i}`] = 'value'
    }
    expect(() => validateFields(manyFields)).toThrow('Too many fields (max 50)')
  })

  it('should accept valid fields object', () => {
    const fields = { name: 'John', email: 'john@example.com', age: '30' }
    expect(validateFields(fields)).toEqual(fields)
  })

  it('should accept exactly 50 fields', () => {
    const fields: Record<string, string> = {}
    for (let i = 0; i < 50; i++) {
      fields[`field${i}`] = 'value'
    }
    expect(validateFields(fields)).toEqual(fields)
  })
})

describe('validateBoolean', () => {
  it('should return default value for undefined or null', () => {
    expect(validateBoolean(undefined, false)).toBe(false)
    expect(validateBoolean(null, false)).toBe(false)
    expect(validateBoolean(undefined, true)).toBe(true)
    expect(validateBoolean(null, true)).toBe(true)
  })

  it('should use false as default when not specified', () => {
    expect(validateBoolean(undefined)).toBe(false)
    expect(validateBoolean(null)).toBe(false)
  })

  it('should reject non-boolean values', () => {
    expect(() => validateBoolean('true')).toThrow('Value must be a boolean')
    expect(() => validateBoolean(1)).toThrow('Value must be a boolean')
    expect(() => validateBoolean(0)).toThrow('Value must be a boolean')
  })

  it('should accept boolean values', () => {
    expect(validateBoolean(true)).toBe(true)
    expect(validateBoolean(false)).toBe(false)
  })
})

describe('validatePageQuery', () => {
  it('should reject non-object values', () => {
    expect(() => validatePageQuery(null)).toThrow('Query must be an object')
    expect(() => validatePageQuery('string')).toThrow('Query must be an object')
    expect(() => validatePageQuery(123)).toThrow('Query must be an object')
  })

  it('should validate all required fields', () => {
    const validQuery = {
      fileId: 'abcd1234567890ef',
      page: 1,
      limit: 10,
    }

    expect(validatePageQuery(validQuery)).toEqual({
      fileId: 'abcd1234567890ef',
      page: 1,
      limit: 10,
      filters: undefined,
    })
  })

  it('should validate optional filters', () => {
    const validQuery = {
      fileId: 'abcd1234567890ef',
      page: 1,
      limit: 10,
      filters: { name: 'John' },
    }

    expect(validatePageQuery(validQuery)).toEqual({
      fileId: 'abcd1234567890ef',
      page: 1,
      limit: 10,
      filters: { name: 'John' },
    })
  })

  it('should throw on invalid fileId', () => {
    expect(() =>
      validatePageQuery({
        fileId: 'invalid',
        page: 1,
        limit: 10,
      })
    ).toThrow('Invalid file ID format')
  })

  it('should throw on invalid page', () => {
    expect(() =>
      validatePageQuery({
        fileId: 'abcd1234567890ef',
        page: 0,
        limit: 10,
      })
    ).toThrow('Page must be a positive integer')
  })

  it('should throw on invalid limit', () => {
    expect(() =>
      validatePageQuery({
        fileId: 'abcd1234567890ef',
        page: 1,
        limit: 2000,
      })
    ).toThrow('Limit too large (max 1000)')
  })
})

describe('validateSearchQuery', () => {
  it('should reject non-object values', () => {
    expect(() => validateSearchQuery(null)).toThrow('Query must be an object')
    expect(() => validateSearchQuery('string')).toThrow('Query must be an object')
  })

  it('should validate all required fields', () => {
    const validQuery = {
      fileId: 'abcd1234567890ef',
      fields: { name: 'John' },
      exact: true,
      page: 1,
      limit: 10,
    }

    expect(validateSearchQuery(validQuery)).toEqual({
      fileId: 'abcd1234567890ef',
      fields: { name: 'John' },
      exact: true,
      page: 1,
      limit: 10,
    })
  })

  it('should use false as default for exact field', () => {
    const validQuery = {
      fileId: 'abcd1234567890ef',
      fields: { name: 'John' },
      page: 1,
      limit: 10,
    }

    const result = validateSearchQuery(validQuery)
    expect(result.exact).toBe(false)
  })

  it('should throw on invalid fields', () => {
    expect(() =>
      validateSearchQuery({
        fileId: 'abcd1234567890ef',
        fields: 'invalid',
        page: 1,
        limit: 10,
      })
    ).toThrow('Fields must be an object')
  })
})

describe('sanitizeString', () => {
  it('should escape HTML special characters', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('should escape ampersands', () => {
    expect(sanitizeString('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  it('should escape quotes', () => {
    expect(sanitizeString('He said "Hello"')).toBe('He said &quot;Hello&quot;')
    expect(sanitizeString("It's working")).toBe('It&#x27;s working')
  })

  it('should escape angle brackets', () => {
    expect(sanitizeString('1 < 2 > 0')).toBe('1 &lt; 2 &gt; 0')
  })

  it('should handle multiple special characters', () => {
    expect(sanitizeString(`<div class="test" id='box'>A & B</div>`)).toBe(
      '&lt;div class=&quot;test&quot; id=&#x27;box&#x27;&gt;A &amp; B&lt;/div&gt;'
    )
  })

  it('should return unchanged string with no special characters', () => {
    expect(sanitizeString('Hello World')).toBe('Hello World')
  })
})

describe('validateFileExtension', () => {
  it('should accept allowed extensions', () => {
    expect(validateFileExtension('/path/to/file.json')).toBe(true)
    expect(validateFileExtension('/path/to/file.csv')).toBe(true)
    expect(validateFileExtension('/path/to/file.vcf')).toBe(true)
  })

  it('should accept uppercase extensions', () => {
    expect(validateFileExtension('/path/to/file.JSON')).toBe(true)
    expect(validateFileExtension('/path/to/file.CSV')).toBe(true)
    expect(validateFileExtension('/path/to/file.VCF')).toBe(true)
  })

  it('should reject disallowed extensions', () => {
    expect(validateFileExtension('/path/to/file.txt')).toBe(false)
    expect(validateFileExtension('/path/to/file.xml')).toBe(false)
    expect(validateFileExtension('/path/to/file.exe')).toBe(false)
    expect(validateFileExtension('/path/to/file')).toBe(false)
  })
})
