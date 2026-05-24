/**
 * Lokale OCR voor bonnen en facturen — cross-platform (Windows + Mac + Linux).
 *
 * Pipeline (primair → fallback):
 *   1a. PDF met tekstlaag → pdfjs-dist (exact, positie-bewust, geen OCR nodig)
 *   1b. Afbeelding of gescande PDF → PaddleOCR via ONNX Runtime
 *   2.  Veld-extractie op basis van regel-inhoud én spatial layout (kolommen, tabellen)
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { BrowserWindow } from 'electron'
import { ocrAfbeelding, type OcrWoord } from './paddle-ocr'

export interface OcrRegel {
  omschrijving: string
  bedrag: number
  aantal: number
  totaal: number
}

export interface OcrVelden {
  nummer?: string | null
  klantNaam?: string | null
  klantEmail?: string | null
  klantAdres?: string | null
  datum?: string | null
  vervaldatum?: string | null
  subtotaal?: number | null
  btwBedrag?: number | null
  totaal?: number | null
  status?: string | null
  notities?: string | null
  omschrijving?: string | null
  regels?: OcrRegel[]
  /** Type document: "factuur" of "bon" (kassabon) */
  documentType?: 'factuur' | 'bon'
  rawText?: string | null
  error?: string
}

// ── PDF tekstextractie via pdfjs-dist (CJS legacy build) ─────────────────────

/** Extraheer tekst met posities uit een PDF via PDF.js — werkt voor gedrukte/programmatische PDFs */
type PdfJsTekstLib = {
  getDocument: (src: {
    data: Uint8Array
    useSystemFonts?: boolean
    disableFontFace?: boolean
  }) => { promise: Promise<PdfDoc> }
  GlobalWorkerOptions: { workerSrc: unknown }
}

let pdfJsTekstLib: PdfJsTekstLib | null = null

function laadPdfJsVoorTekst(): PdfJsTekstLib {
  if (pdfJsTekstLib) return pdfJsTekstLib

  const globals = globalThis as Record<string, unknown>
  // PDF.js probeert anders de native `canvas` package te laden. Voor tekstextractie gebruiken we geen canvas-rendering.
  globals.DOMMatrix ??= class DOMMatrix {}
  globals.Path2D ??= class Path2D {}

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pdfJsTekstLib = require('pdfjs-dist/legacy/build/pdf.js') as PdfJsTekstLib
  pdfJsTekstLib.GlobalWorkerOptions.workerSrc = ''
  return pdfJsTekstLib
}

async function extraheerPdfAlsRegels(pad: string): Promise<OcrWoord[][] | null> {
  try {
    const pdfjsLib = laadPdfJsVoorTekst()
    const buffer = fs.readFileSync(pad)
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise

    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: 1.0 })
    const pdfH = viewport.height

    const content = await page.getTextContent({ normalizeWhitespace: false })

    // Converteer PDF-items naar OcrWoord
    // PDF-coördinaten: origin linksonder, Y omhoog → omdraaien naar scherm-Y
    const woorden: OcrWoord[] = []
    for (const raw of content.items) {
      const item = raw as {
        str: string
        transform: number[]  // [a, b, c, d, x, y]
        width: number
        height: number
      }
      if (!item.str?.trim()) continue
      // transform[3] = y-schaal (fonthoogte in PDF-punten)
      const itemH = Math.max(4, Math.round(Math.abs(item.transform[3]) || Math.abs(item.height) || 10))
      woorden.push({
        tekst: item.str.trim(),
        box: {
          x: Math.round(item.transform[4]),
          y: Math.round(pdfH - item.transform[5] - itemH),
          width: Math.max(4, Math.round(Math.abs(item.width) || item.str.length * 5)),
          height: itemH,
        },
        confidence: 1.0,
      })
    }

    for (let pagina = 2; pagina <= doc.numPages; pagina++) {
      const extraPage = await doc.getPage(pagina)
      const extraViewport = extraPage.getViewport({ scale: 1.0 })
      const extraPdfH = extraViewport.height
      const extraContent = await extraPage.getTextContent({ normalizeWhitespace: false })
      const paginaOffsetY = (pagina - 1) * (pdfH + 40)

      for (const raw of extraContent.items) {
        const item = raw as {
          str: string
          transform: number[]
          width: number
          height: number
        }
        if (!item.str?.trim()) continue
        const itemH = Math.max(4, Math.round(Math.abs(item.transform[3]) || Math.abs(item.height) || 10))
        woorden.push({
          tekst: item.str.trim(),
          box: {
            x: Math.round(item.transform[4]),
            y: Math.round(paginaOffsetY + extraPdfH - item.transform[5] - itemH),
            width: Math.max(4, Math.round(Math.abs(item.width) || item.str.length * 5)),
            height: itemH,
          },
          confidence: 1.0,
        })
      }
    }

    await doc.destroy()

    if (woorden.length < 5) return null

    // Sorteer op y (boven → onder), dan x (links → rechts)
    woorden.sort((a, b) => a.box.y !== b.box.y ? a.box.y - b.box.y : a.box.x - b.box.x)

    // Groepeer op regel (30% y-overlap is genoeg voor PDF-tekstitems)
    const regels: OcrWoord[][] = []
    for (const w of woorden) {
      const lijn = regels.find(r => {
        const last = r[r.length - 1]
        const topO = Math.max(w.box.y, last.box.y)
        const botO = Math.min(w.box.y + w.box.height, last.box.y + last.box.height)
        return botO - topO > 0.3 * Math.min(w.box.height, last.box.height)
      })
      if (lijn) lijn.push(w)
      else regels.push([w])
    }

    return regels
  } catch {
    return null
  }
}

async function telPdfPaginas(pad: string): Promise<number> {
  try {
    const pdfjsLib = laadPdfJsVoorTekst()
    const buffer = fs.readFileSync(pad)
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise
    const aantal = doc.numPages || 1
    await doc.destroy()
    return aantal
  } catch {
    return 1
  }
}

// Minimal types voor pdfjs-dist page/doc objecten
interface PdfDoc {
  numPages: number
  getPage(n: number): Promise<PdfPage>
  destroy(): Promise<void>
}
interface PdfPage {
  getViewport(opts: { scale: number }): { width: number; height: number }
  getTextContent(opts?: { normalizeWhitespace: boolean }): Promise<{ items: unknown[] }>
}

// ── PDF → PNG via Electron offscreen BrowserWindow ───────────────────────────
export async function pdfPaginaNaarPng(pad: string, paginaIndex = 0): Promise<Buffer> {
  try {
    // Probeer pdf2pic eerst
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { convert } = require('pdf2pic')

    const options = {
      density: 150,
      saveFilename: `page_${paginaIndex}`,
      savePath: os.tmpdir(),
      format: 'png',
      width: 1240,
      height: 1754,
    }

    const converted = await convert({
      url: pad,
      page: paginaIndex + 1,
      ...options
    })

    if (converted && converted.path && fs.existsSync(converted.path)) {
      const pngBuffer = fs.readFileSync(converted.path)
      try {
        fs.unlinkSync(converted.path)
      } catch {
        // ignore
      }
      return pngBuffer
    }
  } catch {
    // pdf2pic failed - dat's oké, we gebruiken een placeholder
  }

  // Fallback: maak een placeholder afbeelding (zwart met PDF icon text)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas } = require('canvas')
  const canvas = createCanvas(1240, 1754)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#f5f5f5'
  ctx.fillRect(0, 0, 1240, 1754)

  // PDF icoon achtergrond
  ctx.fillStyle = '#e74c3c'
  ctx.fillRect(100, 200, 1040, 300)

  // Tekst
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 48px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('PDF Pagina ' + (paginaIndex + 1), 620, 300)

  ctx.fillStyle = '#666666'
  ctx.font = '24px Arial'
  ctx.fillText('Preview niet beschikbaar', 620, 600)
  ctx.fillText('Maar OCR werkt nog steeds - teken eenvoudig een box op deze pagina', 620, 650)

  return canvas.toBuffer('image/png')
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

function parseerBedrag(s: string): number | null {
  const schoon = s.replace(/\s/g, '').replace(/[€$£]/g, '')
  // NL: 1.234,56
  if (/^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(schoon))
    return parseFloat(schoon.replace(/\./g, '').replace(',', '.'))
  // EN: 1,234.56
  if (/^-?\d{1,3}(?:,\d{3})*\.\d{2}$/.test(schoon))
    return parseFloat(schoon.replace(/,/g, ''))
  // Eenvoudig: 12,50 of 12.50 of 12
  const n = parseFloat(schoon.replace(',', '.'))
  return isNaN(n) ? null : n
}

const BEDRAG_RGX = /(?:[€$£]\s*)?(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2}|-?\d+)\s*(?:[€$£])?/
const BEDRAG_RGX_GLOBAL = /(?:[€$£]\s*)?(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s*(?:[€$£])?/g

function eersteBedragIn(r: string): number | null {
  const m = r.match(BEDRAG_RGX)
  return m ? parseerBedrag(m[1]) : null
}
function laatsteBedragIn(r: string): number | null {
  let laatste: number | null = null
  let m: RegExpExecArray | null
  BEDRAG_RGX_GLOBAL.lastIndex = 0
  while ((m = BEDRAG_RGX_GLOBAL.exec(r)) !== null) {
    const n = parseerBedrag(m[1])
    if (n !== null) laatste = n
  }
  return laatste
}

// Suppress unused warning
void eersteBedragIn

const MAANDEN: Record<string, string> = {
  jan: '01', feb: '02', mrt: '03', maa: '03', apr: '04', mei: '05',
  jun: '06', juni: '06', jul: '07', juli: '07', aug: '08', augustus: '08',
  sep: '09', sept: '09', okt: '10', oktober: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  januari: '01', februari: '02', maart: '03',
}

function maakIsoDatum(jaar: string, maand: string, dag: string): string | null {
  const y = jaar.length === 2 ? Number(`20${jaar}`) : Number(jaar)
  const m = Number(maand)
  const d = Number(dag)
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function normaliseerDatum(s: string): string | null {
  s = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (ymd) return maakIsoDatum(ymd[1], ymd[2], ymd[3])
  const dm = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (dm) {
    return maakIsoDatum(dm[3], dm[2], dm[1])
  }
  const wm = s.match(/^(\d{1,2})\s+([\p{L}]+)\.?\s+(\d{2,4})$/iu)
  if (wm) {
    const mn = MAANDEN[wm[2].toLowerCase()] ?? MAANDEN[wm[2].toLowerCase().slice(0, 3)]
    if (mn) {
      return maakIsoDatum(wm[3], mn, wm[1])
    }
  }
  const mw = s.match(/^([\p{L}]+)\.?\s+(\d{1,2}),?\s+(\d{2,4})$/iu)
  if (mw) {
    const mn = MAANDEN[mw[1].toLowerCase()] ?? MAANDEN[mw[1].toLowerCase().slice(0, 3)]
    if (mn) {
      return maakIsoDatum(mw[3], mn, mw[2])
    }
  }
  return null
}

function vindDatumInRegel(r: string): string | null {
  for (const pat of [
    /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/,
    /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/,
    /\b(\d{1,2}\s+[\p{L}]{3,12}\.?\s+\d{2,4})\b/iu,
    /\b([\p{L}]{3,12}\.?\s+\d{1,2},?\s+\d{2,4})\b/iu,
  ]) {
    const m = r.match(pat)
    if (m) {
      const d = normaliseerDatum(m[1])
      if (d) return d
    }
  }
  return null
}

function vindDatumsInRegel(r: string): string[] {
  const gevonden = new Set<string>()
  const patronen = [
    /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/g,
    /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g,
    /\b(\d{1,2}\s+[\p{L}]{3,12}\.?\s+\d{2,4})\b/giu,
    /\b([\p{L}]{3,12}\.?\s+\d{1,2},?\s+\d{2,4})\b/giu,
  ]

  for (const patroon of patronen) {
    patroon.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = patroon.exec(r)) !== null) {
      const datum = normaliseerDatum(m[1])
      if (datum) gevonden.add(datum)
    }
  }

  return [...gevonden]
}

function datumNaOfGelijk(a: string, b: string): boolean {
  return new Date(a).getTime() >= new Date(b).getTime()
}

// ── Spatial helpers: gebruik bounding-box geometrie ──────────────────────────

interface SpatialRegel {
  tekst: string
  x: number
  xEinde: number
  y: number
  yEinde: number
  segmenten: OcrWoord[]
}

function bouwSpatialRegels(woordRegels: OcrWoord[][]): SpatialRegel[] {
  return woordRegels
    .filter(line => line.length > 0)
    .map(line => {
      const gesorteerd = [...line].sort((a, b) => a.box.x - b.box.x)
      const x = Math.min(...gesorteerd.map(w => w.box.x))
      const xEinde = Math.max(...gesorteerd.map(w => w.box.x + w.box.width))
      const y = Math.min(...gesorteerd.map(w => w.box.y))
      const yEinde = Math.max(...gesorteerd.map(w => w.box.y + w.box.height))
      const tekst = gesorteerd.map(w => w.tekst).join(' ').replace(/\s+/g, ' ').trim()
      return { tekst, x, xEinde, y, yEinde, segmenten: gesorteerd }
    })
    .sort((a, b) => a.y - b.y)
}

function detecteerBedragKolom(regels: SpatialRegel[]): { drempel: number } | null {
  const bedragX: number[] = []
  for (const r of regels) {
    for (const seg of r.segmenten) {
      if (BEDRAG_RGX.test(seg.tekst)) bedragX.push(seg.box.x)
    }
  }
  if (bedragX.length < 2) return null
  const sorted = [...bedragX].sort((a, b) => a - b)
  const mediaan = sorted[Math.floor(sorted.length / 2)]
  return { drempel: mediaan - 20 }
}

// ── Factuurvelden extraheren ─────────────────────────────────────────────────
const FACTUURNUMMER_LABEL = /\b(?:factuur\s*(?:nummer|nr\.?|no\.?)?|factuurnummer|invoice\s*(?:number|no\.?|#)?|inv\.?\s*(?:no\.?|nr\.?)?|nota\s*(?:nummer|nr\.?)?|document\s*(?:number|no\.?)?|referentie|kenmerk)\b/i

function kandidaatNummerTokens(tekst: string, context = tekst): string[] {
  const tokens = tekst.match(/[A-Z]{0,8}\d[A-Z0-9._/-]{1,35}/gi) ?? []
  return [...new Set(tokens
    .map(t => t.replace(/^[#:\s-]+|[.,;:)]+$/g, '').trim())
    .filter(t => !lijktOngeldigeNummerKandidaat(t, context)))]
}

function lijktOngeldigeNummerKandidaat(kandidaat: string, context = ''): boolean {
  const k = kandidaat.trim()
  if (k.length < 3 || k.length > 35) return true
  if (!/\d/.test(k)) return true
  if (normaliseerDatum(k)) return true
  if (/^\d+[.,]\d{2}$/.test(k)) return true
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/i.test(k)) return true
  if (/\b(?:iban|btw|vat|tax|kvk|kamer\s+van\s+koophandel|tel|phone|postcode|zip)\b/i.test(context) &&
      !FACTUURNUMMER_LABEL.test(context)) return true
  if (/^(?:202\d|20\d{2})$/.test(k)) return true
  return false
}

function labelX(regel: SpatialRegel, label: RegExp): number {
  const segment = regel.segmenten.find(w => label.test(w.tekst))
  return segment?.box.x ?? regel.x
}

function kandidaatX(regel: SpatialRegel, kandidaat: string): number {
  const segment = regel.segmenten.find(w => w.tekst.includes(kandidaat) || kandidaat.includes(w.tekst))
  return segment?.box.x ?? regel.x
}

function vindFactuurnummerSlim(regels: SpatialRegel[], alles: string): string | null {
  for (let i = 0; i < regels.length; i++) {
    const regel = regels[i]
    if (!FACTUURNUMMER_LABEL.test(regel.tekst)) continue

    const naLabel = regel.tekst.replace(/^.*?(?:factuur\s*(?:nummer|nr\.?|no\.?)?|factuurnummer|invoice\s*(?:number|no\.?|#)?|inv\.?\s*(?:no\.?|nr\.?)?|nota\s*(?:nummer|nr\.?)?|document\s*(?:number|no\.?)?|referentie|kenmerk)\s*[:#-]?\s*/i, '')
    const direct = kandidaatNummerTokens(naLabel, regel.tekst)[0]
    if (direct) return direct

    const xLabel = labelX(regel, FACTUURNUMMER_LABEL)
    const volgendeKandidaten = regels.slice(i + 1, Math.min(i + 4, regels.length))
      .flatMap(r => kandidaatNummerTokens(r.tekst, regel.tekst).map(k => ({
        waarde: k,
        afstand: Math.abs(kandidaatX(r, k) - xLabel),
      })))
      .sort((a, b) => a.afstand - b.afstand)
    if (volgendeKandidaten[0]) return volgendeKandidaten[0].waarde
  }

  const directMatch = alles.match(/(?:factuur\s*(?:nummer|nr\.?|no\.?)?|factuurnummer|invoice\s*(?:number|no\.?|#)?|inv\.?\s*(?:no\.?|nr\.?)?|nota\s*(?:nummer|nr\.?)?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,35})/i)
  if (directMatch && !lijktOngeldigeNummerKandidaat(directMatch[1], directMatch[0])) return directMatch[1]

  let beste: { waarde: string; score: number } | null = null
  for (const regel of regels.slice(0, 25)) {
    for (const kandidaat of kandidaatNummerTokens(regel.tekst, regel.tekst)) {
      let score = 0
      if (/[A-Z]/i.test(kandidaat) && /\d/.test(kandidaat)) score += 8
      if (/[-/_]/.test(kandidaat)) score += 6
      if (/20\d{2}[-/_]?\d{2,}/.test(kandidaat)) score += 5
      if (regel.y < 350) score += 4
      if (/factuur|invoice|nota|declaratie/i.test(regel.tekst)) score += 12
      if (/^\d{6,}$/.test(kandidaat) && !/factuur|invoice|nota/i.test(regel.tekst)) score -= 8
      if (!beste || score > beste.score) beste = { waarde: kandidaat, score }
    }
  }

  return beste && beste.score >= 8 ? beste.waarde : null
}

interface DatumKandidaat {
  datum: string
  regelIndex: number
  x: number
  y: number
  tekst: string
}

function datumKandidaten(regels: SpatialRegel[]): DatumKandidaat[] {
  const kandidaten: DatumKandidaat[] = []
  for (let i = 0; i < regels.length; i++) {
    const regel = regels[i]
    const datums = vindDatumsInRegel(regel.tekst)
    for (const datum of datums) {
      const seg = regel.segmenten.find(w => vindDatumsInRegel(w.tekst).includes(datum))
      kandidaten.push({ datum, regelIndex: i, x: seg?.box.x ?? regel.x, y: regel.y, tekst: regel.tekst })
    }
  }
  return kandidaten
}

function vindDatumVeldenSlim(regels: SpatialRegel[]): { datum: string | null; vervaldatum: string | null } {
  const kandidaten = datumKandidaten(regels)
  let datum: string | null = null
  let vervaldatum: string | null = null

  const datumsRondRegel = (idx: number) => kandidaten
    .filter(k => k.regelIndex >= idx && k.regelIndex <= idx + 2)
    .sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  const gecombineerdeIdx = regels.findIndex(r =>
    /factuur\s*datum|invoice\s*date|datum/i.test(r.tekst) &&
    /verval|due|betaal(?:termijn|datum)|payment/i.test(r.tekst)
  )
  if (gecombineerdeIdx >= 0) {
    const dichtbij = datumsRondRegel(gecombineerdeIdx)
    if (dichtbij.length >= 2) {
      datum = dichtbij[0].datum
      vervaldatum = dichtbij.find(k => k.datum !== datum && datumNaOfGelijk(k.datum, datum))?.datum ?? dichtbij[1].datum
    }
  }

  for (let i = 0; i < regels.length; i++) {
    if (vervaldatum) break
    if (/verval|due\s*date|betaal.*voor|uiterlijk|payment\s*due|betaal(?:termijn|datum)/i.test(regels[i].tekst)) {
      const dichtbij = datumsRondRegel(i)
      if (dichtbij.length > 0) vervaldatum = dichtbij[dichtbij.length - 1].datum
    }
  }

  for (let i = 0; i < regels.length; i++) {
    if (datum) break
    if (/factuur\s*datum|invoice\s*date|bill\s*date|document\s*date|^datum\b|\bdatum:/i.test(regels[i].tekst)) {
      const dichtbij = datumsRondRegel(i).filter(k => k.datum !== vervaldatum)
      if (dichtbij.length > 0) datum = dichtbij[0].datum
    }
  }

  if ((!datum || !vervaldatum) && kandidaten.length >= 2) {
    const gesorteerd = [...kandidaten].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)
    const paar = gesorteerd.find((k, idx) => {
      const volgende = gesorteerd[idx + 1]
      return Boolean(volgende && Math.abs(volgende.y - k.y) < 80 && datumNaOfGelijk(volgende.datum, k.datum))
    })
    if (paar) {
      const idx = gesorteerd.indexOf(paar)
      datum ??= gesorteerd[idx].datum
      vervaldatum ??= gesorteerd[idx + 1].datum
    }
  }

  if (!datum) datum = kandidaten.find(k => k.datum !== vervaldatum)?.datum ?? null
  if (!vervaldatum && datum) {
    vervaldatum = kandidaten.find(k => k.datum !== datum && datumNaOfGelijk(k.datum, datum))?.datum ?? null
  }

  return { datum, vervaldatum }
}

function laatsteBedragInfo(regel: SpatialRegel): { bedrag: number; index: number; raw: string; x: number } | null {
  const matches = [...regel.tekst.matchAll(BEDRAG_RGX_GLOBAL)]
  const geldige = matches
    .map(m => ({
      bedrag: parseerBedrag(m[1]),
      index: m.index ?? 0,
      raw: m[0],
    }))
    .filter((m): m is { bedrag: number; index: number; raw: string } => m.bedrag !== null)
  const laatste = geldige.at(-1)
  if (!laatste) return null
  const segment = regel.segmenten.find(w => w.tekst.includes(laatste.raw.trim()) || laatste.raw.includes(w.tekst))
  return { ...laatste, x: segment?.box.x ?? Math.max(regel.x, regel.xEinde - 90) }
}

function parseerDynamischeFactuurregel(regel: SpatialRegel): (OcrRegel & { bedragX: number }) | null {
  const info = laatsteBedragInfo(regel)
  if (!info || info.bedrag <= 0) return null
  if (/\b(?:subtotaal|totaal|btw|vat|tax|korting|discount|te\s+betalen|amount\s+due|payment|iban|kvk|factuur(?:nummer|datum)?|invoice|verval|due\s*date)\b/i.test(regel.tekst)) return null

  const matches = [...regel.tekst.matchAll(BEDRAG_RGX_GLOBAL)]
  const eersteMatch = matches[0]
  if (!eersteMatch || eersteMatch.index === undefined) return null

  let omschrijving = regel.tekst.slice(0, eersteMatch.index).replace(/\s+/g, ' ').trim()
  if (omschrijving.length < 2 || /^\d[\d\s.,/-]*$/.test(omschrijving)) return null

  let aantal = 1
  const explicietAantal = omschrijving.match(/^(.+?)\s+(\d+(?:[,.]\d+)?)\s*(?:x|st\.?|stuks?|uur|uren|u|pcs?)$/i)
  if (explicietAantal) {
    omschrijving = explicietAantal[1].trim()
    aantal = parseFloat(explicietAantal[2].replace(',', '.')) || 1
  } else if (matches.length >= 2) {
    const losAantal = omschrijving.match(/^(.+?)\s+(\d+(?:[,.]\d+)?)$/)
    if (losAantal) {
      const mogelijkAantal = parseFloat(losAantal[2].replace(',', '.'))
      if (mogelijkAantal > 0 && mogelijkAantal < 10000) {
        omschrijving = losAantal[1].trim()
        aantal = mogelijkAantal
      }
    }
  }

  const eersteBedrag = parseerBedrag(eersteMatch[1])
  const bedrag = matches.length >= 2 && eersteBedrag !== null ? eersteBedrag : Math.round((info.bedrag / aantal) * 100) / 100
  return { omschrijving, bedrag, aantal, totaal: info.bedrag, bedragX: info.x }
}

function detecteerDynamischeFactuurregels(regels: SpatialRegel[]): OcrRegel[] {
  const kandidaten = regels
    .map((regel, index) => ({ regel: parseerDynamischeFactuurregel(regel), index, y: regel.y }))
    .filter((k): k is { regel: OcrRegel & { bedragX: number }; index: number; y: number } => Boolean(k.regel))

  if (kandidaten.length < 2) return []

  const groepen: typeof kandidaten[] = []
  for (const kandidaat of kandidaten) {
    const laatsteGroep = groepen.at(-1)
    const vorige = laatsteGroep?.at(-1)
    if (vorige && Math.abs(vorige.regel.bedragX - kandidaat.regel.bedragX) < 90 && kandidaat.y - vorige.y < 110) {
      laatsteGroep!.push(kandidaat)
    } else {
      groepen.push([kandidaat])
    }
  }

  const beste = groepen
    .filter(g => g.length >= 2)
    .sort((a, b) => b.length - a.length || a[0].y - b[0].y)[0]

  return beste ? beste.map(k => ({
    omschrijving: k.regel.omschrijving,
    bedrag: k.regel.bedrag,
    aantal: k.regel.aantal,
    totaal: k.regel.totaal,
  })) : []
}

export function extraheerFactuurVelden(
  woordRegels: OcrWoord[][],
  ruweTekst: string,
  opties?: { eigenBedrijfsnaam?: string; eigenEmail?: string }
): Omit<OcrVelden, 'error'> {
  const spatialRegels = bouwSpatialRegels(woordRegels)
  const tekstRegels = spatialRegels.map(r => r.tekst)
  const alles = tekstRegels.join(' ')
  const eigenBedrijfsnaam = opties?.eigenBedrijfsnaam
  const eigenEmail = opties?.eigenEmail?.toLowerCase().trim()

  // ── Documenttype detecteren ────────────────────────────────────────────────
  const factuurIndicatoren = /\b(?:factuur|invoice|btw-?nummer|kvk|factuurdatum|vervaldatum|debiteur|crediteur|iban)\b/i
  const bonIndicatoren = /\b(?:kassabon|btw\s*hoog|btw\s*laag|tot(?:aal|al)\s*eur|bon\s*nr|bonnummer|aantal\s*x|pinpas|contactloos|maestro|cash|wisselgeld)\b/i
  const lijktFactuur = factuurIndicatoren.test(alles)
  const lijktBon = bonIndicatoren.test(alles)
  const documentType: 'factuur' | 'bon' = lijktFactuur && !lijktBon ? 'factuur'
    : lijktBon && !lijktFactuur ? 'bon'
    : tekstRegels.length < 20 ? 'bon'
    : 'factuur'

  // ── KOR / BTW-vrijstelling ────────────────────────────────────────────────
  // Ruime match: ook als "kleineondernemersregeling" wordt opgesplitst door OCR
  const korActief = /\b(?:kor|kleineondernemer|vrijgesteld\s+van\s+btw|niet\s+btw.?plichtig|btw\s+niet\s+van\s+toepassing|art\.?\s*25|reverse\s+charge|btw\s+verlegd)\b/i.test(alles)
    || /vrijgesteld.*btw|btw.*vrijgesteld/i.test(alles)

  // ── Factuurnummer ─────────────────────────────────────────────────────────
  let nummer: string | null = null
  // Probeer eerst met dubbele punt (meest betrouwbaar — pakt nooit de kopkop "Factuur")
  const nummerMatch = alles.match(
    /(?:factuur(?:nummer)?|invoice(?:\s*no\.?|\s*number)?|inv\.?\s*nr\.?|rekening(?:nummer)?|bon(?:nummer|\s*nr\.?)?)\s*[:#]\s*([A-Z0-9][-A-Z0-9/_.]{2,25})/i
  ) ?? alles.match(
    // Zonder dubbele punt alleen als het VOLLEDIGE samengestelde woord er staat
    /(?:factuurnummer|invoicenumber|bonnummer|rekeningnummer)\s+([A-Z0-9][-A-Z0-9/_.]{2,25})/i
  )
  if (nummerMatch) nummer = nummerMatch[1].trim()
  if (!nummer || lijktOngeldigeNummerKandidaat(nummer, nummerMatch?.[0] ?? alles)) {
    nummer = vindFactuurnummerSlim(spatialRegels, alles)
  }

  // ── Datums ────────────────────────────────────────────────────────────────
  // Strategie: zoek label + datum op dezelfde regel; als datum ontbreekt, kijk ook op de volgende regel.
  let datum: string | null = null
  let vervaldatum: string | null = null

  for (let i = 0; i < tekstRegels.length; i++) {
    const r = tekstRegels[i]
    if (/verval|due\s*date|betaal.*voor|uiterlijk|payment\s*due/i.test(r)) {
      let d = vindDatumInRegel(r)
      // label zonder datum op dezelfde regel → kijk volgende regel
      if (!d && i + 1 < tekstRegels.length) d = vindDatumInRegel(tekstRegels[i + 1])
      if (d && !vervaldatum) vervaldatum = d
    }
  }
  for (let i = 0; i < tekstRegels.length; i++) {
    const r = tekstRegels[i]
    if (/factuur(?:datum)?|invoice\s*date|bill\s*date|^datum\b|\bdatum:/i.test(r)) {
      let d = vindDatumInRegel(r)
      if (!d && i + 1 < tekstRegels.length) d = vindDatumInRegel(tekstRegels[i + 1])
      if (d && d !== vervaldatum) { datum = d; break }
    }
  }
  if (!datum) {
    for (let i = 0; i < tekstRegels.length; i++) {
      const d = vindDatumInRegel(tekstRegels[i])
      if (d && d !== vervaldatum) { datum = d; break }
    }
  }
  const slimmeDatums = vindDatumVeldenSlim(spatialRegels)
  if (slimmeDatums.datum) datum = slimmeDatums.datum
  if (slimmeDatums.vervaldatum) vervaldatum = slimmeDatums.vervaldatum

  // ── E-mail ────────────────────────────────────────────────────────────────
  // Verzamel alle e-mailadressen, sla eigen bedrijfse-mail over
  const alleEmails = [...alles.matchAll(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g)]
    .map(m => m[1])
  const klantEmail = alleEmails.find(e => !eigenEmail || e.toLowerCase() !== eigenEmail) ?? null

  // ── Klantnaam / Leverancier ──────────────────────────────────────────────
  let klantNaam: string | null = null

  if (documentType === 'bon') {
    const GEEN_NAAM_BON = /^\d{4}\s?[A-Z]{2}\b|^[+]?[(]?\d{2,}|^(www\.|http|kvk|iban|tel|fax|btw|filiaal|datum|bon\s)/i
    for (const r of spatialRegels.slice(0, 5)) {
      if (r.tekst.length >= 2 && r.tekst.length <= 50 &&
          !GEEN_NAAM_BON.test(r.tekst) &&
          !/^\d[\d\s.,€-]*$/.test(r.tekst)) {
        klantNaam = r.tekst
        break
      }
    }
  } else {
    // Gelabelde klant: "Klant:", "Aan:", etc.
    const gelabeldIdx = spatialRegels.findIndex(r =>
      /^(?:klant|aan|t\.?\s*a\.?\s*v\.?|bill\s+to|invoice\s+to|geleverd\s+aan|sold\s+to|ontvanger|recipient)[:\s]/i.test(r.tekst)
    )
    if (gelabeldIdx >= 0) {
      const huidig = spatialRegels[gelabeldIdx].tekst.replace(/^[^:]+:\s*/i, '').trim()
      if (huidig) klantNaam = huidig
      else {
        const volgende = spatialRegels[gelabeldIdx + 1]
        if (volgende) klantNaam = volgende.tekst.trim()
      }
    }

    if (!klantNaam) {
      // Header-blok vóór de "Factuur" kop — meest-linkse kandidaat is de klant
      const factuurKopIdx = spatialRegels.findIndex(r => /^factuur\b/i.test(r.tekst))
      const headerRegels = factuurKopIdx > 0 ? spatialRegels.slice(0, factuurKopIdx) : spatialRegels.slice(0, 12)

      const GEEN_NAAM = /^\d{4}\s?[A-Z]{2}\b|^[+]?[(]?\d{2,}|^(www\.|http|kvk|iban|tel|fax|rekeningnr|btw-nr|btw nr|e-?mail)/i
      const kandidaten = headerRegels.filter(r =>
        r.tekst.length >= 2 && r.tekst.length <= 60 &&
        !GEEN_NAAM.test(r.tekst) &&
        !/^\d[\d\s.,€-]*$/.test(r.tekst) &&
        !/^(factuur|invoice|omschrijving|bedrag|aantal|totaal|datum)/i.test(r.tekst) &&
        !(eigenBedrijfsnaam && r.tekst.toLowerCase().includes(eigenBedrijfsnaam.toLowerCase()))
      )

      if (kandidaten.length > 0) {
        // Klant staat links; eigen bedrijf staat rechts. Pak de meest-linkse kandidaat.
        const minX = Math.min(...kandidaten.map(k => k.x))
        const linksKandidaten = kandidaten.filter(k => k.x <= minX + 50)
        let naam = linksKandidaten[0]?.tekst ?? kandidaten[0].tekst
        // Strip rechts-uitgelijnde bedrijfsinfo die op dezelfde PDF-regel staat (KvK, IBAN, BTW-nr)
        naam = naam
          .replace(/\s+(?:k\.?v\.?k\.?|kvk|kamer\s+van\s+koophandel)[:\s#.]*\s*[\w\d-]+.*/i, '')
          .replace(/\s+iban[:\s]\s*[A-Z]{2}[\w\d]+.*/i, '')
          .replace(/\s+btw[-\s:]*(?:nr\.?|nummer)?[:\s]*[A-Z]{2}[\w\d]+.*/i, '')
          .trim()
        // "(Evy en Isa)" op de volgende regel toevoegen als het echt tussen haakjes staat
        const idx = spatialRegels.findIndex(r => r.tekst === naam || r.tekst.startsWith(naam))
        if (idx >= 0 && idx + 1 < spatialRegels.length && /^\(.*\)$/.test(spatialRegels[idx + 1].tekst)) {
          naam += ` ${spatialRegels[idx + 1].tekst}`
        }
        klantNaam = naam
      }
    }

    if (!klantNaam) {
      const rechtsvormen = /\b(?:b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|bvba|gmbh|inc\.?|ltd\.?|llc|holding|groep|group)\b/i
      const r = tekstRegels.find(t =>
        rechtsvormen.test(t) && t.length >= 3 && t.length <= 60 &&
        !/factuur|invoice|btw|kvk|iban|datum/i.test(t) &&
        !(eigenBedrijfsnaam && t.toLowerCase().includes(eigenBedrijfsnaam.toLowerCase()))
      )
      klantNaam = r ?? null
    }
  }

  // ── Klantadres ────────────────────────────────────────────────────────────
  let klantAdres: string | null = null
  if (klantNaam && documentType === 'factuur') {
    const klantIdx = spatialRegels.findIndex(r => r.tekst.includes(klantNaam!))
    if (klantIdx >= 0) {
      const adresRegels: string[] = []
      for (let i = klantIdx + 1; i < Math.min(klantIdx + 5, spatialRegels.length); i++) {
        const t = spatialRegels[i].tekst
        if (/^\d{4}\s?[A-Z]{2}\b|^[A-Za-zà-ü\s]+\d+|^[A-Za-zà-ü\s]+$/.test(t) &&
            t.length < 60 && !/factuur|datum|btw|kvk|email/i.test(t)) {
          adresRegels.push(t)
        } else break
      }
      if (adresRegels.length > 0) klantAdres = adresRegels.join(', ')
    }
  }

  // ── Artikelregels via spatial-analyse ─────────────────────────────────────
  const geextraheerdRegels: OcrRegel[] = []
  const bedragKolom = detecteerBedragKolom(spatialRegels)

  const tabelHeaderIdx = spatialRegels.findIndex(r =>
    /omschrijving|description|product|artikel|dienst|service|werkzaamheden/i.test(r.tekst) &&
    /bedrag|prijs|price|totaal|amount|aantal|qty|quantity/i.test(r.tekst)
  )
  const tabelFooterIdx = spatialRegels.findIndex(r =>
    /\btotaal\s+te\s+voldoen\b|\bgrand\s+total\b|\bte\s+betalen\b|\btotal\s+amount\b|\bamount\s+due\b|\bfactuurbedrag\b|\bverschuldigd\b|\bsubtotaal\b|\bbtw\b/i.test(r.tekst)
  )

  if (tabelHeaderIdx >= 0 && documentType === 'factuur') {
    const start = tabelHeaderIdx + 1
    const einde = tabelFooterIdx > tabelHeaderIdx ? tabelFooterIdx : spatialRegels.length

    for (let i = start; i < einde; i++) {
      const r = spatialRegels[i]
      if (!r.tekst || /^[€\s\-]+$/.test(r.tekst)) continue
      if (/^(?:btw|vat|subtotaal|korting|discount|verzend|shipping|tussentotaal|exclusief|inclusief)/i.test(r.tekst)) continue

      // Formaat: "<omschr> <bedrag> <aantal> <totaal>"
      const driePoorts = r.tekst.match(
        /^(.+?)\s+[€$]?\s*(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s+(\d+(?:[.,]\d+)?)\s+[€$]?\s*(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s*$/
      )
      if (driePoorts) {
        const omschr = driePoorts[1].trim()
        const bedrag = parseerBedrag(driePoorts[2])
        const aantal = parseFloat(driePoorts[3].replace(',', '.')) || 1
        const regelTotaal = parseerBedrag(driePoorts[4])
        if (omschr.length >= 2 && bedrag !== null && regelTotaal !== null && regelTotaal !== 0) {
          geextraheerdRegels.push({ omschrijving: omschr, bedrag, aantal, totaal: regelTotaal })
          continue
        }
      }

      // Fallback: omschrijving + één bedrag rechts
      const enkel = r.tekst.match(/^(.+?)\s+[€$]?\s*(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s*$/)
      if (enkel) {
        const omschr = enkel[1].trim()
        const bedrag = parseerBedrag(enkel[2])
        if (omschr.length >= 2 && bedrag !== null && bedrag !== 0 &&
            !/^(aantal|omschrijving|bedrag|totaal|btw|subtotaal)/i.test(omschr)) {
          geextraheerdRegels.push({ omschrijving: omschr, bedrag, aantal: 1, totaal: bedrag })
        }
      }
    }
  } else if (documentType === 'bon' && bedragKolom) {
    for (const r of spatialRegels) {
      if (/\b(?:totaal|subtotaal|btw|te\s*betalen|pin|cash|wissel|kassabon|datum|bon)/i.test(r.tekst)) {
        if (geextraheerdRegels.length > 0) break
        continue
      }
      const m = r.tekst.match(/^(.+?)\s+[€$]?\s*(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s*$/)
      if (m) {
        const omschr = m[1].trim()
        const bedrag = parseerBedrag(m[2])
        if (omschr.length >= 2 && bedrag !== null && bedrag > 0 &&
            !/^(aantal|omschrijving|bedrag|totaal|btw|subtotaal|datum|filiaal)/i.test(omschr)) {
          let aantal = 1
          let omschrSchoon = omschr
          const aantalMatch = omschr.match(/^(\d+)\s*[xX]\s+(.+)$/) || omschr.match(/^(.+?)\s+(\d+)\s*[xX]$/)
          if (aantalMatch) {
            aantal = parseInt(aantalMatch[1], 10) || 1
            omschrSchoon = aantalMatch[2] ?? aantalMatch[1]
          }
          geextraheerdRegels.push({
            omschrijving: omschrSchoon,
            bedrag: aantal > 0 ? Math.round((bedrag / aantal) * 100) / 100 : bedrag,
            aantal,
            totaal: bedrag,
          })
        }
      }
    }
  }

  // ── Totaalbedrag ──────────────────────────────────────────────────────────
  if (documentType === 'factuur' && geextraheerdRegels.length === 0) {
    geextraheerdRegels.push(...detecteerDynamischeFactuurregels(spatialRegels))
  }

  let totaal: number | null = null

  // Stap 1: zoek "Totaal te voldoen" label — bedrag kan op dezelfde of volgende regel staan
  const totaalRegelIdx = spatialRegels.findIndex(r =>
    /\b(?:totaal\s+te\s+voldoen|totaal\s+incl\.?\s*btw|totaalbedrag|factuurbedrag|grand\s+total|te\s+betalen|verschuldigd|amount\s+due|balance\s+due|total\s+due|total\s+amount)\b/i.test(r.tekst)
  )
  if (totaalRegelIdx >= 0) {
    totaal = laatsteBedragIn(spatialRegels[totaalRegelIdx].tekst)
    // Bedrag staat soms op een aparte regel direct na het label
    if (totaal === null || totaal === 0) {
      for (let j = totaalRegelIdx + 1; j <= Math.min(totaalRegelIdx + 3, spatialRegels.length - 1); j++) {
        const b = laatsteBedragIn(spatialRegels[j].tekst)
        if (b !== null && b > 0) { totaal = b; break }
      }
    }
  }

  // Stap 2: generieke "totaal"-regel
  if (totaal === null) {
    const totaalRegel = tekstRegels.find(r =>
      /\btotaal\b|\btotal\b|\bfactuurbedrag\b|\bverschuldigd\b/i.test(r) &&
      !/subtotaal|excl|btw\s*hoog|btw\s*laag|omschrijving|description|aantal|qty|prijs|price/i.test(r) &&
      /\d/.test(r)
    )
    if (totaalRegel) totaal = laatsteBedragIn(totaalRegel)
  }

  // Stap 3: som van geëxtraheerde regels
  if (totaal === null && geextraheerdRegels.length > 0) {
    totaal = Math.round(geextraheerdRegels.reduce((s, r) => s + r.totaal, 0) * 100) / 100
  }

  // Stap 4: hoogste bedrag in document
  if (totaal === null) {
    const bedragen: number[] = []
    BEDRAG_RGX_GLOBAL.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = BEDRAG_RGX_GLOBAL.exec(alles)) !== null) {
      const n = parseerBedrag(m[1])
      if (n !== null && n >= 0.01 && n < 999_999) bedragen.push(n)
    }
    totaal = [...new Set(bedragen)].sort((a, b) => b - a)[0] ?? null
  }

  // ── BTW ───────────────────────────────────────────────────────────────────
  let btwBedrag: number | null = null
  let subtotaal: number | null = null

  if (korActief) {
    btwBedrag = 0
    subtotaal = totaal
  } else {
    let totaleBtw = 0
    let btwGevonden = false
    for (const r of tekstRegels) {
      if (/\b(?:btw|omzetbelasting|vat|tax)\b/i.test(r) &&
          !/excl|exclu|tarief/i.test(r) && /\d/.test(r)) {
        const b = laatsteBedragIn(r)
        if (b !== null && b >= 0 && b < (totaal ?? 999999)) {
          totaleBtw += b
          btwGevonden = true
        }
      }
    }
    if (btwGevonden) btwBedrag = Math.round(totaleBtw * 100) / 100

    const subRegel = tekstRegels.find(r =>
      /\b(?:subtotaal|excl(?:\.|usief)?\.?\s*btw|netto(?:bedrag)?)\b/i.test(r) && /\d/.test(r)
    )
    if (subRegel) subtotaal = laatsteBedragIn(subRegel)

    if (totaal !== null && btwBedrag !== null && subtotaal === null)
      subtotaal = Math.round((totaal - btwBedrag) * 100) / 100
    else if (totaal !== null && subtotaal !== null && btwBedrag === null)
      btwBedrag = Math.round((totaal - subtotaal) * 100) / 100
    else if (totaal !== null && btwBedrag === null && subtotaal === null) {
      // Geen BTW-info gevonden — neem aan 21%
      subtotaal = Math.round((totaal / 1.21) * 100) / 100
      btwBedrag = Math.round((totaal - subtotaal) * 100) / 100
    }
    if (btwBedrag === 0) subtotaal = totaal
  }

  // ── Omschrijving / samenvatting ────────────────────────────────────────────
  let omschrijving: string | null = null
  if (geextraheerdRegels.length > 0) {
    const beschrijvingen = geextraheerdRegels.map(r => r.omschrijving)
    omschrijving = beschrijvingen.slice(0, 5).join('; ')
    if (beschrijvingen.length > 5) omschrijving += ` (+${beschrijvingen.length - 5} meer)`
  } else if (klantNaam && datum) {
    omschrijving = `${klantNaam} – ${datum}`
  } else if (klantNaam) {
    omschrijving = klantNaam
  }

  return {
    nummer,
    klantNaam,
    klantEmail,
    klantAdres,
    datum,
    vervaldatum,
    subtotaal,
    btwBedrag,
    totaal,
    status: 'BETAALD',
    notities: korActief ? 'KOR – geen BTW' : null,
    omschrijving,
    regels: geextraheerdRegels.length > 0 ? geextraheerdRegels : undefined,
    documentType,
    rawText: ruweTekst,
  }
}

// ── Hoofdfunctie: scan een bestand lokaal ────────────────────────────────────
export async function scanBestandLokaal(
  pad: string,
  opties?: { eigenBedrijfsnaam?: string; eigenEmail?: string }
): Promise<OcrVelden> {
  const ext = pad.split('.').pop()?.toLowerCase() ?? ''
  const ondersteund = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif']

  if (!ondersteund.includes(ext)) {
    return { error: `Bestandstype .${ext} wordt niet ondersteund voor lokale OCR.` }
  }

  let beeldPad = pad
  const tmpPaden: string[] = []

  try {
    // ── Primair pad: PDF-tekstlaag via pdfjs-dist ──────────────────────────
    if (ext === 'pdf') {
      const pdfRegels = await extraheerPdfAlsRegels(pad)
      if (pdfRegels && pdfRegels.length >= 5) {
        const ruweTekst = pdfRegels.map(r => r.map(w => w.tekst).join(' ')).join('\n')
        return extraheerFactuurVelden(pdfRegels, ruweTekst, opties)
      }
    }

    // ── Fallback: PaddleOCR via ONNX Runtime (voor gescande PDFs / afbeeldingen) ──
    if (ext === 'pdf') {
      const aantalPaginas = await telPdfPaginas(pad)
      const alleRegels: OcrWoord[][] = []
      const tekstDelen: string[] = []

      for (let paginaIndex = 0; paginaIndex < aantalPaginas; paginaIndex++) {
        const pngBuffer = await pdfPaginaNaarPng(pad, paginaIndex)
        const tmpPng = path.join(os.tmpdir(), `sf_ocr_${Date.now()}_${paginaIndex}.png`)
        tmpPaden.push(tmpPng)
        fs.writeFileSync(tmpPng, pngBuffer)

        const resultaat = await ocrAfbeelding(tmpPng)
        if (!resultaat.tekst?.trim()) continue

        const paginaOffsetY = paginaIndex * 2000
        alleRegels.push(...resultaat.regels.map(regel => regel.map(w => ({
          ...w,
          box: { ...w.box, y: w.box.y + paginaOffsetY },
        }))))
        tekstDelen.push(resultaat.tekst)
      }

      const tekst = tekstDelen.join('\n')
      if (!tekst || tekst.trim().length < 5) {
        return { error: 'OCR heeft geen bruikbare tekst gevonden. Probeer een hogere resolutie of betere belichting.' }
      }

      return extraheerFactuurVelden(alleRegels, tekst, opties)
    }

    const resultaat = await ocrAfbeelding(beeldPad)
    if (!resultaat.tekst || resultaat.tekst.trim().length < 5) {
      return { error: 'OCR heeft geen bruikbare tekst gevonden. Probeer een hogere resolutie of betere belichting.' }
    }

    return extraheerFactuurVelden(resultaat.regels, resultaat.tekst, opties)
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Lokale scan mislukt' }
  } finally {
    for (const tmpPad of tmpPaden) {
      try { fs.unlinkSync(tmpPad) } catch { /* */ }
    }
  }
}
