export interface InvoiceLineItem {
  description?: string
  quantity?: number
  unitPrice?: number
  vatRate?: number
  total?: number
}

export interface ParsedInvoice {
  documentType: 'invoice' | 'receipt' | 'credit_note' | 'unknown'
  supplierName?: string
  supplierVatNumber?: string
  supplierIban?: string
  customerName?: string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  currency?: string
  subtotal?: number
  vatTotal?: number
  total?: number
  paymentReference?: string
  lineItems: InvoiceLineItem[]
  warnings: string[]
  rawOcrText?: string
}

export interface InvoiceImportJob {
  id: string
  status: string
  totalFiles: number
  processedFiles: number
}

export interface InvoiceImportItem {
  id: string
  filePath: string
  status:
    | 'pending'
    | 'processing'
    | 'parsed'
    | 'needs_review'
    | 'failed'
    | 'imported'
  parsedInvoice?: ParsedInvoice
  errors?: string[]
}

export interface ParseWarning {
  code: string
  message: string
}

export interface ParseError {
  code: string
  message: string
}

export interface DuplicateMatch {
  type: 'factuur' | 'uitgave'
  id: string
  label: string
}

export interface ParsedInvoiceResult {
  status: InvoiceImportItem['status']
  parsedInvoice?: ParsedInvoice
  warnings: ParseWarning[]
  errors: ParseError[]
  duplicate?: DuplicateMatch | null
  source: 'ocr' | 'ocr+ollama'
}

export interface HistoricalImportJobState extends InvoiceImportJob {
  items: Array<InvoiceImportItem & {
    fileName: string
    warnings?: ParseWarning[]
    duplicate?: DuplicateMatch | null
    source?: 'ocr' | 'ocr+ollama'
  }>
}

export interface ReceiptExpenseSuggestion {
  leverancier?: string
  datum?: string
  bedrag?: number
  btwBedrag?: number
  btwPercentage?: number
  totaal?: number
  valuta?: string
  omschrijving?: string
  betalingsreferentie?: string
}

export interface ReceiptScanResult extends ParsedInvoiceResult {
  suggestion: ReceiptExpenseSuggestion
}

export interface InvoiceParseContext {
  eigenBedrijfsnaam?: string
  eigenEmail?: string
  ollamaBaseUrl?: string
  ollamaModel?: string
  useOllama?: boolean
  mode: 'historical' | 'expense'
}
