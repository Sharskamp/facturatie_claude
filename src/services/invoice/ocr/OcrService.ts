import { scanBestandLokaal, type OcrVelden } from '../../../lib/lokale-ocr'
import type { InvoiceParseContext, ParsedInvoice, InvoiceLineItem, ParseError, ParseWarning } from '../types'
import { normaliseerGetal, normaliseerLineItems, normaliseerTekst } from '../utils/normalize'

export interface OcrScanResult {
  raw: OcrVelden
  parsedInvoice: ParsedInvoice
  warnings: ParseWarning[]
}

export class OcrService {
  async scanDocument(filePath: string, context: InvoiceParseContext): Promise<OcrScanResult> {
    const raw = await scanBestandLokaal(filePath, {
      eigenBedrijfsnaam: context.eigenBedrijfsnaam,
      eigenEmail: context.eigenEmail,
    })

    if (raw.error) {
      throw <ParseError>{ code: 'ocr_failed', message: raw.error }
    }

    const warnings: ParseWarning[] = []
    const lineItems: InvoiceLineItem[] = normaliseerLineItems(
      raw.regels?.map(regel => ({
        description: regel.omschrijving,
        quantity: regel.aantal,
        unitPrice: regel.bedrag,
        total: regel.totaal,
      }))
    )

    if (!raw.totaal) warnings.push({ code: 'missing_total', message: 'Geen totaalbedrag betrouwbaar herkend uit OCR.' })
    if (!raw.datum) warnings.push({ code: 'missing_date', message: 'Geen factuurdatum betrouwbaar herkend uit OCR.' })
    if (!lineItems.length) warnings.push({ code: 'missing_lines', message: 'Geen afzonderlijke regels herkend; controleer omschrijving en bedragen.' })

    const parsedInvoice: ParsedInvoice = {
      documentType: raw.documentType === 'bon' ? 'receipt' : raw.documentType === 'factuur' ? 'invoice' : 'unknown',
      supplierName: context.mode === 'expense'
        ? normaliseerTekst(raw.klantNaam)
        : normaliseerTekst(context.eigenBedrijfsnaam),
      customerName: context.mode === 'historical' ? normaliseerTekst(raw.klantNaam) : undefined,
      invoiceNumber: normaliseerTekst(raw.nummer),
      invoiceDate: normaliseerTekst(raw.datum),
      dueDate: normaliseerTekst(raw.vervaldatum),
      currency: 'EUR',
      subtotal: normaliseerGetal(raw.subtotaal),
      vatTotal: normaliseerGetal(raw.btwBedrag),
      total: normaliseerGetal(raw.totaal),
      paymentReference: normaliseerTekst(raw.nummer),
      lineItems,
      warnings: warnings.map(w => w.message),
      rawOcrText: normaliseerTekst(raw.rawText) ?? undefined,
    }

    if (!parsedInvoice.supplierName && context.mode === 'expense') {
      parsedInvoice.supplierName = normaliseerTekst(raw.klantNaam)
    }

    return { raw, parsedInvoice, warnings }
  }
}
