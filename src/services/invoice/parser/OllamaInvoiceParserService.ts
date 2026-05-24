import type { InvoiceParseContext, ParsedInvoice, ParseWarning } from '../types'
import { normaliseerTekst } from '../utils/normalize'

interface OllamaResponse {
  response?: string
}

export class OllamaInvoiceParserService {
  private resolveBaseUrl(context: InvoiceParseContext): string {
    return normaliseerTekst(context.ollamaBaseUrl) ?? 'http://127.0.0.1:11434'
  }

  private resolveModel(context: InvoiceParseContext): string {
    const kandidaat = normaliseerTekst(context.ollamaModel)
    if (!kandidaat || kandidaat.toLowerCase() === 'claude') return 'qwen2.5:7b'
    return kandidaat
  }

  async parse(rawText: string, hints: ParsedInvoice, context: InvoiceParseContext): Promise<{ parsed?: Partial<ParsedInvoice>; warnings: ParseWarning[] }> {
    const tekst = normaliseerTekst(rawText)
    if (!tekst || tekst.length < 20) {
      return { warnings: [{ code: 'ollama_skipped', message: 'Te weinig OCR-tekst om lokaal via Ollama te parsen.' }] }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

    try {
      const response = await fetch(`${this.resolveBaseUrl(context)}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.resolveModel(context),
          stream: false,
          format: 'json',
          options: { temperature: 0.1 },
          prompt: this.maakPrompt(tekst, hints, context),
        }),
      })

      if (!response.ok) {
        return { warnings: [{ code: 'ollama_unavailable', message: `Ollama antwoordde met status ${response.status}; OCR-resultaat wordt gebruikt.` }] }
      }

      const data = await response.json() as OllamaResponse
      const json = this.parseJson(data.response)
      if (!json) {
        return { warnings: [{ code: 'ollama_invalid_json', message: 'Ollama gaf geen bruikbare JSON terug; OCR-resultaat wordt gebruikt.' }] }
      }

      return { parsed: this.normaliseerParsedInvoice(json), warnings: [] }
    } catch (error) {
      const boodschap = error instanceof Error ? error.message : 'Onbekende fout'
      return { warnings: [{ code: 'ollama_failed', message: `Lokale AI-parse niet beschikbaar (${boodschap}); OCR-resultaat wordt gebruikt.` }] }
    } finally {
      clearTimeout(timeout)
    }
  }

  private maakPrompt(rawText: string, hints: ParsedInvoice, context: InvoiceParseContext): string {
    return [
      'Je extraheert factuur- of bongegevens uit OCR-tekst.',
      'Geef ALLEEN geldige JSON terug, zonder uitleg of markdown.',
      'Gebruik dit schema:',
      '{"documentType":"invoice|receipt|credit_note|unknown","supplierName":"","supplierVatNumber":"","supplierIban":"","customerName":"","invoiceNumber":"","invoiceDate":"YYYY-MM-DD","dueDate":"YYYY-MM-DD","currency":"EUR","subtotal":0,"vatTotal":0,"total":0,"paymentReference":"","lineItems":[{"description":"","quantity":1,"unitPrice":0,"vatRate":21,"total":0}],"warnings":[]}',
      `Context modus: ${context.mode}`,
      `Bekende OCR-hints: ${JSON.stringify(hints)}`,
      'Regels:',
      '- Gebruik lege velden liever weg of null-achtig dan gokken.',
      '- Als twee datums dicht bij elkaar staan, is de eerste meestal invoiceDate en de tweede dueDate.',
      '- Bij een receipt is supplierName belangrijker dan customerName.',
      '- Valuta is meestal EUR tenzij duidelijk anders vermeld.',
      'OCR tekst:',
      rawText,
    ].join('\n')
  }

  private parseJson(bron?: string): Record<string, unknown> | null {
    if (!bron) return null
    const schoon = bron.trim().replace(/^```json\s*|```$/g, '')
    try {
      return JSON.parse(schoon) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private normaliseerParsedInvoice(data: Record<string, unknown>): Partial<ParsedInvoice> {
    const documentType = typeof data.documentType === 'string' ? data.documentType : undefined
    return {
      documentType: documentType === 'invoice' || documentType === 'receipt' || documentType === 'credit_note' ? documentType : 'unknown',
      supplierName: normaliseerTekst(data.supplierName as string | undefined),
      supplierVatNumber: normaliseerTekst(data.supplierVatNumber as string | undefined),
      supplierIban: normaliseerTekst(data.supplierIban as string | undefined),
      customerName: normaliseerTekst(data.customerName as string | undefined),
      invoiceNumber: normaliseerTekst(data.invoiceNumber as string | undefined),
      invoiceDate: normaliseerTekst(data.invoiceDate as string | undefined),
      dueDate: normaliseerTekst(data.dueDate as string | undefined),
      currency: normaliseerTekst(data.currency as string | undefined),
      subtotal: typeof data.subtotal === 'number' ? data.subtotal : undefined,
      vatTotal: typeof data.vatTotal === 'number' ? data.vatTotal : undefined,
      total: typeof data.total === 'number' ? data.total : undefined,
      paymentReference: normaliseerTekst(data.paymentReference as string | undefined),
      lineItems: Array.isArray(data.lineItems) ? data.lineItems as ParsedInvoice['lineItems'] : [],
      warnings: Array.isArray(data.warnings) ? data.warnings.filter((w): w is string => typeof w === 'string') : [],
    }
  }
}
