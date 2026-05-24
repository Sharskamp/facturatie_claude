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
  { key: 'nummer', label: 'Factuurnummer' },
  { key: 'datum', label: 'Factuurdatum', type: 'date' },
  { key: 'vervaldatum', label: 'Vervaldatum', type: 'date' },
  { key: 'status', label: 'Status', type: 'select', opties: ['OPENSTAAND', 'BETAALD'] },
  { key: 'klantNaam', label: 'Klant / Leverancier' },
  { key: 'subtotaal', label: 'Subtotaal', type: 'number' },
  { key: 'btwBedrag', label: 'BTW-bedrag', type: 'number' },
  { key: 'totaal', label: 'Totaal', type: 'number' },
]

type Modus = 'rij-eerst' | 'auto'

interface TekenBox {
  x: number
  y: number
  w: number
  h: number
}

interface MatchBox {
  tekst: string
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  open: boolean
  onClose: () => void
  onOpslaan: (formulier: ScanFormulier, bonPad: string | null) => Promise<void>
}

export function ScanModal({ open, onClose, onOpslaan }: Props) {
  const [bestandPad, setBestandPad] = useState<string | null>(null)
  const [bonPad, setBonPad] = useState<string | null>(null)
  const [previewBase64, setPreviewBase64] = useState<string | null>(null)
  const [isPdf, setIsPdf] = useState(false)
  const [previewGeladen, setPreviewGeladen] = useState(false)
  const [aantalPaginas, setAantalPaginas] = useState(1)
  const [huidigePagina, setHuidigePagina] = useState(1)
  const [formulier, setFormulier] = useState<ScanFormulier>(LEEG_SCAN_FORMULIER)
  const [geselecteerdVeld, setGeselecteerdVeld] = useState<keyof ScanFormulier | null>(null)
  const [modus, setModus] = useState<Modus>('rij-eerst')
  const [ladenPreview, setLadenPreview] = useState(false)
  const [ladenOcr, setLadenOcr] = useState(false)
  const [opslaan, setOpslaan] = useState(false)
  const [tekenbox, setTekenbox] = useState<TekenBox | null>(null)
  const [laatsteSelectieBox, setLaatsteSelectieBox] = useState<TekenBox | null>(null)
  const [laatsteMatchBoxes, setLaatsteMatchBoxes] = useState<MatchBox[]>([])
  const [laatsteDebugPreview, setLaatsteDebugPreview] = useState<string | null>(null)
  const [laatsteDebugTekst, setLaatsteDebugTekst] = useState('')
  const [laatsteDebugBron, setLaatsteDebugBron] = useState<string | null>(null)
  const tekenStartRef = useRef<{ x: number; y: number } | null>(null)
  const tekenboxRef = useRef<TekenBox | null>(null)
  const imgWrapperRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const resetState = () => {
    setBestandPad(null)
    setBonPad(null)
    setPreviewBase64(null)
    setIsPdf(false)
    setPreviewGeladen(false)
    setAantalPaginas(1)
    setHuidigePagina(1)
    setFormulier(LEEG_SCAN_FORMULIER)
    setGeselecteerdVeld(null)
    setTekenbox(null)
    setLaatsteSelectieBox(null)
    setLaatsteMatchBoxes([])
    setLaatsteDebugPreview(null)
    setLaatsteDebugTekst('')
    setLaatsteDebugBron(null)
    tekenStartRef.current = null
    tekenboxRef.current = null
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const openBestand = async () => {
    setLadenPreview(true)
    setPreviewGeladen(false)

    try {
      const res = await window.api.scan.openEnPreview()
      if (!res.succes) return

      const pad = res.bestandPad!
      const ext = pad.split(/[/\\]/).pop()?.split('.').pop()?.toLowerCase()

      setBestandPad(pad)
      setBonPad(res.bonPad!)
      setAantalPaginas(res.aantalPaginas ?? 1)
      setHuidigePagina(1)
      setIsPdf(ext === 'pdf')
      setPreviewBase64(res.previewBase64 ?? null)
      setPreviewGeladen(!!res.previewBase64)

      if (res.velden && !res.velden.error) {
        const v = res.velden
        setFormulier({
          nummer: v.nummer ?? '',
          datum: v.datum ?? '',
          vervaldatum: v.vervaldatum ?? '',
          status: 'OPENSTAAND',
          klantNaam: v.klantNaam ?? '',
          subtotaal: v.subtotaal != null ? String(v.subtotaal) : '',
          btwBedrag: v.btwBedrag != null ? String(v.btwBedrag) : '',
          totaal: v.totaal != null ? String(v.totaal) : '',
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
    setPreviewGeladen(false)

    try {
      const res = await window.api.scan.renderPagina({ bestandPad, pagina: nieuw })
      if (res.succes && res.previewBase64) {
        setHuidigePagina(nieuw)
        setPreviewBase64(res.previewBase64)
        setPreviewGeladen(true)
      }
    } finally {
      setLadenPreview(false)
    }
  }

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
    if (!previewGeladen || e.button !== 0) {
      console.log('[SCAN] onMouseDown genegeerd - previewGeladen:', previewGeladen, 'button:', e.button)
      return
    }

    const pos = getRelPos(e)
    console.log('[SCAN] Tekenen gestart op:', pos, '| modus:', modus, '| geselecteerdVeld:', geselecteerdVeld)
    tekenStartRef.current = pos
    tekenboxRef.current = null
    setTekenbox(null)
    setLaatsteSelectieBox(null)
    setLaatsteMatchBoxes([])
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!tekenStartRef.current) return

    e.preventDefault()
    const pos = getRelPos(e)
    const box = {
      x: Math.min(tekenStartRef.current.x, pos.x),
      y: Math.min(tekenStartRef.current.y, pos.y),
      w: Math.abs(pos.x - tekenStartRef.current.x),
      h: Math.abs(pos.y - tekenStartRef.current.y),
    }

    tekenboxRef.current = box
    setTekenbox(box)
  }

  const onMouseUp = async () => {
    if (!tekenStartRef.current) {
      console.log('[SCAN] onMouseUp: geen tekenStart, negeer')
      return
    }

    if (!bestandPad) {
      console.log('[SCAN] onMouseUp: geen bestandPad geladen')
      tekenStartRef.current = null
      return
    }

    const box = tekenboxRef.current
    tekenStartRef.current = null
    tekenboxRef.current = null

    console.log('[SCAN] Box afgerond:', box, '| modus:', modus, '| geselecteerdVeld:', geselecteerdVeld)
    setLaatsteSelectieBox(box)

    if (!box || box.w < 0.005 || box.h < 0.005) {
      console.log('[SCAN] Box te klein of null, OCR overgeslagen')
      setTekenbox(null)
      setLaatsteSelectieBox(null)
      return
    }

    if (modus === 'rij-eerst' && !geselecteerdVeld) {
      console.log('[SCAN] Rij-eerst modus maar geen veld geselecteerd - valt terug op auto-detectie')
    }

    setLadenOcr(true)

    try {
      const imgEl = imgRef.current
      if (imgEl) {
        console.log('[SCAN] Preview weergave:', imgEl.getBoundingClientRect().width.toFixed(0), 'x', imgEl.getBoundingClientRect().height.toFixed(0), 'CSS px')
        console.log('[SCAN] Preview natuurlijk:', imgEl.naturalWidth, 'x', imgEl.naturalHeight, 'px')
      }

      console.log('[SCAN] devicePixelRatio:', window.devicePixelRatio)

      const params = { bestandPad, pagina: huidigePagina, x: box.x, y: box.y, breedte: box.w, hoogte: box.h }
      console.log('[SCAN] IPC scan:ocrUitsnede aanroepen met:', params)
      const res = await window.api.scan.ocrUitsnede(params)
      console.log('[SCAN] IPC antwoord:', res)
      setLaatsteDebugPreview(res.debugPreviewBase64 ?? null)
      setLaatsteDebugTekst(res.tekst?.trim() ?? '')
      setLaatsteDebugBron(res.bron ?? null)
      setLaatsteMatchBoxes(res.matchBoxes ?? [])

      if (res.succes && res.tekst) {
        const tekst = res.tekst.trim()
        console.log('[SCAN] Geextraheerde tekst:', JSON.stringify(tekst))

        if (modus === 'rij-eerst' && geselecteerdVeld) {
          setFormulier((prev) => ({ ...prev, [geselecteerdVeld]: tekst }))
          setGeselecteerdVeld(null)
          console.log('[SCAN] Veld ingevuld:', geselecteerdVeld, '=', tekst)
        } else {
          const veldKey = autoDetecteerVeld(tekst)
          console.log('[SCAN] Auto-detect veld:', veldKey, 'voor tekst:', JSON.stringify(tekst))
          setFormulier((prev) => ({ ...prev, [veldKey]: tekst }))
          console.log('[SCAN] Auto-detect ingevuld:', veldKey, '=', tekst)
        }
      } else {
        console.log('[SCAN] OCR leverde geen tekst op:', res)
      }
    } finally {
      setLadenOcr(false)
      setTekenbox(null)
    }
  }

  const autoDetecteerVeld = (tekst: string): keyof ScanFormulier => {
    const schoon = tekst.replace(/[€\s]/g, '').trim()

    if (/^\d{2}[-./]\d{2}[-./]\d{4}$|^\d{4}[-./]\d{2}[-./]\d{2}$/.test(schoon)) {
      return formulier.datum ? 'vervaldatum' : 'datum'
    }

    const bedrag = parseFloat(schoon.replace(',', '.'))
    if (!Number.isNaN(bedrag) && bedrag > 0) {
      if (!formulier.totaal) return 'totaal'
      if (!formulier.subtotaal) return 'subtotaal'
      if (!formulier.btwBedrag) return 'btwBedrag'
      return 'totaal'
    }

    if (/^[A-Z0-9][-A-Z0-9/_.]{1,25}$/i.test(schoon)) return 'nummer'
    return 'klantNaam'
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
    <div
      className="fixed inset-0 z-50 flex flex-col bg-gray-950"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-900 px-4 py-2 text-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Document scannen</span>
          {bestandPad && (
            <span className="max-w-xs truncate text-xs text-gray-400">
              {bestandPad.split(/[\\/]/).pop()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bestandPad && (
            <button
              onClick={() => setModus((m) => (m === 'rij-eerst' ? 'auto' : 'rij-eerst'))}
              title={modus === 'rij-eerst' ? 'Modus: selecteer rij en teken daarna een box' : 'Modus: teken een box en detecteer automatisch'}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                modus === 'rij-eerst' ? 'bg-indigo-600 text-white' : 'bg-amber-600 text-white'
              }`}
            >
              {modus === 'rij-eerst'
                ? <><MousePointer className="h-3 w-3" /> Rij {'->'} Box</>
                : <><Wand2 className="h-3 w-3" /> Auto-detecteer</>}
            </button>
          )}
          <button onClick={handleClose} className="rounded p-1.5 transition-colors hover:bg-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex w-[400px] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
          {!bestandPad ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <FolderOpen className="h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500">
                Open een factuur of bon om te beginnen.
                <br />
                Velden worden automatisch herkend.
              </p>
              <Button onClick={openBestand} disabled={ladenPreview}>
                {ladenPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                Bestand openen
              </Button>
            </div>
          ) : (
            <>
              <div className="flex min-h-[36px] items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                {ladenOcr ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                    <span className="text-indigo-600">OCR bezig...</span>
                  </>
                ) : modus === 'rij-eerst' ? (
                  geselecteerdVeld ? (
                    <>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                      <span>
                        <strong>{VELDEN.find((v) => v.key === geselecteerdVeld)?.label}</strong> geselecteerd - teken nu een box in de preview
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-gray-300" />
                      Klik een veld aan, teken dan een box in de preview
                    </>
                  )
                ) : (
                  <>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                    Teken een box - veld wordt automatisch herkend
                  </>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {VELDEN.map((veld) => {
                      const geselecteerd = geselecteerdVeld === veld.key
                      const heeftWaarde = !!formulier[veld.key]

                      return (
                        <tr
                          key={veld.key}
                          onClick={() => modus === 'rij-eerst' && setGeselecteerdVeld((prev) => (prev === veld.key ? null : veld.key))}
                          className={`border-b border-gray-100 transition-colors ${
                            geselecteerd
                              ? 'cursor-default bg-indigo-50 ring-1 ring-inset ring-indigo-300'
                              : modus === 'rij-eerst'
                                ? 'cursor-pointer hover:bg-gray-50'
                                : 'cursor-default'
                          }`}
                        >
                          <td className={`w-36 select-none whitespace-nowrap px-3 py-2 text-xs font-medium ${geselecteerd ? 'text-indigo-700' : 'text-gray-500'}`}>
                            {veld.label}
                            {geselecteerd && <span className="ml-1 text-indigo-400">{'<-'}</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            {veld.type === 'select' ? (
                              <select
                                value={formulier[veld.key]}
                                onChange={(e) => setFormulier((prev) => ({ ...prev, [veld.key]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              >
                                {veld.opties!.map((optie) => (
                                  <option key={optie} value={optie}>{optie}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={veld.type ?? 'text'}
                                value={formulier[veld.key]}
                                onChange={(e) => setFormulier((prev) => ({ ...prev, [veld.key]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="-"
                                className={`w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
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

              <div className="space-y-2 border-t border-gray-200 p-3">
                <button
                  onClick={openBestand}
                  disabled={ladenPreview}
                  className="flex w-full items-center justify-center gap-1 py-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  <FolderOpen className="h-3 w-3" /> Ander bestand openen
                </button>
                <Button onClick={handleOpslaan} disabled={opslaan} className="w-full">
                  {opslaan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Opslaan
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-gray-800">
          {(!previewGeladen || ladenPreview) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-800">
              {ladenPreview || (bestandPad && !previewGeladen) ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
                  <span className="text-sm text-gray-400">Document laden...</span>
                </>
              ) : (
                <>
                  <FolderOpen className="h-12 w-12 text-gray-600" />
                  <span className="text-sm text-gray-500">Open een bestand om te beginnen</span>
                </>
              )}
            </div>
          )}

          <div className="flex flex-1 items-start justify-center overflow-auto p-6">
            <div className="flex gap-6 items-start">
              <div
                ref={imgWrapperRef}
                className="relative inline-block select-none"
                style={{ cursor: previewGeladen ? 'crosshair' : 'default' }}
                onMouseDown={onMouseDown}
              >
                {previewBase64 && (
                  <img
                    ref={imgRef}
                    src={`data:image/png;base64,${previewBase64}`}
                    alt={`Document preview${isPdf ? ' PDF' : ''}`}
                    className="block shadow-2xl"
                    style={{ maxHeight: 'calc(100vh - 140px)', maxWidth: '100%' }}
                    draggable={false}
                  />
                )}

                {laatsteSelectieBox && (
                  <div
                    className="pointer-events-none absolute border-2 border-sky-400"
                    style={{
                      left: `${laatsteSelectieBox.x * 100}%`,
                      top: `${laatsteSelectieBox.y * 100}%`,
                      width: `${laatsteSelectieBox.w * 100}%`,
                      height: `${laatsteSelectieBox.h * 100}%`,
                    }}
                  />
                )}

                {laatsteMatchBoxes.map((box, index) => (
                  <div
                    key={`${box.tekst}-${index}`}
                    className="pointer-events-none absolute border border-emerald-400 bg-emerald-400/15"
                    title={box.tekst}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                    }}
                  />
                ))}

                {tekenbox && (
                  <div
                    className="pointer-events-none absolute border-2 border-indigo-400 bg-indigo-400/10"
                    style={{
                      left: `${tekenbox.x * 100}%`,
                      top: `${tekenbox.y * 100}%`,
                      width: `${tekenbox.w * 100}%`,
                      height: `${tekenbox.h * 100}%`,
                    }}
                  />
                )}
              </div>

              {laatsteDebugPreview && (
                <div className="w-72 shrink-0 rounded-xl border border-gray-700 bg-gray-900/95 p-3 text-white shadow-2xl">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-300">Backend crop</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Bron: {laatsteDebugBron ?? 'onbekend'}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Blauw = jouw selectie, groen = woorden die de backend echt heeft gebruikt
                  </p>
                  <img
                    src={`data:image/png;base64,${laatsteDebugPreview}`}
                    alt="Backend crop preview"
                    className="mt-3 w-full rounded border border-gray-700 bg-white"
                  />
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-300">Uitgelezen tekst</p>
                  <p className="mt-1 rounded bg-gray-950 px-2 py-2 text-xs text-gray-100 break-words">
                    {laatsteDebugTekst || '(leeg)'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {previewGeladen && aantalPaginas > 1 && (
            <div className="flex items-center justify-center gap-3 bg-gray-900 py-2 text-sm text-white shrink-0">
              <button
                onClick={() => navigeerPagina(-1)}
                disabled={huidigePagina <= 1 || ladenPreview}
                className="p-1 transition-colors hover:text-indigo-300 disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-xs">Pagina {huidigePagina} / {aantalPaginas}</span>
              <button
                onClick={() => navigeerPagina(1)}
                disabled={huidigePagina >= aantalPaginas || ladenPreview}
                className="p-1 transition-colors hover:text-indigo-300 disabled:opacity-40"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
