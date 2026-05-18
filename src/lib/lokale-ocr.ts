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
export function extraheerFactuurVelden(tekst: string): Omit<OcrVelden, 'error'> {
  const regels = tekst.split('\n').map(r => r.trim()).filter(Boolean)
  const alles = tekst.replace(/\n/g, ' ')

  // ── Hulpfuncties ────────────────────────────────────────────────────────────

  function parseerBedrag(s: string): number | null {
    const schoon = s.replace(/\s/g, '').replace(/[€$£]/g, '')
    if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(schoon))
      return parseFloat(schoon.replace(/\./g, '').replace(',', '.'))
    if (/^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(schoon))
      return parseFloat(schoon.replace(/,/g, ''))
    const n = parseFloat(schoon.replace(',', '.'))
    return isNaN(n) ? null : n
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

  const DATUM_PATRONEN = [
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/,
    /\b(\d{1,2}\s+[a-zA-Zà-ü]{3,9}\.?\s+\d{4})\b/i,
  ]
  function vindDatumInRegel(r: string): string | null {
    for (const pat of DATUM_PATRONEN) {
      const m = r.match(pat)
      if (m) { const d = normaliseerDatum(m[1]); if (d) return d }
    }
    return null
  }

  // ── KOR / BTW-vrijstelling detecteren ───────────────────────────────────────
  const korActief = /\b(?:kor|kleineondernemersregeling|vrijgesteld\s+van\s+btw|niet\s+btw.?plichtig|btw\s+niet\s+van\s+toepassing|article\s+25|art\.?\s*25|reverse\s+charge|btw\s+verlegd)\b/i.test(alles)

  // ── Factuurnummer ────────────────────────────────────────────────────────────
  const nummerMatch = alles.match(
    /(?:factuur(?:nummer)?|invoice(?:\s*no\.?)?|inv\.?\s*nr\.?|rekening(?:nummer)?)\s*[:#]?\s*([A-Z0-9][-A-Z0-9/_.]{1,20})/i
  )
  const nummer = nummerMatch?.[1]?.trim() ?? null

  // ── Bedragen ─────────────────────────────────────────────────────────────────
  const bedragRgx = /[€$]?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g
  const gevondenBedragen: number[] = []
  let m: RegExpExecArray | null
  while ((m = bedragRgx.exec(alles)) !== null) {
    const n = parseerBedrag(m[1])
    if (n !== null && n >= 0.01 && n < 999_999) gevondenBedragen.push(n)
  }
  const uniekeBedragen = [...new Set(gevondenBedragen)].sort((a, b) => b - a)

  // Totaal: zoek expliciet "totaal"-label, anders grootste bedrag
  let totaal: number | null = null
  const totaalRegel = regels.find(r =>
    /\b(?:totaal|total|te\s+betalen|amount\s+due|grand\s+total)\b/i.test(r) &&
    !/subtotaal|excl/i.test(r)
  )
  if (totaalRegel) {
    const tm = totaalRegel.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/)
    if (tm) totaal = parseerBedrag(tm[1])
  }
  if (totaal === null) totaal = uniekeBedragen[0] ?? null

  // BTW
  let btwBedrag: number | null = null
  let subtotaal: number | null = null

  if (korActief) {
    // KOR: geen BTW
    btwBedrag = 0
    subtotaal = totaal
  } else {
    const btwRegel = regels.find(r =>
      /\b(?:btw|omzetbelasting|vat|tax)\b.*\d/i.test(r) && !/excl|exclu/i.test(r)
    )
    if (btwRegel) {
      const bm = btwRegel.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/)
      if (bm) btwBedrag = parseerBedrag(bm[1])
    }
    const subRegel = regels.find(r =>
      /\b(?:subtotaal|sub(?:total)?|excl(?:\.|usief)?\.?\s*btw|netto(?:bedrag)?)\b.*\d/i.test(r)
    )
    if (subRegel) {
      const sm = subRegel.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/)
      if (sm) subtotaal = parseerBedrag(sm[1])
    }
    // Bereken ontbrekende waarde
    if (totaal !== null && btwBedrag !== null && subtotaal === null) {
      subtotaal = Math.round((totaal - btwBedrag) * 100) / 100
    } else if (totaal !== null && subtotaal !== null && btwBedrag === null) {
      btwBedrag = Math.round((totaal - subtotaal) * 100) / 100
    } else if (totaal !== null && btwBedrag === null && subtotaal === null) {
      // Controleer of totaal ≈ subtotaal (geen BTW): verschil < 0.01
      // Anders schat op 21%
      subtotaal = Math.round((totaal / 1.21) * 100) / 100
      btwBedrag = Math.round((totaal - subtotaal) * 100) / 100
    }
    // Als BTW = 0 maar KOR niet expliciet: zet toch op 0
    if (btwBedrag !== null && btwBedrag === 0) subtotaal = totaal
  }

  // ── Datum en vervaldatum ─────────────────────────────────────────────────────
  let datum: string | null = null
  let vervaldatum: string | null = null

  const vervalRegel = regels.find(r =>
    /verval|due\s*date|betaal.*voor|uiterlijk|payment\s*due/i.test(r)
  )
  if (vervalRegel) vervaldatum = vindDatumInRegel(vervalRegel)

  const datumRegel = regels.find(r =>
    /factuur(?:datum)?|invoice\s*date|datum\s*(?:van\s*)?(?:factuur|rekening)|bill\s*date/i.test(r)
  )
  const zoekIn = datumRegel ? [datumRegel, ...regels] : regels
  for (const regel of zoekIn) {
    const d = vindDatumInRegel(regel)
    if (d && d !== vervaldatum) { datum = d; break }
  }

  // ── E-mail ───────────────────────────────────────────────────────────────────
  const emailMatch = alles.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/)
  const klantEmail = emailMatch?.[1] ?? null

  // ── Klantnaam / Leverancier ──────────────────────────────────────────────────
  // Volgorde:
  // 1. Gelabelde klant-regel ("Aan:", "Klant:", "Bill to:", "Geleverd aan:")
  // 2. Bedrijfsnaam met rechtsvorm (BV, NV, VOF, Inc, Ltd, GmbH)
  // 3. Eerste zinvolle niet-numerieke bovenregel (kassabon)

  let klantNaam: string | null = null

  // 1. Gelabeld
  const gelabeldeKlantRegel = regels.find(r =>
    /^(?:klant|aan|t\.?\s*a\.?\s*v\.?|bill\s+to|invoice\s+to|geleverd\s+aan|sold\s+to|ontvanger|recipient|besteld\s+door)[:\s]/i.test(r)
  )
  if (gelabeldeKlantRegel) {
    klantNaam = gelabeldeKlantRegel.replace(/^[^:]+:\s*/i, '').trim() || null
  }

  // 2. Bedrijfsnaam met rechtsvorm ergens in document
  if (!klantNaam) {
    const rechtsvormen = /\b(?:b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|bvba|gmbh|inc\.?|ltd\.?|llc|s\.?a\.?r\.?l\.?|eenmanszaak|holding|groep|group)\b/i
    const bedrijfsRegel = regels.find(r =>
      rechtsvormen.test(r) && r.length >= 3 && r.length <= 60 &&
      !/factuur|invoice|btw|vat|kvk|iban|datum|nummer/i.test(r)
    )
    if (bedrijfsRegel) klantNaam = bedrijfsRegel.trim()
  }

  // 3. Eerste zinvolle regel (kassabon fallback)
  if (!klantNaam) {
    klantNaam = regels.find(r =>
      r.length >= 2 && r.length <= 60 &&
      !/^\d[\d\s.,€*-]*$/.test(r) &&
      !/^\d{4}\s?[A-Z]{2}\b/.test(r) &&
      !/^[+]?[(]?[0-9]{2,}[)]?[-\s.]/.test(r) &&
      !/^(www\.|http)/i.test(r) &&
      !/^(btw|vat|tax|kvk|iban|subtotaal|totaal|bedrag|datum|factuur|invoice|nummer|nr\.)/i.test(r)
    ) ?? null
  }

  // ── Artikelregels / omschrijving ────────────────────────────────────────────
  // Herken inhoudsregels: tekst gevolgd door een bedrag, maar geen kop/voet/totaal-regels
  const SKIP_PATRONEN = /^(?:btw|vat|tax|omzetbelasting|subtotaal|totaal|total|te\s+betalen|amount\s+due|korting|discount|verzend|shipping|porto|aanbetaling|deposit|iban|kvk|datum|factuur|invoice|aan|klant|bill\s+to|tel\.|fax|www\.|http|pagina|page)/i
  const BEDRAG_ACHTERAAN = /[€$]?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s*$/

  const artikelRegels: string[] = []
  for (const regel of regels) {
    // Sla koptekst (eerste 3 en laatste 5 regels) over
    const idx = regels.indexOf(regel)
    if (idx < 3 || idx >= regels.length - 5) continue
    if (SKIP_PATRONEN.test(regel)) continue
    if (BEDRAG_ACHTERAAN.test(regel) && regel.length > 5) {
      // Haal bedrag weg aan het einde → omschrijving
      const omschr = regel.replace(/[€$]?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s*$/, '').trim()
      if (omschr.length >= 3 && !/^\d+$/.test(omschr)) artikelRegels.push(omschr)
    }
  }

  // Omschrijving samenstellen
  let omschrijving: string | null = null
  if (artikelRegels.length > 0) {
    // Meerdere regels: combineer, max 5 voor leesbaarheid
    omschrijving = artikelRegels.slice(0, 5).join('; ')
    if (artikelRegels.length > 5) omschrijving += ` (+${artikelRegels.length - 5} meer)`
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
