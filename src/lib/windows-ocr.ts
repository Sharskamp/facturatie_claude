import { execFile } from 'child_process'

export interface WindowsOcrWoord {
  tekst: string
  box: { x: number; y: number; width: number; height: number }
}

export interface WindowsOcrUitkomst {
  tekst: string
  woorden: WindowsOcrWoord[]
}

interface PowerShellWoord {
  text: string
  x: number
  y: number
  width: number
  height: number
}

interface PowerShellUitkomst {
  text?: string
  words?: PowerShellWoord[]
}

function maakPowerShellScript(): string {
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ImagePath = [System.Environment]::GetEnvironmentVariable('WINDOWS_OCR_IMAGE_PATH')
if ([string]::IsNullOrWhiteSpace($ImagePath)) {
  throw 'Geen afbeeldingspad ontvangen voor Windows OCR.'
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime

function AwaitWinRt([object]$AsyncOp, [Type]$ResultType) {
  $method = (
    [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  ).MakeGenericMethod(@($ResultType))
  $task = $method.Invoke($null, @($AsyncOp))
  $task.Wait()
  if ($task.Exception) {
    throw $task.Exception
  }
  return $task.Result
}

[void][Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Storage.FileAccessMode, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]

$file = AwaitWinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
$stream = AwaitWinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = AwaitWinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = AwaitWinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

if (
  $bitmap.BitmapPixelFormat -ne [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8 -or
  $bitmap.BitmapAlphaMode -ne [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied
) {
  $bitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert(
    $bitmap,
    [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
    [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied
  )
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  throw 'Windows OCR-engine is niet beschikbaar op dit systeem.'
}

$result = AwaitWinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$words = @()

foreach ($line in $result.Lines) {
  foreach ($word in $line.Words) {
    $rect = $word.BoundingRect
    $words += [pscustomobject]@{
      text = [string]$word.Text
      x = [double]$rect.X
      y = [double]$rect.Y
      width = [double]$rect.Width
      height = [double]$rect.Height
    }
  }
}

[pscustomobject]@{
  text = [string]$result.Text
  words = $words
} | ConvertTo-Json -Compress -Depth 6
`.trim()
}

function parseerUitkomst(stdout: string): PowerShellUitkomst {
  const jsonRegel = stdout
    .split(/\r?\n/)
    .map((regel) => regel.trim())
    .find((regel) => regel.startsWith('{') && regel.endsWith('}'))

  if (!jsonRegel) {
    throw new Error(`Geen JSON ontvangen van Windows OCR. Uitvoer: ${stdout.slice(0, 500)}`)
  }

  return JSON.parse(jsonRegel) as PowerShellUitkomst
}

export async function ocrAfbeeldingWindows(pad: string): Promise<WindowsOcrUitkomst> {
  if (process.platform !== 'win32') {
    throw new Error('Windows OCR is alleen beschikbaar op Windows.')
  }

  const script = maakPowerShellScript()
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        env: {
          ...process.env,
          WINDOWS_OCR_IMAGE_PATH: pad,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Windows OCR mislukt: ${stderr || error.message}`.trim()))
          return
        }

        try {
          const resultaat = parseerUitkomst(stdout)
          resolve({
            tekst: (resultaat.text ?? '').trim(),
            woorden: (resultaat.words ?? []).map((woord) => ({
              tekst: woord.text,
              box: {
                x: woord.x,
                y: woord.y,
                width: woord.width,
                height: woord.height,
              },
            })),
          })
        } catch (parseFout) {
          reject(
            new Error(
              `Windows OCR gaf onleesbare uitvoer terug: ${parseFout instanceof Error ? parseFout.message : String(parseFout)}${stderr ? ` | stderr: ${stderr}` : ''}`
            )
          )
        }
      }
    )
  })
}
