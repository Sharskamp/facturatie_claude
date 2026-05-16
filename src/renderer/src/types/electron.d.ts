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
  }
  facturen: {
    list: (params?: { status?: string; klantId?: string; zoek?: string }) => Promise<unknown[]>
    get: (id: string) => Promise<unknown>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
    verstuur: (id: string, data: unknown) => Promise<unknown>
    downloadPdf: (id: string) => Promise<unknown>
    maakTermijnFacturen: () => Promise<unknown>
    maakCreditnota: (id: string) => Promise<string>
    stuurHerinneringen: () => Promise<unknown>
  }
  offertes: {
    list: (params?: { status?: string }) => Promise<unknown[]>
    get: (id: string) => Promise<unknown>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
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
  }
  bank: {
    openBestandDialog: () => Promise<string | null>
    importeerCsv: (data: unknown) => Promise<unknown[]>
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
    haalAfspraken: (params?: { van?: string; tot?: string }) => Promise<unknown[]>
  }
  producten: {
    list: () => Promise<unknown[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
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
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
