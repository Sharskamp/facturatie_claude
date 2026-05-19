/**
 * PaddleOCR implementatie via onnxruntime-node + Electron nativeImage.
 *
 * Geen externe canvas-bibliotheken nodig — gebruikt alleen:
 *   - onnxruntime-node (NAPI, werkt in Electron)
 *   - nativeImage (ingebouwd in Electron, laadt PNG/JPEG)
 *
 * Pipeline: afbeelding → detection boxes → per-box recognition → tekst + layout
 */

import * as fs from 'fs'
import * as path from 'path'
import { app, nativeImage } from 'electron'
import * as ort from 'onnxruntime-node'

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

// ── Model-sessies (lazy, eenmalig) ───────────────────────────────────────────
let detSessie: ort.InferenceSession | null = null
let recSessie: ort.InferenceSession | null = null
let dictChars: string[] = []
let initPromise: Promise<void> | null = null

function modellenMap(): string {
  if (app?.isPackaged) return path.join(process.resourcesPath, 'paddleocr')
  return path.join(process.cwd(), 'resources', 'paddleocr')
}

async function init(): Promise<void> {
  if (detSessie && recSessie) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    const dir = modellenMap()
    const detPad  = path.join(dir, 'det.onnx')
    const recPad  = path.join(dir, 'rec.onnx')
    const dictPad = path.join(dir, 'dict.txt')
    for (const p of [detPad, recPad, dictPad]) {
      if (!fs.existsSync(p)) throw new Error(`PaddleOCR-model ontbreekt: ${p}`)
    }
    // ONNX sessies: gebruik DirectML op Windows (NPU/GPU), anders cpu
    const providers: ort.InferenceSession.ExecutionProviderConfig[] =
      process.platform === 'win32' ? ['dml', 'cpu'] : ['cpu']
    const opts: ort.InferenceSession.SessionOptions = {
      executionProviders: providers,
      graphOptimizationLevel: 'all',
    }
    ;[detSessie, recSessie] = await Promise.all([
      ort.InferenceSession.create(detPad, opts).catch(() =>
        ort.InferenceSession.create(detPad, { executionProviders: ['cpu'] })
      ),
      ort.InferenceSession.create(recPad, opts).catch(() =>
        ort.InferenceSession.create(recPad, { executionProviders: ['cpu'] })
      ),
    ])
    dictChars = fs.readFileSync(dictPad, 'utf8').split('\n').map(l => l.trimEnd())
  })()
  return initPromise
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

/** Bilineaire sample uit BGRA-buffer → [R,G,B] 0..255 */
function sampleBGRA(bgra: Buffer, w: number, h: number, fx: number, fy: number): [number, number, number] {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx)))
  const x1 = Math.max(0, Math.min(w - 1, x0 + 1))
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)))
  const y1 = Math.max(0, Math.min(h - 1, y0 + 1))
  const dx = fx - x0, dy = fy - y0
  const lerp = (a: number, b: number, c: number, d: number) =>
    (1 - dy) * ((1 - dx) * a + dx * b) + dy * ((1 - dx) * c + dx * d)
  const p = (y: number, x: number) => (y * w + x) * 4
  return [
    lerp(bgra[p(y0,x0)+2], bgra[p(y0,x1)+2], bgra[p(y1,x0)+2], bgra[p(y1,x1)+2]),
    lerp(bgra[p(y0,x0)+1], bgra[p(y0,x1)+1], bgra[p(y1,x0)+1], bgra[p(y1,x1)+1]),
    lerp(bgra[p(y0,x0)+0], bgra[p(y0,x1)+0], bgra[p(y1,x0)+0], bgra[p(y1,x1)+0]),
  ]
}

/** Afmeting + schaalfactor voor detection model (max 960, veelvoud van 32) */
function detDims(srcW: number, srcH: number): { w: number; h: number; schaal: number } {
  const schaal = Math.min(1, 960 / Math.max(srcW, srcH))
  const w = Math.max(32, Math.ceil((srcW * schaal) / 32) * 32)
  const h = Math.max(32, Math.ceil((srcH * schaal) / 32) * 32)
  return { w, h, schaal }
}

const DET_MEAN = [0.485, 0.456, 0.406]
const DET_STD  = [0.229, 0.224, 0.225]

/** BGRA buffer → genormaliseerde float32 CHW tensor voor detection */
function maakDetTensor(bgra: Buffer, srcW: number, srcH: number, dstW: number, dstH: number, schaal: number): ort.Tensor {
  const data = new Float32Array(3 * dstH * dstW)
  const stride = dstH * dstW
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const [r, g, b] = sampleBGRA(bgra, srcW, srcH, (x + 0.5) / schaal - 0.5, (y + 0.5) / schaal - 0.5)
      const i = y * dstW + x
      data[i]            = (r / 255 - DET_MEAN[0]) / DET_STD[0]
      data[stride + i]   = (g / 255 - DET_MEAN[1]) / DET_STD[1]
      data[2*stride + i] = (b / 255 - DET_MEAN[2]) / DET_STD[2]
    }
  }
  return new ort.Tensor('float32', data, [1, 3, dstH, dstW])
}

interface Box { x: number; y: number; w: number; h: number }

/**
 * Drempelwaarde-kaart → bounding boxes via BFS connected components.
 * Boxes zijn in detection-model coördinaten (nog niet geschaald naar origineel).
 */
function vindBoxes(probMap: Float32Array, mapH: number, mapW: number): Box[] {
  const DREMPEL = 0.3
  const MIN_AREA = 40
  const MARGE = 0.25  // randuitbreiding t.o.v. kleinste zijde

  const bin = new Uint8Array(mapH * mapW)
  for (let i = 0; i < mapH * mapW; i++) {
    // PP-OCRv5 DBNet heeft sigmoid al in het model — gebruik waarde direct
    bin[i] = probMap[i] > DREMPEL ? 1 : 0
  }

  const bezocht = new Uint8Array(mapH * mapW)
  const boxes: Box[] = []

  for (let startY = 0; startY < mapH; startY++) {
    for (let startX = 0; startX < mapW; startX++) {
      const startIdx = startY * mapW + startX
      if (!bin[startIdx] || bezocht[startIdx]) continue

      // BFS
      const queue: number[] = [startIdx]
      bezocht[startIdx] = 1
      let minX = startX, maxX = startX, minY = startY, maxY = startY
      let qi = 0
      while (qi < queue.length) {
        const cur = queue[qi++]
        const cy = (cur / mapW) | 0
        const cx = cur % mapW
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy
        for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
          const ny = cy + dy, nx = cx + dx
          if (ny < 0 || ny >= mapH || nx < 0 || nx >= mapW) continue
          const ni = ny * mapW + nx
          if (!bin[ni] || bezocht[ni]) continue
          bezocht[ni] = 1
          queue.push(ni)
        }
      }

      const area = (maxX - minX + 1) * (maxY - minY + 1)
      if (area < MIN_AREA) continue

      const mg = Math.round(Math.min(maxX - minX, maxY - minY) * MARGE)
      boxes.push({
        x: Math.max(0, minX - mg),
        y: Math.max(0, minY - mg),
        w: Math.min(mapW, maxX + mg + 1) - Math.max(0, minX - mg),
        h: Math.min(mapH, maxY + mg + 1) - Math.max(0, minY - mg),
      })
    }
  }

  // Sorteer: boven→onder, links→rechts
  return boxes.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)
}

const REC_H = 48

/** Crop + resize → genormaliseerde float32 CHW tensor voor recognition */
function maakRecTensor(bgra: Buffer, srcW: number, srcH: number, box: Box): ort.Tensor {
  const aspect = Math.max(1, (box.w * REC_H) / Math.max(1, box.h))
  const recW = Math.max(8, Math.ceil(aspect / 4) * 4)  // veelvoud van 4
  const data = new Float32Array(3 * REC_H * recW)
  const stride = REC_H * recW
  const xSchaal = box.w / recW
  const ySchaal = box.h / REC_H
  for (let y = 0; y < REC_H; y++) {
    for (let x = 0; x < recW; x++) {
      const srcX = box.x + (x + 0.5) * xSchaal - 0.5
      const srcY = box.y + (y + 0.5) * ySchaal - 0.5
      const [r, g, b] = sampleBGRA(bgra, srcW, srcH, srcX, srcY)
      const i = y * recW + x
      data[i]            = (r / 255 - DET_MEAN[0]) / DET_STD[0]
      data[stride + i]   = (g / 255 - DET_MEAN[1]) / DET_STD[1]
      data[2*stride + i] = (b / 255 - DET_MEAN[2]) / DET_STD[2]
    }
  }
  return new ort.Tensor('float32', data, [1, 3, REC_H, recW])
}

/** CTC greedy decode: blank = index 0, tekens = dict[idx-1] */
function ctcDecode(logits: ort.Tensor): { tekst: string; confidence: number } {
  const [, T, C] = logits.dims as [number, number, number]
  const data = logits.data as Float32Array
  let tekst = ''
  let prev = -1
  let totaalConf = 0
  for (let t = 0; t < T; t++) {
    let maxIdx = 0, maxVal = data[t * C]
    for (let c = 1; c < C; c++) {
      if (data[t * C + c] > maxVal) { maxVal = data[t * C + c]; maxIdx = c }
    }
    totaalConf += maxVal
    if (maxIdx !== 0 && maxIdx !== prev) {
      tekst += dictChars[maxIdx - 1] ?? ''
    }
    prev = maxIdx
  }
  return { tekst, confidence: T > 0 ? Math.exp(totaalConf / T) : 0 }
}

/** Groepeer boxes op dezelfde regelhoogte (max 50% overlap in y-richting) */
function groeperNaarRegels(woorden: OcrWoord[]): OcrWoord[][] {
  const regels: OcrWoord[][] = []
  for (const w of woorden) {
    const gevonden = regels.find(r => {
      const last = r[r.length - 1]
      const topOverlap = Math.max(w.box.y, last.box.y)
      const botOverlap = Math.min(w.box.y + w.box.height, last.box.y + last.box.height)
      return botOverlap - topOverlap > 0.5 * Math.min(w.box.height, last.box.height)
    })
    if (gevonden) gevonden.push(w)
    else regels.push([w])
  }
  return regels
}

// ── Hoofdfunctie ─────────────────────────────────────────────────────────────

/**
 * OCR van een afbeelding (pad naar PNG/JPEG/BMP).
 * Laadt via Electron nativeImage — geen externe canvas-bibliotheek nodig.
 */
export async function ocrAfbeelding(pad: string): Promise<OcrUitkomst> {
  await init()

  // 1. Afbeelding laden via Electron nativeImage
  const ni = nativeImage.createFromPath(pad)
  if (ni.isEmpty()) throw new Error(`Kan afbeelding niet laden: ${pad}`)
  const { width: srcW, height: srcH } = ni.getSize()
  const bgra = ni.getBitmap()  // BGRA, row-major

  // 2. Detection
  const { w: detW, h: detH, schaal } = detDims(srcW, srcH)
  const detInput = maakDetTensor(bgra, srcW, srcH, detW, detH, schaal)
  const detOutput = await detSessie!.run({ x: detInput })
  const probMap = detOutput[detSessie!.outputNames[0]].data as Float32Array

  // 3. Boxes vinden in detection-kaart (coördinaten in detection-resolutie)
  const detBoxes = vindBoxes(probMap, detH, detW)

  // 4. Per box: recognition
  const woorden: OcrWoord[] = []
  for (const db of detBoxes) {
    // Schaal box terug naar originele afbeelding-coördinaten
    const box = {
      x: Math.round(db.x / schaal),
      y: Math.round(db.y / schaal),
      width:  Math.round(db.w / schaal),
      height: Math.round(db.h / schaal),
    }
    // Sla te smalle/kleine boxes over
    if (box.width < 4 || box.height < 4) continue

    const recInput = maakRecTensor(bgra, srcW, srcH, { x: box.x, y: box.y, w: box.width, h: box.height })
    const recOutput = await recSessie!.run({ x: recInput })
    const { tekst, confidence } = ctcDecode(recOutput[recSessie!.outputNames[0]])
    if (tekst.trim()) woorden.push({ tekst: tekst.trim(), box, confidence })
  }

  // 5. Groepeer op regels en stel tekst samen
  const regels = groeperNaarRegels(woorden)
  const tekst = regels.map(r => r.map(w => w.tekst).join(' ')).join('\n')

  return {
    tekst,
    regels,
    woorden,
    confidence: woorden.length > 0
      ? woorden.reduce((s, w) => s + w.confidence, 0) / woorden.length
      : 0,
  }
}

export function disposePaddleOcr(): void {
  detSessie = null
  recSessie = null
  initPromise = null
  dictChars = []
}
