import { useAppStore } from '../../stores/app-store'

export function TabBar() {
  const { files, activeFileId, setActiveFile, removeFile } = useAppStore()
  const fileList = Array.from(files.values())

  if (fileList.length === 0) return null

  return (
    <div className="h-10 bg-[#18181b] border-b border-[#27272a] flex items-end px-2 gap-1">
      {fileList.map(({ info }) => (
        <div
          key={info.id}
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-t text-sm cursor-pointer transition-colors ${
            activeFileId === info.id
              ? 'bg-[#09090b] text-[#fafafa]'
              : 'text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a]'
          }`}
          onClick={() => setActiveFile(info.id)}
        >
          <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${
            info.type === 'json' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {info.type.toUpperCase()}
          </span>
          <span className="truncate max-w-[150px]">{info.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeFile(info.id)
            }}
            className="p-0.5 rounded hover:bg-[#3f3f46] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
