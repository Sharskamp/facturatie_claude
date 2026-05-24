import type { InvoiceParseContext, ParsedInvoice, ParseError, ParseWarning, ParsedInvoiceResult } from './types'
import { berekenBtwPercentage, mergeParsedInvoices, normaliseerDatum, normaliseerGetal, normaliseerLineItems, normaliseerTekst, uniekeStrings } from './utils/normalize'

export class InvoiceValidationService {
  validate(parsed: ParsedInvoice, context: InvoiceParseContext, bestaandeWarnings: ParseWarning[] = []): Omit<ParsedInvoiceResult, 'duplicate' | 'source'> {
    const warnings = [...bestaandeWarnings]
    const errors: ParseError[] = []

    const opgeschoond = this.sanitize(parsed)

    if (!opgeschoond.invoiceDate) warnings.push({ code: 'review_invoice_date', message: 'Controleer de factuurdatum.' })
    if (!opgeschoond.total) warnings.push({ code: 'review_total', message: 'Controleer het totaalbedrag.' })
    if (context.mode === 'historical' && !opgeschoond.invoiceNumber) warnings.push({ code: 'review_invoice_number', message: 'Controleer het factuurnummer.' })
    if (context.mode === 'historical' && !opgeschoond.customerName) warnings.push({ code: 'review_customer', message: 'Controleer de klantnaam.' })
    if (context.mode === 'expense' && !opgeschoond.supplierName) warnings.push({ code: 'review_supplier', message: 'Controleer de leverancier.' })

    const status: ParsedInvoiceResult['status'] = errors.length > 0
      ? 'failed'
      : warnings.length > 0
        ? 'needs_review'
        : 'parsed'

    return {
      status,
      parsedInvoice: opgeschoond,
      warnings,
      errors,
    }
  }

  sanitize(parsed: ParsedInvoice): ParsedInvoice {
    const merged = mergeParsedInvoices({
      documentType: parsed.documentType ?? 'unknown',
      lineItems: parsed.lineItems ?? [],
      warnings: parsed.warnings ?? [],
    }, parsed)

    const subtotal = normaliseerGetal(merged.subtotal)
    const vatTotal = normaliseerGetal(merged.vatTotal)
    const total = normaliseerGetal(merged.total)

    return {
      documentType: this.resolveDocumentType(merged),
      supplierName: normaliseerTekst(merged.supplierName),
      supplierVatNumber: normaliseerTekst(merged.supplierVatNumber),
      supplierIban: normaliseerTekst(merged.supplierIban),
      customerName: normaliseerTekst(merged.customerName),
      invoiceNumber: normaliseerTekst(merged.invoiceNumber),
      invoiceDate: normaliseerDatum(merged.invoiceDate),
      dueDate: normaliseerDatum(merged.dueDate),
      currency: normaliseerTekst(merged.currency) ?? 'EUR',
      subtotal: subtotal ?? (total !== undefined && vatTotal !== undefined ? normaliseerGetal(total - vatTotal) : undefined),
      vatTotal: vatTotal ?? (total !== undefined && subtotal !== undefined ? normaliseerGetal(total - subtotal) : undefined),
      total: total ?? (subtotal !== undefined && vatTotal !== undefined ? normaliseerGetal(subtotal + vatTotal) : undefined),
      paymentReference: normaliseerTekst(merged.paymentReference),
      lineItems: normaliseerLineItems(merged.lineItems),
      warnings: uniekeStrings([
        ...(merged.warnings ?? []),
        merged.vatTotal === undefined && subtotal !== undefined && total !== undefined
          ? `BTW-percentage indicatief ${berekenBtwPercentage(subtotal, total - subtotal) ?? 0}% berekend.`
          : undefined,
      ]),
      rawOcrText: normaliseerTekst(merged.rawOcrText),
    }
  }

  private resolveDocumentType(parsed: ParsedInvoice): ParsedInvoice['documentType'] {
    if (parsed.documentType && parsed.documentType !== 'unknown') return parsed.documentType
    if (parsed.dueDate || parsed.invoiceNumber) return 'invoice'
    if (parsed.supplierName && parsed.total) return 'receipt'
    return 'unknown'
  }
}
