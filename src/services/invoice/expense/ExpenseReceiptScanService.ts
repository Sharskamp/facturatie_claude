import type { PrismaClient } from '../../../generated/prisma/client'
import { SharedInvoiceParserService } from '../parser/SharedInvoiceParserService'
import type { DuplicateMatch, InvoiceParseContext, ReceiptScanResult } from '../types'
import { berekenBtwPercentage, normaliseerGetal, normaliseerTekst } from '../utils/normalize'

export class ExpenseReceiptScanService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly parserService = new SharedInvoiceParserService(),
  ) {}

  async scanReceipt(filePath: string, context: Omit<InvoiceParseContext, 'mode'>): Promise<ReceiptScanResult> {
    const result = await this.parserService.parseDocument(filePath, { ...context, mode: 'expense' })
    const parsed = result.parsedInvoice
    const duplicate = parsed ? await this.detectDuplicate(parsed.supplierName, parsed.invoiceDate, parsed.total) : null

    return {
      ...result,
      duplicate,
      status: result.status === 'failed'
        ? 'failed'
        : duplicate
          ? 'needs_review'
          : result.status,
      suggestion: {
        leverancier: normaliseerTekst(parsed?.supplierName),
        datum: parsed?.invoiceDate,
        bedrag: normaliseerGetal(parsed?.subtotal ?? (parsed?.total !== undefined && parsed?.vatTotal !== undefined ? parsed.total - parsed.vatTotal : parsed?.total)),
        btwBedrag: normaliseerGetal(parsed?.vatTotal),
        btwPercentage: normaliseerGetal(
          parsed?.subtotal && parsed?.vatTotal
            ? berekenBtwPercentage(parsed.subtotal, parsed.vatTotal)
            : undefined
        ),
        totaal: normaliseerGetal(parsed?.total),
        valuta: parsed?.currency ?? 'EUR',
        omschrijving: normaliseerTekst(parsed?.lineItems?.[0]?.description ?? parsed?.supplierName),
        betalingsreferentie: normaliseerTekst(parsed?.paymentReference ?? parsed?.invoiceNumber),
      },
    }
  }

  private async detectDuplicate(leverancier?: string, datum?: string, totaal?: number): Promise<DuplicateMatch | null> {
    if (!leverancier || !datum || totaal === undefined) return null
    const datumStart = new Date(`${datum}T00:00:00`)
    const datumEinde = new Date(`${datum}T23:59:59`)
    const match = await this.prisma.uitgave.findFirst({
      where: {
        leverancier,
        datum: { gte: datumStart, lte: datumEinde },
        OR: [
          { bedrag: { gte: totaal - 0.01, lte: totaal + 0.01 } },
          { btwBedrag: { gte: 0, lte: totaal + 0.01 } },
        ],
      },
      select: { id: true, omschrijving: true },
    })
    return match ? { type: 'uitgave', id: match.id, label: `Mogelijk duplicaat van uitgave "${match.omschrijving}".` } : null
  }
}
