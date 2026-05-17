import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'
import * as fs from 'fs'
import * as http from 'http'
import * as net from 'net'
import { verstuurEmail, maakFactuurEmailHtml } from '../lib/email'
import { haalAgendaAfspraken, maakGoogleAuthUrl, wisselCodeVoorTokens, vernieuwAccessToken } from '../lib/google-calendar'
import { autoUpdater } from 'electron-updater'
import * as os from 'os'

app.setName('Streamline Facturatie')

let prisma: PrismaClient
let mainWindow: BrowserWindow | null = null

const logBestand = join(app.getPath('userData'), 'app.log')
function logSchrijven(bericht: string) {
  const regel = `[${new Date().toISOString()}] ${bericht}\n`
  try { fs.appendFileSync(logBestand, regel) } catch {}
}

function initPrisma() {
  const dbPath = is.dev
    ? join(process.cwd(), 'dev.db')
    : join(app.getPath('userData'), 'adminpro.db')

  const adapter = new PrismaBetterSqlite3({ url: dbPath })
  prisma = new PrismaClient({ adapter })
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Streamline Facturatie',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  mainWindow.maximize()
  mainWindow.setMenuBarVisibility(false)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Helper functies (inline, geen externe import nodig) ──
function vrijePoortvinden(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo
      server.close(() => resolve(addr.port))
    })
    server.on('error', reject)
  })
}

async function genereerNummer(prefix: string, tabel: 'factuur' | 'offerte'): Promise<string> {
  const jaar = new Date().getFullYear()
  const startsWith = `${prefix}${jaar}-`
  let maxSeq = 0
  if (tabel === 'factuur') {
    const rows = await prisma.factuur.findMany({ where: { nummer: { startsWith } }, select: { nummer: true } })
    for (const r of rows) {
      const seq = parseInt(r.nummer.split('-').pop() ?? '0', 10)
      if (seq > maxSeq) maxSeq = seq
    }
  } else {
    const rows = await prisma.offerte.findMany({ where: { nummer: { startsWith } }, select: { nummer: true } })
    for (const r of rows) {
      const seq = parseInt(r.nummer.split('-').pop() ?? '0', 10)
      if (seq > maxSeq) maxSeq = seq
    }
  }
  return `${startsWith}${String(maxSeq + 1).padStart(4, '0')}`
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

      const nieuweNummer = await genereerNummer(user.factuurPrefix, 'factuur')

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
  ipcMain.handle('shell:open-external', (_, url: string) => {
    const toegestaan = /^https?:\/\//i.test(url) || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('wa.me')
    if (!toegestaan) { logSchrijven(`Geblokkeerde shell.openExternal URL: ${url}`); return }
    return shell.openExternal(url)
  })

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

  ipcMain.handle('auth:setup', async (_, data: {
    naam: string; email: string; wachtwoord: string; bedrijfsnaam?: string;
    kvkNummer?: string; btwNummer?: string; iban?: string; adres?: string;
    postcode?: string; stad?: string; telefoon?: string; website?: string; logoBase64?: string
  }) => {
    const bestaand = await prisma.user.findFirst()
    if (bestaand) throw new Error('Systeem is al geconfigureerd')

    const gehashed = await bcrypt.hash(data.wachtwoord, 12)
    const user = await prisma.user.create({
      data: {
        naam: data.naam, email: data.email, wachtwoord: gehashed,
        bedrijfsnaam: data.bedrijfsnaam, kvkNummer: data.kvkNummer,
        btwNummer: data.btwNummer, iban: data.iban, adres: data.adres,
        postcode: data.postcode, stad: data.stad, telefoon: data.telefoon,
        website: data.website, logoBase64: data.logoBase64
      }
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
      orderBy: [{ actief: 'desc' }, { naam: 'asc' }],
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

  ipcMain.handle('klanten:archiveer', async (_, id: string) => {
    const klant = await prisma.klant.findUnique({ where: { id } })
    if (!klant) throw new Error('Klant niet gevonden')
    return prisma.klant.update({ where: { id }, data: { actief: !klant.actief } })
  })

  // Facturen
  ipcMain.handle('facturen:list', async (_, params?: { status?: string; klantId?: string; zoek?: string }) => {
    return prisma.factuur.findMany({
      where: {
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.klantId ? { klantId: params.klantId } : {}),
        ...(params?.zoek ? {
          OR: [
            { nummer: { contains: params.zoek } },
            { klant: { naam: { contains: params.zoek } } },
            { klant: { bedrijf: { contains: params.zoek } } },
          ]
        } : {}),
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
    taal?: string
    totaalKorting?: number
    totaalKortingBedrag?: number
    mollieBetaalLink?: string
    terugkerend?: boolean
    terugkerendInterval?: string | null
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

    const klant = await prisma.klant.findUnique({ where: { id: payload.klantId } })
    const effectieveBetaalTermijn = klant?.betaalTermijn ?? user.standaardBetaalTermijn

    const nummer = await genereerNummer(user.factuurPrefix, 'factuur')

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
        vervaldatum: payload.vervaldatum ? new Date(payload.vervaldatum) : berekenVervaldatum(effectieveBetaalTermijn),
        notities: payload.notities,
        betalingsCondities: payload.betalingsCondities,
        btwVerlegd: payload.btwVerlegd ?? false,
        kortingPercentage: payload.kortingPercentage ?? 0,
        kortingBedrag,
        subtotaal,
        btwBedrag,
        totaal: subtotaal + btwBedrag,
        status: payload.status ?? 'CONCEPT',
        taal: payload.taal ?? 'nl',
        totaalKorting: payload.totaalKorting ?? 0,
        totaalKortingBedrag: payload.totaalKortingBedrag ?? 0,
        mollieBetaalLink: payload.mollieBetaalLink,
        terugkerend: payload.terugkerend ?? false,
        terugkerendInterval: payload.terugkerendInterval ?? null,
        regels: { create: berekendeRegels }
      },
      include: { klant: true, regels: true }
    })

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

  ipcMain.handle('facturen:duplicate', async (_, id: string) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')
    const orig = await prisma.factuur.findUnique({ where: { id }, include: { regels: true } })
    if (!orig) throw new Error('Factuur niet gevonden')
    const nummer = await genereerNummer(user.factuurPrefix, 'factuur')
    const kopie = await prisma.factuur.create({
      data: {
        nummer,
        klantId: orig.klantId,
        datum: new Date(),
        vervaldatum: berekenVervaldatum(user.standaardBetaalTermijn),
        notities: orig.notities,
        betalingsCondities: orig.betalingsCondities,
        btwVerlegd: orig.btwVerlegd,
        kortingPercentage: orig.kortingPercentage,
        kortingBedrag: orig.kortingBedrag,
        subtotaal: orig.subtotaal,
        btwBedrag: orig.btwBedrag,
        totaal: orig.totaal,
        status: 'CONCEPT',
        taal: orig.taal,
        totaalKorting: orig.totaalKorting,
        totaalKortingBedrag: orig.totaalKortingBedrag,
        regels: {
          create: orig.regels.map((r, i) => ({
            omschrijving: r.omschrijving,
            aantal: r.aantal,
            eenheid: r.eenheid,
            prijs: r.prijs,
            btwPercentage: r.btwPercentage,
            kortingPercentage: r.kortingPercentage,
            totaal: r.totaal,
            volgorde: i,
          }))
        }
      },
      include: { klant: true, regels: true }
    })
    return kopie
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
        factuurUrl: ``,
        notities: payload.bericht,
        mollieBetaalLink: factuur.mollieBetaalLink,
      })

      try {
        await verstuurEmail(
          { host: user.emailSmtpHost, port: user.emailSmtpPort ?? 587, secure: user.emailSmtpSecure, user: user.emailSmtpUser, pass: user.emailSmtpPass ?? '' },
          { van: `${user.bedrijfsnaam ?? user.naam} <${user.emailSmtpUser}>`, naar: payload.naarEmail ?? factuur.klant.email ?? '', onderwerp: `Factuur ${factuur.nummer} - ${user.bedrijfsnaam ?? user.naam}`, html: emailHtml }
        )
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Onbekende fout'
        if (msg.includes('ETIMEDOUT') || msg.includes('connect')) {
          const poort = user.emailSmtpPort ?? 587
          throw new Error(`Verbinding met SMTP-server mislukt (${user.emailSmtpHost}:${poort}). Controleer de host, poort en firewall. Poort 25 wordt vaak geblokkeerd — gebruik poort 587 (STARTTLS) of 465 (SSL). Details: ${msg}`)
        }
        if (msg.includes('EAUTH') || msg.includes('535') || msg.includes('auth')) {
          throw new Error(`SMTP-authenticatie mislukt. Controleer gebruikersnaam en wachtwoord. Details: ${msg}`)
        }
        throw new Error(`E-mail versturen mislukt: ${msg}`)
      }

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

    const nummer = await genereerNummer(user.offertePrefix, 'offerte')

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

    return offerte
  })

  ipcMain.handle('offertes:update', async (_, id: string, data: Record<string, unknown> & { regels?: Array<Record<string, unknown>> }) => {
    if (data.actie === 'naar-factuur') {
      const offerte = await prisma.offerte.findUnique({ where: { id }, include: { klant: true, regels: true } })
      if (!offerte) throw new Error('Niet gevonden')

      const user = await prisma.user.findFirst()
      if (!user) throw new Error('Geen gebruiker')

      const factuurNummer = await genereerNummer(user.factuurPrefix, 'factuur')

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

      await prisma.offerte.update({ where: { id }, data: { status: 'GEACCEPTEERD' } })

      return { factuur }
    }

    const { regels, actie: _actie, ...velden } = data

    if (regels) {
      let subtotaal = 0; let btwBedrag = 0
      const berekendeRegels = regels.map((r, index) => {
        const bruto = (r.prijs as number) * (r.aantal as number)
        const korting = (bruto * ((r.kortingPercentage as number) ?? 0)) / 100
        const netto = bruto - korting
        const btw = (netto * (r.btwPercentage as number)) / 100
        subtotaal += netto; btwBedrag += btw
        return { ...r, totaal: netto + btw, volgorde: index }
      })
      const kortingBedrag = (subtotaal * ((velden.kortingPercentage as number) ?? 0)) / 100
      subtotaal -= kortingBedrag

      await prisma.offerteRegel.deleteMany({ where: { offerteId: id } })
      return prisma.offerte.update({
        where: { id },
        data: {
          ...velden,
          subtotaal, btwBedrag, kortingBedrag, totaal: subtotaal + btwBedrag,
          datum: velden.datum ? new Date(velden.datum as string) : undefined,
          geldigTot: velden.geldigTot ? new Date(velden.geldigTot as string) : undefined,
          regels: { create: berekendeRegels as Parameters<typeof prisma.offerteRegel.create>[0]['data'][] }
        },
        include: { klant: true, regels: { orderBy: { volgorde: 'asc' } } }
      })
    }

    return prisma.offerte.update({
      where: { id },
      data: {
        ...velden,
        datum: velden.datum ? new Date(velden.datum as string) : undefined,
        geldigTot: velden.geldigTot ? new Date(velden.geldigTot as string) : undefined,
      },
      include: { klant: true, regels: { orderBy: { volgorde: 'asc' } } }
    })
  })

  ipcMain.handle('offertes:delete', async (_, id: string) => {
    await prisma.offerte.delete({ where: { id } })
    return { succes: true }
  })

  ipcMain.handle('offertes:verstuur', async (_, id: string, payload: { email: string; onderwerp?: string; bericht?: string }) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')
    if (!user.emailSmtpHost || !user.emailSmtpUser) throw new Error('SMTP niet geconfigureerd')
    const offerte = await prisma.offerte.findUnique({
      where: { id },
      include: { klant: true, regels: true }
    })
    if (!offerte) throw new Error('Offerte niet gevonden')

    const bedrijfsnaam = user.bedrijfsnaam ?? user.naam
    const klantNaam = offerte.klant.bedrijf ?? offerte.klant.naam
    const totaalStr = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(offerte.totaal)

    const onderwerp = payload.onderwerp ?? `Offerte ${offerte.nummer} van ${bedrijfsnaam}`
    const aanheefTekst = (user as any).emailAanhef?.replace('{{naam}}', klantNaam) ?? `Geachte ${klantNaam},`
    const afsluitingTekst = (user as any).emailAfsluitingsTekst ?? 'Met vriendelijke groet,'

    const berichtHtml = payload.bericht
      ? payload.bericht.replace(/\n/g, '<br>')
      : `Hierbij sturen wij u offerte <strong>${offerte.nummer}</strong> toe met een totaalbedrag van <strong>${totaalStr}</strong>.<br><br>De offerte is geldig tot ${formatDatum(offerte.geldigTot.toISOString())}.`

    const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #4f46e5; padding: 25px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 22px;">Offerte ${offerte.nummer}</h1>
    <p style="color: #c7d2fe; margin: 4px 0 0;">${bedrijfsnaam}</p>
  </div>
  <div style="background: #f9fafb; padding: 25px; border: 1px solid #e5e7eb;">
    <p>${aanheefTekst}</p>
    <p>${berichtHtml}</p>
    <p style="margin-top: 20px;">${afsluitingTekst}<br><strong>${bedrijfsnaam}</strong></p>
  </div>
</body></html>`

    await verstuurEmail(
      { host: user.emailSmtpHost, port: user.emailSmtpPort ?? 587, secure: user.emailSmtpSecure, user: user.emailSmtpUser, pass: user.emailSmtpPass ?? '' },
      { naar: payload.email, van: `"${bedrijfsnaam}" <${user.emailSmtpUser}>`, onderwerp, html }
    )

    await prisma.offerte.update({ where: { id }, data: { verzondenOp: new Date(), status: offerte.status === 'CONCEPT' ? 'VERZONDEN' : offerte.status } })
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

  ipcMain.handle('categorien:create', async (_, data: { naam: string; kleur?: string; icoon?: string; standaardBtwTarief?: number }) => {
    return prisma.categorie.create({ data })
  })

  ipcMain.handle('categorien:update', async (_, id: string, data: { naam?: string; kleur?: string; icoon?: string; standaardBtwTarief?: number | null }) => {
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
        iban: true, adres: true, postcode: true, stad: true, telefoon: true, website: true,
        logo: true, logoBase64: true,
        factuurPrefix: true, offertePrefix: true, factuurVolgNummer: true, offerteVolgNummer: true,
        factuurNummerFormaat: true, standaardCreditnotaPrefix: true,
        emailSmtpHost: true, emailSmtpPort: true, emailSmtpUser: true, emailSmtpSecure: true,
        korActief: true, korDrempel: true, korWaarschuwing: true,
        standaardBetaalTermijn: true, standaardBtwTarief: true,
        betalingsherinneringen: true, herinneringDagen: true,
        googleRefreshToken: true, googleClientId: true, kmVergoeding: true, anthropicApiKey: true,
        donkerModus: true, autoStart: true, pdfMapPad: true, mollieApiKey: true,
        layoutPrimairKleur: true, layoutSecundairKleur: true, layoutLettertype: true,
        layoutKoptekst: true, layoutVoettekst: true, layoutLogoPositie: true,
        layoutToonBtwNummer: true, layoutToonKvkNummer: true, layoutToonIban: true,
        layoutToonQrCode: true, layoutRegelSpacing: true,
        layoutLetterGrootte: true, layoutLogoGrootte: true, layoutMarges: true, layoutSectieVolgorde: true,
        onbetaaldeFactuurMelding: true,
      }
    })
    return { ...user, googleGekoppeld: !!user?.googleRefreshToken, googleClientId: user?.googleClientId ?? '' }
  })

  ipcMain.handle('instellingen:update', async (_, data: Record<string, unknown>) => {
    const toegestaneVelden = new Set([
      'naam', 'email', 'bedrijfsnaam', 'kvkNummer', 'btwNummer', 'iban',
      'adres', 'postcode', 'stad', 'telefoon', 'website', 'logo', 'logoBase64',
      'factuurPrefix', 'offertePrefix', 'factuurVolgNummer', 'offerteVolgNummer',
      'factuurNummerFormaat', 'standaardCreditnotaPrefix',
      'emailSmtpHost', 'emailSmtpPort', 'emailSmtpUser', 'emailSmtpSecure', 'emailSmtpPass',
      'korActief', 'korDrempel', 'korWaarschuwing',
      'standaardBetaalTermijn', 'standaardBtwTarief', 'betalingsCondities',
      'betalingsherinneringen', 'herinneringDagen',
      'kmVergoeding', 'anthropicApiKey', 'mollieApiKey',
      'donkerModus', 'autoStart', 'pdfMapPad',
      'emailAanhef', 'emailAfsluitingsTekst',
      'googleClientId', 'googleClientSecret',
      'layoutPrimairKleur', 'layoutSecundairKleur', 'layoutLettertype',
      'layoutKoptekst', 'layoutVoettekst', 'layoutLogoPositie',
      'layoutToonBtwNummer', 'layoutToonKvkNummer', 'layoutToonIban',
      'layoutToonQrCode', 'layoutRegelSpacing',
      'layoutLetterGrootte', 'layoutLogoGrootte', 'layoutMarges', 'layoutSectieVolgorde',
      'onbetaaldeFactuurMelding',
    ])
    const updateData: Record<string, unknown> = {}
    for (const [sleutel, waarde] of Object.entries(data)) {
      if (toegestaneVelden.has(sleutel)) updateData[sleutel] = waarde
    }
    if (updateData.emailSmtpPass === '') delete updateData.emailSmtpPass
    if (updateData.anthropicApiKey === '') updateData.anthropicApiKey = null
    await prisma.user.updateMany({ data: updateData })
    return { succes: true }
  })

  ipcMain.handle('instellingen:test-email', async (_, config: { host: string; port: number; secure: boolean; user: string; pass: string; naar: string }) => {
    try {
      // Port 465 = direct SSL; port 587/25/other = STARTTLS (secure must be false)
      const secureDwingen = config.port === 465 ? true : config.port === 587 ? false : config.secure
      const naar = config.naar?.trim() || config.user // fallback: stuur naar eigen adres
      if (!naar) throw new Error('Geen ontvanger opgegeven. Vul je e-mailadres in bij Bedrijfsgegevens of gebruikersnaam bij SMTP.')
      await verstuurEmail(
        { host: config.host, port: config.port, secure: secureDwingen, user: config.user, pass: config.pass },
        { van: config.user, naar, onderwerp: 'AdminPro - Test e-mail', html: '<p>Dit is een test e-mail van AdminPro. Uw SMTP-instellingen werken correct!</p>' }
      )
      return { succes: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Onbekende fout'
      if (msg.includes('WRONG_VERSION') || msg.includes('SSL')) {
        throw new Error(`SSL/TLS mismatch. Gebruik poort 465 met SSL aan, of poort 587 met SSL uit (STARTTLS). Details: ${msg}`)
      }
      if (msg.includes('ETIMEDOUT') || msg.includes('connect')) {
        throw new Error(`Verbinding mislukt (${config.host}:${config.port}). Controleer host, poort en firewall. Gebruik 587 (STARTTLS) of 465 (SSL). Details: ${msg}`)
      }
      if (msg.includes('EAUTH') || msg.includes('535') || msg.includes('auth')) {
        throw new Error(`Authenticatie mislukt. Controleer gebruikersnaam en wachtwoord. Details: ${msg}`)
      }
      throw new Error(`Test e-mail mislukt: ${msg}`)
    }
  })

  ipcMain.handle('instellingen:google-auth-url', async () => {
    const user = await prisma.user.findFirst()
    if (!user?.googleClientId) {
      throw new Error('Google Client ID ontbreekt. Vul dit in bij Instellingen → Google Agenda.')
    }
    const port = await vrijePoortvinden()
    const redirectUri = `http://127.0.0.1:${port}`
    const url = maakGoogleAuthUrl(user.googleClientId, redirectUri)
    return { url, port }
  })

  ipcMain.handle('instellingen:google-koppelen', async () => {
    const user = await prisma.user.findFirst()
    if (!user?.googleClientId || !user?.googleClientSecret) {
      throw new Error('Google OAuth-gegevens ontbreken. Vul Client ID en Client Secret in bij Instellingen → Google Agenda.')
    }
    const port = await vrijePoortvinden()
    const redirectUri = `http://127.0.0.1:${port}`
    const authUrl = maakGoogleAuthUrl(user.googleClientId, redirectUri)

    return new Promise<{ succes: true }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close()
        reject(new Error('Time-out: geen toestemming ontvangen binnen 5 minuten.'))
      }, 5 * 60 * 1000)

      const server = http.createServer(async (req, res) => {
        if (!req.url) return
        const urlParams = new URL(req.url, `http://127.0.0.1:${port}`)
        const code = urlParams.searchParams.get('code')
        const error = urlParams.searchParams.get('error')

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        if (error || !code) {
          res.end('<html><body style="font-family:Arial;text-align:center;padding:40px"><h2>Autorisatie geweigerd</h2><p>Sluit dit venster en probeer het opnieuw in AdminPro.</p></body></html>')
          clearTimeout(timeout)
          server.close()
          reject(new Error(`Google autorisatie geweigerd: ${error || 'geen code ontvangen'}`))
          return
        }
        res.end('<html><body style="font-family:Arial;text-align:center;padding:40px"><h2>Verbinding geslaagd!</h2><p>Je Google Agenda is gekoppeld. Je kunt dit venster sluiten.</p></body></html>')
        clearTimeout(timeout)
        server.close()
        try {
          const tokens = await wisselCodeVoorTokens(code, redirectUri, user!.googleClientId!, user!.googleClientSecret!)
          await prisma.user.updateMany({
            data: {
              googleRefreshToken: tokens.refresh_token,
              googleAccessToken: tokens.access_token,
              googleTokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
            }
          })
          resolve({ succes: true })
        } catch (e) {
          reject(e)
        }
      })

      server.on('error', (e) => { clearTimeout(timeout); reject(e) })
      server.listen(port, '127.0.0.1', () => { shell.openExternal(authUrl) })
    })
  })

  ipcMain.handle('instellingen:google-ontkoppelen', async () => {
    await prisma.user.updateMany({ data: { googleRefreshToken: null, googleAccessToken: null, googleTokenExpiry: null } })
    return { succes: true }
  })

  // Agenda
  ipcMain.handle('agenda:haal-afspraken', async (_, params?: { van?: string; tot?: string }) => {
    const user = await prisma.user.findFirst()
    if (!user?.googleRefreshToken) {
      return { afspraken: [], googleNietGekoppeld: true }
    }
    if (!user.googleClientId || !user.googleClientSecret) {
      return { afspraken: [], fout: 'Google OAuth-gegevens ontbreken. Vul Client ID en Client Secret in bij Instellingen → Google Agenda.' }
    }

    let accessToken = user.googleAccessToken
    if (!accessToken || (user.googleTokenExpiry && new Date() >= user.googleTokenExpiry)) {
      try {
        const nieuwTokens = await vernieuwAccessToken(user.googleRefreshToken, user.googleClientId, user.googleClientSecret)
        accessToken = nieuwTokens.access_token
        await prisma.user.updateMany({
          data: { googleAccessToken: accessToken, googleTokenExpiry: new Date(Date.now() + nieuwTokens.expires_in * 1000) }
        })
      } catch (e) {
        return { afspraken: [], fout: `Token vernieuwen mislukt: ${e instanceof Error ? e.message : 'Onbekende fout'}` }
      }
    }

    const nu = new Date()
    const vanDatum = params?.van ? new Date(params.van) : new Date(nu.getFullYear(), nu.getMonth(), 1)
    const totDatum = params?.tot ? new Date(params.tot) : new Date(nu.getFullYear(), nu.getMonth() + 2, 0)

    try {
      const afspraken = await haalAgendaAfspraken(accessToken!, vanDatum, totDatum)
      return { afspraken }
    } catch (e) {
      return { afspraken: [], fout: e instanceof Error ? e.message : 'Agenda ophalen mislukt' }
    }
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

      const user = await prisma.user.findFirst({ select: { pdfMapPad: true } })
      const pdfPad = user?.pdfMapPad
        ? join(user.pdfMapPad, `factuur-${factuur.nummer}.pdf`)
        : `factuur-${factuur.nummer}.pdf`

      const result = await dialog.showSaveDialog(parentWindow, {
        defaultPath: pdfPad,
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

  ipcMain.handle('bank:importeerCsv', async (_, { bank, filePath }: { bank: 'abn' | 'ing' | 'rabobank' | 'knab'; filePath: string }) => {
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
          const omschrijving = (velden[omschrijvingIdx] ?? naam) || 'Onbekend'

          transacties.push({
            datum,
            omschrijving: omschrijving || 'Onbekend',
            bedrag,
            type: bedrag < 0 ? 'uitgave' : 'inkomen'
          })
        } else if (bank === 'knab') {
          // KNAB: Datum;Naam / Omschrijving;IBAN;Type;Af/Bij;Bedrag (EUR);Balans na boeking;...
          const idx = (naam: string) => header.findIndex(h => h.toLowerCase().includes(naam.toLowerCase()))
          const datumIdx = idx('datum')
          const omschrijvingIdx = idx('naam')
          const afBijIdx = header.findIndex(h => h.toLowerCase().replace(' ', '') === 'af/bij' || h.toLowerCase() === 'af/bij')
          const bedragIdx = header.findIndex(h => h.toLowerCase().includes('bedrag') && !h.toLowerCase().includes('balans'))

          if (datumIdx < 0 || bedragIdx < 0) continue

          const datumRaw = velden[datumIdx] ?? ''
          let datum = datumRaw
          if (/^\d{2}-\d{2}-\d{4}$/.test(datumRaw)) {
            const parts = datumRaw.split('-')
            datum = `${parts[2]}-${parts[1]}-${parts[0]}`
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(datumRaw)) {
            datum = datumRaw
          }

          const omschrijving = omschrijvingIdx >= 0 ? (velden[omschrijvingIdx] ?? '') : ''
          const bedragStr = (velden[bedragIdx] ?? '').replace(/\./g, '').replace(',', '.')
          const bedragAbs = Math.abs(parseFloat(bedragStr) || 0)
          const afBij = afBijIdx >= 0 ? (velden[afBijIdx] ?? '').toLowerCase() : ''
          const isDebet = afBij === 'af' || afBij === 'debet'

          transacties.push({
            datum,
            omschrijving: omschrijving || 'Onbekend',
            bedrag: isDebet ? -bedragAbs : bedragAbs,
            type: isDebet ? 'uitgave' : 'inkomen'
          })
        }
      } catch {
        continue
      }
    }

    return { transacties, headers: header, autoHerkend: transacties.length > 0 }
  })

  // Lees ruwe CSV-data terug voor handmatige kolomkoppeling
  ipcMain.handle('bank:leesRuweData', async (_, filePath: string) => {
    const inhoud = fs.readFileSync(filePath, 'utf-8')
    const regels = inhoud.split('\n').map(r => r.trim()).filter(r => r.length > 0)

    function parseerCsvRij(rij: string): string[] {
      const velden: string[] = []
      let huidig = ''
      let inQuotes = false
      for (let i = 0; i < rij.length; i++) {
        const c = rij[i]
        if (c === '"') { inQuotes = !inQuotes }
        else if ((c === ',' || c === ';') && !inQuotes) { velden.push(huidig.trim()); huidig = '' }
        else { huidig += c }
      }
      velden.push(huidig.trim())
      return velden.map(v => v.replace(/^"|"$/g, '').trim())
    }

    const headers = regels[0] ? parseerCsvRij(regels[0]) : []
    const preview = regels.slice(1, 6).map(r => parseerCsvRij(r))
    const alleRijen = regels.slice(1).map(r => parseerCsvRij(r)).filter(r => r.some(v => v))
    return { headers, preview, alleRijen }
  })

  // Importeer transacties met handmatige kolomkoppeling
  ipcMain.handle('bank:importeerMetMapping', async (_, { alleRijen, mapping, datumFormaat }: {
    alleRijen: string[][]
    mapping: { datum: number; omschrijving: number; bedrag: number; afBij?: number; debitCredit?: number }
    datumFormaat?: string
  }) => {
    function parseerDatum(raw: string): string {
      const s = raw.trim()
      if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
      if (/^\d{2}-\d{2}-\d{4}$/.test(s)) { const [d, m, y] = s.split('-'); return `${y}-${m}-${d}` }
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}` }
      if (/^\d{2}-\d{2}-\d{2}$/.test(s) && datumFormaat === 'DD-MM-YY') {
        const [d, m, y] = s.split('-')
        return `20${y}-${m}-${d}`
      }
      return s
    }

    const transacties: Array<{ datum: string; omschrijving: string; bedrag: number; type: 'inkomen' | 'uitgave' }> = []
    for (const rij of alleRijen) {
      try {
        const datum = parseerDatum(rij[mapping.datum] ?? '')
        const omschrijving = (rij[mapping.omschrijving] ?? '').trim() || 'Onbekend'
        const bedragStr = (rij[mapping.bedrag] ?? '').replace(/\./g, '').replace(',', '.')
        let bedrag = parseFloat(bedragStr) || 0

        if (mapping.afBij !== undefined) {
          const afBijWaarde = (rij[mapping.afBij] ?? '').toLowerCase().trim()
          if (afBijWaarde === 'af' || afBijWaarde === 'd' || afBijWaarde === 'debet') {
            bedrag = -Math.abs(bedrag)
          } else {
            bedrag = Math.abs(bedrag)
          }
        } else if (mapping.debitCredit !== undefined) {
          const dc = (rij[mapping.debitCredit] ?? '').toLowerCase().trim()
          if (dc === 'debit' || dc === 'd') bedrag = -Math.abs(bedrag)
          else bedrag = Math.abs(bedrag)
        }

        if (!datum) continue
        transacties.push({ datum, omschrijving, bedrag, type: bedrag < 0 ? 'uitgave' : 'inkomen' })
      } catch { continue }
    }
    return transacties
  })

  ipcMain.handle('bank:controleerDuplicaten', async () => {
    const [latestInkomen, latestUitgave] = await Promise.all([
      prisma.inkomen.findFirst({ orderBy: { datum: 'desc' }, select: { datum: true } }),
      prisma.uitgave.findFirst({ orderBy: { datum: 'desc' }, select: { datum: true } }),
    ])
    const dates = [latestInkomen?.datum, latestUitgave?.datum].filter(Boolean) as Date[]
    if (dates.length === 0) return { latesteDatum: null }
    const max = new Date(Math.max(...dates.map(d => d.getTime())))
    return { latesteDatum: max.toISOString().split('T')[0] }
  })

  // ── Historische facturen importeren ──
  ipcMain.handle('facturen:importeerHistorisch', async (_, payload: {
    nummer: string
    klantId: string
    datum: string
    vervaldatum: string
    status: string
    subtotaal: number
    btwBedrag: number
    totaal: number
    notities?: string
    betalingsCondities?: string
    btwVerlegd?: boolean
    verzondenOp?: string
    betaaldOp?: string
    handmatigBedrag: boolean
    regels: Array<{
      omschrijving: string
      aantal: number
      prijs: number
      btwPercentage: number
      kortingPercentage?: number
      totaal: number
    }>
  }) => {
    const bestaand = await prisma.factuur.findUnique({ where: { nummer: payload.nummer } })
    if (bestaand) throw new Error(`Factuurnummer ${payload.nummer} bestaat al in het systeem.`)

    const factuur = await prisma.factuur.create({
      data: {
        nummer: payload.nummer,
        klantId: payload.klantId,
        datum: new Date(payload.datum),
        vervaldatum: new Date(payload.vervaldatum),
        status: payload.status,
        subtotaal: payload.subtotaal,
        btwBedrag: payload.btwBedrag,
        kortingBedrag: 0,
        kortingPercentage: 0,
        totaal: payload.totaal,
        notities: payload.notities,
        betalingsCondities: payload.betalingsCondities,
        btwVerlegd: payload.btwVerlegd ?? false,
        historisch: true,
        handmatigBedrag: payload.handmatigBedrag,
        verzondenOp: payload.verzondenOp ? new Date(payload.verzondenOp) : undefined,
        regels: {
          create: payload.regels.map((r, i) => ({
            omschrijving: r.omschrijving,
            aantal: r.aantal,
            prijs: r.prijs,
            btwPercentage: r.btwPercentage,
            kortingPercentage: r.kortingPercentage ?? 0,
            totaal: r.totaal,
            volgorde: i,
          }))
        }
      },
      include: { klant: true, regels: true }
    })

    if (payload.status === 'BETAALD' && payload.betaaldOp) {
      await prisma.inkomen.create({
        data: {
          datum: new Date(payload.betaaldOp),
          omschrijving: `Betaling factuur ${payload.nummer}`,
          bedrag: payload.totaal,
          factuurId: factuur.id,
          bron: 'Historisch',
        }
      })
    }

    return factuur
  })

  // Haal onbetaalde facturen op voor meldingen
  ipcMain.handle('facturen:onbetaaldeMeldingen', async () => {
    const user = await prisma.user.findFirst({ select: { onbetaaldeFactuurMelding: true } })
    if (!user?.onbetaaldeFactuurMelding) return { facturen: [] }

    const nu = new Date()
    const over7Dagen = new Date(nu.getTime() + 7 * 24 * 60 * 60 * 1000)

    const facturen = await prisma.factuur.findMany({
      where: {
        status: { in: ['VERZONDEN', 'VERLOPEN'] },
        OR: [
          { vervaldatum: { lt: nu } }, // al vervallen
          { vervaldatum: { lte: over7Dagen, gte: nu } }, // vervalt binnen 7 dagen
        ]
      },
      include: { klant: true },
      orderBy: { vervaldatum: 'asc' },
    })

    return {
      facturen: facturen.map(f => ({
        id: f.id,
        nummer: f.nummer,
        klantNaam: f.klant.bedrijf ?? f.klant.naam,
        totaal: f.totaal,
        vervaldatum: f.vervaldatum.toISOString(),
        status: f.status,
        dagenTeLaat: f.vervaldatum < nu ? Math.floor((nu.getTime() - f.vervaldatum.getTime()) / 86400000) : 0,
        dagenTotVervaldatum: f.vervaldatum >= nu ? Math.ceil((f.vervaldatum.getTime() - nu.getTime()) / 86400000) : 0,
      }))
    }
  })

  // ── Uren → Factuur ──
  ipcMain.handle('uren:factuurAanmaken', async (_, { urenIds, klantId, uurtarief }: { urenIds: string[]; klantId: string; uurtarief?: number }) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')

    const urenRegistraties = await prisma.uurregistratie.findMany({ where: { id: { in: urenIds } } })
    if (urenRegistraties.length === 0) throw new Error('Geen urenregistraties gevonden')

    const nummer = await genereerNummer(user.factuurPrefix, 'factuur')

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

  // ── Audit Log ──
  ipcMain.handle('audit:list', async (_, factuurId: string) => {
    return prisma.auditLog.findMany({
      where: { factuurId },
      orderBy: { aangemaakt: 'desc' }
    })
  })

  ipcMain.handle('audit:create', async (_, data: { factuurId: string; actie: string; details?: string }) => {
    return prisma.auditLog.create({ data })
  })

  // ── Autostart ──
  ipcMain.handle('app:getAutoStart', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('app:setAutoStart', (_, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return { succes: true }
  })

  // ── Database backup ──
  ipcMain.handle('app:backup', async () => {
    const dbPath = is.dev
      ? join(process.cwd(), 'dev.db')
      : join(app.getPath('userData'), 'adminpro.db')

    const result = await dialog.showSaveDialog({
      title: 'Database backup opslaan',
      defaultPath: `streamline-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Database', extensions: ['db'] }]
    })

    if (!result.filePath) return { geannuleerd: true }

    fs.copyFileSync(dbPath, result.filePath)
    return { succes: true, pad: result.filePath }
  })

  // ── PDF map kiezen ──
  ipcMain.handle('app:kiesPdfMap', async () => {
    const result = await dialog.showOpenDialog({
      title: 'PDF-map selecteren',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('app:exporteerData', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Kies map voor data-export',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled) return { geannuleerd: true }

    const doelMap = result.filePaths[0]
    const bom = '﻿' // UTF-8 BOM voor Excel

    function naarCsv(headers: string[], rijen: unknown[][]): string {
      const esc = (v: unknown) => {
        const s = v == null ? '' : String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s
      }
      return [headers, ...rijen].map(r => (r as unknown[]).map(esc).join(',')).join('\r\n')
    }

    const user = await prisma.user.findFirst()
    const kmVergoeding = user?.kmVergoeding ?? 0.23

    const [klanten, facturen, factuurRegels, uren, ritten, inkomen, uitgaven, categorieën] = await Promise.all([
      prisma.klant.findMany({ orderBy: { naam: 'asc' } }),
      prisma.factuur.findMany({ include: { klant: true }, orderBy: { datum: 'desc' } }),
      prisma.factuurRegel.findMany({ orderBy: { factuurId: 'asc' } }),
      prisma.uurregistratie.findMany({ include: { klant: true }, orderBy: { startTijd: 'desc' } }),
      prisma.rit.findMany({ orderBy: { datum: 'desc' } }),
      prisma.inkomen.findMany({ orderBy: { datum: 'desc' } }),
      prisma.uitgave.findMany({ include: { categorie: true }, orderBy: { datum: 'desc' } }),
      prisma.categorie.findMany({ orderBy: { naam: 'asc' } }),
    ])

    const bestanden: Array<{ naam: string; inhoud: string }> = [
      {
        naam: 'klanten.csv',
        inhoud: naarCsv(
          ['ID', 'Naam', 'Bedrijf', 'Email', 'Telefoon', 'Adres', 'Postcode', 'Stad', 'Land', 'KvK', 'BTW-nummer', 'Betaaltermijn', 'Taal', 'Notities'],
          klanten.map(k => [k.id, k.naam, k.bedrijf, k.email, k.telefoon, k.adres, k.postcode, k.stad, k.land, k.kvkNummer, k.btwNummer, k.betaalTermijn, k.taal, k.notities])
        )
      },
      {
        naam: 'facturen.csv',
        inhoud: naarCsv(
          ['ID', 'Nummer', 'Klant', 'Datum', 'Vervaldatum', 'Status', 'Subtotaal', 'BTW', 'Totaal', 'Taal', 'Notities'],
          facturen.map(f => [f.id, f.nummer, f.klant.naam, f.datum.toISOString().split('T')[0], f.vervaldatum.toISOString().split('T')[0], f.status, f.subtotaal, f.btwBedrag, f.totaal, f.taal, f.notities])
        )
      },
      {
        naam: 'factuur_regels.csv',
        inhoud: naarCsv(
          ['Factuur ID', 'Omschrijving', 'Aantal', 'Eenheid', 'Prijs', 'BTW%', 'Korting%', 'Totaal'],
          factuurRegels.map(r => [r.factuurId, r.omschrijving, r.aantal, r.eenheid, r.prijs, r.btwPercentage, r.kortingPercentage, r.totaal])
        )
      },
      {
        naam: 'uren.csv',
        inhoud: naarCsv(
          ['ID', 'Klant', 'Project', 'Start', 'Einde', 'Duur (min)', 'Uurtarief', 'Gefactureerd', 'Omschrijving', 'Notities'],
          uren.map(u => [
            u.id,
            u.klant?.naam ?? '',
            u.projectNaam ?? '',
            u.startTijd.toISOString(),
            u.eindTijd?.toISOString() ?? '',
            u.duur ?? '',
            u.uurtarief ?? '',
            u.gefactureerd ? 'Ja' : 'Nee',
            u.omschrijving,
            u.notities ?? ''
          ])
        )
      },
      {
        naam: 'kilometers.csv',
        inhoud: naarCsv(
          ['ID', 'Datum', 'Van', 'Naar', 'Kilometers', 'Retour', 'Zakelijk', 'Vergoeding (EUR)', 'Omschrijving', 'Notities'],
          ritten.map(r => [
            r.id,
            r.datum.toISOString().split('T')[0],
            r.van,
            r.naar,
            r.kilometers,
            r.retour ? 'Ja' : 'Nee',
            r.zakelijk ? 'Ja' : 'Nee',
            (r.kilometers * kmVergoeding).toFixed(2),
            r.omschrijving,
            r.notities ?? ''
          ])
        )
      },
      {
        naam: 'inkomen.csv',
        inhoud: naarCsv(
          ['ID', 'Datum', 'Omschrijving', 'Bedrag', 'Bron', 'Notities'],
          inkomen.map(i => [i.id, i.datum.toISOString().split('T')[0], i.omschrijving, i.bedrag, i.bron ?? '', i.notities ?? ''])
        )
      },
      {
        naam: 'uitgaven.csv',
        inhoud: naarCsv(
          ['ID', 'Datum', 'Omschrijving', 'Bedrag', 'BTW%', 'BTW bedrag', 'Categorie', 'Leverancier', 'Zakelijk%', 'Notities'],
          uitgaven.map(u => [u.id, u.datum.toISOString().split('T')[0], u.omschrijving, u.bedrag, u.btwPercentage, u.btwBedrag, u.categorie?.naam ?? '', u.leverancier ?? '', u.zakelijkPercent, u.notities ?? ''])
        )
      },
      {
        naam: 'categorieën.csv',
        inhoud: naarCsv(
          ['ID', 'Naam', 'Standaard BTW%'],
          categorieën.map(c => [c.id, c.naam, c.standaardBtwTarief ?? ''])
        )
      },
    ]

    for (const bestand of bestanden) {
      fs.writeFileSync(join(doelMap, bestand.naam), bom + bestand.inhoud, 'utf8')
    }

    return { succes: true, pad: doelMap }
  })

  ipcMain.handle('mollie:maakBetaalLink', async (_, factuurId: string) => {
    const user = await prisma.user.findFirst()
    if (!user?.mollieApiKey) throw new Error('Geen Mollie API-sleutel geconfigureerd in Instellingen')

    const factuur = await prisma.factuur.findUnique({ where: { id: factuurId } })
    if (!factuur) throw new Error('Factuur niet gevonden')

    const response = await fetch('https://api.mollie.com/v2/payment-links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.mollieApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: factuur.totaal.toFixed(2) },
        description: `Factuur ${factuur.nummer}`,
      }),
    })

    if (!response.ok) {
      const fout = await response.json() as { detail?: string; message?: string }
      throw new Error(fout.detail || fout.message || `Mollie API fout (${response.status})`)
    }

    const data = await response.json() as { _links?: { paymentLink?: { href: string } } }
    const betaalLink = data._links?.paymentLink?.href ?? ''

    await prisma.factuur.update({ where: { id: factuurId }, data: { mollieBetaalLink: betaalLink } })
    return { url: betaalLink }
  })
}

app.whenReady().then(async () => {
  initPrisma()

  // Voer database migratie uit bij eerste start
  try {
    const { execSync } = require('child_process')
    const prismaPath = is.dev
      ? join(process.cwd(), 'node_modules/.bin/prisma')
      : join(process.resourcesPath, 'node_modules/.bin/prisma')
    // In productie: gebruik prisma migrate deploy
    // In dev: skip (al gedaan door developer)
    if (!is.dev) {
      const migrationsPath = join(process.resourcesPath, 'migrations')
      process.env.DATABASE_URL = `file:${join(app.getPath('userData'), 'adminpro.db')}`
      execSync(`"${prismaPath}" migrate deploy --schema="${join(process.resourcesPath, 'schema.prisma')}"`, {
        env: { ...process.env }
      })
    }
    logSchrijven('Database migratie succesvol')
  } catch (e) {
    logSchrijven(`Database migratie fout (niet kritiek): ${e}`)
  }

  setupIpcHandlers()
  createWindow()

  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify().catch(e => logSchrijven(`Update check fout: ${e}`))
  }

  // Maak terugkerende facturen aan bij opstarten
  maakTermijnFacturen().catch(e => console.error('Fout bij opstarten terugkerende facturen:', e))
  stuurHerinneringen().catch(e => console.error('Fout bij sturen herinneringen:', e))

  // Notificatie voor vervallen facturen
  setTimeout(async () => {
    try {
      const nu = new Date()
      const vervallenFacturen = await prisma.factuur.findMany({
        where: { status: 'VERZONDEN', vervaldatum: { lt: nu } },
        include: { klant: true }
      })
      if (vervallenFacturen.length > 0 && mainWindow) {
        const { Notification } = require('electron')
        new Notification({
          title: 'Streamline Facturatie',
          body: `${vervallenFacturen.length} factuur${vervallenFacturen.length > 1 ? 'en zijn' : ' is'} vervallen en wacht${vervallenFacturen.length > 1 ? 'en' : ''} op betaling.`
        }).show()
      }
    } catch {}
  }, 3000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
