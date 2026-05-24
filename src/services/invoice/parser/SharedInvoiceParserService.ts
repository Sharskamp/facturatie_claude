import { InvoiceValidationService } from '../InvoiceValidationService'
import { OcrService } from '../ocr/OcrService'
import { OllamaInvoiceParserService } from './OllamaInvoiceParserService'
import type { InvoiceParseContext, ParsedInvoiceResult } from '../types'
import { mergeParsedInvoices } from '../utils/normalize'

export class SharedInvoiceParserService {
  constructor(
    private readonly ocrService = new OcrService(),
    private readonly ollamaService = new OllamaInvoiceParserService(),
    private readonly validationService = new InvoiceValidationService(),
  ) {}

  async parseDocument(filePath: string, context: InvoiceParseContext): Promise<ParsedInvoiceResult> {
    const ocr = await this.ocrService.scanDocument(filePath, context)
    let parsedInvoice = ocr.parsedInvoice
    const warnings = [...ocr.warnings]
    let source: ParsedInvoiceResult['source'] = 'ocr'

    if (context.useOllama !== false && parsedInvoice.rawOcrText) {
      const ai = await this.ollamaService.parse(parsedInvoice.rawOcrText, parsedInvoice, context)
      warnings.push(...ai.warnings)
      if (ai.parsed) {
        parsedInvoice = mergeParsedInvoices(parsedInvoice, ai.parsed)
        source = 'ocr+ollama'
      }
    }

    const validated = this.validationService.validate(parsedInvoice, context, warnings)
    return {
      ...validated,
      source,
    }
  }
}
