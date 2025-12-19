import { useState, useEffect, useCallback } from 'react'
import { Download } from 'lucide-react'
import { FileInfo, FileStats, PageResult, SearchResult, ExportOptions } from '../../../shared/types'
import { DataTable } from './DataTable'
import { Pagination } from './Pagination'
import { RecordModal } from './RecordModal'
import { Dashboard } from '../dashboard/Dashboard'
import { SearchMode } from './SearchMode'
import { formatNumber } from '../../lib/utils'
import { notify } from '../../stores/notification-store'

interface DataExplorerProps {
  file: {
    info: FileInfo
    stats: FileStats | null
  }
}

type ViewMode = 'browse' | 'search' | 'dashboard'

export function DataExplorer({ file }: DataExplorerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('browse')
  const [page, setPage] = useState(1)
  const [limit] = useState(100)
  const [data, setData] = useState<PageResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  const columns = file.info.columns || []

  const handleExport = async (format: 'csv' | 'json') => {
    setIsExporting(true)
    setExportMenuOpen(false)

    try {
      const options: ExportOptions = {
        fileId: file.info.id,
        format,
        filters: viewMode === 'browse' ? filters : undefined,
      }

      const result = await window.electronAPI.exportData(options)

      if (result.success) {
        notify.success('Export successful', `Saved to ${result.path}`)
      } else if (result.error !== 'Export cancelled') {
        notify.error('Export failed', result.error)
      }
    } catch (error) {
      notify.error('Export failed', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsExporting(false)
    }
  }

  const loadData = useCallback(async (retryCount = 0) => {
    if (viewMode !== 'browse') return
    setIsLoading(true)
    try {
      const result = await window.electronAPI.getPage({
        fileId: file.info.id,
        page,
        limit,
        filters,
      })

      // If we got 0 records but the file should have records, retry after a short delay
      // This handles the case where the database is still initializing
      if (result.totalRecords === 0 && file.info.totalRecords && file.info.totalRecords > 0 && retryCount < 3) {
        setTimeout(() => loadData(retryCount + 1), 200)
        return
      }

      setData(result)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [file.info.id, file.info.totalRecords, page, limit, filters, viewMode])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [filters])

  const handleFilter = (field: string, value: string) => {
    setFilters(prev => {
      if (value) {
        return { ...prev, [field]: value }
      } else {
        const next = { ...prev }
        delete next[field]
        return next
      }
    })
  }

  const handleRecordClick = async (record: Record<string, unknown>) => {
    const index = record._index as number
    const fullRecord = await window.electronAPI.getRecord(file.info.id, index)
    setSelectedRecord(fullRecord)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a]">
        <div className="flex items-center gap-4">
          {/* Mode Toggle */}
          <div className="flex items-center bg-[#18181b] rounded-full p-1">
            <button
              onClick={() => setViewMode('browse')}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
                viewMode === 'browse'
                  ? 'bg-[#27272a] text-[#fafafa] shadow-sm'
                  : 'text-[#71717a] hover:text-[#a1a1aa]'
              }`}
            >
              Browse
            </button>
            <button
              onClick={() => setViewMode('search')}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
                viewMode === 'search'
                  ? 'bg-[#27272a] text-[#fafafa] shadow-sm'
                  : 'text-[#71717a] hover:text-[#a1a1aa]'
              }`}
            >
              Search
            </button>
          </div>

          {/* Dashboard button */}
          <button
            onClick={() => setViewMode(viewMode === 'dashboard' ? 'browse' : 'dashboard')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'dashboard'
                ? 'bg-[#27272a] text-[#fafafa]'
                : 'text-[#71717a] hover:text-[#a1a1aa] hover:bg-[#18181b]'
            }`}
            title="Dashboard"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>

          {/* Record count */}
          {viewMode === 'browse' && data && (
            <span className="text-sm text-[#71717a]">
              {formatNumber(data.totalRecords)} records
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Clear filters (browse mode) */}
          {viewMode === 'browse' && Object.keys(filters).length > 0 && (
            <button
              onClick={() => setFilters({})}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Clear filters
            </button>
          )}

          {/* Export button */}
          {viewMode !== 'dashboard' && (
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                disabled={isExporting}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#a1a1aa] hover:text-[#fafafa] bg-[#18181b] hover:bg-[#27272a] rounded-lg transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isExporting ? 'Exporting...' : 'Export'}
              </button>

              {exportMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setExportMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-[#18181b] border border-[#27272a] rounded-lg shadow-lg py-1 min-w-[120px]">
                    <button
                      onClick={() => handleExport('csv')}
                      className="w-full px-3 py-2 text-sm text-left text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition-colors"
                    >
                      Export as CSV
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="w-full px-3 py-2 text-sm text-left text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition-colors"
                    >
                      Export as JSON
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {viewMode === 'browse' && (
        <>
          <div className="flex-1 overflow-auto">
            <DataTable
              columns={columns}
              records={data?.records || []}
              isLoading={isLoading}
              onRecordClick={handleRecordClick}
              onFilter={handleFilter}
              filters={filters}
            />
          </div>

          {data && (
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              from={data.from}
              to={data.to}
              total={data.totalRecords}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {viewMode === 'search' && (
        <SearchMode
          fileId={file.info.id}
          columns={columns.slice(0, 6)}
          onRecordClick={handleRecordClick}
        />
      )}

      {viewMode === 'dashboard' && (
        <Dashboard stats={file.stats} totalRecords={file.info.totalRecords || 0} />
      )}

      {/* Record modal */}
      {selectedRecord && (
        <RecordModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  )
}
