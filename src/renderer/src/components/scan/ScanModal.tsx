import { useState, useRef, useCallback } from 'react'
import { Loader2, ChevronLeft, ChevronRight, X, FolderOpen, Save, MousePointer, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ScanFormulier {
  nummer: string
  datum: string
  vervaldatum: string
  status: string
  klantNaam: string
  subtotaal: string
  btwBedrag: string
  totaal: string
}

export const LEEG_SCAN_FORMULIER: ScanFormulier = {
  nummer: '',
  datum: '',
  vervaldatum: '',
  status: 'OPENSTAAND',
  klantNaam: '',
  subtotaal: '',
  btwBedrag: '',
  totaal: '',
}

const VELDEN: { key: keyof ScanFormulier; label: string; type?: 'date' | 'number' | 'select'; opties?: string[] }[] = [
  { key: 'nummer',     label: 'Factuurnummer' },
  { key: 'datum',      label: 'Factuurdatum',  type: 'date' },
  { key: 'vervaldatum',label: 'Vervaldatum',   type: 'date' },
  { key: 'status',     label: 'Status',        type: 'select', opties: ['OPENSTAAND', 'BETAALD'] },
  { key: 'klantNaam',  label: 'Klant / Leverancier' },
  { key: 'subtotaal',  label: 'Subtotaal',     type: 'number' },
  { key: 'btwBedrag',  label: 'BTW-bedrag',    type: 'number' },
  { key: 'totaal',     label: 'Totaal',        type: 'number' },
]

type Modus = 'rij-eerst' | 'auto'

interface TekenBox { x: number; y: number; w: number; h: number }

interface Props {
  open: boolean
  onClose: () => void
  onOpslaan: (formulier: ScanFormulier, bonPad: string | null) => Promise<void>
}

export function ScanModal({ open, onClose, onOpslaan }: Props) {
  const [bestandPad, setBestandPad] = useState<string | null>(null)
  const [bonPad, setBonPad] = useState<string | null>(null)
  const [previewBase64, setPreviewBase64] = useState<string | null>(null)
  const [aantalPaginas, setAantalPaginas] = useState(1)
  const [huidigePagina, setHuidigePagina] = useState(1)
  const [formulier, setFormulier] = useState<ScanFormulier>(LEEG_SCAN_FORMULIER)
  const [geselecteerdVeld, setGeselecteerdVeld] = useState<keyof ScanFormulier | null>(null)
  const [modus, setModus] = useState<Modus>('rij-eerst')
  const [ladenPreview, setLadenPreview] = useState(false)
  const [ladenOcr, setLadenOcr] = useState(false)
  const [opslaan, setOpslaan] = useState(false)
  const [tekenbox, setTekenbox] = useState<TekenBox | null>(null)
  const [tekenStart, setTekenStart] = useState<{ x: number; y: number } | null>(null)
  const imgWrapperRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const resetState = () => {
    setBestandPad(null); setBonPad(null); setPreviewBase64(null)
    setAantalPaginas(1); setHuidigePagina(1)
    setFormulier(LEEG_SCAN_FORMULIER); setGeselecteerdVeld(null)
    setTekenbox(null); setTekenStart(null)
  }

  const handleClose = () => { resetState(); onClose() }

  const openBestand = async () => {
    setLadenPreview(true)
    try {
      const res = await window.api.scan.openEnPreview()
      if (!res.succes) return
      setBestandPad(res.bestandPad!)
      setBonPad(res.bonPad!)
      setPreviewBase64(res.previewBase64!)
      setAantalPaginas(res.aantalPaginas ?? 1)
      setHuidigePagina(1)
      if (res.velden && !res.velden.error) {
        const v = res.velden
        setFormulier({
          nummer:      v.nummer       ?? '',
          datum:       v.datum        ?? '',
          vervaldatum: v.vervaldatum  ?? '',
          status:      'OPENSTAAND',
          klantNaam:   v.klantNaam    ?? '',
          subtotaal:   v.subtotaal    != null ? String(v.subtotaal)  : '',
          btwBedrag:   v.btwBedrag    != null ? String(v.btwBedrag)  : '',
          totaal:      v.totaal       != null ? String(v.totaal)     : '',
        })
      }
    } finally {
      setLadenPreview(false)
    }
  }

  const navigeerPagina = async (richting: 1 | -1) => {
    const nieuw = huidigePagina + richting
    if (nieuw < 1 || nieuw > aantalPaginas || !bestandPad) return
    setLadenPreview(true)
    try {
      const res = await window.api.scan.renderPagina({ bestandPad, pagina: nieuw })
      if (res.succes) { setPreviewBase64(res.previewBase64!); setHuidigePagina(nieuw) }
    } finally { setLadenPreview(false) }
  }

  // Relatieve positie t.o.v. de image wrapper (0-1)
  const getRelPos = useCallback((e: React.MouseEvent) => {
    const el = imgWrapperRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    }
  }, [])

  const onMouseDown = (e: React.MouseEvent) => {
    if (!previewBase64 || e.button !== 0) return
    e.preventDefault()
    setTekenStart(getRelPos(e))
    setTekenbox(null)
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!tekenStart) return
    e.preventDefault()
    const pos = getRelPos(e)
    setTekenbox({
      x: Math.min(tekenStart.x, pos.x),
      y: Math.min(tekenStart.y, pos.y),
      w: Math.abs(pos.x - tekenStart.x),
      h: Math.abs(pos.y - tekenStart.y),
    })
  }

  const onMouseUp = async (e: React.MouseEvent) => {
    if (!tekenStart || !bestandPad) { setTekenStart(null); return }
    const box = tekenbox
    setTekenStart(null)
    if (!box || box.w < 0.005 || box.h < 0.005) { setTekenbox(null); return }

    setLadenOcr(true)
    try {
      const res = await window.api.scan.ocrUitsnede({
        bestandPad,
        pagina: huidigePagina,
        x: box.x, y: box.y, breedte: box.w, hoogte: box.h,
      })
      if (res.succes && res.tekst) {
        const tekst = res.tekst.trim()
        if (modus === 'rij-eerst' && geselecteerdVeld) {
          setFormulier(prev => ({ ...prev, [geselecteerdVeld]: tekst }))
          setGeselecteerdVeld(null)
        } else {
          const veldKey = autoDetecteerVeld(tekst)
          if (veldKey) setFormulier(prev => ({ ...prev, [veldKey]: tekst }))
        }
      }
    } finally {
      setLadenOcr(false)
      setTekenbox(null)
    }
  }

  const autoDetecteerVeld = (tekst: string): keyof ScanFormulier | null => {
    const schoon = tekst.replace(/[€\s]/g, '').trim()
    // Datum: dd-mm-yyyy of yyyy-mm-dd
    if (/^\d{2}[-./]\d{2}[-./]\d{4}$|^\d{4}[-./]\d{2}[-./]\d{2}$/.test(schoon)) {
      if (!formulier.datum) return 'datum'
      if (!formulier.vervaldatum) return 'vervaldatum'
      return 'datum'
    }
    // Bedrag
    const bedrag = parseFloat(schoon.replace(',', '.'))
    if (!isNaN(bedrag) && bedrag > 0) {
      if (!formulier.totaal)     return 'totaal'
      if (!formulier.subtotaal)  return 'subtotaal'
      if (!formulier.btwBedrag)  return 'btwBedrag'
    }
    // Factuurnummer: alfanumeriek met streepje
    if (/^[A-Z0-9][-A-Z0-9/_.]{1,25}$/i.test(schoon) && !formulier.nummer) return 'nummer'
    // Naam
    if (tekst.length > 1 && tekst.length < 80 && !formulier.klantNaam) return 'klantNaam'
    return null
  }

  const handleOpslaan = async () => {
    setOpslaan(true)
    try {
      await onOpslaan(formulier, bonPad)
      handleClose()
    } finally {
      setOpslaan(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {/* Topbalk */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white shrink-0 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">Document scannen</span>
          {bestandPad && (
            <span className="text-gray-400 text-xs truncate max-w-xs">
              {bestandPad.split(/[\\/]/).pop()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bestandPad && (
            <button
              onClick={() => setModus(m => m === 'rij-eerst' ? 'auto' : 'rij-eerst')}
              title={modus === 'rij-eerst' ? 'Modus: selecteer rij → teken box' : 'Modus: teken box → auto-detecteer veld'}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                modus === 'rij-eerst'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-amber-600 text-white'
              }`}
            >
              {modus === 'rij-eerst'
                ? <><MousePointer className="h-3 w-3" /> Rij → Box</>
                : <><Wand2 className="h-3 w-3" /> Auto-detecteer</>
              }
            </button>
          )}
          <button onClick={handleClose} className="p-1.5 rounded hover:bg-gray-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* ── Links: veldentabel ── */}
        <div className="w-[400px] shrink-0 bg-white flex flex-col border-r border-gray-200 overflow-hidden">
          {!bestandPad ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <FolderOpen className="h-12 w-12 text-gray-300" />
              <p className="text-gray-500 text-sm">Open een factuur of bon om te beginnen.<br/>Velden worden automatisch herkend.</p>
              <Button onClick={openBestand} disabled={ladenPreview}>
                {ladenPreview ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FolderOpen className="h-4 w-4 mr-2" />}
                Bestand openen
              </Button>
            </div>
          ) : (
            <>
              {/* Status balk */}
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 text-xs text-gray-500 flex items-center gap-2 min-h-[36px]">
                {ladenOcr
                  ? <><Loader2 className="h-3 w-3 animate-spin text-indigo-500" /><span className="text-indigo-600">OCR bezig…</span></>
                  : modus === 'rij-eerst'
                    ? geselecteerdVeld
                      ? <><span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" /><span><strong>{VELDEN.find(v => v.key === geselecteerdVeld)?.label}</strong> geselecteerd — teken nu een box in de preview</span></>
                      : <><span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />Klik een veld aan, teken dan een box in de preview</>
                    : <><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />Teken een box — veld wordt automatisch herkend</>
                }
              </div>

              {/* Veldentabel */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {VELDEN.map(veld => {
                      const geselecteerd = geselecteerdVeld === veld.key
                      const heeftWaarde = !!formulier[veld.key]
                      return (
                        <tr
                          key={veld.key}
                          onClick={() => modus === 'rij-eerst' && setGeselecteerdVeld(prev => prev === veld.key ? null : veld.key)}
                          className={`border-b border-gray-100 transition-colors ${
                            geselecteerd
                              ? 'bg-indigo-50 ring-inset ring-1 ring-indigo-300 cursor-default'
                              : modus === 'rij-eerst' ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                          }`}
                        >
                          <td className={`px-3 py-2 whitespace-nowrap w-36 font-medium select-none text-xs ${geselecteerd ? 'text-indigo-700' : 'text-gray-500'}`}>
                            {veld.label}
                            {geselecteerd && <span className="ml-1 text-indigo-400">←</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            {veld.type === 'select' ? (
                              <select
                                value={formulier[veld.key]}
                                onChange={e => setFormulier(prev => ({ ...prev, [veld.key]: e.target.value }))}
                                onClick={e => e.stopPropagation()}
                                className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                              >
                                {veld.opties!.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input
                                type={veld.type ?? 'text'}
                                value={formulier[veld.key]}
                                onChange={e => setFormulier(prev => ({ ...prev, [veld.key]: e.target.value }))}
                                onClick={e => e.stopPropagation()}
                                placeholder="—"
                                className={`w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                                  heeftWaarde ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
                                }`}
                              />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer met opslaan */}
              <div className="p-3 border-t border-gray-200 space-y-2">
                <button
                  onClick={openBestand}
                  disabled={ladenPreview}
                  className="w-full text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 py-1"
                >
                  <FolderOpen className="h-3 w-3" /> Ander bestand openen
                </button>
                <Button onClick={handleOpslaan} disabled={opslaan} className="w-full">
                  {opslaan ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Opslaan
                </Button>
              </div>
            </>
          )}
        </div>

        {/* ── Rechts: document preview ── */}
        <div className="flex-1 bg-gray-800 flex flex-col min-w-0 overflow-hidden">
          {ladenPreview ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="h-10 w-10 animate-spin" />
              <span className="text-sm">Document laden…</span>
            </div>
          ) : previewBase64 ? (
            <>
              <div className="flex-1 overflow-auto flex items-start justify-center p-6">
                {/* Wrapper: exact zo groot als de afbeelding, voor correcte box-overlay */}
                <div
                  ref={imgWrapperRef}
                  className="relative inline-block select-none"
                  style={{ cursor: previewBase64 ? 'crosshair' : 'default' }}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                >
                  <img
                    ref={imgRef}
                    src={`data:image/png;base64,${previewBase64}`}
                    alt="Document preview"
                    className="block shadow-2xl"
                    style={{ maxHeight: 'calc(100vh - 140px)', maxWidth: '100%' }}
                    draggable={false}
                  />
                  {/* Teken-overlay */}
                  {tekenbox && (
                    <div
                      className="absolute border-2 border-indigo-400 bg-indigo-400/10 pointer-events-none"
                      style={{
                        left:   `${tekenbox.x * 100}%`,
                        top:    `${tekenbox.y * 100}%`,
                        width:  `${tekenbox.w * 100}%`,
                        height: `${tekenbox.h * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Paginanavigatie */}
              {aantalPaginas > 1 && (
                <div className="flex items-center justify-center gap-3 py-2 bg-gray-900 text-white text-sm shrink-0">
                  <button
                    onClick={() => navigeerPagina(-1)}
                    disabled={huidigePagina <= 1 || ladenPreview}
                    className="p-1 disabled:opacity-40 hover:text-indigo-300 transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-xs">Pagina {huidigePagina} / {aantalPaginas}</span>
                  <button
                    onClick={() => navigeerPagina(1)}
                    disabled={huidigePagina >= aantalPaginas || ladenPreview}
                    className="p-1 disabled:opacity-40 hover:text-indigo-300 transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm gap-3">
              <div>Geen preview beschikbaar</div>
              <div className="text-xs text-gray-400 max-w-md text-center">
                PDF preview werkt niet goed, maar OCR functie werkt prima!<br/>
                Klik op een veld en teken een box om tekst te extraheren.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
