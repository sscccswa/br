import { useEffect } from 'react'

interface RecordModalProps {
  record: Record<string, unknown>
  onClose: () => void
}

export function RecordModal({ record, onClose }: RecordModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const entries = Object.entries(record).filter(([key]) => !key.startsWith('_'))

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] bg-[#18181b] border border-[#27272a] rounded-lg shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a]">
          <h3 className="text-lg font-medium text-[#fafafa]">Record Details</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-60px)] p-4 selectable">
          <div className="space-y-3">
            {entries.map(([key, value]) => (
              <div key={key} className="flex gap-3">
                <span className="text-sm font-medium text-[#a1a1aa] min-w-[140px] shrink-0">
                  {key}
                </span>
                <span className="text-sm text-[#fafafa] break-all">
                  {formatValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#27272a]">
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(record, null, 2))
            }}
            className="px-3 py-1.5 text-sm text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] rounded transition-colors"
          >
            Copy JSON
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-[#27272a] hover:bg-[#3f3f46] rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
