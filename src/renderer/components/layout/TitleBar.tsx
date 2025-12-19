export function TitleBar() {
  return (
    <div className="h-8 bg-[#0c0c0e] flex items-center justify-between px-3 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Window controls - macOS style */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => window.electronAPI.windowClose()}
          className="group w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57] transition-colors flex items-center justify-center"
        >
          <svg className="w-2 h-2 text-[#820b07] opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <button
          onClick={() => window.electronAPI.windowMinimize()}
          className="group w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e] transition-colors flex items-center justify-center"
        >
          <svg className="w-2 h-2 text-[#9a6c01] opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          onClick={() => window.electronAPI.windowMaximize()}
          className="group w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840] transition-colors flex items-center justify-center"
        >
          <svg className="w-1.5 h-1.5 text-[#0a6518] opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M7 17L17 7M7 7h10v10" />
          </svg>
        </button>
      </div>

      {/* Title */}
      <span className="text-[10px] text-[#52525b] font-medium tracking-wider uppercase">
        Breach Explorer
      </span>

      {/* Spacer for balance */}
      <div className="w-14" />
    </div>
  )
}
