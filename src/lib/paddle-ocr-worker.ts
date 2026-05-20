/**
 * Worker thread voor PaddleOCR — draait alle zware ONNX-inferentie + preprocessing
 * buiten de Electron main thread zodat de UI niet bevriest.
 */

import { workerData, parentPort } from 'worker_threads'
import * as fs from 'fs'
import * as path from 'path'
import * as ort from 'onnxruntime-node'

interface WorkerInit {
  modelDir: string
}

interface WorkerRequest {
  id: number
  bgraBuffer: ArrayBuffer
  srcW: number
  srcH: number
}

interface OcrWoord {
  tekst: string
  box: { x: number; y: number; width: number; height: number }
  confidence: number
}

// ── Session staat ────────────────────────────────────────────────────────────
let detSessie: ort.InferenceSession | null = null
let recSessie: ort.InferenceSession | null = null
let dictChars: string[] = []

async function init(modelDir: string): Promise<void> {
  if (detSessie && recSessie) return
  const detPad  = path.join(modelDir, 'det.onnx')
  const recPad  = path.join(modelDir, 'rec.onnx')
  const dictPad = path.join(modelDir, 'dict.txt')
  for (const p of [detPad, recPad, dictPad]) {
    if (!fs.existsSync(p)) throw new Error(`PaddleOCR-model ontbreekt: ${p}`)
  }
  ;[detSessie, recSessie] = await Promise.all([
    ort.InferenceSession.create(detPad, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' }),
    ort.InferenceSession.create(recPad, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' }),
  ])
  dictChars = fs.readFileSync(dictPad, 'utf8').split('\n').map(l => l.trimEnd())
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

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

function detDims(srcW: number, srcH: number): { w: number; h: number; schaal: number } {
  const schaal = Math.min(1, 960 / Math.max(srcW, srcH))
  const w = Math.max(32, Math.ceil((srcW * schaal) / 32) * 32)
  const h = Math.max(32, Math.ceil((srcH * schaal) / 32) * 32)
  return { w, h, schaal }
}

const DET_MEAN = [0.485, 0.456, 0.406]
const DET_STD  = [0.229, 0.224, 0.225]

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

function vindBoxes(probMap: Float32Array, mapH: number, mapW: number): Box[] {
  const DREMPEL = 0.3
  const MIN_AREA = 40
  const MARGE = 0.25

  const bin = new Uint8Array(mapH * mapW)
  for (let i = 0; i < mapH * mapW; i++) {
    bin[i] = probMap[i] > DREMPEL ? 1 : 0
  }

  const bezocht = new Uint8Array(mapH * mapW)
  const boxes: Box[] = []
  const stack = new Int32Array(mapH * mapW)

  for (let startY = 0; startY < mapH; startY++) {
    for (let startX = 0; startX < mapW; startX++) {
      const startIdx = startY * mapW + startX
      if (!bin[startIdx] || bezocht[startIdx]) continue

      let sp = 0
      stack[sp++] = startIdx
      bezocht[startIdx] = 1
      let minX = startX, maxX = startX, minY = startY, maxY = startY

      while (sp > 0) {
        const cur = stack[--sp]
        const cy = (cur / mapW) | 0
        const cx = cur % mapW
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy
        const neighbors = [cur - mapW, cur + mapW, cur - 1, cur + 1]
        for (const ni of neighbors) {
          if (ni < 0 || ni >= mapH * mapW) continue
          const ny = (ni / mapW) | 0, nx = ni % mapW
          if (Math.abs(ny - cy) + Math.abs(nx - cx) !== 1) continue
          if (!bin[ni] || bezocht[ni]) continue
          bezocht[ni] = 1
          stack[sp++] = ni
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

  return boxes.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)
}

const REC_H = 48

function maakRecTensor(bgra: Buffer, srcW: number, srcH: number, box: Box): ort.Tensor {
  const aspect = Math.max(1, (box.w * REC_H) / Math.max(1, box.h))
  const recW = Math.max(8, Math.ceil(aspect / 4) * 4)
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

// ── OCR verwerking ────────────────────────────────────────────────────────────

async function verwerkOcr(bgra: Buffer, srcW: number, srcH: number) {
  const { w: detW, h: detH, schaal } = detDims(srcW, srcH)
  const detInput = maakDetTensor(bgra, srcW, srcH, detW, detH, schaal)
  const detOutput = await detSessie!.run({ x: detInput })
  const probMap = detOutput[detSessie!.outputNames[0]].data as Float32Array

  const detBoxes = vindBoxes(probMap, detH, detW)

  const woorden: OcrWoord[] = []
  for (const db of detBoxes) {
    const box = {
      x: Math.round(db.x / schaal),
      y: Math.round(db.y / schaal),
      width:  Math.round(db.w / schaal),
      height: Math.round(db.h / schaal),
    }
    if (box.width < 4 || box.height < 4) continue

    const recInput = maakRecTensor(bgra, srcW, srcH, { x: box.x, y: box.y, w: box.width, h: box.height })
    const recOutput = await recSessie!.run({ x: recInput })
    const { tekst, confidence } = ctcDecode(recOutput[recSessie!.outputNames[0]])
    if (tekst.trim()) woorden.push({ tekst: tekst.trim(), box, confidence })
  }

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

// ── Worker startup + message loop ─────────────────────────────────────────────

const { modelDir } = workerData as WorkerInit

init(modelDir)
  .then(() => {
    parentPort!.postMessage({ type: 'ready' })

    parentPort!.on('message', async (req: WorkerRequest) => {
      try {
        const bgra = Buffer.from(req.bgraBuffer)
        const result = await verwerkOcr(bgra, req.srcW, req.srcH)
        parentPort!.postMessage({ type: 'result', id: req.id, result })
      } catch (err) {
        parentPort!.postMessage({ type: 'error', id: req.id, error: (err as Error).message })
      }
    })
  })
  .catch(err => {
    parentPort!.postMessage({ type: 'init-error', error: (err as Error).message })
  })
