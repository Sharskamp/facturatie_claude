/**
 * PaddleOCR-service voor lokale OCR via ONNX Runtime.
 *
 * Modellen worden vanuit `resources/paddleocr/` geladen (dev) of
 * `process.resourcesPath/paddleocr/` (gepackagede app).
 *
 * Beide ESM-packages (ppu-paddle-ocr, @napi-rs/canvas) worden via
 * dynamic import() geladen — nodig vanuit CJS Electron main process.
 */
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface OcrWoord {
  tekst: string
  box: { x: number; y: number; width: number; height: number }
  confidence: number
}

export interface OcrUitkomst {
  tekst: string
  regels: OcrWoord[][]
  woorden: OcrWoord[]
  confidence: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyService = any

let service: AnyService | null = null
let initPromise: Promise<AnyService> | null = null

function modellenMap(): string {
  const ispackaged = app?.isPackaged ?? false
  if (ispackaged) {
    return path.join(process.resourcesPath, 'paddleocr')
  }
  return path.join(process.cwd(), 'resources', 'paddleocr')
}

async function initService(): Promise<AnyService> {
  if (service) return service
  if (initPromise) return initPromise

  initPromise = (async () => {
    const dir = modellenMap()
    const detPad = path.join(dir, 'det.onnx')
    const recPad = path.join(dir, 'rec.onnx')
    const dictPad = path.join(dir, 'dict.txt')

    for (const p of [detPad, recPad, dictPad]) {
      if (!fs.existsSync(p)) {
        throw new Error(`PaddleOCR-model ontbreekt: ${p}`)
      }
    }

    const { PaddleOcrService } = await import('ppu-paddle-ocr')
    const s = new PaddleOcrService({
      model: {
        detection: detPad,
        recognition: recPad,
        charactersDictionary: dictPad,
      },
      processing: { engine: 'canvas-native' },
      recognition: { strategy: 'per-line', charactersDictionary: [] },
    })
    await s.initialize()
    service = s
    return s
  })()
  return initPromise
}

/**
 * Laad een afbeelding (pad of Buffer) in een @napi-rs/canvas Canvas-object.
 * ppu-paddle-ocr verwacht een CoreCanvas zodat .getContext('2d') beschikbaar is.
 */
async function laadAlsCanvas(input: Buffer | string): Promise<AnyService> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const bron: Buffer | string = Buffer.isBuffer(input) ? input : input
  const img = await loadImage(bron as Parameters<typeof loadImage>[0])
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return canvas
}

/**
 * Voer OCR uit op een afbeeldingspad of Buffer (PNG/JPG/BMP/TIFF/WEBP).
 */
export async function ocrAfbeelding(input: Buffer | string): Promise<OcrUitkomst> {
  const svc = await initService()
  const canvas = await laadAlsCanvas(input)
  const resultaat = await svc.recognize(canvas) as {
    text: string
    lines: Array<Array<{ text: string; box: { x: number; y: number; width: number; height: number }; confidence: number }>>
    confidence: number
  }

  const regels: OcrWoord[][] = resultaat.lines.map(
    (line: Array<{ text: string; box: { x: number; y: number; width: number; height: number }; confidence: number }>) =>
      line.map(w => ({ tekst: w.text, box: w.box, confidence: w.confidence }))
  )

  return {
    tekst: resultaat.text,
    regels,
    woorden: regels.flat(),
    confidence: resultaat.confidence,
  }
}

export function disposePaddleOcr(): void {
  service = null
  initPromise = null
}
