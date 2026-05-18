/**
 * Lokale OCR voor bonnen en facturen — cross-platform (Windows + Mac + Linux).
 *
 * Pipeline:
 *   1. PDF → PNG via Electron offscreen BrowserWindow (Chromium PDF renderer)
 *   2. OCR via PaddleOCR (ONNX Runtime, geen cloud) — levert tekst + bounding boxes
 *   3. Veld-extractie op basis van regel-inhoud én spatial layout (kolommen, tabellen)
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

/**
 * Een "logische regel" zoals PaddleOCR die levert: meerdere woord-segmenten
 * die op ongeveer dezelfde y-positie staan. We voegen ze samen tot één string
 * en bewaren de geometrie voor latere analyse.
 */
interface SpatialRegel {
  tekst: string
  /** Linker-grens van de meest-linkse box */
  x: number
  /** Rechter-grens van de meest-rechtse box */
  xEinde: number
  /** Top-y */
  y: number
  /** Bottom-y */
  yEinde: number
  /** Originele woord-segmenten in deze regel, gesorteerd op x */
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

/** Detecteer kolommen op basis van x-coördinaten van bedragen. */
function detecteerBedragKolom(regels: SpatialRegel[]): { drempel: number } | null {
  // Verzamel x-posities van losse "€ 12,50"-segmenten
  const bedragX: number[] = []
  for (const r of regels) {
    for (const seg of r.segmenten) {
      if (BEDRAG_RGX.test(seg.tekst)) bedragX.push(seg.box.x)
    }
  }
  if (bedragX.length < 2) return null
  const sorted = [...bedragX].sort((a, b) => a - b)
  // Mediaan als drempel — alles rechts hiervan zijn waarschijnlijk bedragen
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
  // Bon: smal document, weinig regels, vaak "TOTAAL"/"KASSABON" prominent
  // Factuur: bevat "Factuur", "Vervaldatum", "BTW-nr", structured tabel
  const factuurIndicatoren = /\b(?:factuur|invoice|btw-?nummer|kvk|factuurdatum|vervaldatum|debiteur|crediteur|iban)\b/i
  const bonIndicatoren = /\b(?:kassabon|btw\s*hoog|btw\s*laag|tot(?:aal|al)\s*eur|bon\s*nr|bonnummer|aantal\s*x|pinpas|contactloos|maestro|cash|wisselgeld)\b/i
  const lijktFactuur = factuurIndicatoren.test(alles)
  const lijktBon = bonIndicatoren.test(alles)
  const documentType: 'factuur' | 'bon' = lijktFactuur && !lijktBon ? 'factuur'
    : lijktBon && !lijktFactuur ? 'bon'
    : tekstRegels.length < 20 ? 'bon'
    : 'factuur'

  // ── KOR / BTW-vrijstelling ────────────────────────────────────────────────
  const korActief = /\b(?:kor|kleineondernemersregeling|vrijgesteld\s+van\s+btw|niet\s+btw.?plichtig|btw\s+niet\s+van\s+toepassing|art\.?\s*25|reverse\s+charge|btw\s+verlegd)\b/i.test(alles)

  // ── Factuurnummer ─────────────────────────────────────────────────────────
  let nummer: string | null = null
  const nummerMatch = alles.match(
    /(?:factuur(?:nummer)?|invoice(?:\s*no\.?|\s*number)?|inv\.?\s*nr\.?|rekening(?:nummer)?|bon(?:nummer|\s*nr\.?)?)\s*[:#]?\s*([A-Z0-9][-A-Z0-9/_.]{2,25})/i
  )
  if (nummerMatch) nummer = nummerMatch[1].trim()

  // ── Datums ────────────────────────────────────────────────────────────────
  let datum: string | null = null
  let vervaldatum: string | null = null

  for (const r of tekstRegels) {
    if (/verval|due\s*date|betaal.*voor|uiterlijk|payment\s*due/i.test(r)) {
      const d = vindDatumInRegel(r)
      if (d) vervaldatum = d
    }
  }
  for (const r of tekstRegels) {
    if (/factuur(?:datum)?|invoice\s*date|bill\s*date|^datum\b|\bdatum:/i.test(r)) {
      const d = vindDatumInRegel(r)
      if (d && d !== vervaldatum) { datum = d; break }
    }
  }
  if (!datum) {
    for (const r of tekstRegels) {
      const d = vindDatumInRegel(r)
      if (d && d !== vervaldatum) { datum = d; break }
    }
  }

  // ── E-mail ────────────────────────────────────────────────────────────────
  const emailMatch = alles.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/)
  const klantEmail = emailMatch?.[1] ?? null

  // ── Klantnaam / Leverancier ──────────────────────────────────────────────
  let klantNaam: string | null = null

  if (documentType === 'bon') {
    // Voor bonnen: leverancier = eerste niet-lege regel die geen straat/postcode/telnr is
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
    // Voor facturen: gelabelde klant → header-blok vóór "Factuur" → rechtsvorm
    const gelabeldIdx = spatialRegels.findIndex(r =>
      /^(?:klant|aan|t\.?\s*a\.?\s*v\.?|bill\s+to|invoice\s+to|geleverd\s+aan|sold\s+to|ontvanger|recipient)[:\s]/i.test(r.tekst)
    )
    if (gelabeldIdx >= 0) {
      const huidig = spatialRegels[gelabeldIdx].tekst.replace(/^[^:]+:\s*/i, '').trim()
      if (huidig) klantNaam = huidig
      else {
        // Naam staat op de volgende regel
        const volgende = spatialRegels[gelabeldIdx + 1]
        if (volgende) klantNaam = volgende.tekst.trim()
      }
    }

    if (!klantNaam) {
      // Header-blok vóór de "Factuur" kop. Onderscheid links- en rechtsblok via x-positie.
      const factuurKopIdx = spatialRegels.findIndex(r => /^factuur\b/i.test(r.tekst))
      const headerRegels = factuurKopIdx > 0 ? spatialRegels.slice(0, factuurKopIdx) : spatialRegels.slice(0, 10)

      const GEEN_NAAM = /^\d{4}\s?[A-Z]{2}\b|^[+]?[(]?\d{2,}|^(www\.|http|kvk|iban|tel|fax|rekeningnr|btw-nr|btw nr)/i
      const kandidaten = headerRegels.filter(r =>
        r.tekst.length >= 2 && r.tekst.length <= 60 &&
        !GEEN_NAAM.test(r.tekst) &&
        !/^\d[\d\s.,€-]*$/.test(r.tekst) &&
        !/^(factuur|invoice|omschrijving|bedrag|aantal|totaal|datum)/i.test(r.tekst) &&
        !(eigenBedrijfsnaam && r.tekst.toLowerCase().includes(eigenBedrijfsnaam.toLowerCase()))
      )

      // De klant staat meestal links (eigen bedrijf rechts). Zoek de meest-linkse kandidaat.
      if (kandidaten.length > 0) {
        const xPosities = kandidaten.map(k => k.x)
        const minX = Math.min(...xPosities)
        const linksKandidaten = kandidaten.filter(k => k.x < minX + 50)
        let naam = linksKandidaten[0]?.tekst ?? kandidaten[0].tekst
        // Bijvoeging tussen haakjes op volgende regel ("Naam" gevolgd door "(Dyon)")
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

  // ── Klantadres (alleen voor facturen) ─────────────────────────────────────
  let klantAdres: string | null = null
  if (klantNaam && documentType === 'factuur') {
    const klantIdx = spatialRegels.findIndex(r => r.tekst.includes(klantNaam!))
    if (klantIdx >= 0) {
      const adresRegels: string[] = []
      // Verzamel de volgende ~3 regels die er als adres uitzien (postcode, straat, plaats)
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

  // Zoek tabel-headers in een factuur
  const tabelHeaderIdx = spatialRegels.findIndex(r =>
    /omschrijving|description|product|artikel/i.test(r.tekst) &&
    /bedrag|prijs|price|totaal|amount/i.test(r.tekst)
  )
  const tabelFooterIdx = spatialRegels.findIndex(r =>
    /\btotaal\s+te\s+voldoen\b|\bgrand\s+total\b|\bte\s+betalen\b|\btotal\s+amount\b/i.test(r.tekst)
  )

  // Pad 1: gestructureerde factuur-tabel
  if (tabelHeaderIdx >= 0 && documentType === 'factuur') {
    const start = tabelHeaderIdx + 1
    const einde = tabelFooterIdx > tabelHeaderIdx ? tabelFooterIdx : spatialRegels.length

    for (let i = start; i < einde; i++) {
      const r = spatialRegels[i]
      if (!r.tekst || /^[€\s\-]+$/.test(r.tekst)) continue
      if (/^(?:btw|vat|subtotaal|korting|discount|verzend|shipping|tussentotaal|exclusief|inclusief)/i.test(r.tekst)) continue

      // Probeer "<omschr> <bedrag> <aantal> <totaal>"
      const driePoorts = r.tekst.match(
        /^(.+?)\s+[€$]?\s*(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s+(\d+(?:[.,]\d+)?)\s+[€$]?\s*(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s*$/
      )
      if (driePoorts) {
        const omschr = driePoorts[1].trim()
        const bedrag = parseerBedrag(driePoorts[2])
        const aantal = parseFloat(driePoorts[3].replace(',', '.')) || 1
        const regelTotaal = parseerBedrag(driePoorts[4])
        if (omschr.length >= 2 && bedrag !== null && regelTotaal !== null) {
          geextraheerdRegels.push({ omschrijving: omschr, bedrag, aantal, totaal: regelTotaal })
          continue
        }
      }

      // Fallback: omschrijving + één bedrag aan rechterkant
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
  }
  // Pad 2: kassabon — elke regel met tekst+bedrag is een artikel
  else if (documentType === 'bon' && bedragKolom) {
    for (const r of spatialRegels) {
      // Stop bij totaal/BTW/subtotaal
      if (/\b(?:totaal|subtotaal|btw|te\s*betalen|pin|cash|wissel|kassabon|datum|bon)/i.test(r.tekst)) {
        // Maar alleen als het al daadwerkelijk de afsluiting is (na minstens 1 artikel)
        if (geextraheerdRegels.length > 0) break
        continue
      }
      const m = r.tekst.match(/^(.+?)\s+[€$]?\s*(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s*$/)
      if (m) {
        const omschr = m[1].trim()
        const bedrag = parseerBedrag(m[2])
        if (omschr.length >= 2 && bedrag !== null && bedrag > 0 &&
            !/^(aantal|omschrijving|bedrag|totaal|btw|subtotaal|datum|filiaal)/i.test(omschr)) {
          // Detecteer aantal in omschrijving: "2 x Brood" of "Brood 2x"
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
  // Voorkeur: regels met expliciet "totaal te voldoen" / "te betalen"
  const totaalRegel = tekstRegels.find(r =>
    /\b(?:totaal\s+te\s+voldoen|grand\s+total|te\s+betalen|amount\s+due|total\s+amount)\b/i.test(r)
  ) ?? tekstRegels.find(r =>
    /\btotaal\b/i.test(r) && !/subtotaal|excl|btw\s*hoog|btw\s*laag/i.test(r) && /\d/.test(r)
  )
  if (totaalRegel) totaal = laatsteBedragIn(totaalRegel)

  if (totaal === null && geextraheerdRegels.length > 0) {
    totaal = Math.round(geextraheerdRegels.reduce((s, r) => s + r.totaal, 0) * 100) / 100
  }
  if (totaal === null) {
    // Laatste redmiddel: hoogste bedrag in het document
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
    // Verzamel alle BTW-regels (kunnen meerdere tarieven zijn op een bon: 9% en 21%)
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
    // PDF → PNG via Electron Chromium PDF renderer
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
