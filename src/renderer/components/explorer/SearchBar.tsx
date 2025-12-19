import { useState, useCallback } from 'react'
import { debounce } from '../../lib/utils'

interface SearchBarProps {
  columns: string[]
  onSearch: (fields: Record<string, string>) => void
}

export function SearchBar({ columns, onSearch }: SearchBarProps) {
  const [fields, setFields] = useState<Record<string, string>>({})
  const [isExpanded, setIsExpanded] = useState(false)

  const debouncedSearch = useCallback(
    debounce((f: Record<string, string>) => onSearch(f), 300),
    [onSearch]
  )

  const handleChange = (col: string, value: string) => {
    const newFields = { ...fields, [col]: value }
    setFields(newFields)
    debouncedSearch(newFields)
  }

  const handleClear = () => {
    setFields({})
    onSearch({})
  }

  const hasValues = Object.values(fields).some(v => v.length > 0)

  return (
    <div className="border-b border-[#27272a]">
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] rounded transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {hasValues && (
          <>
            <div className="flex items-center gap-1 flex-wrap">
              {Object.entries(fields)
                .filter(([_, v]) => v.length > 0)
                .map(([col, value]) => (
                  <span
                    key={col}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded"
                  >
                    {col}: {value}
                    <button
                      onClick={() => handleChange(col, '')}
                      className="hover:text-blue-300"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
            </div>
            <button
              onClick={handleClear}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {isExpanded && (
        <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {columns.map((col) => (
            <div key={col}>
              <label className="block text-xs text-[#71717a] mb-1 truncate" title={col}>
                {col}
              </label>
              <input
                type="text"
                value={fields[col] || ''}
                onChange={(e) => handleChange(col, e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1.5 text-sm bg-[#18181b] border border-[#27272a] rounded focus:outline-none focus:border-blue-500 placeholder:text-[#52525b]"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
