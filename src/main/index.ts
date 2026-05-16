import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'
import { verstuurEmail, maakFactuurEmailHtml } from '../lib/email'
import { haalAgendaAfspraken, maakGoogleAuthUrl, wisselCodeVoorTokens, vernieuwAccessToken } from '../lib/google-calendar'

let prisma: PrismaClient
let mainWindow: BrowserWindow | null = null

function initPrisma() {
  const dbPath = is.dev
    ? join(process.cwd(), 'dev.db')
    : join(app.getPath('userData'), 'adminpro.db')

  const adapter = new PrismaBetterSqlite3({ url: dbPath })
  prisma = new PrismaClient({ adapter })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AdminPro',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  mainWindow.setMenuBarVisibility(false)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Helper functies (inline, geen externe import nodig) ──
function genereerNummer(prefix: string, volgNummer: number): string {
  const jaar = new Date().getFullYear()
  return `${prefix}${jaar}-${String(volgNummer).padStart(4, '0')}`
}

function berekenVervaldatum(dagen: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + dagen)
  return d
}

function formatBedrag(bedrag: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag)
}

function formatDatum(datum: string | Date): string {
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(datum))
}

// ── IPC Handlers ──

function setupIpcHandlers() {
  // Shell
  ipcMain.handle('shell:open-external', (_, url: string) => shell.openExternal(url))

  ipcMain.handle('shell:open-print', async (_, factuurId: string) => {
    const printWindow = new BrowserWindow({
      width: 900,
      height: 1100,
      title: 'Factuur afdrukken',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    })
    printWindow.setMenuBarVisibility(false)
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      printWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/facturen/${factuurId}/print`)
    } else {
      printWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: `/facturen/${factuurId}/print`
      })
    }
  })

  // Auth
  ipcMain.handle('auth:setup-status', async () => {
    const count = await prisma.user.count()
    return { geconfigureerd: count > 0 }
  })

  ipcMain.handle('auth:setup', async (_, data: { naam: string; email: string; wachtwoord: string; bedrijfsnaam?: string }) => {
    const bestaand = await prisma.user.findFirst()
    if (bestaand) throw new Error('Systeem is al geconfigureerd')

    const gehashed = await bcrypt.hash(data.wachtwoord, 12)
    const user = await prisma.user.create({
      data: { naam: data.naam, email: data.email, wachtwoord: gehashed, bedrijfsnaam: data.bedrijfsnaam }
    })

    await prisma.categorie.createMany({
      data: [
        { naam: 'Kantoorbenodigdheden', kleur: '#6366f1', icoon: '📎' },
        { naam: 'Reiskosten', kleur: '#f59e0b', icoon: '🚗' },
        { naam: 'Software & Abonnementen', kleur: '#3b82f6', icoon: '💻' },
        { naam: 'Marketing & Reclame', kleur: '#ec4899', icoon: '📣' },
        { naam: 'Telefoon & Internet', kleur: '#10b981', icoon: '📱' },
        { naam: 'Verzekeringen', kleur: '#8b5cf6', icoon: '🛡️' },
        { naam: 'Opleidingen & Cursussen', kleur: '#f97316', icoon: '📚' },
        { naam: 'Overig', kleur: '#6b7280', icoon: '📋' },
      ]
    })

    return { succes: true, user: { id: user.id, naam: user.naam, email: user.email } }
  })

  ipcMain.handle('auth:login', async (_, email: string, wachtwoord: string) => {
    const user = await prisma.user.findFirst({ where: { email } })
    if (!user) throw new Error('Onbekend e-mailadres')

    const geldig = await bcrypt.compare(wachtwoord, user.wachtwoord)
    if (!geldig) throw new Error('Onjuist wachtwoord')

    return { id: user.id, naam: user.naam, email: user.email, bedrijfsnaam: user.bedrijfsnaam }
  })

  // Klanten
  ipcMain.handle('klanten:list', async (_, params?: { zoek?: string }) => {
    return prisma.klant.findMany({
      where: params?.zoek ? {
        OR: [
          { naam: { contains: params.zoek } },
          { bedrijf: { contains: params.zoek } },
          { email: { contains: params.zoek } },
        ]
      } : undefined,
      orderBy: { naam: 'asc' },
      include: { _count: { select: { facturen: true } } }
    })
  })

  ipcMain.handle('klanten:get', async (_, id: string) => {
    return prisma.klant.findUnique({
      where: { id },
      include: {
        facturen: {
          include: { klant: true },
          orderBy: { datum: 'desc' }
        }
      }
    })
  })

  ipcMain.handle('klanten:create', async (_, data: Record<string, unknown>) => {
    return prisma.klant.create({ data: data as Parameters<typeof prisma.klant.create>[0]['data'] })
  })

  ipcMain.handle('klanten:update', async (_, id: string, data: Record<string, unknown>) => {
    return prisma.klant.update({ where: { id }, data: data as Parameters<typeof prisma.klant.update>[0]['data'] })
  })

  ipcMain.handle('klanten:delete', async (_, id: string) => {
    await prisma.klant.delete({ where: { id } })
    return { succes: true }
  })

  // Facturen
  ipcMain.handle('facturen:list', async (_, params?: { status?: string; klantId?: string }) => {
    return prisma.factuur.findMany({
      where: {
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.klantId ? { klantId: params.klantId } : {}),
      },
      include: { klant: true },
      orderBy: { datum: 'desc' }
    })
  })

  ipcMain.handle('facturen:get', async (_, id: string) => {
    return prisma.factuur.findUnique({
      where: { id },
      include: { klant: true, regels: { orderBy: { volgorde: 'asc' } }, inkomsten: true }
    })
  })

  ipcMain.handle('facturen:create', async (_, payload: {
    klantId: string
    datum?: string
    vervaldatum?: string
    btwVerlegd?: boolean
    kortingPercentage?: number
    notities?: string
    betalingsCondities?: string
    status?: string
    regels: Array<{
      omschrijving: string
      aantal: number
      prijs: number
      btwPercentage: number
      kortingPercentage?: number
      eenheid?: string
    }>
  }) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')

    const nummer = genereerNummer(user.factuurPrefix, user.factuurVolgNummer)

    let subtotaal = 0
    let btwBedrag = 0
    const berekendeRegels = payload.regels.map((regel, index) => {
      const bruto = regel.prijs * regel.aantal
      const korting = (bruto * (regel.kortingPercentage ?? 0)) / 100
      const netto = bruto - korting
      const btw = payload.btwVerlegd ? 0 : (netto * regel.btwPercentage) / 100
      subtotaal += netto
      btwBedrag += btw
      return { ...regel, kortingPercentage: regel.kortingPercentage ?? 0, totaal: netto + btw, volgorde: index }
    })

    const kortingBedrag = (subtotaal * (payload.kortingPercentage ?? 0)) / 100
    subtotaal -= kortingBedrag

    const factuur = await prisma.factuur.create({
      data: {
        nummer,
        klantId: payload.klantId,
        datum: payload.datum ? new Date(payload.datum) : new Date(),
        vervaldatum: payload.vervaldatum ? new Date(payload.vervaldatum) : berekenVervaldatum(user.standaardBetaalTermijn),
        notities: payload.notities,
        betalingsCondities: payload.betalingsCondities,
        btwVerlegd: payload.btwVerlegd ?? false,
        kortingPercentage: payload.kortingPercentage ?? 0,
        kortingBedrag,
        subtotaal,
        btwBedrag,
        totaal: subtotaal + btwBedrag,
        status: payload.status ?? 'CONCEPT',
        regels: { create: berekendeRegels }
      },
      include: { klant: true, regels: true }
    })

    await prisma.user.updateMany({ data: { factuurVolgNummer: user.factuurVolgNummer + 1 } })

    return factuur
  })

  ipcMain.handle('facturen:update', async (_, id: string, payload: Record<string, unknown> & { regels?: Array<Record<string, unknown>> }) => {
    const { regels, ...data } = payload

    if (regels) {
      let subtotaal = 0
      let btwBedrag = 0
      const berekendeRegels = regels.map((regel, index) => {
        const bruto = (regel.prijs as number) * (regel.aantal as number)
        const korting = (bruto * ((regel.kortingPercentage as number) ?? 0)) / 100
        const netto = bruto - korting
        const btw = data.btwVerlegd ? 0 : (netto * (regel.btwPercentage as number)) / 100
        subtotaal += netto
        btwBedrag += btw
        return { ...regel, totaal: netto + btw, volgorde: index }
      })

      const kortingBedrag = (subtotaal * ((data.kortingPercentage as number) ?? 0)) / 100
      subtotaal -= kortingBedrag

      await prisma.factuurRegel.deleteMany({ where: { factuurId: id } })

      return prisma.factuur.update({
        where: { id },
        data: {
          ...data,
          subtotaal,
          btwBedrag,
          kortingBedrag,
          totaal: subtotaal + btwBedrag,
          datum: data.datum ? new Date(data.datum as string) : undefined,
          vervaldatum: data.vervaldatum ? new Date(data.vervaldatum as string) : undefined,
          regels: { create: berekendeRegels as Parameters<typeof prisma.factuurRegel.create>[0]['data'][] }
        },
        include: { klant: true, regels: { orderBy: { volgorde: 'asc' } } }
      })
    }

    return prisma.factuur.update({
      where: { id },
      data: {
        ...data,
        datum: data.datum ? new Date(data.datum as string) : undefined,
        vervaldatum: data.vervaldatum ? new Date(data.vervaldatum as string) : undefined,
      },
      include: { klant: true, regels: { orderBy: { volgorde: 'asc' } } }
    })
  })

  ipcMain.handle('facturen:delete', async (_, id: string) => {
    await prisma.factuur.delete({ where: { id } })
    return { succes: true }
  })

  ipcMain.handle('facturen:verstuur', async (_, id: string, payload: { methode: 'email' | 'whatsapp'; naarEmail?: string; bericht?: string }) => {
    const factuur = await prisma.factuur.findUnique({ where: { id }, include: { klant: true } })
    if (!factuur) throw new Error('Factuur niet gevonden')

    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')

    if (payload.methode === 'email') {
      if (!user.emailSmtpHost || !user.emailSmtpUser) {
        throw new Error('Email SMTP niet geconfigureerd. Ga naar Instellingen > Email.')
      }

      const emailHtml = maakFactuurEmailHtml({
        klantNaam: factuur.klant.naam,
        bedrijfsnaam: user.bedrijfsnaam ?? user.naam,
        factuurNummer: factuur.nummer,
        totaal: formatBedrag(factuur.totaal),
        vervaldatum: formatDatum(factuur.vervaldatum),
        factuurUrl: `adminpro://factuur/${factuur.id}`,
        notities: payload.bericht,
      })

      await verstuurEmail(
        { host: user.emailSmtpHost, port: user.emailSmtpPort ?? 587, secure: user.emailSmtpSecure, user: user.emailSmtpUser, pass: user.emailSmtpPass ?? '' },
        { van: `${user.bedrijfsnaam ?? user.naam} <${user.emailSmtpUser}>`, naar: payload.naarEmail ?? factuur.klant.email ?? '', onderwerp: `Factuur ${factuur.nummer} - ${user.bedrijfsnaam ?? user.naam}`, html: emailHtml }
      )

      await prisma.factuur.update({ where: { id }, data: { status: 'VERZONDEN', verzondenOp: new Date() } })
      return { succes: true, methode: 'email' }
    }

    if (payload.methode === 'whatsapp') {
      const telefoon = factuur.klant.telefoon ?? ''
      const schoonTelefoon = telefoon.replace(/\D/g, '').replace(/^0/, '31')
      const bericht = encodeURIComponent(`Beste ${factuur.klant.naam},\n\nHierbij stuur ik u factuur ${factuur.nummer} ter waarde van ${formatBedrag(factuur.totaal)}.\n\nVervaldatum: ${formatDatum(factuur.vervaldatum)}\n\nMet vriendelijke groet,\n${user.bedrijfsnaam ?? user.naam}`)
      const whatsappUrl = `https://wa.me/${schoonTelefoon}?text=${bericht}`

      await prisma.factuur.update({ where: { id }, data: { status: 'VERZONDEN', verzondenOp: new Date() } })
      return { succes: true, methode: 'whatsapp', whatsappUrl }
    }

    throw new Error('Onbekende methode')
  })

  // Offertes
  ipcMain.handle('offertes:list', async (_, params?: { status?: string }) => {
    return prisma.offerte.findMany({
      where: params?.status ? { status: params.status } : {},
      include: { klant: true },
      orderBy: { datum: 'desc' }
    })
  })

  ipcMain.handle('offertes:get', async (_, id: string) => {
    return prisma.offerte.findUnique({
      where: { id },
      include: { klant: true, regels: { orderBy: { volgorde: 'asc' } } }
    })
  })

  ipcMain.handle('offertes:create', async (_, payload: {
    klantId: string
    datum?: string
    geldigTot?: string
    notities?: string
    kortingPercentage?: number
    regels: Array<{ omschrijving: string; aantal: number; prijs: number; btwPercentage: number; kortingPercentage?: number; eenheid?: string }>
  }) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')

    const nummer = genereerNummer(user.offertePrefix, user.offerteVolgNummer)

    let subtotaal = 0; let btwBedrag = 0
    const berekendeRegels = payload.regels.map((regel, index) => {
      const bruto = regel.prijs * regel.aantal
      const korting = (bruto * (regel.kortingPercentage ?? 0)) / 100
      const netto = bruto - korting
      const btw = (netto * regel.btwPercentage) / 100
      subtotaal += netto; btwBedrag += btw
      return { ...regel, kortingPercentage: regel.kortingPercentage ?? 0, totaal: netto + btw, volgorde: index }
    })

    const kortingBedrag = (subtotaal * (payload.kortingPercentage ?? 0)) / 100
    subtotaal -= kortingBedrag

    const offerte = await prisma.offerte.create({
      data: {
        nummer,
        klantId: payload.klantId,
        datum: payload.datum ? new Date(payload.datum) : new Date(),
        geldigTot: payload.geldigTot ? new Date(payload.geldigTot) : berekenVervaldatum(30),
        notities: payload.notities,
        kortingPercentage: payload.kortingPercentage ?? 0,
        kortingBedrag,
        subtotaal,
        btwBedrag,
        totaal: subtotaal + btwBedrag,
        regels: { create: berekendeRegels }
      },
      include: { klant: true, regels: true }
    })

    await prisma.user.updateMany({ data: { offerteVolgNummer: user.offerteVolgNummer + 1 } })
    return offerte
  })

  ipcMain.handle('offertes:update', async (_, id: string, data: Record<string, unknown>) => {
    if (data.actie === 'naar-factuur') {
      const offerte = await prisma.offerte.findUnique({ where: { id }, include: { klant: true, regels: true } })
      if (!offerte) throw new Error('Niet gevonden')

      const user = await prisma.user.findFirst()
      if (!user) throw new Error('Geen gebruiker')

      const factuurNummer = genereerNummer(user.factuurPrefix, user.factuurVolgNummer)

      const factuur = await prisma.factuur.create({
        data: {
          nummer: factuurNummer,
          klantId: offerte.klantId,
          datum: new Date(),
          vervaldatum: berekenVervaldatum(user.standaardBetaalTermijn),
          subtotaal: offerte.subtotaal,
          btwBedrag: offerte.btwBedrag,
          kortingBedrag: offerte.kortingBedrag,
          kortingPercentage: offerte.kortingPercentage,
          totaal: offerte.totaal,
          notities: offerte.notities,
          offerteId: offerte.id,
          regels: {
            create: offerte.regels.map(r => ({
              omschrijving: r.omschrijving, aantal: r.aantal, eenheid: r.eenheid,
              prijs: r.prijs, btwPercentage: r.btwPercentage, kortingPercentage: r.kortingPercentage,
              totaal: r.totaal, volgorde: r.volgorde
            }))
          }
        },
        include: { klant: true, regels: true }
      })

      await prisma.user.updateMany({ data: { factuurVolgNummer: user.factuurVolgNummer + 1 } })
      await prisma.offerte.update({ where: { id }, data: { status: 'GEACCEPTEERD' } })

      return { factuur }
    }

    return prisma.offerte.update({
      where: { id },
      data: {
        ...data,
        datum: data.datum ? new Date(data.datum as string) : undefined,
        geldigTot: data.geldigTot ? new Date(data.geldigTot as string) : undefined,
      },
      include: { klant: true }
    })
  })

  ipcMain.handle('offertes:delete', async (_, id: string) => {
    await prisma.offerte.delete({ where: { id } })
    return { succes: true }
  })

  // Inkomen
  ipcMain.handle('inkomen:list', async (_, params?: { van?: string; tot?: string }) => {
    return prisma.inkomen.findMany({
      where: {
        ...(params?.van ? { datum: { gte: new Date(params.van) } } : {}),
        ...(params?.tot ? { datum: { lte: new Date(params.tot) } } : {}),
      },
      include: { factuur: { include: { klant: true } } },
      orderBy: { datum: 'desc' }
    })
  })

  ipcMain.handle('inkomen:create', async (_, data: Record<string, unknown>) => {
    const inkomen = await prisma.inkomen.create({
      data: { ...data, datum: new Date(data.datum as string) } as Parameters<typeof prisma.inkomen.create>[0]['data'],
      include: { factuur: { include: { klant: true } } }
    })

    if (data.factuurId) {
      await prisma.factuur.update({ where: { id: data.factuurId as string }, data: { status: 'BETAALD' } })
    }

    return inkomen
  })

  ipcMain.handle('inkomen:update', async (_, id: string, data: Record<string, unknown>) => {
    return prisma.inkomen.update({
      where: { id },
      data: { ...data, datum: data.datum ? new Date(data.datum as string) : undefined } as Parameters<typeof prisma.inkomen.update>[0]['data'],
      include: { factuur: { include: { klant: true } } }
    })
  })

  ipcMain.handle('inkomen:delete', async (_, id: string) => {
    await prisma.inkomen.delete({ where: { id } })
    return { succes: true }
  })

  // Uitgaven
  ipcMain.handle('uitgaven:list', async (_, params?: { van?: string; tot?: string; categorieId?: string }) => {
    return prisma.uitgave.findMany({
      where: {
        ...(params?.van ? { datum: { gte: new Date(params.van) } } : {}),
        ...(params?.tot ? { datum: { lte: new Date(params.tot) } } : {}),
        ...(params?.categorieId ? { categorieId: params.categorieId } : {}),
      },
      include: { categorie: true },
      orderBy: { datum: 'desc' }
    })
  })

  ipcMain.handle('uitgaven:create', async (_, data: Record<string, unknown>) => {
    return prisma.uitgave.create({
      data: { ...data, datum: new Date(data.datum as string) } as Parameters<typeof prisma.uitgave.create>[0]['data'],
      include: { categorie: true }
    })
  })

  ipcMain.handle('uitgaven:update', async (_, id: string, data: Record<string, unknown>) => {
    return prisma.uitgave.update({
      where: { id },
      data: { ...data, datum: data.datum ? new Date(data.datum as string) : undefined } as Parameters<typeof prisma.uitgave.update>[0]['data'],
      include: { categorie: true }
    })
  })

  ipcMain.handle('uitgaven:delete', async (_, id: string) => {
    await prisma.uitgave.delete({ where: { id } })
    return { succes: true }
  })

  // Categorieën
  ipcMain.handle('categorien:list', async () => {
    return prisma.categorie.findMany({ orderBy: { naam: 'asc' } })
  })

  ipcMain.handle('categorien:create', async (_, data: { naam: string; kleur?: string; icoon?: string }) => {
    return prisma.categorie.create({ data })
  })

  ipcMain.handle('categorien:update', async (_, id: string, data: { naam?: string; kleur?: string; icoon?: string }) => {
    return prisma.categorie.update({ where: { id }, data })
  })

  ipcMain.handle('categorien:delete', async (_, id: string) => {
    await prisma.categorie.delete({ where: { id } })
    return { succes: true }
  })

  // Uren
  ipcMain.handle('uren:list', async (_, params?: { gefactureerd?: boolean }) => {
    return prisma.uurregistratie.findMany({
      where: params?.gefactureerd !== undefined ? { gefactureerd: params.gefactureerd } : {},
      orderBy: { startTijd: 'desc' }
    })
  })

  ipcMain.handle('uren:create', async (_, data: Record<string, unknown>) => {
    let duur: number | null = null
    if (data.startTijd && data.eindTijd) {
      duur = Math.floor((new Date(data.eindTijd as string).getTime() - new Date(data.startTijd as string).getTime()) / 60000)
    }
    return prisma.uurregistratie.create({
      data: { ...data, startTijd: new Date(data.startTijd as string), eindTijd: data.eindTijd ? new Date(data.eindTijd as string) : null, duur } as Parameters<typeof prisma.uurregistratie.create>[0]['data']
    })
  })

  ipcMain.handle('uren:update', async (_, id: string, data: Record<string, unknown>) => {
    return prisma.uurregistratie.update({
      where: { id },
      data: { ...data, startTijd: data.startTijd ? new Date(data.startTijd as string) : undefined, eindTijd: data.eindTijd ? new Date(data.eindTijd as string) : null } as Parameters<typeof prisma.uurregistratie.update>[0]['data']
    })
  })

  ipcMain.handle('uren:delete', async (_, id: string) => {
    await prisma.uurregistratie.delete({ where: { id } })
    return { succes: true }
  })

  // Instellingen
  ipcMain.handle('instellingen:get', async () => {
    const user = await prisma.user.findFirst({
      select: {
        id: true, naam: true, email: true, bedrijfsnaam: true, kvkNummer: true, btwNummer: true,
        iban: true, adres: true, postcode: true, stad: true, telefoon: true, website: true, logo: true,
        factuurPrefix: true, offertePrefix: true, emailSmtpHost: true, emailSmtpPort: true,
        emailSmtpUser: true, emailSmtpSecure: true, korActief: true, korDrempel: true,
        standaardBetaalTermijn: true, standaardBtwTarief: true, betalingsherinneringen: true,
        herinneringDagen: true, googleRefreshToken: true,
      }
    })
    return { ...user, googleGekoppeld: !!user?.googleRefreshToken }
  })

  ipcMain.handle('instellingen:update', async (_, data: Record<string, unknown>) => {
    const { emailSmtpPass, ...rest } = data
    const updateData: Record<string, unknown> = { ...rest }
    if (emailSmtpPass) updateData.emailSmtpPass = emailSmtpPass
    await prisma.user.updateMany({ data: updateData })
    return { succes: true }
  })

  ipcMain.handle('instellingen:test-email', async (_, config: { host: string; port: number; secure: boolean; user: string; pass: string; naar: string }) => {
    await verstuurEmail(
      { host: config.host, port: config.port, secure: config.secure, user: config.user, pass: config.pass },
      { van: config.user, naar: config.naar, onderwerp: 'AdminPro - Test e-mail', html: '<p>Dit is een test e-mail van AdminPro. Uw SMTP-instellingen werken correct!</p>' }
    )
    return { succes: true }
  })

  ipcMain.handle('instellingen:google-auth-url', async () => {
    return maakGoogleAuthUrl()
  })

  ipcMain.handle('instellingen:google-koppelen', async (_, code: string) => {
    const tokens = await wisselCodeVoorTokens(code, 'urn:ietf:wg:oauth:2.0:oob')
    await prisma.user.updateMany({
      data: {
        googleRefreshToken: tokens.refresh_token,
        googleAccessToken: tokens.access_token,
        googleTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      }
    })
    return { succes: true }
  })

  ipcMain.handle('instellingen:google-ontkoppelen', async () => {
    await prisma.user.updateMany({ data: { googleRefreshToken: null, googleAccessToken: null, googleTokenExpiry: null } })
    return { succes: true }
  })

  // Agenda
  ipcMain.handle('agenda:haal-afspraken', async (_, params?: { van?: string; tot?: string }) => {
    const user = await prisma.user.findFirst()
    if (!user?.googleRefreshToken) return []

    let accessToken = user.googleAccessToken
    if (!accessToken || (user.googleTokenExpiry && new Date() >= user.googleTokenExpiry)) {
      const nieuwTokens = await vernieuwAccessToken(user.googleRefreshToken)
      accessToken = nieuwTokens.access_token
      await prisma.user.updateMany({
        data: { googleAccessToken: accessToken, googleTokenExpiry: new Date(Date.now() + nieuwTokens.expires_in * 1000) }
      })
    }

    return haalAgendaAfspraken(accessToken!, params?.van, params?.tot)
  })
}

app.whenReady().then(() => {
  initPrisma()
  setupIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
