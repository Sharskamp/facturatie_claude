import { randomUUID } from 'crypto'
import type { PrismaClient } from '../../../generated/prisma/client'
import { SharedInvoiceParserService } from '../parser/SharedInvoiceParserService'
import type {
  DuplicateMatch,
  HistoricalImportJobState,
  InvoiceImportItem,
  InvoiceParseContext,
  ParsedInvoiceResult,
} from '../types'

export class HistoricalInvoiceImportService {
  private readonly jobs = new Map<string, HistoricalImportJobState>()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly parserService = new SharedInvoiceParserService(),
  ) {}

  async scanFile(filePath: string, context: InvoiceParseContext): Promise<ParsedInvoiceResult> {
    const parsed = await this.parserService.parseDocument(filePath, context)
    const duplicate = await this.detectDuplicate(parsed.parsedInvoice?.invoiceNumber, parsed.parsedInvoice?.invoiceDate, parsed.parsedInvoice?.total)
    return {
      ...parsed,
      duplicate,
      status: parsed.status === 'failed'
        ? 'failed'
        : duplicate
          ? 'needs_review'
          : parsed.status,
    }
  }

  startJob(filePaths: string[], context: InvoiceParseContext): HistoricalImportJobState {
    const jobId = randomUUID()
    const job: HistoricalImportJobState = {
      id: jobId,
      status: 'pending',
      totalFiles: filePaths.length,
      processedFiles: 0,
      items: filePaths.map(filePath => ({
        id: randomUUID(),
        filePath,
        fileName: filePath.split(/[/\\]/).pop() ?? filePath,
        status: 'pending',
      })),
    }

    this.jobs.set(jobId, job)
    void this.verwerkJob(jobId, context)
    return this.getJob(jobId) ?? job
  }

  getJob(jobId: string): HistoricalImportJobState | null {
    const job = this.jobs.get(jobId)
    if (!job) return null
    return JSON.parse(JSON.stringify(job)) as HistoricalImportJobState
  }

  async retryItem(jobId: string, itemId: string, context: InvoiceParseContext): Promise<HistoricalImportJobState | null> {
    const job = this.jobs.get(jobId)
    const item = job?.items.find(entry => entry.id === itemId)
    if (!job || !item) return null

    await this.verwerkItem(job, item, context)
    return this.getJob(jobId)
  }

  private async verwerkJob(jobId: string, context: InvoiceParseContext): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.status = 'processing'

    for (const item of job.items) {
      if (item.status === 'imported') continue
      await this.verwerkItem(job, item, context)
    }

    job.status = job.items.every(item => item.status === 'failed')
      ? 'failed'
      : job.items.some(item => item.status === 'needs_review')
        ? 'needs_review'
        : 'parsed'
  }

  private async verwerkItem(job: HistoricalImportJobState, item: HistoricalImportJobState['items'][number], context: InvoiceParseContext): Promise<void> {
    item.status = 'processing'
    item.errors = []
    try {
      const result = await this.scanFile(item.filePath, context)
      item.parsedInvoice = result.parsedInvoice
      item.warnings = result.warnings
      item.duplicate = result.duplicate ?? null
      item.source = result.source
      item.errors = result.errors.map(error => error.message)
      item.status = result.status
    } catch (error) {
      item.errors = [error instanceof Error ? error.message : 'Scannen mislukt']
      item.status = 'failed'
    } finally {
      job.processedFiles = job.items.filter(entry => entry.status !== 'pending' && entry.status !== 'processing').length
    }
  }

  private async detectDuplicate(invoiceNumber?: string, invoiceDate?: string, total?: number): Promise<DuplicateMatch | null> {
    if (invoiceNumber) {
      const match = await this.prisma.factuur.findFirst({
        where: { nummer: invoiceNumber },
        select: { id: true, nummer: true },
      })
      if (match) {
        return { type: 'factuur', id: match.id, label: `Factuur ${match.nummer} bestaat al.` }
      }
    }

    if (invoiceDate && total !== undefined) {
      const datumStart = new Date(`${invoiceDate}T00:00:00`)
      const datumEinde = new Date(`${invoiceDate}T23:59:59`)
      const match = await this.prisma.factuur.findFirst({
        where: {
          datum: { gte: datumStart, lte: datumEinde },
          totaal: { gte: total - 0.01, lte: total + 0.01 },
        },
        select: { id: true, nummer: true },
      })
      if (match) {
        return { type: 'factuur', id: match.id, label: `Mogelijk duplicaat: ${match.nummer} met hetzelfde bedrag en datum.` }
      }
    }

    return null
  }
}
