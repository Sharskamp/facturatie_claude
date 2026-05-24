import type { ParsedInvoice, InvoiceLineItem } from '../types'

export function normaliseerTekst(waarde?: string | null): string | undefined {
  const schoon = waarde?.replace(/\s+/g, ' ').trim()
  return schoon ? schoon : undefined
}

export function normaliseerDatum(waarde?: string | null): string | undefined {
  const schoon = normaliseerTekst(waarde)
  if (!schoon) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(schoon)) return schoon
  return undefined
}

export function normaliseerGetal(waarde?: number | null): number | undefined {
  if (waarde === null || waarde === undefined) return undefined
  if (!Number.isFinite(waarde)) return undefined
  return Math.round(waarde * 100) / 100
}

export function uniekeStrings(waardes: Array<string | undefined | null>): string[] {
  return [...new Set(waardes.map(v => normaliseerTekst(v)).filter(Boolean) as string[])]
}

export function berekenBtwPercentage(subtotal?: number, vatTotal?: number): number | undefined {
  if (!subtotal || !vatTotal || subtotal <= 0 || vatTotal <= 0) return undefined
  return Math.round((vatTotal / subtotal) * 10000) / 100
}

export function normaliseerLineItems(items?: InvoiceLineItem[]): InvoiceLineItem[] {
  return (items ?? [])
    .map(item => ({
      description: normaliseerTekst(item.description),
      quantity: normaliseerGetal(item.quantity),
      unitPrice: normaliseerGetal(item.unitPrice),
      vatRate: normaliseerGetal(item.vatRate),
      total: normaliseerGetal(item.total),
    }))
    .filter(item => item.description || item.total || item.unitPrice)
}

export function mergeParsedInvoices(basis: ParsedInvoice, overschrijving?: Partial<ParsedInvoice> | null): ParsedInvoice {
  if (!overschrijving) return basis
  return {
    ...basis,
    ...Object.fromEntries(
      Object.entries(overschrijving).filter(([, value]) => {
        if (value === undefined || value === null) return false
        if (typeof value === 'string') return value.trim().length > 0
        if (Array.isArray(value)) return value.length > 0
        return true
      })
    ),
    lineItems: normaliseerLineItems(overschrijving.lineItems?.length ? overschrijving.lineItems : basis.lineItems),
    warnings: uniekeStrings([...(basis.warnings ?? []), ...(overschrijving.warnings ?? [])]),
    rawOcrText: normaliseerTekst(overschrijving.rawOcrText) ?? basis.rawOcrText,
  }
}
