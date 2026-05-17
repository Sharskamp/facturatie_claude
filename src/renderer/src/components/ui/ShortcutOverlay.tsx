import { useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

const shortcuts = [
  { keys: ['Ctrl', 'N'], action: 'Nieuwe factuur' },
  { keys: ['Ctrl', 'Shift', 'K'], action: 'Klanten' },
  { keys: ['Ctrl', 'Shift', 'O'], action: 'Offertes' },
  { keys: ['Ctrl', 'Shift', 'E'], action: 'Uitgaven' },
  { keys: ['Ctrl', 'Shift', 'R'], action: 'Rapporten' },
  { keys: ['Ctrl', ','], action: 'Instellingen' },
  { keys: ['Ctrl', 'Shift', 'B'], action: 'Database backup' },
  { keys: ['?'], action: 'Deze hulp tonen/verbergen' },
  { keys: ['Escape'], action: 'Sluiten' },
]

export function ShortcutOverlay({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sneltoetsen</h2>
        <div className="grid grid-cols-1 gap-2">
          {shortcuts.map(({ keys, action }) => (
            <div key={action} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-600">{action}</span>
              <div className="flex items-center gap-1">
                {keys.map((key, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <kbd className="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-sm text-gray-700">
                      {key}
                    </kbd>
                    {i < keys.length - 1 && (
                      <span className="text-gray-400 text-xs">+</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-400 text-center">
          Druk op <kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-mono text-xs">Escape</kbd> of klik buiten dit venster om te sluiten
        </p>
      </div>
    </div>
  )
}
