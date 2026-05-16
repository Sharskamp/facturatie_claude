import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'
import * as fs from 'fs'
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

// ── Terugkerende facturen (gedeeld tussen IPC en startup) ──
async function maakTermijnFacturen(): Promise<number> {
  try {
    const user = await prisma.user.findFirst()
    if (!user) return 0

    const terugkerende = await prisma.factuur.findMany({
      where: { terugkerend: true, status: { not: 'CONCEPT' } },
      include: { regels: true }
    })

    let aangemaakt = 0
    const nu = new Date()

    for (const factuur of terugkerende) {
      const interval = factuur.terugkerendInterval
      if (!interval) continue

      const dagSinds = Math.floor((nu.getTime() - new Date(factuur.datum).getTime()) / (1000 * 60 * 60 * 24))

      let dueNa = 0
      if (interval === 'maandelijks') dueNa = 30
      else if (interval === 'kwartaal') dueNa = 90
      else if (interval === 'jaarlijks') dueNa = 365

      if (dagSinds < dueNa) continue

      const nieuweNummer = genereerNummer(user.factuurPrefix, user.factuurVolgNummer + aangemaakt)

      await prisma.factuur.create({
        data: {
          nummer: nieuweNummer,
          klantId: factuur.klantId,
          datum: new Date(),
          vervaldatum: berekenVervaldatum(user.standaardBetaalTermijn),
          subtotaal: factuur.subtotaal,
          btwBedrag: factuur.btwBedrag,
          kortingBedrag: factuur.kortingBedrag,
          kortingPercentage: factuur.kortingPercentage,
          totaal: factuur.totaal,
          notities: factuur.notities,
          betalingsCondities: factuur.betalingsCondities,
          btwVerlegd: factuur.btwVerlegd,
          status: 'CONCEPT',
          regels: {
            create: factuur.regels.map(r => ({
              omschrijving: r.omschrijving, aantal: r.aantal, eenheid: r.eenheid,
              prijs: r.prijs, btwPercentage: r.btwPercentage, kortingPercentage: r.kortingPercentage,
              totaal: r.totaal, volgorde: r.volgorde
            }))
          }
        }
      })
      aangemaakt++
    }

    if (aangemaakt > 0) {
      await prisma.user.updateMany({ data: { factuurVolgNummer: user.factuurVolgNummer + aangemaakt } })
    }

    return aangemaakt
  } catch (e) {
    console.error('Fout bij aanmaken termijnfacturen:', e)
    return 0
  }
}

// ── Betalingsherinneringen (gedeeld tussen IPC en startup) ──
async function stuurHerinneringen(): Promise<{ verstuurd: number; fouten: number; fout?: string }> {
  const user = await prisma.user.findFirst()
  if (!user || !user.betalingsherinneringen) return { verstuurd: 0, fouten: 0 }
  if (!user.emailSmtpHost || !user.emailSmtpUser) return { verstuurd: 0, fouten: 0, fout: 'SMTP niet geconfigureerd' }

  const nu = new Date()
  const drempelDatum = new Date(nu)
  drempelDatum.setDate(nu.getDate() - user.herinneringDagen)

  // Find overdue invoices: VERZONDEN, past due, no reminder sent yet (or sent long ago)
  const teHerinnerenFacturen = await prisma.factuur.findMany({
    where: {
      status: 'VERZONDEN',
      vervaldatum: { lt: drempelDatum },
      OR: [
        { herinneringVerzondenOp: null },
        { herinneringVerzondenOp: { lt: new Date(nu.getTime() - 14 * 24 * 60 * 60 * 1000) } } // not in last 14 days
      ]
    },
    include: { klant: true, regels: true }
  })

  let verstuurd = 0
  let fouten = 0

  for (const factuur of teHerinnerenFacturen) {
    if (!factuur.klant.email) continue

    const dagenTeLasten = Math.floor((nu.getTime() - new Date(factuur.vervaldatum).getTime()) / (1000 * 60 * 60 * 24))

    const html = `
      <p>Geachte ${factuur.klant.naam},</p>
      <p>Wij hebben geconstateerd dat onderstaande factuur nog niet is voldaan.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px"><strong>Factuurnummer:</strong></td><td>${factuur.nummer}</td></tr>
        <tr><td style="padding:4px 8px"><strong>Factuurdatum:</strong></td><td>${new Date(factuur.datum).toLocaleDateString('nl-NL')}</td></tr>
        <tr><td style="padding:4px 8px"><strong>Vervaldatum:</strong></td><td>${new Date(factuur.vervaldatum).toLocaleDateString('nl-NL')}</td></tr>
        <tr><td style="padding:4px 8px"><strong>Openstaand bedrag:</strong></td><td><strong>€ ${factuur.totaal.toFixed(2).replace('.', ',')}</strong></td></tr>
        <tr><td style="padding:4px 8px"><strong>Dagen te laat:</strong></td><td>${dagenTeLasten} dagen</td></tr>
      </table>
      <p>Wij verzoeken u vriendelijk het openstaande bedrag zo spoedig mogelijk te voldoen.</p>
      <p>Heeft u deze factuur reeds betaald? Dan kunt u dit bericht als niet verzonden beschouwen.</p>
      <p>Met vriendelijke groet,<br>${user.naam}${user.bedrijfsnaam ? '<br>' + user.bedrijfsnaam : ''}</p>
    `

    try {
      await verstuurEmail(
        { host: user.emailSmtpHost, port: user.emailSmtpPort ?? 587, secure: user.emailSmtpSecure, user: user.emailSmtpUser!, pass: user.emailSmtpPass ?? '' },
        { van: user.emailSmtpUser!, naar: factuur.klant.email, onderwerp: `Betalingsherinnering - Factuur ${factuur.nummer}`, html }
      )
      await prisma.factuur.update({ where: { id: factuur.id }, data: { herinneringVerzondenOp: nu } })
      verstuurd++
    } catch {
      fouten++
    }
  }

  return { verstuurd, fouten }
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
        herinneringDagen: true, googleRefreshToken: true, kmVergoeding: true,
        anthropicApiKey: true,
      }
    })
    return { ...user, googleGekoppeld: !!user?.googleRefreshToken }
  })

  ipcMain.handle('instellingen:update', async (_, data: Record<string, unknown>) => {
    const { emailSmtpPass, anthropicApiKey, ...rest } = data
    const updateData: Record<string, unknown> = { ...rest }
    if (emailSmtpPass) updateData.emailSmtpPass = emailSmtpPass
    if (anthropicApiKey !== undefined) updateData.anthropicApiKey = anthropicApiKey || null
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

  // ── Ritten (Kilometerregistratie) ──
  ipcMain.handle('ritten:list', async () => {
    const user = await prisma.user.findFirst()
    const kmVergoeding = user?.kmVergoeding ?? 0.23
    const ritten = await prisma.rit.findMany({ orderBy: { datum: 'desc' } })
    return ritten.map(r => ({ ...r, vergoeding: r.kilometers * kmVergoeding }))
  })

  ipcMain.handle('ritten:create', async (_, data: {
    datum: string; omschrijving: string; van: string; naar: string;
    kilometers: number; retour?: boolean; zakelijk?: boolean; notities?: string
  }) => {
    const km = data.retour ? data.kilometers * 2 : data.kilometers
    const rit = await prisma.rit.create({
      data: {
        datum: new Date(data.datum),
        omschrijving: data.omschrijving,
        van: data.van,
        naar: data.naar,
        kilometers: km,
        retour: data.retour ?? false,
        zakelijk: data.zakelijk ?? true,
        notities: data.notities ?? null,
      }
    })
    const user = await prisma.user.findFirst()
    const kmVergoeding = user?.kmVergoeding ?? 0.23
    return { ...rit, vergoeding: rit.kilometers * kmVergoeding }
  })

  ipcMain.handle('ritten:update', async (_, id: string, data: Record<string, unknown>) => {
    const rit = await prisma.rit.update({
      where: { id },
      data: { ...data, datum: data.datum ? new Date(data.datum as string) : undefined } as Parameters<typeof prisma.rit.update>[0]['data']
    })
    const user = await prisma.user.findFirst()
    const kmVergoeding = user?.kmVergoeding ?? 0.23
    return { ...rit, vergoeding: rit.kilometers * kmVergoeding }
  })

  ipcMain.handle('ritten:delete', async (_, id: string) => {
    await prisma.rit.delete({ where: { id } })
    return { succes: true }
  })

  ipcMain.handle('ritten:exportCsv', async (_, csvInhoud: string) => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(focusedWindow!, {
      defaultPath: `ritten-export-${new Date().toISOString().split('T')[0]}.csv`,
      filters: [{ name: 'CSV bestanden', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return { succes: false }
    fs.writeFileSync(result.filePath, csvInhoud, 'utf-8')
    return { succes: true, pad: result.filePath }
  })

  ipcMain.handle('facturen:maakTermijnFacturen', async () => {
    return { aangemaakt: await maakTermijnFacturen() }
  })

  // ── PDF download ──
  ipcMain.handle('facturen:downloadPdf', async (_, factuurId: string) => {
    try {
      const factuur = await prisma.factuur.findUnique({ where: { id: factuurId } })
      if (!factuur) return { succes: false, fout: 'Factuur niet gevonden' }

      const parentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      if (!parentWindow) return { succes: false, fout: 'Geen actief venster' }

      // Toon save dialog VOOR het aanmaken van de printpagina
      const result = await dialog.showSaveDialog(parentWindow, {
        defaultPath: `factuur-${factuur.nummer}.pdf`,
        filters: [{ name: 'PDF bestanden', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return { succes: false }

      // Maak een verborgen venster met de printlayout (zelfde patroon als shell:open-print)
      const pdfWindow = new BrowserWindow({
        show: false,
        width: 900,
        height: 1200,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
        }
      })
      pdfWindow.setMenuBarVisibility(false)

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        await pdfWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/facturen/${factuurId}/print`)
      } else {
        await pdfWindow.loadFile(join(__dirname, '../renderer/index.html'), {
          hash: `/facturen/${factuurId}/print`
        })
      }

      // Wacht op volledige render (fonts, afbeeldingen)
      await new Promise(resolve => setTimeout(resolve, 1500))

      const pdfBuffer = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      pdfWindow.destroy()

      fs.writeFileSync(result.filePath, pdfBuffer)
      return { succes: true, pad: result.filePath }
    } catch (e: unknown) {
      return { succes: false, fout: e instanceof Error ? e.message : 'Onbekende fout' }
    }
  })

  // ── Bank CSV import ──
  ipcMain.handle('bank:openBestandDialog', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(focusedWindow!, {
      filters: [{ name: 'CSV bestanden', extensions: ['csv'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('bank:importeerCsv', async (_, { bank, filePath }: { bank: 'abn' | 'ing' | 'rabobank'; filePath: string }) => {
    const inhoud = fs.readFileSync(filePath, 'utf-8')
    const regels = inhoud.split('\n').map(r => r.trim()).filter(r => r.length > 0)

    function parseerveldCsv(rij: string): string[] {
      const velden: string[] = []
      let huidig = ''
      let inQuotes = false
      for (let i = 0; i < rij.length; i++) {
        const c = rij[i]
        if (c === '"') {
          inQuotes = !inQuotes
        } else if (c === ',' && !inQuotes) {
          velden.push(huidig.trim())
          huidig = ''
        } else if (c === ';' && !inQuotes) {
          velden.push(huidig.trim())
          huidig = ''
        } else {
          huidig += c
        }
      }
      velden.push(huidig.trim())
      return velden
    }

    const header = parseerveldCsv(regels[0]).map(h => h.replace(/"/g, '').trim())
    const transacties: Array<{ datum: string; omschrijving: string; bedrag: number; type: 'inkomen' | 'uitgave' }> = []

    for (let i = 1; i < regels.length; i++) {
      const velden = parseerveldCsv(regels[i]).map(v => v.replace(/"/g, '').trim())
      if (velden.length < 3) continue

      try {
        if (bank === 'abn' || bank === 'ing') {
          // Kolommen: Datum,Naam / Omschrijving,Rekening,Tegenrekening,Code,Af Bij,Bedrag (EUR),MutatieSoort,Mededelingen
          const idx = (naam: string) => header.findIndex(h => h.toLowerCase().includes(naam.toLowerCase()))
          const datumIdx = idx('datum')
          const omschrijvingIdx = idx('naam')
          const afBijIdx = header.findIndex(h => h.toLowerCase().includes('af bij') || h.toLowerCase() === 'af bij')
          const bedragIdx = header.findIndex(h => h.toLowerCase().includes('bedrag'))

          if (datumIdx < 0 || bedragIdx < 0) continue

          const datumRaw = velden[datumIdx] ?? ''
          // Format: YYYYMMDD or DD-MM-YYYY
          let datum = datumRaw
          if (/^\d{8}$/.test(datumRaw)) {
            datum = `${datumRaw.slice(0, 4)}-${datumRaw.slice(4, 6)}-${datumRaw.slice(6, 8)}`
          } else if (/^\d{2}-\d{2}-\d{4}$/.test(datumRaw)) {
            const parts = datumRaw.split('-')
            datum = `${parts[2]}-${parts[1]}-${parts[0]}`
          }

          const omschrijving = velden[omschrijvingIdx] ?? ''
          const bedragStr = (velden[bedragIdx] ?? '').replace('.', '').replace(',', '.')
          const bedragAbs = Math.abs(parseFloat(bedragStr) || 0)
          const afBij = velden[afBijIdx]?.toLowerCase() ?? ''
          const isDebet = afBij === 'af' || afBij === 'debet' || afBij === 'd'

          transacties.push({
            datum,
            omschrijving: omschrijving || 'Onbekend',
            bedrag: isDebet ? -bedragAbs : bedragAbs,
            type: isDebet ? 'uitgave' : 'inkomen'
          })
        } else if (bank === 'rabobank') {
          // IBAN/BBAN,Munt,BIC,Volgnr,Datum,Rentedatum,Bedrag,Saldo na trn,...
          const datumIdx = header.findIndex(h => h.toLowerCase() === 'datum')
          const bedragIdx = header.findIndex(h => h.toLowerCase() === 'bedrag')
          const naamIdx = header.findIndex(h => h.toLowerCase().includes('tegenpartij naam'))
          const omschrijvingIdx = header.findIndex(h => h.toLowerCase() === 'omschrijving')

          if (datumIdx < 0 || bedragIdx < 0) continue

          const datumRaw = velden[datumIdx] ?? ''
          let datum = datumRaw
          if (/^\d{4}-\d{2}-\d{2}$/.test(datumRaw)) {
            datum = datumRaw
          } else if (/^\d{2}-\d{2}-\d{4}$/.test(datumRaw)) {
            const parts = datumRaw.split('-')
            datum = `${parts[2]}-${parts[1]}-${parts[0]}`
          }

          const bedragStr = (velden[bedragIdx] ?? '').replace('.', '').replace(',', '.')
          const bedrag = parseFloat(bedragStr) || 0
          const naam = velden[naamIdx] ?? ''
          const omschrijving = velden[omschrijvingIdx] ?? naam || 'Onbekend'

          transacties.push({
            datum,
            omschrijving: omschrijving || 'Onbekend',
            bedrag,
            type: bedrag < 0 ? 'uitgave' : 'inkomen'
          })
        }
      } catch {
        continue
      }
    }

    return transacties
  })

  // ── Uren → Factuur ──
  ipcMain.handle('uren:factuurAanmaken', async (_, { urenIds, klantId, uurtarief }: { urenIds: string[]; klantId: string; uurtarief?: number }) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')

    const urenRegistraties = await prisma.uurregistratie.findMany({ where: { id: { in: urenIds } } })
    if (urenRegistraties.length === 0) throw new Error('Geen urenregistraties gevonden')

    const nummer = genereerNummer(user.factuurPrefix, user.factuurVolgNummer)

    const btwPercentage = user.standaardBtwTarief

    let subtotaal = 0
    let btwBedrag = 0
    const berekendeRegels = urenRegistraties.map((uur, index) => {
      const uren = (uur.duur ?? 0) / 60
      const tarief = uurtarief ?? uur.uurtarief ?? 0
      const omschrijving = uur.projectNaam ? `${uur.omschrijving} - ${uur.projectNaam}` : uur.omschrijving
      const netto = uren * tarief
      const btw = (netto * btwPercentage) / 100
      subtotaal += netto
      btwBedrag += btw
      return {
        omschrijving,
        aantal: parseFloat(uren.toFixed(2)),
        eenheid: 'uur',
        prijs: tarief,
        btwPercentage,
        kortingPercentage: 0,
        totaal: netto + btw,
        volgorde: index
      }
    })

    const factuur = await prisma.factuur.create({
      data: {
        nummer,
        klantId,
        datum: new Date(),
        vervaldatum: berekenVervaldatum(user.standaardBetaalTermijn),
        subtotaal,
        btwBedrag,
        kortingBedrag: 0,
        kortingPercentage: 0,
        totaal: subtotaal + btwBedrag,
        status: 'CONCEPT',
        regels: { create: berekendeRegels }
      },
      include: { klant: true, regels: true }
    })

    await prisma.user.updateMany({ data: { factuurVolgNummer: user.factuurVolgNummer + 1 } })

    await prisma.uurregistratie.updateMany({
      where: { id: { in: urenIds } },
      data: { gefactureerd: true, factuurId: factuur.id }
    })

    return factuur.id
  })

  // ── Bon uploaden (Uitgaven) ──
  ipcMain.handle('uitgaven:uploadBon', async (_, { uitgaveId }: { uitgaveId: string }) => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(focusedWindow!, {
      filters: [{ name: 'Afbeeldingen', extensions: ['jpg', 'jpeg', 'png', 'pdf', 'webp'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { succes: false }

    const bronPad = result.filePaths[0]
    const bestandsnaam = bronPad.split('/').pop() ?? bronPad.split('\\').pop() ?? 'bon'
    const bonMap = join(app.getPath('userData'), 'bonnen')
    if (!fs.existsSync(bonMap)) fs.mkdirSync(bonMap, { recursive: true })

    const doelPad = join(bonMap, `${uitgaveId}-${bestandsnaam}`)
    fs.copyFileSync(bronPad, doelPad)

    await prisma.uitgave.update({ where: { id: uitgaveId }, data: { bonBestand: doelPad } })
    return { succes: true, pad: doelPad }
  })

  ipcMain.handle('uitgaven:openBon', async (_, { pad }: { pad: string }) => {
    await shell.openPath(pad)
    return { succes: true }
  })

  // ── Producten (catalogus) ──
  ipcMain.handle('producten:list', async () => {
    return prisma.product.findMany({ where: { actief: true }, orderBy: { naam: 'asc' } })
  })

  ipcMain.handle('producten:create', async (_, data: { naam: string; omschrijving?: string; prijs: number; eenheid?: string; btwPercentage: number }) => {
    return prisma.product.create({ data })
  })

  ipcMain.handle('producten:update', async (_, id: string, data: Record<string, unknown>) => {
    return prisma.product.update({ where: { id }, data: data as Parameters<typeof prisma.product.update>[0]['data'] })
  })

  ipcMain.handle('producten:delete', async (_, id: string) => {
    // Soft delete
    await prisma.product.update({ where: { id }, data: { actief: false } })
    return { succes: true }
  })

  // ── Creditnota aanmaken ──
  ipcMain.handle('facturen:maakCreditnota', async (_, factuurId: string) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')

    const origineel = await prisma.factuur.findUnique({ where: { id: factuurId }, include: { regels: true } })
    if (!origineel) throw new Error('Factuur niet gevonden')

    // Generate credit note number using CN prefix
    const prefix = user.standaardCreditnotaPrefix ?? 'CN'
    const jaar = new Date().getFullYear()
    // Count existing credit notes this year to get sequence
    const aantalCN = await prisma.factuur.count({ where: { nummer: { startsWith: `${prefix}${jaar}` } } })
    const nummer = `${prefix}${jaar}-${String(aantalCN + 1).padStart(4, '0')}`

    const creditnota = await prisma.factuur.create({
      data: {
        nummer,
        klantId: origineel.klantId,
        datum: new Date(),
        vervaldatum: new Date(), // Direct opeisbaar
        subtotaal: -origineel.subtotaal,
        kortingBedrag: -origineel.kortingBedrag,
        kortingPercentage: origineel.kortingPercentage,
        btwBedrag: -origineel.btwBedrag,
        totaal: -origineel.totaal,
        notities: `Creditnota voor factuur ${origineel.nummer}`,
        btwVerlegd: origineel.btwVerlegd,
        status: 'CONCEPT',
        creditNotaVoorId: factuurId,
        regels: {
          create: origineel.regels.map(r => ({
            omschrijving: r.omschrijving,
            aantal: -r.aantal,
            eenheid: r.eenheid,
            prijs: r.prijs,
            btwPercentage: r.btwPercentage,
            kortingPercentage: r.kortingPercentage,
            totaal: -r.totaal,
            volgorde: r.volgorde
          }))
        }
      },
      include: { klant: true, regels: true }
    })

    return creditnota.id
  })

  // ── Betalingsherinneringen sturen ──
  ipcMain.handle('facturen:stuurHerinneringen', async () => stuurHerinneringen())

  ipcMain.handle('uitgaven:scanBon', async (_, { bonPad }: { bonPad: string }) => {
    const user = await prisma.user.findFirst()
    if (!user?.anthropicApiKey) {
      return { error: 'Geen Anthropic API sleutel ingesteld. Ga naar Instellingen > AI.' }
    }

    const ext = bonPad.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'pdf') {
      return { error: 'PDF scanning niet ondersteund. Gebruik een afbeelding (JPG, PNG, WEBP).' }
    }

    let mediaType: string
    if (ext === 'jpg' || ext === 'jpeg') {
      mediaType = 'image/jpeg'
    } else if (ext === 'png') {
      mediaType = 'image/png'
    } else if (ext === 'webp') {
      mediaType = 'image/webp'
    } else {
      return { error: `Onbekend bestandstype: .${ext}. Gebruik JPG, PNG of WEBP.` }
    }

    const base64 = fs.readFileSync(bonPad).toString('base64')

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': user.anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system: 'Je bent een assistent die bonnen uitleest. Reageer alleen met het gevraagde JSON-formaat, niets anders.',
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: 'Dit is een kassabon of factuur. Extraheer: 1) totaalbedrag (alleen getal, geen €-teken, punt als decimaalscheidingsteken), 2) naam van de winkel/leverancier, 3) datum (formaat YYYY-MM-DD). Reageer ALLEEN met JSON: {"bedrag": 12.50, "leverancier": "Albert Heijn", "datum": "2025-03-15"}. Als je een waarde niet kunt vinden, gebruik null.' }
            ]
          }]
        })
      })

      if (!response.ok) {
        const fout = await response.text()
        return { error: `API fout (${response.status}): ${fout.slice(0, 200)}` }
      }

      const apiResp = await response.json() as { content: Array<{ text: string }> }
      const tekst = apiResp.content?.[0]?.text ?? '{}'

      // Strip mogelijke markdown code fences
      const schoonTekst = tekst.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(schoonTekst) as { bedrag?: number | null; leverancier?: string | null; datum?: string | null }
      return { bedrag: parsed.bedrag ?? null, leverancier: parsed.leverancier ?? null, datum: parsed.datum ?? null }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Onbekende fout bij scannen' }
    }
  })

  // ── Vaste Activa ──
  ipcMain.handle('vasteActiva:list', async () => {
    return prisma.vasteActiva.findMany({ where: { actief: true }, orderBy: { aanschafDatum: 'desc' } })
  })

  ipcMain.handle('vasteActiva:create', async (_, data: Record<string, unknown>) => {
    return prisma.vasteActiva.create({
      data: { ...data, aanschafDatum: new Date(data.aanschafDatum as string) } as Parameters<typeof prisma.vasteActiva.create>[0]['data']
    })
  })

  ipcMain.handle('vasteActiva:update', async (_, id: string, data: Record<string, unknown>) => {
    return prisma.vasteActiva.update({
      where: { id },
      data: { ...data, aanschafDatum: data.aanschafDatum ? new Date(data.aanschafDatum as string) : undefined } as Parameters<typeof prisma.vasteActiva.update>[0]['data']
    })
  })

  ipcMain.handle('vasteActiva:delete', async (_, id: string) => {
    await prisma.vasteActiva.update({ where: { id }, data: { actief: false } })
    return { succes: true }
  })
}

app.whenReady().then(async () => {
  initPrisma()
  setupIpcHandlers()
  createWindow()

  // Maak terugkerende facturen aan bij opstarten
  maakTermijnFacturen().catch(e => console.error('Fout bij opstarten terugkerende facturen:', e))
  stuurHerinneringen().catch(e => console.error('Fout bij sturen herinneringen:', e))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
