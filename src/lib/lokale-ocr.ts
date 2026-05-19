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
  error?: string
}

// ── PDF tekstextractie via pdfjs-dist (CJS legacy build) ─────────────────────

/** Extraheer tekst met posities uit een PDF via PDF.js — werkt voor gedrukte/programmatische PDFs */
async function extraheerPdfAlsRegels(pad: string): Promise<OcrWoord[][] | null> {
  try {
    // Lazy load om startup-tijd te beperken; legacy/build/pdf.js is CJS
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js') as {
      getDocument: (src: {
        data: Uint8Array
        useSystemFonts?: boolean
        disableFontFace?: boolean
      }) => { promise: Promise<PdfDoc> }
      GlobalWorkerOptions: { workerSrc: unknown }
    }
    // Geen worker nodig voor tekst-extractie — fake-worker mode (main thread)
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''

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
    await doc.destroy()

    if (content.items.length < 5) return null

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

// Minimal types voor pdfjs-dist page/doc objecten
interface PdfDoc {
  getPage(n: number): Promise<PdfPage>
  destroy(): Promise<void>
}
interface PdfPage {
  getViewport(opts: { scale: number }): { width: number; height: number }
  getTextContent(opts?: { normalizeWhitespace: boolean }): Promise<{ items: unknown[] }>
}

// ── PDF → PNG via Electron offscreen BrowserWindow ───────────────────────────
export async function pdfPaginaNaarPng(pad: string, paginaIndex = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 1240,
      height: 1754, // A4 @ 150 dpi
      show: false,
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    const timeout = setTimeout(() => {
      win.close()
      reject(new Error('PDF rendering timeout (15s)'))
    }, 15_000)

    win.webContents.once('did-fail-load', (_e, code, desc) => {
      clearTimeout(timeout)
      win.close()
      reject(new Error(`PDF laden mislukt: ${desc} (code ${code})`))
    })

    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 1_500))
        if (paginaIndex > 0) {
          await win.webContents.executeJavaScript(
            `window.scrollTo(0, ${paginaIndex} * window.innerHeight)`
          )
          await new Promise(r => setTimeout(r, 500))
        }
        const image = await win.webContents.capturePage()
        clearTimeout(timeout)
        win.close()
        resolve(image.toPNG())
      } catch (e) {
        clearTimeout(timeout)
        win.close()
        reject(e)
      }
    })

    const url = `file://${pad.replace(/\\/g, '/').replace(/ /g, '%20')}`
    win.loadURL(url)
  })
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
  jun: '06', jul: '07', aug: '08', sep: '09', okt: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  januari: '01', februari: '02', maart: '03',
}

function normaliseerDatum(s: string): string | null {
  s = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dm = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (dm) {
    const jaar = dm[3].length === 2 ? `20${dm[3]}` : dm[3]
    return `${jaar}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
  }
  const wm = s.match(/^(\d{1,2})\s+([a-zà-ü]+)\.?\s+(\d{2,4})$/i)
  if (wm) {
    const mn = MAANDEN[wm[2].toLowerCase()] ?? MAANDEN[wm[2].toLowerCase().slice(0, 3)]
    if (mn) {
      const jaar = wm[3].length === 2 ? `20${wm[3]}` : wm[3]
      return `${jaar}-${mn}-${wm[1].padStart(2, '0')}`
    }
  }
  return null
}

function vindDatumInRegel(r: string): string | null {
  for (const pat of [
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/,
    /\b(\d{1,2}\s+[a-zA-Zà-ü]{3,9}\.?\s+\d{2,4})\b/i,
  ]) {
    const m = r.match(pat)
    if (m) {
      const d = normaliseerDatum(m[1])
      if (d) return d
    }
  }
  return null
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
export function extraheerFactuurVelden(
  woordRegels: OcrWoord[][],
  ruweTekst: string,
  opties?: { eigenBedrijfsnaam?: string }
): Omit<OcrVelden, 'error'> {
  const spatialRegels = bouwSpatialRegels(woordRegels)
  const tekstRegels = spatialRegels.map(r => r.tekst)
  const alles = tekstRegels.join(' ')
  const eigenBedrijfsnaam = opties?.eigenBedrijfsnaam

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
  const nummerMatch = alles.match(
    /(?:factuur(?:nummer)?|invoice(?:\s*no\.?|\s*number)?|inv\.?\s*nr\.?|rekening(?:nummer)?|bon(?:nummer|\s*nr\.?)?)\s*[:#]?\s*([A-Z0-9][-A-Z0-9/_.]{2,25})/i
  )
  if (nummerMatch) nummer = nummerMatch[1].trim()

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

  // ── E-mail ────────────────────────────────────────────────────────────────
  const emailMatch = alles.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/)
  const klantEmail = emailMatch?.[1] ?? null

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
        // "(Evy en Isa)" op de volgende regel toevoegen als het echt tussen haakjes staat
        const idx = spatialRegels.findIndex(r => r.tekst === naam)
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
    /omschrijving|description|product|artikel/i.test(r.tekst) &&
    /bedrag|prijs|price|totaal|amount/i.test(r.tekst)
  )
  const tabelFooterIdx = spatialRegels.findIndex(r =>
    /\btotaal\s+te\s+voldoen\b|\bgrand\s+total\b|\bte\s+betalen\b|\btotal\s+amount\b/i.test(r.tekst)
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
  let totaal: number | null = null

  // Stap 1: zoek "Totaal te voldoen" label — bedrag kan op dezelfde of volgende regel staan
  const totaalRegelIdx = spatialRegels.findIndex(r =>
    /\b(?:totaal\s+te\s+voldoen|grand\s+total|te\s+betalen|amount\s+due|total\s+amount)\b/i.test(r.tekst)
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
      /\btotaal\b/i.test(r) && !/subtotaal|excl|btw\s*hoog|btw\s*laag/i.test(r) && /\d/.test(r)
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
  }
}

// ── Hoofdfunctie: scan een bestand lokaal ────────────────────────────────────
export async function scanBestandLokaal(
  pad: string,
  opties?: { eigenBedrijfsnaam?: string }
): Promise<OcrVelden> {
  const ext = pad.split('.').pop()?.toLowerCase() ?? ''
  const ondersteund = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif']

  if (!ondersteund.includes(ext)) {
    return { error: `Bestandstype .${ext} wordt niet ondersteund voor lokale OCR.` }
  }

  let beeldPad = pad
  let tmpPng: string | null = null

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
      const pngBuffer = await pdfPaginaNaarPng(pad)
      tmpPng = path.join(os.tmpdir(), `sf_ocr_${Date.now()}.png`)
      fs.writeFileSync(tmpPng, pngBuffer)
      beeldPad = tmpPng
    }

    const resultaat = await ocrAfbeelding(beeldPad)
    if (!resultaat.tekst || resultaat.tekst.trim().length < 5) {
      return { error: 'OCR heeft geen bruikbare tekst gevonden. Probeer een hogere resolutie of betere belichting.' }
    }

    return extraheerFactuurVelden(resultaat.regels, resultaat.tekst, opties)
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Lokale scan mislukt' }
  } finally {
    if (tmpPng) {
      try { fs.unlinkSync(tmpPng) } catch { /* */ }
    }
  }
}
