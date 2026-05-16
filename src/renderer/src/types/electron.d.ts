interface ElectronAPI {
  shell: {
    openExternal: (url: string) => Promise<void>
    openPrint: (factuurId: string) => Promise<void>
  }
  auth: {
    setupStatus: () => Promise<{ geconfigureerd: boolean }>
    setup: (data: { naam: string; email: string; wachtwoord: string; bedrijfsnaam?: string }) => Promise<{ succes: boolean; user: { id: string; naam: string; email: string } }>
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
    list: (params?: { status?: string; klantId?: string }) => Promise<unknown[]>
    get: (id: string) => Promise<unknown>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ succes: boolean }>
    verstuur: (id: string, data: unknown) => Promise<unknown>
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
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
