/**
 * Lokale OCR zonder cloud API.
 * - Windows: Windows.Media.Ocr via PowerShell (hardware-versneld, gebruikt NPU/GPU indien beschikbaar)
 * - PDF → afbeelding via Electron offscreen BrowserWindow (Chromium PDF renderer)
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { BrowserWindow } from 'electron'

const execAsync = promisify(exec)

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
  error?: string
}

// ── Windows.Media.Ocr via PowerShell ─────────────────────────────────────────
// Gebruikt de Windows OCR-engine die op moderne hardware (Intel, AMD, Qualcomm)
// automatisch de NPU/iGPU inschakelt via Windows ML.
// WinRT-types worden geladen via ContentType=WindowsRuntime (niet Add-Type -AssemblyName).
const WINDOWS_OCR_SCRIPT = String.raw`
param([string]$ImagePath)
$ErrorActionPreference = 'Stop'
try {
  # System.Runtime.WindowsRuntime levert de AsTask extensiemethoden
  Add-Type -AssemblyName System.Runtime.WindowsRuntime

  # WinRT types laden via ContentType=WindowsRuntime
  $null = [Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]
  $null = [Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]

  # Helper: IAsyncOperation<T> -> wachten op resultaat.
  # ResultType moet EXPLICIET meegegeven worden — auto-detectie via GetGenericArguments()
  # werkt niet met WinRT-types in PowerShell.
  function Await-WinRT([object]$asyncOp, [type]$ResultType) {
    $method = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
      Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
      Select-Object -First 1).MakeGenericMethod($ResultType)
    $task = $method.Invoke($null, @($asyncOp))
    $task.Wait(-1) | Out-Null
    return $task.Result
  }

  # Afbeelding inladen als SoftwareBitmap
  $stream = [System.IO.File]::OpenRead($ImagePath)
  $ras    = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($stream)
  $dec    = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ras)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp    = Await-WinRT ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $stream.Close()

  # OCR-engine kiezen: nl-NL -> nl-BE -> en-US -> OS-taal
  $engine = $null
  foreach ($code in @('nl-NL','nl-BE','en-US')) {
    try {
      $e = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($code))
      if ($null -ne $e) { $engine = $e; break }
    } catch {}
  }
  if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if ($null -eq $engine) {
    throw 'Geen OCR-taalpack beschikbaar. Installeer Nederlands of Engels via Windows Instellingen > Tijd en taal > Taal.'
  }

  $result = Await-WinRT ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  Write-Output $result.Text
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`.trim()

async function ocrViaWindowsMediaOcr(imagePad: string): Promise<string> {
  const tmpScript = path.join(os.tmpdir(), `sf_windows_ocr_${Date.now()}.ps1`)
  fs.writeFileSync(tmpScript, WINDOWS_OCR_SCRIPT, 'utf8')
  // Escape dubbele aanhalingstekens in het pad voor PowerShell
  const psPad = imagePad.replace(/"/g, '`"')
  try {
    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpScript}" "${psPad}"`,
      { timeout: 30_000 }
    )
    return stdout.trim()
  } finally {
    try { fs.unlinkSync(tmpScript) } catch { /* */ }
  }
}


// ── PDF → PNG via Electron offscreen BrowserWindow ───────────────────────────
// Gebruikt Chromium's ingebouwde PDF-renderer, geen extra dependencies nodig.
export async function pdfPaginaNaarPng(pad: string, paginaIndex = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 1240,
      height: 1754, // A4 @ 150dpi
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
        // Geef Chromium PDF viewer extra tijd om te renderen
        await new Promise(r => setTimeout(r, 1_500))

        // Scroll naar de juiste pagina bij meerdere pagina's
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

    // Gebruik encodeURIComponent voor spaties in pad
    const url = `file://${pad.replace(/\\/g, '/').replace(/ /g, '%20')}`
    win.loadURL(url)
  })
}

// ── Factuurvelden extraheren uit OCR-tekst ────────────────────────────────────
export function extraheerFactuurVelden(tekst: string, eigenBedrijfsnaam?: string): Omit<OcrVelden, 'error'> {
  const regels = tekst.split('\n').map(r => r.trim()).filter(Boolean)
  const alles = tekst.replace(/\n/g, ' ')

  // ── Hulpfuncties ─────────────────────────────────────────────────────────────

  function parseerBedrag(s: string): number | null {
    const schoon = s.replace(/\s/g, '').replace(/[€$£]/g, '')
    if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(schoon))
      return parseFloat(schoon.replace(/\./g, '').replace(',', '.'))
    if (/^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(schoon))
      return parseFloat(schoon.replace(/,/g, ''))
    const n = parseFloat(schoon.replace(',', '.'))
    return isNaN(n) ? null : n
  }

  function eersteBedragIn(r: string): number | null {
    const m = r.match(/[€$]?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/)
    return m ? parseerBedrag(m[1]) : null
  }

  const MAANDEN: Record<string, string> = {
    jan: '01', feb: '02', mrt: '03', maa: '03', apr: '04', mei: '05',
    jun: '06', jul: '07', aug: '08', sep: '09', okt: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  }
  function normaliseerDatum(s: string): string | null {
    s = s.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const dm = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
    if (dm) return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
    const wm = s.match(/^(\d{1,2})\s+([a-zà-ü]+)\.?\s+(\d{4})$/i)
    if (wm) {
      const mn = MAANDEN[wm[2].toLowerCase().slice(0, 3)]
      if (mn) return `${wm[3]}-${mn}-${wm[1].padStart(2, '0')}`
    }
    return null
  }
  function vindDatumInRegel(r: string): string | null {
    for (const pat of [/\b(\d{4}-\d{2}-\d{2})\b/, /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/, /\b(\d{1,2}\s+[a-zA-Zà-ü]{3,9}\.?\s+\d{4})\b/i]) {
      const m = r.match(pat)
      if (m) { const d = normaliseerDatum(m[1]); if (d) return d }
    }
    return null
  }

  // ── KOR / BTW-vrijstelling ───────────────────────────────────────────────────
  const korActief = /\b(?:kor|kleineondernemersregeling|vrijgesteld\s+van\s+btw|niet\s+btw.?plichtig|btw\s+niet\s+van\s+toepassing|art\.?\s*25|reverse\s+charge|btw\s+verlegd)\b/i.test(alles)

  // ── Factuurnummer ─────────────────────────────────────────────────────────────
  const nummerMatch = alles.match(
    /(?:factuur(?:nummer)?|invoice(?:\s*no\.?)?|inv\.?\s*nr\.?|rekening(?:nummer)?)\s*[:#]?\s*([A-Z0-9][-A-Z0-9/_.]{2,20})/i
  )
  const nummer = nummerMatch?.[1]?.trim() ?? null

  // ── Datums ────────────────────────────────────────────────────────────────────
  let datum: string | null = null
  let vervaldatum: string | null = null

  for (const r of regels) {
    if (/verval|due\s*date|betaal.*voor|uiterlijk|payment\s*due/i.test(r)) {
      const d = vindDatumInRegel(r); if (d) vervaldatum = d
    }
  }
  for (const r of regels) {
    if (/factuur(?:datum)?|invoice\s*date|datum|bill\s*date/i.test(r)) {
      const d = vindDatumInRegel(r); if (d && d !== vervaldatum) { datum = d; break }
    }
  }
  // Fallback: eerste datum in document die nog niet is gebruikt
  if (!datum) {
    for (const r of regels) {
      const d = vindDatumInRegel(r)
      if (d && d !== vervaldatum) { datum = d; break }
    }
  }

  // ── E-mail ────────────────────────────────────────────────────────────────────
  const emailMatch = alles.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/)
  const klantEmail = emailMatch?.[1] ?? null

  // ── Klantnaam ─────────────────────────────────────────────────────────────────
  // Strategie voor dit factuurformaat (Streamline Coaching):
  //   - Klantnaam staat linksboven VOOR de "Factuur" kop
  //   - Eigen bedrijfsnaam staat rechtsboven (met adres, telefoon, email etc.)
  //   - Klantnaam kan gevolgd worden door bijzetting tussen haakjes op volgende regel
  let klantNaam: string | null = null

  // 1. Gelabelde klant-regel
  const gelabeldeKlantRegel = regels.find(r =>
    /^(?:klant|aan|t\.?\s*a\.?\s*v\.?|bill\s+to|invoice\s+to|geleverd\s+aan|sold\s+to|ontvanger|recipient)[:\s]/i.test(r)
  )
  if (gelabeldeKlantRegel) {
    klantNaam = gelabeldeKlantRegel.replace(/^[^:]+:\s*/i, '').trim() || null
  }

  // 2. Blok vóór de "Factuur" kop:
  //    zoek regels die er als persoons- of bedrijfsnaam uitzien, exclusief eigen bedrijf
  if (!klantNaam) {
    const factuurKopIdx = regels.findIndex(r => /^factuur\b/i.test(r))
    const headerRegels = factuurKopIdx > 0 ? regels.slice(0, factuurKopIdx) : regels.slice(0, 8)

    // Filter regels die duidelijk geen naam zijn (adres, contactinfo, KvK, IBAN, eigen bedrijf)
    const GEEN_NAAM = /^\d{4}\s?[A-Z]{2}\b|^[+]?[(]?\d{2,}|^(www\.|http|kvk|iban|tel|fax|rekeningnr|btw-nr)/i
    const kandidaten = headerRegels.filter(r =>
      r.length >= 2 && r.length <= 60 &&
      !GEEN_NAAM.test(r) &&
      !/^\d[\d\s.,€-]*$/.test(r) &&
      !/^(streamline|factuur|invoice|omschrijving|bedrag|aantal|totaal)/i.test(r) &&
      !(eigenBedrijfsnaam && r.toLowerCase().includes(eigenBedrijfsnaam.toLowerCase()))
    )

    if (kandidaten.length > 0) {
      // Eerste kandidaat is de naam, optioneel gevolgd door bijzetting (bijv. "(Dyon)")
      let naam = kandidaten[0]
      const volgende = kandidaten[1]
      if (volgende && /^\(.*\)$/.test(volgende)) naam += ` ${volgende}`
      klantNaam = naam
    }
  }

  // 3. Bedrijfsnaam met rechtsvorm
  if (!klantNaam) {
    const rechtsvormen = /\b(?:b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|bvba|gmbh|inc\.?|ltd\.?|llc|holding|groep|group)\b/i
    klantNaam = regels.find(r =>
      rechtsvormen.test(r) && r.length >= 3 && r.length <= 60 &&
      !/factuur|invoice|btw|kvk|iban|datum/i.test(r)
    ) ?? null
  }

  // ── Artikelregels ──────────────────────────────────────────────────────────────
  // Zoek de tabel: koptekst "Omschrijving ... Bedrag ... Aantal ... Totaal"
  // en lees alle rijen tot "Totaal te voldoen" / "Totaal"
  const geextraheerdRegels: OcrRegel[] = []

  const tabelHeaderIdx = regels.findIndex(r =>
    /omschrijving/i.test(r) && /bedrag|prijs/i.test(r) && /totaal/i.test(r)
  )
  const tabelFooterIdx = regels.findIndex(r =>
    /\btotaal\s+te\s+voldoen\b|\bgrand\s+total\b|\bte\s+betalen\b/i.test(r)
  )

  if (tabelHeaderIdx >= 0) {
    const start = tabelHeaderIdx + 1
    const einde = tabelFooterIdx > tabelHeaderIdx ? tabelFooterIdx : regels.length

    for (let i = start; i < einde; i++) {
      const r = regels[i]
      // Sla lege regels en puur-€-lege regels over ("€ - € -")
      if (!r || /^[€\s\-]+$/.test(r)) continue
      // Sla koptekst-achtige regels over
      if (/^(?:btw|vat|subtotaal|korting|discount|verzend|shipping)/i.test(r)) continue

      // Patroon voor een artikelregel:
      // "<omschrijving> [€] <bedrag> <aantal> [€] <totaal>"
      // Bedrag en totaal zijn getallen, aantal is een heel getal
      const artikelMatch = r.match(
        /^(.+?)\s+[€$]?\s*(\d[\d.,]+)\s+(\d+(?:[.,]\d+)?)\s+[€$]?\s*(\d[\d.,]+)\s*$/
      )
      if (artikelMatch) {
        const omschr = artikelMatch[1].trim()
        const bedrag = parseerBedrag(artikelMatch[2])
        const aantal = parseFloat(artikelMatch[3].replace(',', '.'))
        const regelTotaal = parseerBedrag(artikelMatch[4])
        if (omschr.length >= 2 && bedrag !== null && regelTotaal !== null) {
          geextraheerdRegels.push({ omschrijving: omschr, bedrag, aantal: aantal || 1, totaal: regelTotaal })
        }
        continue
      }

      // Simpler: regel met tekst + één bedrag achteraan (geen apart aantal)
      const enkelvoudigMatch = r.match(/^(.+?)\s+[€$]?\s*(\d[\d.,]+)\s*$/)
      if (enkelvoudigMatch) {
        const omschr = enkelvoudigMatch[1].trim()
        const bedrag = parseerBedrag(enkelvoudigMatch[2])
        if (omschr.length >= 2 && bedrag !== null && bedrag >= 0.01 &&
            !/^(aantal|omschrijving|bedrag|totaal)/i.test(omschr)) {
          geextraheerdRegels.push({ omschrijving: omschr, bedrag, aantal: 1, totaal: bedrag })
        }
      }
    }
  }

  // ── Totaalbedrag ────────────────────────────────────────────────────────────
  let totaal: number | null = null
  const totaalRegel = regels.find(r =>
    /\b(?:totaal\s+te\s+voldoen|grand\s+total|te\s+betalen|amount\s+due)\b/i.test(r)
  ) ?? regels.find(r =>
    /\btotaal\b/i.test(r) && !/subtotaal|excl/i.test(r) && /\d/.test(r)
  )
  if (totaalRegel) totaal = eersteBedragIn(totaalRegel.replace(/.*totaal[^€\d]*/i, ''))

  // Fallback: som van artikelregels, of grootste bedrag
  if (totaal === null && geextraheerdRegels.length > 0) {
    totaal = Math.round(geextraheerdRegels.reduce((s, r2) => s + r2.totaal, 0) * 100) / 100
  }
  if (totaal === null) {
    const gevondenBedragen: number[] = []
    let m: RegExpExecArray | null
    const bedragRgx = /[€$]?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g
    while ((m = bedragRgx.exec(alles)) !== null) {
      const n = parseerBedrag(m[1])
      if (n !== null && n >= 0.01 && n < 999_999) gevondenBedragen.push(n)
    }
    totaal = [...new Set(gevondenBedragen)].sort((a, b) => b - a)[0] ?? null
  }

  // ── BTW ────────────────────────────────────────────────────────────────────
  let btwBedrag: number | null = null
  let subtotaal: number | null = null

  if (korActief) {
    btwBedrag = 0
    subtotaal = totaal
  } else {
    const btwRegel = regels.find(r =>
      /\b(?:btw|omzetbelasting|vat|tax)\b.*\d/i.test(r) && !/excl|exclu/i.test(r)
    )
    if (btwRegel) btwBedrag = eersteBedragIn(btwRegel)
    const subRegel = regels.find(r =>
      /\b(?:subtotaal|excl(?:\.|usief)?\.?\s*btw|netto(?:bedrag)?)\b.*\d/i.test(r)
    )
    if (subRegel) subtotaal = eersteBedragIn(subRegel)
    if (totaal !== null && btwBedrag !== null && subtotaal === null)
      subtotaal = Math.round((totaal - btwBedrag) * 100) / 100
    else if (totaal !== null && subtotaal !== null && btwBedrag === null)
      btwBedrag = Math.round((totaal - subtotaal) * 100) / 100
    else if (totaal !== null && btwBedrag === null && subtotaal === null) {
      subtotaal = Math.round((totaal / 1.21) * 100) / 100
      btwBedrag = Math.round((totaal - subtotaal) * 100) / 100
    }
    if (btwBedrag === 0) subtotaal = totaal
  }

  // ── Omschrijving ───────────────────────────────────────────────────────────
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
    klantAdres: null,
    datum,
    vervaldatum,
    subtotaal,
    btwBedrag,
    totaal,
    status: 'BETAALD',
    notities: korActief ? 'KOR – geen BTW' : null,
    omschrijving,
    regels: geextraheerdRegels.length > 0 ? geextraheerdRegels : undefined,
  }
}

// ── Hoofdfunctie: scan een bestand lokaal ────────────────────────────────────
export async function scanBestandLokaal(pad: string): Promise<OcrVelden> {
  const ext = pad.split('.').pop()?.toLowerCase() ?? ''
  const ondersteund = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif']

  if (!ondersteund.includes(ext)) {
    return { error: `Bestandstype .${ext} wordt niet ondersteund voor lokale OCR.` }
  }

  let beeldPad = pad
  let tmpPng: string | null = null

  try {
    // PDF → PNG via Electron PDF renderer
    if (ext === 'pdf') {
      const pngBuffer = await pdfPaginaNaarPng(pad)
      tmpPng = path.join(os.tmpdir(), `sf_ocr_${Date.now()}.png`)
      fs.writeFileSync(tmpPng, pngBuffer)
      beeldPad = tmpPng
    }

    let tekst: string

    if (process.platform === 'win32') {
      tekst = await ocrViaWindowsMediaOcr(beeldPad)
    } else {
      throw new Error(
        'Lokale OCR is momenteel alleen beschikbaar op Windows (Windows.Media.Ocr). ' +
        'Gebruik de Claude AI-scan optie of draai de app op Windows.'
      )
    }

    if (!tekst || tekst.trim().length < 10) {
      return { error: 'OCR heeft geen bruikbare tekst gevonden. Probeer een hogere resolutie afbeelding.' }
    }

    return extraheerFactuurVelden(tekst)
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Lokale scan mislukt' }
  } finally {
    if (tmpPng) try { fs.unlinkSync(tmpPng) } catch { /* */ }
  }
}
