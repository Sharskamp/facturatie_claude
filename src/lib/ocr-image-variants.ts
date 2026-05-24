import { nativeImage, type NativeImage } from 'electron'

export interface OcrAfbeeldingVariant {
  naam: string
  image: NativeImage
  scaleFactor: number
}

function clamp(kanaal: number): number {
  return Math.max(0, Math.min(255, Math.round(kanaal)))
}

function pasContrastToe(waarde: number, contrast: number): number {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
  return clamp(factor * (waarde - 128) + 128)
}

function gemiddeldeLuminantie(data: Uint8ClampedArray): number {
  let som = 0
  for (let i = 0; i < data.length; i += 4) {
    som += (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2])
  }
  return data.length > 0 ? som / (data.length / 4) : 180
}

async function renderVariant(
  bron: NativeImage,
  scaleFactor: number,
  transform: (data: Uint8ClampedArray) => void
): Promise<NativeImage> {
  const canvasMod = require('canvas') as typeof import('canvas')
  if (!canvasMod?.createCanvas || !canvasMod?.loadImage) {
    throw new Error('canvas module niet beschikbaar')
  }

  const { createCanvas, loadImage } = canvasMod
  const { width, height } = bron.getSize()
  const targetWidth = Math.max(1, Math.round(width * scaleFactor))
  const targetHeight = Math.max(1, Math.round(height * scaleFactor))
  const canvas = createCanvas(targetWidth, targetHeight)
  const ctx = canvas.getContext('2d')

  ctx.patternQuality = 'best'
  ctx.quality = 'best'
  ctx.antialias = 'subpixel'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, targetWidth, targetHeight)

  const image = await loadImage(bron.toPNG())
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
  transform(imageData.data)
  ctx.putImageData(imageData, 0, 0)

  return nativeImage.createFromBuffer(canvas.toBuffer('image/png'))
}

export async function maakOcrAfbeeldingVarianten(
  bron: NativeImage,
  minKorteZijde = 300
): Promise<OcrAfbeeldingVariant[]> {
  const { width, height } = bron.getSize()
  const korteZijde = Math.max(Math.min(width, height), 1)
  const scaleFactor = Math.max(1, Math.min(6, Math.ceil(minKorteZijde / korteZijde)))

  const origineel = scaleFactor > 1
    ? bron.resize({ width: width * scaleFactor, height: height * scaleFactor, quality: 'best' })
    : bron

  const grijsHoogContrast = await renderVariant(bron, scaleFactor, (data) => {
    for (let i = 0; i < data.length; i += 4) {
      const luminantie = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2])
      const contrast = pasContrastToe(luminantie, 120)
      data[i] = contrast
      data[i + 1] = contrast
      data[i + 2] = contrast
      data[i + 3] = 255
    }
  })

  const zwartWit = await renderVariant(bron, scaleFactor, (data) => {
    const drempel = Math.max(120, Math.min(205, gemiddeldeLuminantie(data) + 10))
    for (let i = 0; i < data.length; i += 4) {
      const luminantie = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2])
      const waarde = luminantie >= drempel ? 255 : 0
      data[i] = waarde
      data[i + 1] = waarde
      data[i + 2] = waarde
      data[i + 3] = 255
    }
  })

  return [
    { naam: 'kleur', image: origineel, scaleFactor },
    { naam: 'grijs_contrast', image: grijsHoogContrast, scaleFactor },
    { naam: 'zwart_wit', image: zwartWit, scaleFactor },
  ]
}

export function scoreOcrTekst(tekst: string): number {
  const trimmed = tekst.trim()
  if (!trimmed) return -Infinity

  let score = trimmed.length * 4
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length
  const cijfers = (trimmed.match(/\d/g) ?? []).length
  const spaties = (trimmed.match(/\s/g) ?? []).length
  const netteTekens = (trimmed.match(/[A-Za-z0-9\-_/.:,%()+&]/g) ?? []).length
  const rareTekens = trimmed.length - netteTekens - spaties

  score += letters * 2
  score += cijfers * 1.5
  score += spaties * 0.5
  score -= rareTekens * 8

  if (/^[\d\s.,\-/:]+$/.test(trimmed)) score += 6
  if (/^[A-Za-z][A-Za-z0-9\s\-_/.:,&()%+]*$/.test(trimmed)) score += 10
  if (/[^\x20-\x7E]/.test(trimmed)) score -= 12

  return score
}
