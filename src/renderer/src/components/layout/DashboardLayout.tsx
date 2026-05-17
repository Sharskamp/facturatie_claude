import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { useEffect, useState } from 'react'
import { ShortcutOverlay } from '@/components/ui/ShortcutOverlay'

export default function DashboardLayout() {
  const navigate = useNavigate()
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false)
  const [updateGedownload, setUpdateGedownload] = useState(false)

  useEffect(() => {
    window.api.updates.onGedownload(() => setUpdateGedownload(true))
    return () => window.api.updates.verwijderListeners()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement
      const tag = active?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      // ? → toggle shortcut overlay (no modifier needed, skip when typing)
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !isTyping) {
        e.preventDefault()
        setShortcutOverlayOpen((prev) => !prev)
        return
      }

      // Escape → close overlay if open
      if (e.key === 'Escape') {
        setShortcutOverlayOpen((prev) => {
          if (prev) {
            e.preventDefault()
            return false
          }
          return prev
        })
        return
      }

      // All remaining shortcuts require Ctrl/Meta and skip when typing
      if ((!e.ctrlKey && !e.metaKey) || isTyping) return

      if (e.key === 'n' && !e.shiftKey) {
        e.preventDefault()
        navigate('/facturen/nieuw')
        return
      }

      if (e.key === 'K' && e.shiftKey) {
        e.preventDefault()
        navigate('/klanten')
        return
      }

      if (e.key === 'O' && e.shiftKey) {
        e.preventDefault()
        navigate('/offertes')
        return
      }

      if (e.key === 'E' && e.shiftKey) {
        e.preventDefault()
        navigate('/uitgaven')
        return
      }

      if (e.key === 'R' && e.shiftKey) {
        e.preventDefault()
        navigate('/rapporten')
        return
      }

      if (e.key === ',' && !e.shiftKey) {
        e.preventDefault()
        navigate('/instellingen')
        return
      }

      if (e.key === 'B' && e.shiftKey) {
        e.preventDefault()
        window.api.app.backup()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <ShortcutOverlay
        open={shortcutOverlayOpen}
        onClose={() => setShortcutOverlayOpen(false)}
      />
      {updateGedownload && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-indigo-600 text-white px-6 py-3 flex items-center justify-between shadow-lg">
          <span className="text-sm font-medium">
            Een nieuwe versie is beschikbaar en klaar om te installeren.
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => window.api.updates.installeer()}
              className="bg-white text-indigo-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Nu installeren
            </button>
            <button
              onClick={() => setUpdateGedownload(false)}
              className="text-indigo-200 hover:text-white text-sm font-medium transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
