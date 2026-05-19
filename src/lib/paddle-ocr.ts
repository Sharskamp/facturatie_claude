/**
 * PaddleOCR hoofdthread wrapper.
 *
 * Laadt de afbeelding via nativeImage (Electron, geen externe canvas-deps),
 * dan stuurt het BGRA-buffer naar een persistent worker thread zodat de
 * zware ONNX-inferentie de UI niet blokkeert.
 */

import * as path from 'path'
import { Worker } from 'worker_threads'
import { app, nativeImage } from 'electron'

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

// ── Singleton worker ──────────────────────────────────────────────────────────

let worker: Worker | null = null
let workerReady = false
let workerError: string | null = null
let initPromise: Promise<void> | null = null
let msgId = 0
const pending = new Map<number, { resolve: (v: OcrUitkomst) => void; reject: (e: Error) => void }>()

function modelDir(): string {
  if (app?.isPackaged) return path.join(process.resourcesPath, 'paddleocr')
  return path.join(process.cwd(), 'resources', 'paddleocr')
}

function startWorker(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'paddle-ocr-worker.js')
    worker = new Worker(workerPath, { workerData: { modelDir: modelDir() } })

    worker.on('message', (msg: { type: string; id?: number; result?: OcrUitkomst; error?: string }) => {
      if (msg.type === 'ready') {
        workerReady = true
        resolve()
        return
      }
      if (msg.type === 'init-error') {
        workerError = msg.error ?? 'worker init mislukt'
        reject(new Error(workerError))
        return
      }
      if (msg.id == null) return
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.type === 'error') p.reject(new Error(msg.error ?? 'OCR fout'))
      else if (msg.result) p.resolve(msg.result)
    })

    worker.on('error', (err) => {
      if (!workerReady) {
        reject(err)
      }
      for (const p of pending.values()) p.reject(err)
      pending.clear()
      worker = null
      workerReady = false
      initPromise = null
    })

    worker.on('exit', () => {
      if (!workerReady) reject(new Error('Worker gestopt voor initialisatie'))
      for (const p of pending.values()) p.reject(new Error('OCR worker gestopt'))
      pending.clear()
      worker = null
      workerReady = false
      initPromise = null
    })
  })

  return initPromise
}

// ── Hoofdfunctie ──────────────────────────────────────────────────────────────

export async function ocrAfbeelding(pad: string): Promise<OcrUitkomst> {
  await startWorker()

  const ni = nativeImage.createFromPath(pad)
  if (ni.isEmpty()) throw new Error(`Kan afbeelding niet laden: ${pad}`)
  const { width: srcW, height: srcH } = ni.getSize()
  const bgra = ni.getBitmap()

  // Kopieer Buffer naar eigen ArrayBuffer zodat we kunnen overdragen
  const bgraBuffer = bgra.buffer.slice(bgra.byteOffset, bgra.byteOffset + bgra.byteLength) as ArrayBuffer

  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ id, bgraBuffer, srcW, srcH }, [bgraBuffer])
  })
}

export function disposePaddleOcr(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
  workerReady = false
  workerError = null
  initPromise = null
  pending.clear()
}
