import { FileStats } from '../../../shared/types'
import { formatNumber } from '../../lib/utils'

interface DashboardProps {
  stats: FileStats | null
  totalRecords: number
}

export function Dashboard({ stats, totalRecords }: DashboardProps) {
  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-[#3f3f46] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-[#71717a]">No statistics available</p>
        </div>
      </div>
    )
  }

  const columns = Object.values(stats.columns)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Summary card */}
      <div className="mb-6">
        <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[#a1a1aa]">Total Records</p>
              <p className="text-3xl font-bold text-[#fafafa]">{formatNumber(totalRecords)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Column distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {columns.map((col) => (
          <ColumnCard key={col.name} column={col} total={totalRecords} />
        ))}
      </div>
    </div>
  )
}

interface ColumnCardProps {
  column: {
    name: string
    type: string
    unique: number
    distribution: Record<string, number>
  }
  total: number
}

function ColumnCard({ column, total }: ColumnCardProps) {
  const entries = Object.entries(column.distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const maxValue = entries[0]?.[1] || 1
  const colors = [
    'rgba(100, 140, 180, 0.7)',
    'rgba(120, 160, 130, 0.7)',
    'rgba(180, 140, 100, 0.7)',
    'rgba(160, 120, 160, 0.7)',
    'rgba(140, 160, 120, 0.7)',
  ]

  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-[#fafafa] truncate">{column.name}</h3>
        <span className="text-xs text-[#71717a]">{formatNumber(column.unique)} unique</span>
      </div>

      <div className="space-y-2">
        {entries.map(([value, count], i) => {
          const percent = (count / total) * 100
          const barPercent = (count / maxValue) * 100

          return (
            <div key={value} className="group">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[#d4d4d8] truncate max-w-[60%]" title={value}>
                  {value || '(empty)'}
                </span>
                <span className="text-[#71717a]">
                  {formatNumber(count)} ({percent.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 bg-[#09090b] rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${barPercent}%`,
                    backgroundColor: colors[i % colors.length],
                  }}
                />
              </div>
            </div>
          )
        })}

        {entries.length === 0 && (
          <p className="text-xs text-[#71717a] text-center py-4">No data</p>
        )}
      </div>
    </div>
  )
}
