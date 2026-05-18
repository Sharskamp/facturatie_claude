/**
 * PaddleOCR-service voor lokale OCR via ONNX Runtime.
 *
 * Gebruikt PP-OCRv5 mobile-modellen (Latin-script, ondersteunt Nederlands):
 *   - detection:   ~4.7 MB
 *   - recognition: ~7.7 MB
 *   - dictionary:  ~2.6 KB
 *
 * Modellen worden vanuit `resources/paddleocr/` geladen (dev) of
 * `process.resourcesPath/paddleocr/` (gepackagede app).
 *
 * Service wordt lazy geïnitialiseerd (~2-3s eerste call, daarna <1s per scan).
 */
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { PaddleOcrService } from 'ppu-paddle-ocr'

export interface OcrWoord {
  tekst: string
  /** Bounding box in originele afbeelding-coördinaten */
  box: { x: number; y: number; width: number; height: number }
  confidence: number
}

export interface OcrUitkomst {
  /** Volledige tekst, regels gescheiden door \n */
  tekst: string
  /** Lijst van regels, elk met meerdere woord-segmenten (links→rechts) */
  regels: OcrWoord[][]
  /** Platte lijst van alle woorden in leesvolgorde */
  woorden: OcrWoord[]
  confidence: number
}

let service: PaddleOcrService | null = null
let initPromise: Promise<PaddleOcrService> | null = null

function modellenMap(): string {
  // app.isPackaged is undefined buiten Electron context — val terug op resources/ relatief aan cwd
  const ispackaged = app?.isPackaged ?? false
  if (ispackaged) {
    return path.join(process.resourcesPath, 'paddleocr')
  }
  // Dev: project-root/resources/paddleocr
  return path.join(process.cwd(), 'resources', 'paddleocr')
}

async function initService(): Promise<PaddleOcrService> {
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

    const s = new PaddleOcrService({
      model: {
        detection: detPad,
        recognition: recPad,
        charactersDictionary: dictPad,
      },
      // canvas-native engine vermijdt OpenCV-WASM init (sneller cold start)
      processing: { engine: 'canvas-native' },
      recognition: {
        // per-line strategie geeft beste balans accuratesse/snelheid
        strategy: 'per-line',
        charactersDictionary: [],
      },
    })
    await s.initialize()
    service = s
    return s
  })()
  return initPromise
}

/**
 * Voer OCR uit op een afbeelding (PNG/JPG buffer of pad).
 */
export async function ocrAfbeelding(input: Buffer | string): Promise<OcrUitkomst> {
  const svc = await initService()
  // PaddleOcrService accepteert ArrayBuffer of pad-string
  const data: ArrayBuffer | string = Buffer.isBuffer(input)
    ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer
    : input
  const resultaat = await svc.recognize(data) as {
    text: string
    lines: Array<Array<{ text: string; box: { x: number; y: number; width: number; height: number }; confidence: number }>>
    confidence: number
  }

  const regels: OcrWoord[][] = resultaat.lines.map(line =>
    line.map(w => ({ tekst: w.text, box: w.box, confidence: w.confidence }))
  )
  const woorden: OcrWoord[] = regels.flat()

  return {
    tekst: resultaat.text,
    regels,
    woorden,
    confidence: resultaat.confidence,
  }
}

/** Vrijgeven van de OCR-sessie (voor app-shutdown of test-cleanup). */
export function disposePaddleOcr(): void {
  service = null
  initPromise = null
}
