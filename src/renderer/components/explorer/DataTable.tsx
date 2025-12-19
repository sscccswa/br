import { useState } from 'react'
import { truncate } from '../../lib/utils'

interface DataTableProps {
  columns: string[]
  records: Record<string, unknown>[]
  isLoading: boolean
  onRecordClick: (record: Record<string, unknown>) => void
  onFilter: (field: string, value: string) => void
  filters: Record<string, string>
}

export function DataTable({
  columns,
  records,
  isLoading,
  onRecordClick,
  onFilter,
  filters,
}: DataTableProps) {
  const [filterColumn, setFilterColumn] = useState<string | null>(null)
  const [filterValue, setFilterValue] = useState('')

  const handleFilterSubmit = (col: string) => {
    onFilter(col, filterValue)
    setFilterColumn(null)
    setFilterValue('')
  }

  if (isLoading && records.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-[#a1a1aa]">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading data...</span>
        </div>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-[#3f3f46] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[#71717a]">No records found</p>
        </div>
      </div>
    )
  }

  return (
    <table className="w-full data-table">
      <thead>
        <tr className="border-b border-[#27272a]">
          <th className="w-16 px-3 py-2 text-left text-xs font-medium text-[#71717a] uppercase tracking-wider">
            #
          </th>
          {columns.map((col) => (
            <th
              key={col}
              className="px-3 py-2 text-left text-xs font-medium text-[#a1a1aa] uppercase tracking-wider min-w-[120px] max-w-[300px]"
            >
              <div className="flex items-center gap-2">
                <span className="truncate">{col}</span>
                <button
                  onClick={() => {
                    setFilterColumn(filterColumn === col ? null : col)
                    setFilterValue(filters[col] || '')
                  }}
                  className={`p-1 rounded hover:bg-[#27272a] ${
                    filters[col] ? 'text-blue-400' : 'text-[#71717a]'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </button>
              </div>
              {filterColumn === col && (
                <div className="absolute mt-1 p-2 bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl z-20">
                  <input
                    type="text"
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFilterSubmit(col)
                      if (e.key === 'Escape') setFilterColumn(null)
                    }}
                    placeholder={`Filter ${col}...`}
                    className="w-40 px-2 py-1 text-sm bg-[#09090b] border border-[#27272a] rounded focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <div className="flex gap-1 mt-2">
                    <button
                      onClick={() => handleFilterSubmit(col)}
                      className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
                    >
                      Apply
                    </button>
                    {filters[col] && (
                      <button
                        onClick={() => {
                          onFilter(col, '')
                          setFilterColumn(null)
                        }}
                        className="px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 rounded"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[#27272a]/50">
        {records.map((record, idx) => (
          <tr
            key={record._index as number}
            onClick={() => onRecordClick(record)}
            className="cursor-pointer hover:bg-[#18181b] transition-colors"
          >
            <td className="px-3 py-2 text-xs text-[#71717a] font-mono">
              {record._index as number}
            </td>
            {columns.map((col) => (
              <td
                key={col}
                className={`px-3 py-2 text-sm max-w-[300px] ${
                  record._exact ? 'text-[#fafafa]' : 'text-[#d4d4d8]'
                }`}
              >
                <span className="block truncate" title={String(record[col] || '')}>
                  {truncate(String(record[col] || ''), 50)}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
