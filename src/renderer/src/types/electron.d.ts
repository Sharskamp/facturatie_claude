interface ElectronAPI {
  shell: {
    openExternal: (url: string) => Promise<void>
    openPrint: (factuurId: string) => Promise<void>
  }
  auth: {
    setupStatus: () => Promise<{ geconfigureerd: boolean }>
    setup: (data: { naam: string; email: string; wachtwoord: string; bedrijfsnaam?: string; kvkNummer?: string; btwNummer?: string; iban?: string; adres?: string; postcode?: string; stad?: string; telefoon?: string; website?: string; logoBase64?: string }) => Promise<{ succes: boolean; user: { id: string; naam: string; email: string } }>
    login: (email: string, wachtwoord: string) => Promise<{ id: string; naam: string; email: string; bedrijfsnaam?: string }>
  }
  klanten: {
    list: (params?: { zoek?: string }) => Promise<unknown[]>
    get: (id: string) => Promise<unknown>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
    archiveer: (id: string) => Promise<unknown>
  }
  facturen: {
    list: (params?: { status?: string; klantId?: string; zoek?: string }) => Promise<unknown[]>
    get: (id: string) => Promise<unknown>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
    duplicate: (id: string) => Promise<unknown>
    verstuur: (id: string, data: unknown) => Promise<unknown>
    downloadPdf: (id: string) => Promise<unknown>
    maakTermijnFacturen: () => Promise<unknown>
    maakCreditnota: (id: string) => Promise<string>
    stuurHerinneringen: () => Promise<unknown>
    stuurHerinnering: (id: string) => Promise<{ succes: boolean }>
    importeerHistorisch: (data: unknown) => Promise<unknown>
    kiesBestanden: () => Promise<Array<{ pad: string; naam: string }>>
    scanPdf: (filePath: string) => Promise<unknown>
    scanPdfLokaal: (filePath: string) => Promise<unknown>
    startHistorischeImport: (filePaths: string[]) => Promise<unknown>
    historischeImportStatus: (jobId: string) => Promise<unknown>
    retryHistorischeImportItem: (jobId: string, itemId: string) => Promise<unknown>
    openBronBestand: (id: string) => Promise<{ succes: boolean; fout?: string }>
    planVerzending: (id: string, geplandOp: string | null) => Promise<{ succes: boolean }>
  }
  offertes: {
    list: (params?: { status?: string }) => Promise<unknown[]>
    get: (id: string) => Promise<unknown>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
    verstuur: (id: string, data: { email: string; onderwerp?: string; bericht?: string }) => Promise<{ succes: boolean }>
  }
  inkomen: {
    list: (params?: { van?: string; tot?: string }) => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
  }
  uitgaven: {
    list: (params?: { van?: string; tot?: string; categorieId?: string }) => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
    uploadBon: (data: unknown) => Promise<unknown>
    kiesBon: () => Promise<unknown>
    openBon: (data: unknown) => Promise<unknown>
    scanBon: (data: unknown) => Promise<unknown>
  }
  categorien: {
    list: () => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
  }
  uren: {
    list: (params?: { gefactureerd?: boolean }) => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
    factuurAanmaken: (data: unknown) => Promise<string>
  }
  ritten: {
    list: () => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
    exportCsv: (csv: string) => Promise<unknown>
    doorbelasten: (data: unknown) => Promise<{ factuurId: string; nummer: string }>
  }
  crediteuren: {
    list: (params?: unknown) => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
  }
  klantNotities: {
    list: (klantId: string) => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
  }
  rapport: {
    exportBtw: (params: unknown) => Promise<{ succes?: boolean; geannuleerd?: boolean; pad?: string }>
  }
  offertes_extra: {
    checkVerlopen: () => Promise<{ bijgewerkt: number }>
  }
  bank: {
    openBestandDialog: () => Promise<string | null>
    importeerCsv: (data: unknown) => Promise<unknown[]>
    leesRuweData: (filePath: string) => Promise<unknown>
    importeerMetMapping: (data: unknown) => Promise<unknown[]>
    controleerDuplicaten: () => Promise<{ latesteDatum: string | null }>
    zoekFactuurMatch: (params: unknown) => Promise<unknown[]>
    koppelAanFactuur: (params: unknown) => Promise<{ succes: boolean; factuurNummer: string }>
  }
  instellingen: {
    get: () => Promise<unknown>
    update: (data: unknown) => Promise<{ succes: boolean }>
    testEmail: (config: unknown) => Promise<{ succes: boolean }>
    googleAuthUrl: () => Promise<string>
    googleKoppelen: (code: string) => Promise<{ succes: boolean }>
    googleOntkoppelen: () => Promise<{ succes: boolean }>
  }
  agenda: {
    haalAfspraken: (params?: { van?: string; tot?: string }) => Promise<unknown>
    haalKalenders: () => Promise<unknown>
    maakAfspraak: (data: unknown) => Promise<unknown>
    maakFacturenVanAfspraak: (data: { eventId: string }) => Promise<{ succes: boolean; facturen?: Array<{ id: string; nummer: string; klantNaam: string }>; fout?: string }>
  }
  producten: {
    list: () => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
  }
  scan: {
    openEnPreview: () => Promise<{
      succes: boolean
      bestandPad?: string
      bonPad?: string
      previewBase64?: string
      aantalPaginas?: number
      velden?: { klantNaam?: string; nummer?: string; datum?: string; vervaldatum?: string; subtotaal?: number; btwBedrag?: number; totaal?: number; omschrijving?: string; notities?: string; error?: string }
      fout?: string
    }>
    renderPagina: (data: { bestandPad: string; pagina: number }) => Promise<{ succes: boolean; previewBase64?: string; fout?: string }>
    ocrUitsnede: (data: { bestandPad: string; pagina: number; x: number; y: number; breedte: number; hoogte: number }) => Promise<{ succes: boolean; tekst: string; fout?: string }>
  }
  vasteActiva: {
    list: () => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
  }
  audit: {
    list: (factuurId: string) => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
  }
  app: {
    getAutoStart: () => Promise<boolean>
    setAutoStart: (enabled: boolean) => Promise<{ succes: boolean }>
    backup: () => Promise<{ succes?: boolean; geannuleerd?: boolean; pad?: string }>
    kiesPdfMap: () => Promise<string | null>
    exporteerData: () => Promise<{ succes?: boolean; geannuleerd?: boolean; pad?: string }>
    exporteerExcel: (jaar: number) => Promise<{ succes?: boolean; geannuleerd?: boolean; pad?: string; fout?: string }>
    exportPdfArchief: (jaar: number) => Promise<{ succes?: boolean; geannuleerd?: boolean; aangemaakt?: number; pad?: string; fout?: string }>
    installUpdate: () => Promise<void>
  }
  updates: {
    onBeschikbaar: (cb: () => void) => void
    onGedownload: (cb: () => void) => void
    verwijderListeners: () => void
    installeer: () => Promise<void>
  }
  factuurSjablonen: {
    list: () => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
  }
  documenten: {
    list: (params: { type: string; referentieId: string }) => Promise<unknown[]>
    upload: (params: { type: string; referentieId: string }) => Promise<{ succes: boolean; id?: string }>
    open: (id: string) => Promise<{ succes: boolean }>
    delete: (id: string) => Promise<{ succes: boolean }>
  }
  bank2: {
    onNieuwBestand: (cb: (data: { pad: string; naam: string }) => void) => void
    verwijderListeners: () => void
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
