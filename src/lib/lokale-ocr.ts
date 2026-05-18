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

  # Helper: IAsyncOperation<T> -> wachten op resultaat via .NET Task
  function Await-WinRT([object]$asyncOp) {
    $methods = [System.WindowsRuntimeSystemExtensions].GetMethods() |
      Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod }
    $method = $methods | Select-Object -First 1
    $resultType = $asyncOp.GetType().GetGenericArguments()[0]
    $task = $method.MakeGenericMethod($resultType).Invoke($null, @($asyncOp))
    $task.Wait(-1) | Out-Null
    return $task.Result
  }

  # Afbeelding inladen als SoftwareBitmap
  $stream = [System.IO.File]::OpenRead($ImagePath)
  $ras    = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($stream)
  $dec    = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ras))
  $bmp    = Await-WinRT ($dec.GetSoftwareBitmapAsync())
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

  $result = Await-WinRT ($engine.RecognizeAsync($bmp))
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

  // Factuurnummer
  const nummerMatch = alles.match(
    /(?:factuur(?:nummer)?|invoice(?:\s*no\.?)?|inv\.?\s*nr\.?|nummer)\s*[:#]?\s*([A-Z0-9][-A-Z0-9/_.]{1,20})/i
  )
  const nummer = nummerMatch?.[1]?.trim() ?? null

  // Bedragen — NL-formaat: 1.234,56 of 1234.56 of €1.234,56
  function parseerBedrag(s: string): number | null {
    const schoon = s.replace(/\s/g, '').replace(/[€$£]/g, '')
    // NL-stijl: 1.234,56
    if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(schoon)) {
      return parseFloat(schoon.replace(/\./g, '').replace(',', '.'))
    }
    // EN-stijl: 1,234.56
    if (/^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(schoon)) {
      return parseFloat(schoon.replace(/,/g, ''))
    }
    // Eenvoudig getal
    const n = parseFloat(schoon.replace(',', '.'))
    return isNaN(n) ? null : n
  }

  // Zoek regels met bedragen, sla nummers < 0.01 en > 999999 over
  const bedragRgx = /[€$]?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g
  const gevondenBedragen: number[] = []
  let m: RegExpExecArray | null
  while ((m = bedragRgx.exec(alles)) !== null) {
    const n = parseerBedrag(m[1])
    if (n !== null && n >= 0.01 && n < 999_999) gevondenBedragen.push(n)
  }

  // Verwijder duplicaten en sorteer aflopend
  const uniekeBedragen = [...new Set(gevondenBedragen)].sort((a, b) => b - a)
  const totaal = uniekeBedragen[0] ?? null

  // Zoek expliciete BTW-regel
  let btwBedrag: number | null = null
  let subtotaal: number | null = null

  const btwRegel = regels.find(r =>
    /\b(?:btw|omzetbelasting|vat|tax)\b.*\d/i.test(r) && !/excl|exclu/i.test(r)
  )
  if (btwRegel) {
    const bm = btwRegel.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/)
    if (bm) btwBedrag = parseerBedrag(bm[1])
  }

  // Zoek expliciete subtotaal-regel
  const subRegel = regels.find(r =>
    /\b(?:subtotaal|sub(?:total)?|excl(?:\.|usief)?\.?\s*btw|netto(?:bedrag)?)\b.*\d/i.test(r)
  )
  if (subRegel) {
    const sm = subRegel.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/)
    if (sm) subtotaal = parseerBedrag(sm[1])
  }

  // Bereken ontbrekende waarden
  if (totaal !== null && btwBedrag !== null && subtotaal === null) {
    subtotaal = Math.round((totaal - btwBedrag) * 100) / 100
  } else if (totaal !== null && subtotaal !== null && btwBedrag === null) {
    btwBedrag = Math.round((totaal - subtotaal) * 100) / 100
  } else if (totaal !== null && btwBedrag === null && subtotaal === null) {
    // Schat op basis van standaard 21% BTW
    subtotaal = Math.round((totaal / 1.21) * 100) / 100
    btwBedrag = Math.round((totaal - subtotaal) * 100) / 100
  }

  // Datum — NL-formaten
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

  const datumPatronen = [
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/,
    /\b(\d{1,2}\s+[a-zA-Zà-ü]{3,9}\.?\s+\d{4})\b/i,
  ]

  let datum: string | null = null
  let vervaldatum: string | null = null

  // Zoek vervaldatum eerst op gelabelde regels
  const vervalRegel = regels.find(r =>
    /verval|due\s*date|betaal.*voor|uiterlijk|payment\s*due/i.test(r)
  )
  if (vervalRegel) {
    for (const pat of datumPatronen) {
      const vd = vervalRegel.match(pat)
      if (vd) { vervaldatum = normaliseerDatum(vd[1]); break }
    }
  }

  // Zoek factuurdatum
  const datumRegel = regels.find(r =>
    /factuur(?:datum)?|invoice\s*date|datum\s*(?:van\s*)?(?:factuur|rekening)|bill\s*date/i.test(r)
  )
  const zoekIn = datumRegel ? [datumRegel, ...regels] : regels
  for (const regel of zoekIn) {
    for (const pat of datumPatronen) {
      const dd = regel.match(pat)
      if (dd) {
        const d = normaliseerDatum(dd[1])
        if (d && d !== vervaldatum) { datum = d; break }
      }
    }
    if (datum) break
  }

  // E-mail
  const emailMatch = alles.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/)
  const klantEmail = emailMatch?.[1] ?? null

  // Klantnaam — zoek na "klant:", "aan:", "bill to:", "geleverd aan"
  const klantRegel = regels.find(r =>
    /^(?:klant|aan|t\.?\s*a\.?\s*v\.?|bill\s+to|invoice\s+to|geleverd\s+aan|sold\s+to)[:\s]/i.test(r)
  )
  let klantNaam: string | null = null
  if (klantRegel) {
    klantNaam = klantRegel.replace(/^[^:]+:\s*/i, '').trim() || null
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
    notities: null,
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
