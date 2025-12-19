import { useState, useCallback } from 'react'
import { SearchResult } from '../../../shared/types'
import { formatNumber, debounce, truncate } from '../../lib/utils'

interface SearchModeProps {
  fileId: string
  columns: string[]
  onRecordClick: (record: Record<string, unknown>) => void
}

export function SearchMode({ fileId, columns, onRecordClick }: SearchModeProps) {
  const [searchFields, setSearchFields] = useState<Record<string, string>>({})
  const [activeFilters, setActiveFilters] = useState<string[]>([columns[0] || ''])
  const [results, setResults] = useState<SearchResult | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const performSearch = useCallback(async (fields: Record<string, string>) => {
    const hasQuery = Object.values(fields).some(v => v.length >= 2)
    if (!hasQuery) {
      setResults(null)
      setHasSearched(false)
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    try {
      const result = await window.electronAPI.search({
        fileId,
        fields,
        exact: false,
        page: 1,
        limit: 50,
      })
      setResults(result)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }, [fileId])

  const debouncedSearch = useCallback(
    debounce((fields: Record<string, string>) => performSearch(fields), 300),
    [performSearch]
  )

  const handleInputChange = (col: string, value: string) => {
    const newFields = { ...searchFields, [col]: value }
    setSearchFields(newFields)
    debouncedSearch(newFields)
  }

  const toggleFilter = (col: string) => {
    if (activeFilters.includes(col)) {
      if (activeFilters.length > 1) {
        setActiveFilters(activeFilters.filter(c => c !== col))
        const newFields = { ...searchFields }
        delete newFields[col]
        setSearchFields(newFields)
        debouncedSearch(newFields)
      }
    } else {
      setActiveFilters([...activeFilters, col])
    }
  }

  const clearSearch = () => {
    setSearchFields({})
    setResults(null)
    setHasSearched(false)
  }

  return (
    <div className="flex-1 flex flex-col items-center overflow-hidden bg-gradient-to-b from-[#0c0c0e] to-[#09090b]">
      {/* Search container */}
      <div className="w-full max-w-2xl px-6 pt-12 pb-6">
        {/* Main search card */}
        <div className="glow-border rounded-2xl">
          {/* Card content */}
          <div className="relative bg-[#111113] rounded-2xl p-6 overflow-hidden">
            {/* Static top highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#444] to-transparent" />
            {/* Header */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2a2a2e] to-[#1a1a1c] flex items-center justify-center">
                <svg className="w-5 h-5 text-[#888]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-medium text-[#e4e4e7] tracking-tight">Search Records</h2>
                <p className="text-xs text-[#52525b]">Query the database</p>
              </div>
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap justify-center gap-2 mb-5">
              {columns.map((col) => (
                <button
                  key={col}
                  onClick={() => toggleFilter(col)}
                  className={`group relative px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-300 ${
                    activeFilters.includes(col)
                      ? 'text-[#e4e4e7]'
                      : 'text-[#52525b] hover:text-[#71717a]'
                  }`}
                >
                  {/* Chip background */}
                  <div className={`absolute inset-0 rounded-lg transition-all duration-300 ${
                    activeFilters.includes(col)
                      ? 'bg-gradient-to-b from-[#2a2a2e] to-[#1f1f22] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
                      : 'bg-[#18181b] group-hover:bg-[#1c1c1f]'
                  }`} />
                  {activeFilters.includes(col) && (
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/[0.07] via-transparent to-transparent" />
                  )}
                  <span className="relative">{col}</span>
                </button>
              ))}
            </div>

            {/* Search inputs */}
            <div className="space-y-3">
              {activeFilters.map((col) => (
                <div key={col} className="relative group">
                  <div className="absolute -inset-[1px] bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <input
                      type="text"
                      value={searchFields[col] || ''}
                      onChange={(e) => handleInputChange(col, e.target.value)}
                      placeholder={col}
                      className="w-full px-4 py-3.5 bg-[#0a0a0b] border border-[#222] rounded-xl text-[#e4e4e7] placeholder:text-[#3f3f46] focus:outline-none focus:border-[#333] transition-colors text-sm"
                    />
                    {searchFields[col] && (
                      <button
                        onClick={() => handleInputChange(col, '')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#52525b] hover:text-[#71717a] transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Status bar */}
            {hasSearched && (
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#1a1a1c]">
                <div className="text-xs">
                  {isSearching ? (
                    <span className="text-[#52525b] flex items-center gap-2">
                      <div className="w-3 h-3 border border-[#52525b] border-t-transparent rounded-full animate-spin" />
                      Searching...
                    </span>
                  ) : results ? (
                    <span className="text-[#71717a]">
                      <span className="text-[#a1a1aa] font-medium">{formatNumber(results.totalRecords)}</span> results
                      <span className="text-[#3f3f46] mx-2">·</span>
                      <span className="text-[#3f3f46]">{results.searchTime}ms</span>
                    </span>
                  ) : null}
                </div>
                {Object.values(searchFields).some(v => v) && (
                  <button
                    onClick={clearSearch}
                    className="text-xs text-[#52525b] hover:text-[#71717a] transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 w-full max-w-2xl overflow-y-auto px-6 pb-6">
        {!hasSearched ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-[#27272a] mb-3">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-sm text-[#3f3f46]">Type to search records</p>
          </div>
        ) : results && results.records.length > 0 ? (
          <div className="space-y-2">
            {results.records.map((record) => (
              <button
                key={record._index as number}
                onClick={() => onRecordClick(record)}
                className="group w-full text-left"
              >
                <div className="relative">
                  {/* Hover glow */}
                  <div className="absolute -inset-[1px] bg-gradient-to-r from-[#252528] via-[#1e1e20] to-[#252528] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className={`relative p-4 rounded-xl border transition-all duration-200 ${
                    record._exact
                      ? 'bg-[#0f1419] border-[#1e3a5f]/30'
                      : 'bg-[#111113] border-[#1a1a1c] group-hover:border-[#252528]'
                  }`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Primary row */}
                        <div className="flex items-center gap-2 mb-1">
                          {record._exact && (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-400/80 rounded">
                              Match
                            </span>
                          )}
                          {columns.slice(0, 2).map((col) => {
                            const val = record[col]
                            if (!val) return null
                            return (
                              <span key={col} className="text-sm text-[#e4e4e7] font-medium truncate">
                                {truncate(String(val), 25)}
                              </span>
                            )
                          }).filter(Boolean)}
                        </div>
                        {/* Secondary row */}
                        <div className="flex items-center gap-3 text-xs text-[#52525b]">
                          {columns.slice(2, 5).map((col) => {
                            const val = record[col]
                            if (!val) return null
                            return (
                              <span key={col} className="truncate">
                                {truncate(String(val), 20)}
                              </span>
                            )
                          }).filter(Boolean)}
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-[#3f3f46] group-hover:text-[#52525b] transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {results.totalRecords > results.records.length && (
              <p className="text-center text-[10px] text-[#3f3f46] pt-4 uppercase tracking-wider">
                {results.records.length} of {formatNumber(results.totalRecords)}
              </p>
            )}
          </div>
        ) : hasSearched && !isSearching ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-[#27272a] mb-3">
              <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
              </svg>
            </div>
            <p className="text-sm text-[#3f3f46]">No results found</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
