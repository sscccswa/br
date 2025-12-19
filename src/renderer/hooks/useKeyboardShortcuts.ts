import { useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import { notify } from '../stores/notification-store'

interface ShortcutConfig {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  description: string
  handler: () => void
}

export function useKeyboardShortcuts() {
  const { files, activeFileId, setActiveFile, removeFile } = useAppStore()

  const openFile = useCallback(async () => {
    try {
      const paths = await window.electronAPI.openFileDialog()
      if (paths && paths.length > 0) {
        for (const filePath of paths) {
          const info = await window.electronAPI.getFileInfo(filePath)
          useAppStore.getState().addFile(info)
        }
      }
    } catch (error) {
      notify.error('Error opening file', error instanceof Error ? error.message : 'Unknown error')
    }
  }, [])

  const closeCurrentTab = useCallback(() => {
    if (activeFileId) {
      removeFile(activeFileId)
    }
  }, [activeFileId, removeFile])

  const switchToNextTab = useCallback(() => {
    const fileIds = Array.from(files.keys())
    if (fileIds.length <= 1) return

    const currentIndex = activeFileId ? fileIds.indexOf(activeFileId) : -1
    const nextIndex = (currentIndex + 1) % fileIds.length
    setActiveFile(fileIds[nextIndex])
  }, [files, activeFileId, setActiveFile])

  const switchToPrevTab = useCallback(() => {
    const fileIds = Array.from(files.keys())
    if (fileIds.length <= 1) return

    const currentIndex = activeFileId ? fileIds.indexOf(activeFileId) : 0
    const prevIndex = currentIndex === 0 ? fileIds.length - 1 : currentIndex - 1
    setActiveFile(fileIds[prevIndex])
  }, [files, activeFileId, setActiveFile])

  const focusSearch = useCallback(() => {
    const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]')
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
  }, [])

  const shortcuts: ShortcutConfig[] = [
    { key: 'o', ctrl: true, description: 'Open file', handler: openFile },
    { key: 'w', ctrl: true, description: 'Close current tab', handler: closeCurrentTab },
    { key: 'Tab', ctrl: true, description: 'Next tab', handler: switchToNextTab },
    { key: 'Tab', ctrl: true, shift: true, description: 'Previous tab', handler: switchToPrevTab },
    { key: 'f', ctrl: true, description: 'Focus search', handler: focusSearch },
    { key: '1', ctrl: true, description: 'Switch to tab 1', handler: () => switchToTab(0) },
    { key: '2', ctrl: true, description: 'Switch to tab 2', handler: () => switchToTab(1) },
    { key: '3', ctrl: true, description: 'Switch to tab 3', handler: () => switchToTab(2) },
    { key: '4', ctrl: true, description: 'Switch to tab 4', handler: () => switchToTab(3) },
    { key: '5', ctrl: true, description: 'Switch to tab 5', handler: () => switchToTab(4) },
    { key: '6', ctrl: true, description: 'Switch to tab 6', handler: () => switchToTab(5) },
    { key: '7', ctrl: true, description: 'Switch to tab 7', handler: () => switchToTab(6) },
    { key: '8', ctrl: true, description: 'Switch to tab 8', handler: () => switchToTab(7) },
    { key: '9', ctrl: true, description: 'Switch to last tab', handler: () => switchToTab(-1) },
  ]

  const switchToTab = (index: number) => {
    const fileIds = Array.from(files.keys())
    if (fileIds.length === 0) return

    if (index === -1) {
      // Last tab
      setActiveFile(fileIds[fileIds.length - 1])
    } else if (index < fileIds.length) {
      setActiveFile(fileIds[index])
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Only allow Escape and Ctrl+F in inputs
        if (event.key !== 'Escape' && !(event.ctrlKey && event.key === 'f')) {
          return
        }
      }

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey
        const altMatch = shortcut.alt ? event.altKey : !event.altKey
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()

        if (ctrlMatch && altMatch && shiftMatch && keyMatch) {
          event.preventDefault()
          shortcut.handler()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])

  return { shortcuts }
}

// Export for use in keyboard shortcuts help modal
export function getShortcutsList(): Array<{ key: string; description: string }> {
  return [
    { key: 'Ctrl+O', description: 'Open file' },
    { key: 'Ctrl+W', description: 'Close current tab' },
    { key: 'Ctrl+Tab', description: 'Next tab' },
    { key: 'Ctrl+Shift+Tab', description: 'Previous tab' },
    { key: 'Ctrl+F', description: 'Focus search' },
    { key: 'Ctrl+1-8', description: 'Switch to tab 1-8' },
    { key: 'Ctrl+9', description: 'Switch to last tab' },
    { key: 'Escape', description: 'Close modal / Clear search' },
  ]
}
