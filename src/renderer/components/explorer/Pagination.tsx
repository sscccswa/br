import { useState } from 'react'
import { formatNumber } from '../../lib/utils'

interface PaginationProps {
  page: number
  totalPages: number
  from: number
  to: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, from, to, total, onPageChange }: PaginationProps) {
  const [jumpTo, setJumpTo] = useState('')

  const handleJump = () => {
    const pageNum = parseInt(jumpTo, 10)
    if (pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum)
      setJumpTo('')
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[#27272a] bg-[#18181b]">
      <div className="text-sm text-[#a1a1aa]">
        Showing <span className="text-[#fafafa] font-medium">{formatNumber(from)}</span> to{' '}
        <span className="text-[#fafafa] font-medium">{formatNumber(to)}</span> of{' '}
        <span className="text-[#fafafa] font-medium">{formatNumber(total)}</span> records
      </div>

      <div className="flex items-center gap-2">
        {/* Jump to page */}
        <div className="flex items-center gap-1">
          <span className="text-sm text-[#71717a]">Go to:</span>
          <input
            type="text"
            value={jumpTo}
            onChange={(e) => setJumpTo(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            placeholder={String(page)}
            className="w-16 px-2 py-1 text-sm text-center bg-[#09090b] border border-[#27272a] rounded focus:outline-none focus:border-blue-500"
          />
          <span className="text-sm text-[#71717a]">/ {formatNumber(totalPages)}</span>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-1 ml-4">
          <button
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            className="p-1.5 rounded hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed"
            title="First page"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="p-1.5 rounded hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1 mx-2">
            {getPageNumbers(page, totalPages).map((p, i) => (
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-[#71717a]">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => onPageChange(p as number)}
                  className={`w-8 h-8 text-sm rounded transition-colors ${
                    page === p
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-[#27272a] text-[#a1a1aa]'
                  }`}
                >
                  {p}
                </button>
              )
            ))}
          </div>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="p-1.5 rounded hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next page"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            className="p-1.5 rounded hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Last page"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | string)[] = []

  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total)
  } else if (current >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total)
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total)
  }

  return pages
}
