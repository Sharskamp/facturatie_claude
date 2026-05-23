import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join, extname, basename } from 'path'
import { is } from '@electron-toolkit/utils'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'
import * as fs from 'fs'
import * as http from 'http'
import * as net from 'net'
import { DOMParser } from '@xmldom/xmldom'
import { verstuurEmail, maakFactuurEmailHtml } from '../lib/email'
import { haalAgendaAfspraken, haalKalenderLijst, maakGoogleAfspraak, wijzigGoogleAfspraak, verwijderGoogleAfspraak, maakGoogleAuthUrl, wisselCodeVoorTokens, vernieuwAccessToken } from '../lib/google-calendar'
import { autoUpdater } from 'electron-updater'
import * as os from 'os'

app.setName('Streamline Facturatie')

let prisma: PrismaClient
let mainWindow: BrowserWindow | null = null
let bankWatcher: fs.FSWatcher | null = null
const geimporteerdeBank = new Set<string>()

async function startBankWatcher() {
  if (bankWatcher) { bankWatcher.close(); bankWatcher = null }
  try {
    const user = await prisma.user.findFirst()
    const map = (user as Record<string, unknown>)?.bankAfschriftenMap as string | null
    if (!map || !fs.existsSync(map)) return
    bankWatcher = fs.watch(map, (_event, filename) => {
      if (!filename) return
      const vollePad = join(map, filename)
      if (geimporteerdeBank.has(vollePad)) return
      const ext = extname(filename).toLowerCase()
      if (!['.csv', '.mt940', '.xml'].includes(ext)) return
      setTimeout(() => {
        if (!fs.existsSync(vollePad) || geimporteerdeBank.has(vollePad)) return
        geimporteerdeBank.add(vollePad)
        mainWindow?.webContents.send('bank:nieuw-bestand', { pad: vollePad, naam: filename })
      }, 1000)
    })
  } catch {}
}

const logBestand = join(app.getPath('userData'), 'app.log')
function logSchrijven(bericht: string) {
  const regel = `[${new Date().toISOString()}] ${bericht}\n`
  try { fs.appendFileSync(logBestand, regel) } catch {}
}

function getDbPath(): string {
  return is.dev
    ? join(process.cwd(), 'dev.db')
    : join(app.getPath('userData'), 'adminpro.db')
}

function runMigratie(dbPath: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3')
  const db = new Database(dbPath)

  // WAL mode: betere crash-recovery en betere gelijktijdige lees-toegang
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA foreign_keys=ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS "Rit" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "datum" DATETIME NOT NULL,
      "omschrijving" TEXT NOT NULL,
      "van" TEXT NOT NULL,
      "naar" TEXT NOT NULL,
      "kilometers" REAL NOT NULL,
      "retour" BOOLEAN NOT NULL DEFAULT false,
      "zakelijk" BOOLEAN NOT NULL DEFAULT true,
      "notities" TEXT,
      "gefactureerd" BOOLEAN NOT NULL DEFAULT false,
      "factuurId" TEXT,
      "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "bijgewerkt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "factuurId" TEXT,
      "actie" TEXT NOT NULL,
      "details" TEXT,
      "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "Product" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "naam" TEXT NOT NULL,
      "omschrijving" TEXT,
      "prijs" REAL NOT NULL DEFAULT 0,
      "eenheid" TEXT DEFAULT 'stuks',
      "btwPercentage" REAL NOT NULL DEFAULT 21,
      "actief" BOOLEAN NOT NULL DEFAULT true,
      "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "bijgewerkt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "KlantNotitie" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "klantId" TEXT NOT NULL,
      "tekst" TEXT NOT NULL,
      "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "KlantNotitie_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE IF NOT EXISTS "Crediteur" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "leverancier" TEXT NOT NULL,
      "factuurNummer" TEXT,
      "factuurdatum" DATETIME NOT NULL,
      "vervaldatum" DATETIME NOT NULL,
      "bedrag" REAL NOT NULL,
      "btwBedrag" REAL NOT NULL DEFAULT 0,
      "btwPercentage" REAL NOT NULL DEFAULT 21,
      "status" TEXT NOT NULL DEFAULT 'OPENSTAAND',
      "betaaldOp" DATETIME,
      "notities" TEXT,
      "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "bijgewerkt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const kolomToevoegen = (tabel: string, kolom: string, definitie: string) => {
    try { db.exec(`ALTER TABLE "${tabel}" ADD COLUMN "${kolom}" ${definitie}`) } catch {}
  }

  // User — nieuwe kolommen
  kolomToevoegen('User', 'kmVergoeding', 'REAL NOT NULL DEFAULT 0.23')
  kolomToevoegen('User', 'anthropicApiKey', 'TEXT')
  kolomToevoegen('User', 'openaiApiKey', 'TEXT')
  kolomToevoegen('User', 'aiModel', "TEXT NOT NULL DEFAULT 'claude'")
  kolomToevoegen('User', 'donkerModus', "TEXT NOT NULL DEFAULT 'systeem'")
  kolomToevoegen('User', 'autoStart', 'BOOLEAN NOT NULL DEFAULT false')
  kolomToevoegen('User', 'pdfMapPad', 'TEXT')
  kolomToevoegen('User', 'mollieApiKey', 'TEXT')
  kolomToevoegen('User', 'emailAanhef', 'TEXT')
  kolomToevoegen('User', 'emailAfsluitingsTekst', 'TEXT')
  kolomToevoegen('User', 'logoBase64', 'TEXT')
  kolomToevoegen('User', 'factuurNummerFormaat', "TEXT NOT NULL DEFAULT '{PREFIX}{JAAR}-{NNNN}'")
  kolomToevoegen('User', 'korWaarschuwing', 'BOOLEAN NOT NULL DEFAULT true')
  kolomToevoegen('User', 'standaardCreditnotaPrefix', "TEXT NOT NULL DEFAULT 'CN'")
  kolomToevoegen('User', 'googleClientId', 'TEXT')
  kolomToevoegen('User', 'googleClientSecret', 'TEXT')
  kolomToevoegen('User', 'layoutPrimairKleur', "TEXT NOT NULL DEFAULT '#4f46e5'")
  kolomToevoegen('User', 'layoutSecundairKleur', 'TEXT')
  kolomToevoegen('User', 'layoutLettertype', "TEXT NOT NULL DEFAULT 'Arial, sans-serif'")
  kolomToevoegen('User', 'layoutKoptekst', 'TEXT')
  kolomToevoegen('User', 'layoutVoettekst', 'TEXT')
  kolomToevoegen('User', 'layoutLogoPositie', "TEXT NOT NULL DEFAULT 'links'")
  kolomToevoegen('User', 'layoutToonBtwNummer', 'BOOLEAN NOT NULL DEFAULT true')
  kolomToevoegen('User', 'layoutToonKvkNummer', 'BOOLEAN NOT NULL DEFAULT true')
  kolomToevoegen('User', 'layoutToonIban', 'BOOLEAN NOT NULL DEFAULT true')
  kolomToevoegen('User', 'layoutToonQrCode', 'BOOLEAN NOT NULL DEFAULT true')
  kolomToevoegen('User', 'layoutRegelSpacing', "TEXT NOT NULL DEFAULT 'normaal'")
  kolomToevoegen('User', 'layoutLetterGrootte', "TEXT NOT NULL DEFAULT '14'")
  kolomToevoegen('User', 'layoutLogoGrootte', "TEXT NOT NULL DEFAULT 'medium'")
  kolomToevoegen('User', 'layoutMarges', "TEXT NOT NULL DEFAULT 'normaal'")
  kolomToevoegen('User', 'layoutSectieVolgorde', "TEXT NOT NULL DEFAULT '[]'")
  kolomToevoegen('User', 'onbetaaldeFactuurMelding', 'BOOLEAN NOT NULL DEFAULT true')
  kolomToevoegen('User', 'factuurHtmlTemplate', 'TEXT')
  kolomToevoegen('User', 'offerteGeldigheidDagen', 'INTEGER NOT NULL DEFAULT 30')
  kolomToevoegen('User', 'verborgenPaginas', "TEXT NOT NULL DEFAULT '[]'")
  kolomToevoegen('User', 'bankWeergaveVelden', "TEXT NOT NULL DEFAULT '[\"datum\",\"omschrijving\",\"tegenrekeningNaam\",\"tegenrekening\",\"mutatiesoort\",\"mededelingen\",\"saldoNaBoeking\",\"bedrag\",\"bron\",\"factuur\"]'")
  kolomToevoegen('User', 'korIngangsDatum', 'TEXT')
  kolomToevoegen('User', 'uitgavenWeergaveVelden', "TEXT NOT NULL DEFAULT '[\"datum\",\"omschrijving\",\"leverancier\",\"categorie\",\"bedrag\",\"btw\",\"totaal\"]'")
  kolomToevoegen('User', 'spaarrekeningen', "TEXT NOT NULL DEFAULT '[]'")
  // Email template uitbreidingen
  kolomToevoegen('User', 'emailFactuurOnderwerp', 'TEXT')
  kolomToevoegen('User', 'emailHerinneringOnderwerp', 'TEXT')
  kolomToevoegen('User', 'emailHerinneringTekst', 'TEXT')
  // Agenda afspraakherinneringen
  kolomToevoegen('User', 'agendaHerinneringActief', 'BOOLEAN NOT NULL DEFAULT false')
  kolomToevoegen('User', 'agendaHerinneringModus', "TEXT NOT NULL DEFAULT 'vooraf'")
  kolomToevoegen('User', 'agendaHerinneringVoorafUren', 'INTEGER NOT NULL DEFAULT 2')
  kolomToevoegen('User', 'agendaHerinneringDagen', 'INTEGER NOT NULL DEFAULT 1')
  kolomToevoegen('User', 'agendaHerinneringTijd', "TEXT NOT NULL DEFAULT '09:00'")
  // BCC en e-mailsjablonen uitbreidingen
  kolomToevoegen('User', 'emailBcc', 'TEXT')
  kolomToevoegen('User', 'emailBevestigingOnderwerp', 'TEXT')
  kolomToevoegen('User', 'emailBevestigingTekst', 'TEXT')
  kolomToevoegen('User', 'emailFactuurTekst', 'TEXT')

  // Klant — nieuwe kolommen
  kolomToevoegen('Klant', 'betaalTermijn', 'INTEGER')
  kolomToevoegen('Klant', 'taal', "TEXT NOT NULL DEFAULT 'nl'")
  kolomToevoegen('Klant', 'afspraakHerinneringActief', 'BOOLEAN')
  kolomToevoegen('Klant', 'afspraakHerinneringModus', 'TEXT')
  kolomToevoegen('Klant', 'afspraakHerinneringVoorafUren', 'INTEGER')
  kolomToevoegen('Klant', 'afspraakHerinneringDagen', 'INTEGER')
  kolomToevoegen('Klant', 'afspraakHerinneringTijd', 'TEXT')

  // Inkomen — nieuwe kolommen
  kolomToevoegen('Inkomen', 'geboektAlsOmzet', 'BOOLEAN NOT NULL DEFAULT false')
  kolomToevoegen('Inkomen', 'betalingskenmerk', 'TEXT')
  kolomToevoegen('Uitgave', 'tegenrekening', 'TEXT')
  // Verwijder automatisch aangemaakte inkomen-regels voor historische facturen — deze horen niet in bankimport-overzicht
  try { db.exec(`DELETE FROM "Inkomen" WHERE "bron" = 'Historisch' AND "factuurId" IS NOT NULL`) } catch {}
  kolomToevoegen('Inkomen', 'tegenrekeningNaam', 'TEXT')
  kolomToevoegen('Inkomen', 'tegenrekening', 'TEXT')
  kolomToevoegen('Inkomen', 'mutatiesoort', 'TEXT')
  kolomToevoegen('Inkomen', 'mededelingen', 'TEXT')
  kolomToevoegen('Inkomen', 'saldoNaBoeking', 'TEXT')
  // Bestaande handmatige inkomenregels (niet-bank, niet-historisch, niet gekoppeld aan factuur) tellen mee als omzet
  try { db.exec(`UPDATE "Inkomen" SET "geboektAlsOmzet" = true WHERE "factuurId" IS NULL AND ("bron" IS NULL OR ("bron" != 'Bankimport' AND "bron" != 'Historisch'))`) } catch {}

  // Factuur — nieuwe kolommen
  kolomToevoegen('Factuur', 'geplandVerzendOp', 'DATETIME')
  kolomToevoegen('Factuur', 'creditNotaVoorId', 'TEXT')
  kolomToevoegen('Factuur', 'totaalKorting', 'REAL NOT NULL DEFAULT 0')
  kolomToevoegen('Factuur', 'totaalKortingBedrag', 'REAL NOT NULL DEFAULT 0')
  kolomToevoegen('Factuur', 'taal', "TEXT NOT NULL DEFAULT 'nl'")
  kolomToevoegen('Factuur', 'mollieBetaalLink', 'TEXT')
  kolomToevoegen('Factuur', 'molliePaymentLinkId', 'TEXT')
  kolomToevoegen('Factuur', 'historisch', 'BOOLEAN NOT NULL DEFAULT false')
  kolomToevoegen('Factuur', 'handmatigBedrag', 'BOOLEAN NOT NULL DEFAULT false')
  kolomToevoegen('Factuur', 'handmatigBetaald', 'BOOLEAN NOT NULL DEFAULT false')
  kolomToevoegen('Factuur', 'bronBestandPad', 'TEXT')

  // Offerte — nieuwe kolommen
  kolomToevoegen('Offerte', 'totaalKorting', 'REAL NOT NULL DEFAULT 0')
  kolomToevoegen('Offerte', 'totaalKortingBedrag', 'REAL NOT NULL DEFAULT 0')

  // Categorie — nieuwe kolommen
  kolomToevoegen('Categorie', 'standaardBtwTarief', 'REAL')

  // Indexes
  try { db.exec('CREATE INDEX IF NOT EXISTS "Rit_datum_idx" ON "Rit"("datum")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Rit_gefactureerd_idx" ON "Rit"("gefactureerd")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "KlantNotitie_klantId_idx" ON "KlantNotitie"("klantId")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Crediteur_status_idx" ON "Crediteur"("status")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Crediteur_vervaldatum_idx" ON "Crediteur"("vervaldatum")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Factuur_klantId_idx" ON "Factuur"("klantId")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Factuur_status_idx" ON "Factuur"("status")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Factuur_datum_idx" ON "Factuur"("datum")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Factuur_status_datum_idx" ON "Factuur"("status", "datum")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Offerte_klantId_idx" ON "Offerte"("klantId")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Offerte_status_idx" ON "Offerte"("status")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Inkomen_factuurId_idx" ON "Inkomen"("factuurId")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Inkomen_datum_idx" ON "Inkomen"("datum")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Uitgave_datum_idx" ON "Uitgave"("datum")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Uitgave_categorieId_idx" ON "Uitgave"("categorieId")') } catch {}

  kolomToevoegen('User', 'googlePrimaryCalendarId', 'TEXT')

  db.exec(`CREATE TABLE IF NOT EXISTS "AgendaAfspraakData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "klantId" TEXT,
    "klantIds" TEXT,
    "locatie" TEXT,
    "regels" TEXT,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  try { db.exec('ALTER TABLE "AgendaAfspraakData" ADD COLUMN "klantIds" TEXT') } catch {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "AgendaAfspraakData_eventId_key" ON "AgendaAfspraakData"("eventId")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "AgendaAfspraakData_eventId_idx" ON "AgendaAfspraakData"("eventId")') } catch {}

  db.exec(`CREATE TABLE IF NOT EXISTS "FactuurSjabloon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "naam" TEXT NOT NULL,
    "regels" TEXT NOT NULL DEFAULT '[]',
    "notities" TEXT,
    "betalingsCondities" TEXT,
    "btwVerlegd" BOOLEAN NOT NULL DEFAULT false,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "naam" TEXT NOT NULL,
    "bestandsPad" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referentieId" TEXT NOT NULL,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  try { db.exec('CREATE INDEX IF NOT EXISTS "Document_referentieId_idx" ON "Document"("referentieId")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "Document_type_referentieId_idx" ON "Document"("type", "referentieId")') } catch {}

  kolomToevoegen('User', 'bankAfschriftenMap', 'TEXT')

  // InkomenFactuur — junction tabel voor M:M koppeling betaling ↔ factuur
  db.exec(`CREATE TABLE IF NOT EXISTS "InkomenFactuur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inkomstenId" TEXT NOT NULL,
    "factuurId" TEXT NOT NULL,
    "bedrag" REAL NOT NULL,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InkomenFactuur_inkomstenId_fkey" FOREIGN KEY ("inkomstenId") REFERENCES "Inkomen" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InkomenFactuur_factuurId_fkey" FOREIGN KEY ("factuurId") REFERENCES "Factuur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`)
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "InkomenFactuur_inkomstenId_factuurId_key" ON "InkomenFactuur"("inkomstenId", "factuurId")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "InkomenFactuur_inkomstenId_idx" ON "InkomenFactuur"("inkomstenId")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS "InkomenFactuur_factuurId_idx" ON "InkomenFactuur"("factuurId")') } catch {}
  // Migreer bestaande Inkomen.factuurId koppelingen naar InkomenFactuur
  try {
    db.exec(`
      INSERT OR IGNORE INTO "InkomenFactuur" ("id", "inkomstenId", "factuurId", "bedrag", "aangemaakt")
      SELECT lower(hex(randomblob(16))), "id", "factuurId", "bedrag", COALESCE("aangemaakt", CURRENT_TIMESTAMP)
      FROM "Inkomen" WHERE "factuurId" IS NOT NULL
    `)
  } catch {}

  // Seed default categories if none exist
  const catCount = (db.prepare('SELECT COUNT(*) as count FROM "Categorie"').get() as { count: number }).count;
  if (catCount === 0) {
    db.exec(`
      INSERT INTO "Categorie" (id, naam, kleur, icoon) VALUES
      (lower(hex(randomblob(16))), 'Kantoorbenodigdheden', '#6366f1', '📎'),
      (lower(hex(randomblob(16))), 'Reiskosten', '#f59e0b', '🚗'),
      (lower(hex(randomblob(16))), 'Software & Abonnementen', '#3b82f6', '💻'),
      (lower(hex(randomblob(16))), 'Marketing & Reclame', '#ec4899', '📣'),
      (lower(hex(randomblob(16))), 'Telefoon & Internet', '#10b981', '📱'),
      (lower(hex(randomblob(16))), 'Verzekeringen', '#8b5cf6', '🛡️'),
      (lower(hex(randomblob(16))), 'Opleidingen & Cursussen', '#f97316', '📚'),
      (lower(hex(randomblob(16))), 'Overig', '#6b7280', '📋')
    `);
  }

  db.close()
}

function initPrisma() {
  try {
    const dbPath = getDbPath()
    const adapter = new PrismaBetterSqlite3({ url: dbPath })
    prisma = new PrismaClient({ adapter })
  } catch (e) {
    logSchrijven(`Prisma initialisatie mislukt: ${e}`)
    dialog.showErrorBox(
      'Database kon niet worden geopend',
      `De database kon niet worden geïnitialiseerd.\n\nFout: ${e}\n\nSluit de applicatie en probeer opnieuw. Neem contact op als dit probleem aanhoudt.`
    )
    app.quit()
  }
}

async function verifieerDbVerbinding(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (e) {
    logSchrijven(`Database verbinding verificatie mislukt: ${e}`)
    return false
  }
}

async function refreshTokenIfNeeded(user: {
  googleRefreshToken?: string | null
  googleAccessToken?: string | null
  googleTokenExpiry?: Date | null
  googleClientId?: string | null
  googleClientSecret?: string | null
}): Promise<string | null> {
  const tokenVerlopen = !user.googleAccessToken
    || !user.googleTokenExpiry
    || new Date() >= new Date(user.googleTokenExpiry.getTime() - 60_000)
  if (!tokenVerlopen) return user.googleAccessToken!
  if (!user.googleRefreshToken || !user.googleClientId || !user.googleClientSecret) return null
  try {
    const nieuwTokens = await vernieuwAccessToken(user.googleRefreshToken, user.googleClientId, user.googleClientSecret)
    const accessToken = nieuwTokens.access_token
    await prisma.user.updateMany({
      data: {
        googleAccessToken: accessToken,
        googleTokenExpiry: nieuwTokens.expires_in
          ? new Date(Date.now() + nieuwTokens.expires_in * 1000)
          : new Date(Date.now() + 3600_000),
      }
    })
    return accessToken
  } catch { return null }
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

// ── ICS hulpfunctie ──
function maakIcsInhoud(details: { samenvatting?: string; start?: string; einde?: string; geheledag?: boolean; locatie?: string; uid: string }): string {
  const nu = new Date()
  const dtStamp = nu.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
  let dtStart: string
  let dtEnd: string
  if (details.geheledag) {
    dtStart = `DTSTART;VALUE=DATE:${(details.start ?? '').replace(/-/g, '').slice(0, 8) || dtStamp.slice(0, 8)}`
    dtEnd = `DTEND;VALUE=DATE:${(details.einde ?? '').replace(/-/g, '').slice(0, 8) || dtStamp.slice(0, 8)}`
  } else {
    const s = details.start ? new Date(details.start).toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z' : dtStamp
    const e = details.einde ? new Date(details.einde).toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z' : s
    dtStart = `DTSTART:${s}`
    dtEnd = `DTEND:${e}`
  }
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AdminPro//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `DTSTAMP:${dtStamp}`, `UID:${details.uid}@adminpro`,
    dtStart, dtEnd, `SUMMARY:${(details.samenvatting ?? 'Afspraak').replace(/\n/g, ' ')}`,
    ...(details.locatie ? [`LOCATION:${details.locatie.replace(/\n/g, ' ')}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

// ── PDF generatie helper (zonder dialoog) ──
async function genereerFactuurPdfBufferIntern(factuurId: string): Promise<Buffer> {
  const factuur = await prisma.factuur.findUnique({ where: { id: factuurId }, include: { regels: true, klant: true } })
  if (!factuur) throw new Error('Factuur niet gevonden')
  const user = await prisma.user.findFirst({ select: { factuurHtmlTemplate: true, logoBase64: true, naam: true, bedrijfsnaam: true, adres: true, postcode: true, stad: true, email: true, telefoon: true, website: true, kvkNummer: true, btwNummer: true, iban: true, korActief: true } })
  const pdfWindow = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false } })
  pdfWindow.setMenuBarVisibility(false)
  if (user?.factuurHtmlTemplate?.trim()) {
    const f = factuur as typeof factuur & { klant: { naam: string; bedrijf?: string | null; adres?: string | null; postcode?: string | null; stad?: string | null; btwNummer?: string | null }; regels: Array<{ omschrijving: string; aantal: number; eenheid?: string | null; prijs: number; btwPercentage: number; kortingPercentage: number; totaal: number }> }
    const regelsHtml = `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ddd">Omschrijving</th><th style="text-align:center;padding:4px 8px;border-bottom:1px solid #ddd">Aantal</th><th style="text-align:right;padding:4px 8px;border-bottom:1px solid #ddd">Prijs</th><th style="text-align:right;padding:4px 8px;border-bottom:1px solid #ddd">Totaal</th></tr></thead><tbody>${f.regels.map(r => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${r.omschrijving}${r.eenheid ? ` / ${r.eenheid}` : ''}</td><td style="text-align:center;padding:4px 8px;border-bottom:1px solid #eee">${r.aantal}</td><td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">€${r.prijs.toFixed(2)}</td><td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">€${r.totaal.toFixed(2)}</td></tr>`).join('')}</tbody></table>`
    const logoHtml = user.logoBase64 ? `<img src="${user.logoBase64}" style="max-height:80px" />` : ''
    const vars: Record<string, string> = { bedrijfsnaam: user.bedrijfsnaam ?? user.naam ?? '', bedrijfAdres: user.adres ?? '', bedrijfPostcode: user.postcode ?? '', bedrijfStad: user.stad ?? '', bedrijfEmail: user.email ?? '', bedrijfTelefoon: user.telefoon ?? '', bedrijfWebsite: user.website ?? '', kvkNummer: user.kvkNummer ?? '', btwNummer: user.btwNummer ?? '', iban: user.iban ?? '', logo: logoHtml, factuurNummer: f.nummer, factuurDatum: f.datum.toISOString().split('T')[0], vervaldatum: f.vervaldatum.toISOString().split('T')[0], notities: f.notities ?? '', betalingsCondities: f.betalingsCondities ?? '', klantNaam: f.klant.naam, klantBedrijf: f.klant.bedrijf ?? '', klantAdres: f.klant.adres ?? '', klantPostcode: f.klant.postcode ?? '', klantStad: f.klant.stad ?? '', klantBtwNummer: f.klant.btwNummer ?? '', subtotaal: `€${f.subtotaal.toFixed(2)}`, kortingBedrag: `€${f.kortingBedrag.toFixed(2)}`, btwBedrag: `€${f.btwBedrag.toFixed(2)}`, totaalBedrag: `€${f.totaal.toFixed(2)}`, regelsHtml }
    const html = user.factuurHtmlTemplate.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  } else if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await pdfWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/facturen/${factuurId}/print`)
  } else {
    await pdfWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/facturen/${factuurId}/print` })
  }
  await new Promise(resolve => setTimeout(resolve, 1500))
  const pdfBuffer = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
  pdfWindow.destroy()
  return pdfBuffer
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

  // Vind vervallen facturen: VERZONDEN of VERLOPEN, vervaldatum te laat, nog niet recent herinnerd
  const kandidaten = await prisma.factuur.findMany({
    where: {
      status: { in: ['VERZONDEN', 'VERLOPEN'] },
      vervaldatum: { lt: drempelDatum },
      OR: [
        { herinneringVerzondenOp: null },
        { herinneringVerzondenOp: { lt: new Date(nu.getTime() - 14 * 24 * 60 * 60 * 1000) } }
      ]
    },
    include: {
      klant: true,
      betalingen: { select: { bedrag: true } },
    }
  })

  // Groepeer per klant: stuur één herinnering per klant met alle openstaande facturen
  const perKlant = new Map<string, typeof kandidaten>()
  for (const factuur of kandidaten) {
    if (!factuur.klant.email) continue
    const existing = perKlant.get(factuur.klantId) ?? []
    existing.push(factuur)
    perKlant.set(factuur.klantId, existing)
  }

  let verstuurd = 0
  let fouten = 0
  const _smtpPoort1 = user.emailSmtpPort ?? 587
  const smtpConfig = { host: user.emailSmtpHost, port: _smtpPoort1, secure: _smtpPoort1 === 465 ? true : _smtpPoort1 === 587 ? false : user.emailSmtpSecure, user: user.emailSmtpUser!, pass: user.emailSmtpPass ?? '' }

  for (const [, facturen] of perKlant) {
    const klant = facturen[0].klant
    if (!klant.email) continue

    // Bereken openstaand per factuur
    const facturenMetSaldo = facturen.map(f => {
      const ontvangen = f.betalingen.reduce((s, b) => s + b.bedrag, 0)
      const openstaand = Math.max(0, f.totaal - ontvangen)
      return { ...f, openstaand }
    }).filter(f => f.openstaand > 0.01)

    if (facturenMetSaldo.length === 0) continue

    const totaalOpenstaand = facturenMetSaldo.reduce((s, f) => s + f.openstaand, 0)

    // Factuurregels HTML
    const facturenHtml = facturenMetSaldo.map(f => {
      const dagenTeLasten = Math.floor((nu.getTime() - new Date(f.vervaldatum).getTime()) / (1000 * 60 * 60 * 24))
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${f.nummer}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${new Date(f.vervaldatum).toLocaleDateString('nl-NL')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right"><strong>€ ${f.openstaand.toFixed(2).replace('.', ',')}</strong></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309">${dagenTeLasten} dagen te laat</td>
      </tr>`
    }).join('')

    const tabelHtml = `<table style="border-collapse:collapse;width:100%;margin:12px 0">
      <thead><tr style="background:#f9fafb">
        <th style="padding:6px 10px;text-align:left;font-size:12px;color:#6b7280">Factuur</th>
        <th style="padding:6px 10px;text-align:left;font-size:12px;color:#6b7280">Vervaldatum</th>
        <th style="padding:6px 10px;text-align:right;font-size:12px;color:#6b7280">Openstaand</th>
        <th style="padding:6px 10px;text-align:left;font-size:12px;color:#6b7280">Status</th>
      </tr></thead>
      <tbody>${facturenHtml}</tbody>
    </table>`

    // Gebruik aangepast sjabloon of standaard
    const eigenTekst = (user as Record<string, unknown>).emailHerinneringTekst as string | null
    let html: string
    if (eigenTekst) {
      const body = eigenTekst
        .replace(/{{naam}}/g, klant.naam)
        .replace(/{{openstaand}}/g, `€ ${totaalOpenstaand.toFixed(2).replace('.', ',')}`)
        .split('\n').map(r => `<p>${r}</p>`).join('')
      html = `${body}${tabelHtml}<p>Totaal openstaand: <strong>€ ${totaalOpenstaand.toFixed(2).replace('.', ',')}</strong></p>`
    } else {
      html = `<p>Geachte ${klant.naam},</p>
         <p>Wij attenderen u op onderstaande openstaande facturen. Wij verzoeken u vriendelijk deze zo spoedig mogelijk te voldoen.</p>
         ${tabelHtml}
         <p>Totaal openstaand: <strong>€ ${totaalOpenstaand.toFixed(2).replace('.', ',')}</strong></p>
         <p>Heeft u reeds betaald? Dan kunt u dit bericht als niet verzonden beschouwen.</p>
         <p>Met vriendelijke groet,<br>${user.naam}${user.bedrijfsnaam ? '<br>' + user.bedrijfsnaam : ''}</p>`
    }
    if (user.logoBase64) html += `<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb"><img src="${user.logoBase64}" alt="Logo" style="max-height:60px;max-width:200px" /></div>`

    const eigenOnderwerp = (user as Record<string, unknown>).emailHerinneringOnderwerp as string | null
    const onderwerp = eigenOnderwerp
      ? eigenOnderwerp.replace(/{{factuurnummer}}/g, facturenMetSaldo.map(f => f.nummer).join(', '))
      : `Betalingsherinnering - ${facturenMetSaldo.length === 1 ? `Factuur ${facturenMetSaldo[0].nummer}` : `${facturenMetSaldo.length} openstaande facturen`}`

    try {
      const emailBcc = (user as Record<string, unknown>).emailBcc as string | null
      await verstuurEmail(smtpConfig, { van: user.emailSmtpUser!, naar: klant.email, bcc: emailBcc || undefined, onderwerp, html })
      // Markeer alle facturen als herinnerd
      for (const f of facturenMetSaldo) {
        await prisma.factuur.update({ where: { id: f.id }, data: { herinneringVerzondenOp: nu } })
      }
      verstuurd++
    } catch {
      fouten++
    }
  }

  return { verstuurd, fouten }
}

// ── Geplande factuurverzending ──
async function verstuurGeplandeFacturen(): Promise<void> {
  try {
    const nu = new Date()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geplande = await (prisma.factuur as any).findMany({
      where: {
        status: 'CONCEPT',
        geplandVerzendOp: { not: null, lte: nu },
      },
      include: { klant: true }
    }) as Array<Record<string, unknown>>
    if (geplande.length === 0) return

    const user = await prisma.user.findFirst()
    if (!user?.emailSmtpHost || !user.emailSmtpUser) return

    for (const factuur of geplande) {
      try {
        const klant = factuur.klant as Record<string, unknown>
        if (!klant?.email) continue
        const port = user.emailSmtpPort ?? 587
        const secure = (user as Record<string, unknown>).emailSmtpSecure as boolean | undefined ?? (port === 465)
        const smtpConfig = {
          host: user.emailSmtpHost,
          port,
          secure,
          user: user.emailSmtpUser,
          pass: (user as Record<string, unknown>).emailSmtpPass as string ?? '',
        }
        const naam = klant.naam as string
        const emailFactuurTekst = (user as Record<string, unknown>).emailFactuurTekst as string | null
        const emailFactuurOnderwerp = (user as Record<string, unknown>).emailFactuurOnderwerp as string | null
        const bedrijfsnaam = user.bedrijfsnaam ?? user.naam ?? ''
        const nummer = factuur.nummer as string
        const onderwerp = (emailFactuurOnderwerp ?? `Factuur {{nummer}} van {{bedrijfsnaam}}`)
          .replace(/{{nummer}}/g, nummer)
          .replace(/{{bedrijfsnaam}}/g, bedrijfsnaam)
          .replace(/{{klantNaam}}/g, naam)
        const tekst = emailFactuurTekst ?? `Beste {{naam}},\n\nHierbij ontvangt u factuur {{nummer}}.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}`
        const berichtHtml = tekst
          .replace(/{{naam}}/g, naam)
          .replace(/{{nummer}}/g, nummer)
          .replace(/{{bedrijfsnaam}}/g, bedrijfsnaam)
          .split('\n').map((r: string) => `<p>${r}</p>`).join('')
        const pdfBuffer = await genereerFactuurPdfBufferIntern(factuur.id as string)
        const logoHtml = user.logoBase64 ? `<div style="text-align:center;margin-bottom:16px"><img src="${user.logoBase64}" style="max-height:60px"/></div>` : ''
        const html = `${logoHtml}${berichtHtml}`
        const emailBcc = (user as Record<string, unknown>).emailBcc as string | null
        await verstuurEmail(smtpConfig, {
          van: user.emailSmtpUser,
          naar: klant.email as string,
          bcc: emailBcc || undefined,
          onderwerp,
          html,
          bijlagen: [{ bestandsnaam: `factuur-${nummer}.pdf`, inhoud: pdfBuffer, contentType: 'application/pdf' }],
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.factuur as any).update({
          where: { id: factuur.id },
          data: { status: 'VERZONDEN', verzondenOp: nu, geplandVerzendOp: null },
        })
      } catch (e) {
        logSchrijven(`Fout bij geplande verzending factuur ${factuur.id}: ${e}`)
      }
    }
  } catch (e) {
    logSchrijven(`Fout bij verstuurGeplandeFacturen: ${e}`)
  }
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

  ipcMain.handle('klanten:deleteMetFacturen', async (_, id: string) => {
    await prisma.$transaction([
      prisma.factuurRegel.deleteMany({ where: { factuur: { klantId: id } } }),
      prisma.factuur.deleteMany({ where: { klantId: id } }),
      prisma.klant.delete({ where: { id } }),
    ])
    return { succes: true }
  })

  ipcMain.handle('klanten:aantalFacturen', async (_, id: string) => {
    const aantal = await prisma.factuur.count({ where: { klantId: id } })
    return { aantal }
  })

  ipcMain.handle('klanten:overdragenEnVerwijderen', async (_, id: string, naarKlantId: string) => {
    await prisma.$transaction([
      prisma.factuur.updateMany({ where: { klantId: id }, data: { klantId: naarKlantId } }),
      prisma.klant.delete({ where: { id } }),
    ])
    return { succes: true }
  })

  ipcMain.handle('klanten:archiveer', async (_, id: string) => {
    const klant = await prisma.klant.findUnique({ where: { id } })
    if (!klant) throw new Error('Klant niet gevonden')
    return prisma.klant.update({ where: { id }, data: { actief: !klant.actief } })
  })

  // Helper: bepaal groep facturen via gedeelde betalingen en update statussen
  async function berekenEnUpdateGroep(startFactuurId: string) {
    const betalingIds = (await prisma.inkomenFactuur.findMany({
      where: { factuurId: startFactuurId },
      select: { inkomstenId: true },
    })).map(r => r.inkomstenId)

    const groepFactuurIds = betalingIds.length === 0
      ? [startFactuurId]
      : [...new Set((await prisma.inkomenFactuur.findMany({
          where: { inkomstenId: { in: betalingIds } },
          select: { factuurId: true },
        })).map(r => r.factuurId))]

    const [groepKoppelingen, groepFacturen] = await Promise.all([
      prisma.inkomenFactuur.findMany({ where: { factuurId: { in: groepFactuurIds } }, select: { bedrag: true } }),
      prisma.factuur.findMany({ where: { id: { in: groepFactuurIds } }, select: { id: true, totaal: true, status: true, handmatigBetaald: true, vervaldatum: true } }),
    ])

    const groepTotaal = groepFacturen.reduce((s, f) => s + f.totaal, 0)
    const groepOntvangen = groepKoppelingen.reduce((s, k) => s + k.bedrag, 0)

    // Altijd eerst BETAALD resetten — bij elke koppelingswijziging herbereken je van scratch
    const nu = new Date()
    for (const f of groepFacturen) {
      if (f.status === 'BETAALD') {
        const nieuweStatus = new Date(f.vervaldatum) < nu ? 'VERLOPEN' : 'VERZONDEN'
        await prisma.factuur.update({ where: { id: f.id }, data: { status: nieuweStatus, handmatigBetaald: false } })
      }
    }

    // Daarna BETAALD zetten als groep volledig is voldaan
    if (groepOntvangen >= groepTotaal * 0.99) {
      await prisma.factuur.updateMany({ where: { id: { in: groepFactuurIds } }, data: { status: 'BETAALD' } })
    }

    return { groepFactuurIds, groepTotaal, groepOntvangen }
  }

  // Facturen
  ipcMain.handle('facturen:list', async (_, params?: { status?: string; klantId?: string; zoek?: string }) => {
    const facturen = await prisma.factuur.findMany({
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
      include: { klant: true, betalingen: { select: { inkomstenId: true, bedrag: true, aangemaakt: true } } },
      orderBy: { datum: 'desc' }
    })

    type FactuurBetaling = { inkomstenId: string; bedrag: number; aangemaakt: Date | string }

    const alleInkomstenIds = new Set<string>()
    for (const f of facturen) {
      for (const b of f.betalingen) alleInkomstenIds.add(b.inkomstenId)
    }

    if (alleInkomstenIds.size === 0) {
      return facturen.map(f => ({ ...f, reedsBetaald: 0, openstaand: f.totaal, teveel: 0 }))
    }

    const alleKoppelingen = await prisma.inkomenFactuur.findMany({
      where: { inkomstenId: { in: Array.from(alleInkomstenIds) } },
      select: { inkomstenId: true, factuurId: true, bedrag: true },
    })

    const bekendFactuurIds = new Set(facturen.map(f => f.id))
    const fBetalingen = new Map<string, FactuurBetaling[]>()
    const fTotalen = new Map<string, number>()
    const inkNaarFacturen = new Map<string, Set<string>>()

    for (const f of facturen) {
      fBetalingen.set(f.id, f.betalingen as FactuurBetaling[])
      fTotalen.set(f.id, f.totaal)
      for (const b of f.betalingen) {
        if (!inkNaarFacturen.has(b.inkomstenId)) inkNaarFacturen.set(b.inkomstenId, new Set())
        inkNaarFacturen.get(b.inkomstenId)!.add(f.id)
      }
    }
    for (const k of alleKoppelingen) {
      if (!inkNaarFacturen.has(k.inkomstenId)) inkNaarFacturen.set(k.inkomstenId, new Set())
      inkNaarFacturen.get(k.inkomstenId)!.add(k.factuurId)
    }

    const extraIds = [...new Set(alleKoppelingen.map(k => k.factuurId))].filter(id => !bekendFactuurIds.has(id))
    if (extraIds.length > 0) {
      const extras = await prisma.factuur.findMany({
        where: { id: { in: extraIds } },
        select: { id: true, totaal: true, betalingen: { select: { inkomstenId: true, bedrag: true, aangemaakt: true } } },
      })
      for (const f of extras) {
        fBetalingen.set(f.id, f.betalingen as FactuurBetaling[])
        fTotalen.set(f.id, f.totaal)
        for (const b of f.betalingen) {
          if (!inkNaarFacturen.has(b.inkomstenId)) inkNaarFacturen.set(b.inkomstenId, new Set())
          inkNaarFacturen.get(b.inkomstenId)!.add(f.id)
        }
      }
    }

    const vindGroepVanFactuur = (startId: string): Set<string> => {
      const bezochteF = new Set<string>([startId])
      const bezochteB = new Set<string>()
      const wachtrij = [startId]
      while (wachtrij.length > 0) {
        const fId = wachtrij.shift()!
        for (const b of fBetalingen.get(fId) ?? []) {
          if (bezochteB.has(b.inkomstenId)) continue
          bezochteB.add(b.inkomstenId)
          for (const linkedId of inkNaarFacturen.get(b.inkomstenId) ?? []) {
            if (!bezochteF.has(linkedId)) { bezochteF.add(linkedId); wachtrij.push(linkedId) }
          }
        }
      }
      return bezochteF
    }

    const groepCache = new Map<string, { groepTotaal: number; groepOntvangen: number; groepMaxMs: number }>()

    return facturen.map(f => {
      let groepTotaal: number, groepOntvangen: number, groepMaxMs: number
      if (groepCache.has(f.id)) {
        ;({ groepTotaal, groepOntvangen, groepMaxMs } = groepCache.get(f.id)!)
      } else {
        const groep = vindGroepVanFactuur(f.id)
        groepTotaal = 0; groepOntvangen = 0; groepMaxMs = 0
        for (const fId of groep) {
          groepTotaal += fTotalen.get(fId) ?? 0
          for (const b of fBetalingen.get(fId) ?? []) {
            groepOntvangen += b.bedrag
            groepMaxMs = Math.max(groepMaxMs, new Date(b.aangemaakt).getTime())
          }
        }
        for (const fId of groep) groepCache.set(fId, { groepTotaal, groepOntvangen, groepMaxMs })
      }

      // Toon saldo alleen bij de factuur met de MEEST RECENTE koppeling in de groep
      const eigenMaxMs = (fBetalingen.get(f.id) ?? []).reduce((m, b) => Math.max(m, new Date(b.aangemaakt).getTime()), 0)
      const isLaatste = eigenMaxMs >= groepMaxMs

      const perFactuurBetaald = (fBetalingen.get(f.id) ?? []).reduce((s, b) => s + b.bedrag, 0)
      return {
        ...f,
        reedsBetaald: perFactuurBetaald,
        openstaand: isLaatste ? Math.max(0, groepTotaal - groepOntvangen) : 0,
        teveel: isLaatste ? Math.max(0, groepOntvangen - groepTotaal) : 0,
      }
    })
  })

  ipcMain.handle('facturen:get', async (_, id: string) => {
    const factuur = await prisma.factuur.findUnique({
      where: { id },
      include: {
        klant: true,
        regels: { orderBy: { volgorde: 'asc' } },
        inkomsten: true,
        betalingen: {
          include: { inkomen: { select: { id: true, datum: true, omschrijving: true, bedrag: true, bron: true, tegenrekeningNaam: true } } },
          orderBy: { aangemaakt: 'asc' },
        },
      },
    })
    if (!factuur) return null

    // BFS: vind alle facturen in de groep via gedeelde betalingen (zelfde als berekenEnUpdateGroep)
    const eigenBetalingIds = factuur.betalingen.map(b => b.inkomstenId)
    let groepFactuurIds: string[] = [id]
    if (eigenBetalingIds.length > 0) {
      const gekoppeld = await prisma.inkomenFactuur.findMany({
        where: { inkomstenId: { in: eigenBetalingIds } },
        select: { factuurId: true },
      })
      groepFactuurIds = [...new Set(gekoppeld.map(e => e.factuurId))]
    }

    // Haal alle groepfacturen op met hun betalingen (inclusief deze factuur zelf)
    const groepFacturen = await prisma.factuur.findMany({
      where: { id: { in: groepFactuurIds } },
      select: {
        id: true, nummer: true, totaal: true,
        betalingen: {
          include: { inkomen: { select: { id: true, datum: true, omschrijving: true, bedrag: true, bron: true, tegenrekeningNaam: true } } },
          orderBy: { aangemaakt: 'asc' },
        },
      },
      orderBy: { aangemaakt: 'asc' },
    })

    const groepTotaal = groepFacturen.reduce((s, f) => s + f.totaal, 0)
    const groepOntvangen = groepFacturen.reduce((s, f) => s + f.betalingen.reduce((ss, b) => ss + b.bedrag, 0), 0)
    const openstaand = Math.max(0, groepTotaal - groepOntvangen)
    const teveel = Math.max(0, groepOntvangen - groepTotaal)

    return {
      ...factuur,
      reedsBetaald: groepOntvangen,
      openstaand,
      teveel,
      groepTotaal,
      // Stuur groepFacturen mee als er meerdere facturen in de groep zijn
      groepFacturen: groepFacturen.length > 1 ? groepFacturen : undefined,
    }
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

    // Track manual BETAALD status changes
    if (data.status === 'BETAALD') {
      data.handmatigBetaald = true
    } else if (data.status !== undefined) {
      data.handmatigBetaald = false
    }

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

      // Transaction: delete old regels and update factuur atomically to prevent orphaned factuur
      return prisma.$transaction(async (tx) => {
        await tx.factuurRegel.deleteMany({ where: { factuurId: id } })
        return tx.factuur.update({
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
    await prisma.$transaction([
      prisma.inkomen.updateMany({ where: { factuurId: id }, data: { factuurId: null } }),
      prisma.factuur.delete({ where: { id } }),
    ])
    return { succes: true }
  })

  ipcMain.handle('facturen:verwijderBetaaldStatus', async (_, id: string) => {
    const factuur = await prisma.factuur.findUnique({ where: { id }, select: { vervaldatum: true } })
    if (!factuur) return { succes: false }
    const nu = new Date()
    const nieuweStatus = new Date(factuur.vervaldatum) < nu ? 'VERLOPEN' : 'VERZONDEN'
    await prisma.factuur.update({ where: { id }, data: { status: nieuweStatus, handmatigBetaald: false } })
    return { succes: true, nieuweStatus }
  })

  ipcMain.handle('facturen:planVerzending', async (_, id: string, geplandOp: string | null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.factuur as any).update({
      where: { id },
      data: { geplandVerzendOp: geplandOp ? new Date(geplandOp) : null }
    })
    return { succes: true }
  })

  ipcMain.handle('facturen:deleteAll', async () => {
    const { count } = await prisma.$transaction(async (tx) => {
      await tx.inkomen.updateMany({ where: { factuurId: { not: null } }, data: { factuurId: null } })
      return tx.factuur.deleteMany()
    })
    return { succes: true, count }
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

      const bedrijfsnaam = user.bedrijfsnaam ?? user.naam
      let emailHtml: string
      const emailFactuurTekst = (user as Record<string, unknown>).emailFactuurTekst as string | null
      if (emailFactuurTekst) {
        emailHtml = emailFactuurTekst
          .replace(/{{naam}}/g, factuur.klant.naam)
          .replace(/{{bedrijf}}/g, bedrijfsnaam)
          .replace(/{{nummer}}/g, factuur.nummer)
          .replace(/{{totaal}}/g, formatBedrag(factuur.totaal))
          .replace(/{{vervaldatum}}/g, formatDatum(factuur.vervaldatum))
          .split('\n').map(l => `<p>${l}</p>`).join('')
        if (factuur.mollieBetaalLink) {
          emailHtml += `<div style="text-align:center;margin:24px 0"><a href="${factuur.mollieBetaalLink}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Direct betalen via iDEAL</a></div>`
        }
      } else {
        emailHtml = maakFactuurEmailHtml({
          klantNaam: factuur.klant.naam,
          bedrijfsnaam,
          factuurNummer: factuur.nummer,
          totaal: formatBedrag(factuur.totaal),
          vervaldatum: formatDatum(factuur.vervaldatum),
          factuurUrl: ``,
          notities: payload.bericht,
          mollieBetaalLink: factuur.mollieBetaalLink,
        })
      }
      if (user.logoBase64) emailHtml += `<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb"><img src="${user.logoBase64}" alt="Logo" style="max-height:60px;max-width:200px" /></div>`

      const factuurOnderwerp = ((user as Record<string, unknown>).emailFactuurOnderwerp as string | null)
        ?.replace(/{{nummer}}/g, factuur.nummer).replace(/{{bedrijf}}/g, bedrijfsnaam)
        ?? `Factuur ${factuur.nummer} - ${bedrijfsnaam}`
      const emailBcc = (user as Record<string, unknown>).emailBcc as string | null

      // PDF bepalen of genereren
      let pdfBijlage: { bestandsnaam: string; inhoud: Buffer; contentType: string } | undefined
      try {
        let pdfBuffer: Buffer | null = null
        if (factuur.bronBestandPad && fs.existsSync(factuur.bronBestandPad)) {
          pdfBuffer = fs.readFileSync(factuur.bronBestandPad)
        } else {
          pdfBuffer = await genereerFactuurPdfBufferIntern(id)
        }
        if (pdfBuffer) {
          pdfBijlage = { bestandsnaam: `Factuur-${factuur.nummer}.pdf`, inhoud: pdfBuffer, contentType: 'application/pdf' }
        }
      } catch {}

      const _factuurPoort = user.emailSmtpPort ?? 587
      try {
        await verstuurEmail(
          { host: user.emailSmtpHost, port: _factuurPoort, secure: _factuurPoort === 465 ? true : _factuurPoort === 587 ? false : user.emailSmtpSecure, user: user.emailSmtpUser, pass: user.emailSmtpPass ?? '' },
          { van: `${bedrijfsnaam} <${user.emailSmtpUser}>`, naar: payload.naarEmail ?? factuur.klant.email ?? '', bcc: emailBcc || undefined, onderwerp: factuurOnderwerp, html: emailHtml, bijlagen: pdfBijlage ? [pdfBijlage] : undefined }
        )
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Onbekende fout'
        if (msg.includes('WRONG_VERSION') || msg.includes('SSL')) {
          throw new Error(`SSL/TLS mismatch. Gebruik poort 465 met SSL aan, of poort 587 met SSL uit (STARTTLS). Details: ${msg}`)
        }
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

  ipcMain.handle('facturen:previewEmail', async (_, id: string, bericht?: string) => {
    const factuur = await prisma.factuur.findUnique({ where: { id }, include: { klant: true } })
    if (!factuur) throw new Error('Factuur niet gevonden')
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')
    const bedrijfsnaam = user.bedrijfsnaam ?? user.naam
    const emailFactuurTekst = (user as Record<string, unknown>).emailFactuurTekst as string | null
    let emailHtml: string
    if (emailFactuurTekst) {
      emailHtml = emailFactuurTekst
        .replace(/{{naam}}/g, factuur.klant.naam)
        .replace(/{{bedrijf}}/g, bedrijfsnaam)
        .replace(/{{nummer}}/g, factuur.nummer)
        .replace(/{{totaal}}/g, formatBedrag(factuur.totaal))
        .replace(/{{vervaldatum}}/g, formatDatum(factuur.vervaldatum))
        .split('\n').map(l => `<p>${l}</p>`).join('')
      if (factuur.mollieBetaalLink) emailHtml += `<div style="text-align:center;margin:24px 0"><a href="${factuur.mollieBetaalLink}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Direct betalen via iDEAL</a></div>`
    } else {
      emailHtml = maakFactuurEmailHtml({ klantNaam: factuur.klant.naam, bedrijfsnaam, factuurNummer: factuur.nummer, totaal: formatBedrag(factuur.totaal), vervaldatum: formatDatum(factuur.vervaldatum), factuurUrl: '', notities: bericht, mollieBetaalLink: factuur.mollieBetaalLink })
    }
    if (user.logoBase64) emailHtml += `<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb"><img src="${user.logoBase64}" alt="Logo" style="max-height:60px;max-width:200px" /></div>`
    return emailHtml
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
    const aanheefTekst = (user as any).emailAanhef?.replace(/{{naam}}/g, klantNaam) ?? `Geachte ${klantNaam},`
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

    const emailBccOfferte = (user as Record<string, unknown>).emailBcc as string | null
    const _offertePoort = user.emailSmtpPort ?? 587
    await verstuurEmail(
      { host: user.emailSmtpHost, port: _offertePoort, secure: _offertePoort === 465 ? true : _offertePoort === 587 ? false : user.emailSmtpSecure, user: user.emailSmtpUser, pass: user.emailSmtpPass ?? '' },
      { naar: payload.email, van: `"${bedrijfsnaam}" <${user.emailSmtpUser}>`, bcc: emailBccOfferte || undefined, onderwerp, html }
    )

    await prisma.offerte.update({ where: { id }, data: { verzondenOp: new Date(), status: offerte.status === 'CONCEPT' ? 'VERZONDEN' : offerte.status } })
    return { succes: true }
  })

  // Inkomen
  ipcMain.handle('inkomen:list', async (_, params?: { van?: string; tot?: string; maand?: string }) => {
    let vanDatum: Date | undefined
    let totDatum: Date | undefined
    if (params?.maand) {
      const [jaar, mnd] = params.maand.split('-').map(Number)
      vanDatum = new Date(jaar, mnd - 1, 1)
      totDatum = new Date(jaar, mnd, 0, 23, 59, 59)
    } else {
      if (params?.van) vanDatum = new Date(params.van)
      if (params?.tot) totDatum = new Date(params.tot)
    }
    const inkomenList = await prisma.inkomen.findMany({
      where: {
        ...(vanDatum ? { datum: { gte: vanDatum } } : {}),
        ...(totDatum ? { datum: { lte: totDatum } } : {}),
      },
      include: {
        factuur: { include: { klant: true } },
        koppelingen: {
          include: {
            factuur: {
              select: {
                id: true, nummer: true, totaal: true, status: true,
                betalingen: { select: { inkomstenId: true, bedrag: true, aangemaakt: true } },
              },
            },
          },
          orderBy: { aangemaakt: 'asc' },
        },
      },
      orderBy: { datum: 'desc' }
    })

    // Transitieve groepsberekening:
    // Betalingen en facturen vormen een graaf. Via BFS vinden we de volledige
    // verbonden component (ook via betalingen die niet in de gefilterde lijst staan).

    // Map: inkomstenId → Set<factuurId>
    const inkomstenNaarFacturen = new Map<string, Set<string>>()
    // Map: factuurId → [{inkomstenId, bedrag, aangemaakt}]
    const factuurBetalingen = new Map<string, Array<{ inkomstenId: string; bedrag: number; aangemaakt: Date | string }>>()
    // Map: factuurId → totaal
    const factuurTotalen = new Map<string, number>()

    for (const ink of inkomenList) {
      inkomstenNaarFacturen.set(ink.id, new Set(ink.koppelingen.map(k => k.factuurId)))
      for (const k of ink.koppelingen) {
        if (!k.factuur || factuurBetalingen.has(k.factuurId)) continue
        factuurBetalingen.set(k.factuurId, k.factuur.betalingen as Array<{ inkomstenId: string; bedrag: number; aangemaakt: Date | string }>)
        factuurTotalen.set(k.factuurId, k.factuur.totaal)
      }
    }

    // Vind inkomstenIds in factuur.betalingen die NIET in de huidige lijst staan (andere periode)
    const inkomstenInLijst = new Set(inkomenList.map(i => i.id))
    const extraInkomstenIds = new Set<string>()
    for (const [, betalingen] of factuurBetalingen) {
      for (const b of betalingen) {
        if (!inkomstenInLijst.has(b.inkomstenId)) extraInkomstenIds.add(b.inkomstenId)
      }
    }

    // Haal de koppelingen op van die extra betalingen (één query)
    if (extraInkomstenIds.size > 0) {
      const extra = await prisma.inkomenFactuur.findMany({
        where: { inkomstenId: { in: Array.from(extraInkomstenIds) } },
        select: { inkomstenId: true, factuurId: true },
      })
      for (const e of extra) {
        if (!inkomstenNaarFacturen.has(e.inkomstenId)) inkomstenNaarFacturen.set(e.inkomstenId, new Set())
        inkomstenNaarFacturen.get(e.inkomstenId)!.add(e.factuurId)
      }
      // Haal ontbrekende factuurdata op
      const onbekend = [...new Set(extra.map(e => e.factuurId))].filter(id => !factuurBetalingen.has(id))
      if (onbekend.length > 0) {
        const mf = await prisma.factuur.findMany({
          where: { id: { in: onbekend } },
          select: { id: true, totaal: true, betalingen: { select: { inkomstenId: true, bedrag: true, aangemaakt: true } } },
        })
        for (const f of mf) {
          factuurBetalingen.set(f.id, f.betalingen)
          factuurTotalen.set(f.id, f.totaal)
        }
      }
    }

    // BFS: vind alle factuurIds in de verbonden component van een betaling
    const vindGroep = (startId: string): Set<string> => {
      const bezocht = new Set<string>([startId])
      const groep = new Set<string>()
      const wachtrij = [startId]
      while (wachtrij.length > 0) {
        const bId = wachtrij.shift()!
        for (const fId of inkomstenNaarFacturen.get(bId) ?? []) {
          groep.add(fId)
          for (const b of factuurBetalingen.get(fId) ?? []) {
            if (!bezocht.has(b.inkomstenId)) { bezocht.add(b.inkomstenId); wachtrij.push(b.inkomstenId) }
          }
        }
      }
      return groep
    }

    return inkomenList.map(inkomen => {
      const groepFactuurIds = vindGroep(inkomen.id)

      let groepOntvangen = 0
      let groepTotaal = 0
      let groepMaxMs = 0
      for (const fId of groepFactuurIds) {
        groepTotaal += factuurTotalen.get(fId) ?? 0
        for (const b of factuurBetalingen.get(fId) ?? []) {
          groepOntvangen += b.bedrag
          groepMaxMs = Math.max(groepMaxMs, new Date(b.aangemaakt).getTime())
        }
      }

      // Toon het saldo alleen bij de MEEST RECENT gekoppelde betaling van de groep
      const eigenMaxMs = inkomen.koppelingen.reduce((max, k) => Math.max(max, new Date(k.aangemaakt).getTime()), 0)
      const isLaatste = inkomen.koppelingen.length > 0 && eigenMaxMs >= groepMaxMs

      // Groep-waterfall: gebruik groepOntvangen (ALLE betalingen gecombineerd) als pool.
      // Sorteer ALLE groepfacturen op vroegste koppeldatum en verwerk in volgorde.
      // Toon saldo alleen bij de EERSTE factuur waar het geld opraakt (of het laatste als teveel).
      // Als die factuur niet bij déze betaling hoort: fallback naar de laatste koppeling van deze betaling.
      const waterfallSaldo: Record<string, { openstaand: number; teveel: number }> = {}
      if (isLaatste && inkomen.koppelingen.length > 0) {
        const groepOpenstaand = Math.max(0, groepTotaal - groepOntvangen)
        const groepTeveel = Math.max(0, groepOntvangen - groepTotaal)

        // Vroegste koppeldatum per factuur (over alle betalingen heen)
        const vroegsteKoppelMs = (fId: string): number => {
          const betalingen = factuurBetalingen.get(fId) ?? []
          if (betalingen.length === 0) return Date.now()
          return Math.min(...betalingen.map(b => new Date(b.aangemaakt).getTime()))
        }

        const gesorteerdeGroep = [...groepFactuurIds]
          .map(fId => ({ fId, vroegste: vroegsteKoppelMs(fId), totaal: factuurTotalen.get(fId) ?? 0 }))
          .sort((a, b) => a.vroegste - b.vroegste)

        let remaining = groepOntvangen
        let saldoFactuurId: string | null = null

        for (let i = 0; i < gesorteerdeGroep.length; i++) {
          const { fId, totaal } = gesorteerdeGroep[i]
          const isLast = i === gesorteerdeGroep.length - 1
          if (remaining >= totaal - 0.005) {
            remaining = Math.max(0, remaining - totaal)
            waterfallSaldo[fId] = { openstaand: 0, teveel: isLast && remaining > 0.01 ? Math.round(remaining * 100) / 100 : 0 }
            if (isLast && remaining > 0.01) saldoFactuurId = fId
          } else {
            waterfallSaldo[fId] = { openstaand: Math.round((totaal - remaining) * 100) / 100, teveel: 0 }
            saldoFactuurId = fId
            remaining = 0
            for (let j = i + 1; j < gesorteerdeGroep.length; j++) {
              waterfallSaldo[gesorteerdeGroep[j].fId] = { openstaand: 0, teveel: 0 }
            }
            break
          }
        }

        // Fallback: saldo valt op factuur die niet bij déze betaling hoort
        // → toon groepssaldo op de laatste koppeling van deze betaling
        const eigenFactuurIds = new Set(inkomen.koppelingen.map(k => k.factuurId))
        if (saldoFactuurId && !eigenFactuurIds.has(saldoFactuurId) && (groepOpenstaand > 0.01 || groepTeveel > 0.01)) {
          if (waterfallSaldo[saldoFactuurId]) waterfallSaldo[saldoFactuurId] = { openstaand: 0, teveel: 0 }
          const lastKoppeling = inkomen.koppelingen[inkomen.koppelingen.length - 1]
          waterfallSaldo[lastKoppeling.factuurId] = { openstaand: groepOpenstaand, teveel: groepTeveel }
        }
      }

      return {
        ...inkomen,
        koppelingen: inkomen.koppelingen.map(k => {
          const saldo = waterfallSaldo[k.factuurId] ?? { openstaand: 0, teveel: 0 }
          return {
            ...k,
            factuur: k.factuur ? {
              id: k.factuur.id,
              nummer: k.factuur.nummer,
              totaal: k.factuur.totaal,
              status: k.factuur.status,
              reedsBetaald: groepOntvangen,
              openstaand: saldo.openstaand,
              teveel: saldo.teveel,
            } : null,
          }
        }),
      }
    })
  })

  ipcMain.handle('inkomen:create', async (_, data: Record<string, unknown>) => {
    const { factuurId, ...restData } = data
    const inkomen = await prisma.inkomen.create({
      data: { ...restData, datum: new Date(restData.datum as string), factuurId: factuurId as string | undefined } as Parameters<typeof prisma.inkomen.create>[0]['data'],
      include: { factuur: { include: { klant: true } }, koppelingen: { include: { factuur: { select: { id: true, nummer: true, totaal: true, status: true } } } } }
    })

    if (factuurId) {
      const fid = factuurId as string
      await prisma.inkomenFactuur.upsert({
        where: { inkomstenId_factuurId: { inkomstenId: inkomen.id, factuurId: fid } },
        create: { inkomstenId: inkomen.id, factuurId: fid, bedrag: inkomen.bedrag },
        update: { bedrag: inkomen.bedrag },
      })
      await berekenEnUpdateGroep(fid)
    }

    return inkomen
  })

  ipcMain.handle('inkomen:update', async (_, id: string, data: Record<string, unknown>) => {
    const huidig = await prisma.inkomen.findUnique({ where: { id }, select: { factuurId: true, bedrag: true } })
    const updated = await prisma.inkomen.update({
      where: { id },
      data: { ...data, datum: data.datum ? new Date(data.datum as string) : undefined } as Parameters<typeof prisma.inkomen.update>[0]['data'],
      include: { factuur: { include: { klant: true } }, koppelingen: { include: { factuur: { select: { id: true, nummer: true, totaal: true, status: true } } } } }
    })

    const nieuwFactuurId = data.factuurId as string | null | undefined
    const nieuwBedrag = data.bedrag !== undefined ? data.bedrag as number : huidig?.bedrag ?? 0

    // Ontkoppel oude factuur als factuurId wijzigt
    if (huidig?.factuurId && huidig.factuurId !== nieuwFactuurId) {
      await prisma.inkomenFactuur.deleteMany({ where: { inkomstenId: id, factuurId: huidig.factuurId } })
      await berekenEnUpdateGroep(huidig.factuurId)
    }

    // Koppel aan nieuwe factuur of update bedrag
    if (nieuwFactuurId) {
      await prisma.inkomenFactuur.upsert({
        where: { inkomstenId_factuurId: { inkomstenId: id, factuurId: nieuwFactuurId } },
        create: { inkomstenId: id, factuurId: nieuwFactuurId, bedrag: nieuwBedrag },
        update: { bedrag: nieuwBedrag },
      })
      await berekenEnUpdateGroep(nieuwFactuurId)
    }

    return updated
  })

  ipcMain.handle('inkomen:delete', async (_, id: string) => {
    // Haal factuurkoppelingen op VOOR verwijdering zodat we de groepsstatus kunnen herberekenen
    const koppelingen = await prisma.inkomenFactuur.findMany({ where: { inkomstenId: id }, select: { factuurId: true } })
    await prisma.inkomen.delete({ where: { id } })
    for (const { factuurId } of koppelingen) {
      await berekenEnUpdateGroep(factuurId)
    }
    return { succes: true }
  })

  ipcMain.handle('inkomen:deleteAll', async () => {
    const { count } = await prisma.inkomen.deleteMany()
    return { succes: true, count }
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

  ipcMain.handle('uitgaven:deleteAll', async () => {
    const { count } = await prisma.uitgave.deleteMany()
    return { succes: true, count }
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
  const mapUur = (r: Record<string, unknown>) => ({ ...r, duurMinuten: (r.duur as number | null) ?? 0 })

  ipcMain.handle('uren:list', async (_, params?: { gefactureerd?: boolean }) => {
    const records = await prisma.uurregistratie.findMany({
      where: params?.gefactureerd !== undefined ? { gefactureerd: params.gefactureerd } : {},
      orderBy: { startTijd: 'desc' }
    })
    return records.map(mapUur)
  })

  ipcMain.handle('uren:create', async (_, data: Record<string, unknown>) => {
    let duur: number | null = null
    if (data.startTijd && data.eindTijd) {
      duur = Math.floor((new Date(data.eindTijd as string).getTime() - new Date(data.startTijd as string).getTime()) / 60000)
    }
    // Strip frontend-only duurMinuten; backend owns the duur calculation
    const { duurMinuten: _dm, ...cleanData } = data as Record<string, unknown> & { duurMinuten?: unknown }
    void _dm
    const record = await prisma.uurregistratie.create({
      data: { ...cleanData, startTijd: new Date(cleanData.startTijd as string), eindTijd: cleanData.eindTijd ? new Date(cleanData.eindTijd as string) : null, duur } as Parameters<typeof prisma.uurregistratie.create>[0]['data']
    })
    return mapUur(record as unknown as Record<string, unknown>)
  })

  ipcMain.handle('uren:update', async (_, id: string, data: Record<string, unknown>) => {
    // Recalculate duur when start/end times change
    let duur: number | undefined
    if (data.startTijd && data.eindTijd) {
      duur = Math.floor((new Date(data.eindTijd as string).getTime() - new Date(data.startTijd as string).getTime()) / 60000)
    }
    const { duurMinuten: _dm, ...cleanData } = data as Record<string, unknown> & { duurMinuten?: unknown }
    void _dm
    const record = await prisma.uurregistratie.update({
      where: { id },
      data: { ...cleanData, startTijd: cleanData.startTijd ? new Date(cleanData.startTijd as string) : undefined, eindTijd: cleanData.eindTijd ? new Date(cleanData.eindTijd as string) : null, ...(duur !== undefined ? { duur } : {}) } as Parameters<typeof prisma.uurregistratie.update>[0]['data']
    })
    return mapUur(record as unknown as Record<string, unknown>)
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
        emailSmtpHost: true, emailSmtpPort: true, emailSmtpUser: true, emailSmtpSecure: true, emailSmtpPass: true,
        korActief: true, korDrempel: true, korWaarschuwing: true,
        standaardBetaalTermijn: true, standaardBtwTarief: true,
        betalingsherinneringen: true, herinneringDagen: true,
        emailFactuurOnderwerp: true, emailHerinneringOnderwerp: true, emailHerinneringTekst: true,
        emailBcc: true, emailBevestigingOnderwerp: true, emailBevestigingTekst: true, emailFactuurTekst: true,
        agendaHerinneringActief: true, agendaHerinneringModus: true, agendaHerinneringVoorafUren: true, agendaHerinneringDagen: true, agendaHerinneringTijd: true,
        googleRefreshToken: true, googleClientId: true, googleClientSecret: true, googlePrimaryCalendarId: true, kmVergoeding: true,
        anthropicApiKey: true, openaiApiKey: true, aiModel: true, factuurHtmlTemplate: true, offerteGeldigheidDagen: true,
        donkerModus: true, autoStart: true, pdfMapPad: true, mollieApiKey: true,
        layoutPrimairKleur: true, layoutSecundairKleur: true, layoutLettertype: true,
        layoutKoptekst: true, layoutVoettekst: true, layoutLogoPositie: true,
        layoutToonBtwNummer: true, layoutToonKvkNummer: true, layoutToonIban: true,
        layoutToonQrCode: true, layoutRegelSpacing: true,
        layoutLetterGrootte: true, layoutLogoGrootte: true, layoutMarges: true, layoutSectieVolgorde: true,
        onbetaaldeFactuurMelding: true,
        verborgenPaginas: true,
        bankWeergaveVelden: true,
        uitgavenWeergaveVelden: true,
        spaarrekeningen: true,
      }
    })
    const { emailSmtpPass, ...safeUser } = user ?? {} as NonNullable<typeof user>
    return { ...safeUser, emailSmtpPassIngesteld: !!user?.emailSmtpPass, googleGekoppeld: !!user?.googleRefreshToken, googleClientId: user?.googleClientId ?? '' }
  })

  ipcMain.handle('instellingen:update', async (_, data: Record<string, unknown>) => {
    const toegestaneVelden = new Set([
      'naam', 'email', 'bedrijfsnaam', 'kvkNummer', 'btwNummer', 'iban',
      'adres', 'postcode', 'stad', 'telefoon', 'website', 'logo', 'logoBase64',
      'factuurPrefix', 'offertePrefix', 'factuurVolgNummer', 'offerteVolgNummer',
      'factuurNummerFormaat', 'standaardCreditnotaPrefix',
      'emailSmtpHost', 'emailSmtpPort', 'emailSmtpUser', 'emailSmtpSecure', 'emailSmtpPass',
      'korActief', 'korDrempel', 'korWaarschuwing', 'korIngangsDatum',
      'standaardBetaalTermijn', 'standaardBtwTarief', 'betalingsCondities',
      'betalingsherinneringen', 'herinneringDagen',
      'kmVergoeding', 'anthropicApiKey', 'openaiApiKey', 'aiModel', 'mollieApiKey', 'googlePrimaryCalendarId',
      'factuurHtmlTemplate', 'offerteGeldigheidDagen',
      'donkerModus', 'autoStart', 'pdfMapPad',
      'emailAanhef', 'emailAfsluitingsTekst',
      'emailFactuurOnderwerp', 'emailHerinneringOnderwerp', 'emailHerinneringTekst',
      'emailBcc', 'emailBevestigingOnderwerp', 'emailBevestigingTekst', 'emailFactuurTekst',
      'agendaHerinneringActief', 'agendaHerinneringModus', 'agendaHerinneringVoorafUren', 'agendaHerinneringDagen', 'agendaHerinneringTijd',
      'googleClientId', 'googleClientSecret',
      'layoutPrimairKleur', 'layoutSecundairKleur', 'layoutLettertype',
      'layoutKoptekst', 'layoutVoettekst', 'layoutLogoPositie',
      'layoutToonBtwNummer', 'layoutToonKvkNummer', 'layoutToonIban',
      'layoutToonQrCode', 'layoutRegelSpacing',
      'layoutLetterGrootte', 'layoutLogoGrootte', 'layoutMarges', 'layoutSectieVolgorde',
      'onbetaaldeFactuurMelding', 'verborgenPaginas', 'bankAfschriftenMap', 'bankWeergaveVelden', 'uitgavenWeergaveVelden', 'spaarrekeningen',
    ])
    const updateData: Record<string, unknown> = {}
    for (const [sleutel, waarde] of Object.entries(data)) {
      if (toegestaneVelden.has(sleutel)) updateData[sleutel] = waarde
    }
    if (!updateData.emailSmtpPass) delete updateData.emailSmtpPass
    if (updateData.anthropicApiKey === '') updateData.anthropicApiKey = null
    await prisma.user.updateMany({ data: updateData })
    if ('bankAfschriftenMap' in updateData) startBankWatcher().catch(() => {})
    return { succes: true }
  })

  ipcMain.handle('instellingen:test-email', async (_, config: { host: string; port: number; secure: boolean; user: string; pass?: string; naar: string }) => {
    try {
      // Port 465 = direct SSL; port 587/25/other = STARTTLS (secure must be false)
      const secureDwingen = config.port === 465 ? true : config.port === 587 ? false : config.secure
      const naar = config.naar?.trim() || config.user // fallback: stuur naar eigen adres
      if (!naar) throw new Error('Geen ontvanger opgegeven. Vul je e-mailadres in bij Bedrijfsgegevens of gebruikersnaam bij SMTP.')
      // Retrieve password from DB if not provided (frontend doesn't hold the password)
      let pass = config.pass ?? ''
      if (!pass) {
        const dbUser = await prisma.user.findFirst({ select: { emailSmtpPass: true } })
        pass = dbUser?.emailSmtpPass ?? ''
      }
      await verstuurEmail(
        { host: config.host, port: config.port, secure: secureDwingen, user: config.user, pass },
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
    if (!user?.googleRefreshToken) return { afspraken: [], googleNietGekoppeld: true }
    if (!user.googleClientId || !user.googleClientSecret) {
      return { afspraken: [], fout: 'Google OAuth-gegevens ontbreken.' }
    }
    const accessToken = await refreshTokenIfNeeded(user)
    if (!accessToken) return { afspraken: [], fout: 'Token vernieuwen mislukt. Koppel Google Agenda opnieuw via Instellingen.' }

    const nu = new Date()
    const vanDatum = params?.van ? new Date(params.van) : new Date(nu.getFullYear(), nu.getMonth(), 1)
    const totDatum = params?.tot ? new Date(params.tot) : new Date(nu.getFullYear(), nu.getMonth() + 1, 0, 23, 59, 59)

    try {
      const kalenders = await haalKalenderLijst(accessToken).catch(() => [{ id: 'primary', primair: true, samenvatting: 'Primair' }])
      const primaryId = (user as Record<string, unknown>).googlePrimaryCalendarId as string | null
        || kalenders.find((k) => k.primair)?.id
        || 'primary'
      const alleAfspraken = (await Promise.all(
        kalenders.map((kal) =>
          haalAgendaAfspraken(accessToken, vanDatum, totDatum, kal.id)
            .then((items) => items.map((a) => ({
              ...a,
              kalenderId: kal.id,
              kalenderKleur: kal.achtergrondKleur,
              isPrimair: kal.id === primaryId,
            })))
            .catch(() => [])
        )
      )).flat()
      return { afspraken: alleAfspraken }
    } catch (e) {
      return { afspraken: [], fout: e instanceof Error ? e.message : 'Agenda ophalen mislukt' }
    }
  })

  ipcMain.handle('agenda:haal-kalenders', async () => {
    const user = await prisma.user.findFirst()
    if (!user?.googleRefreshToken) return { kalenders: [], googleNietGekoppeld: true }
    const accessToken = await refreshTokenIfNeeded(user)
    if (!accessToken) return { kalenders: [], fout: 'Token vernieuwen mislukt.' }
    try {
      const kalenders = await haalKalenderLijst(accessToken)
      const primaryId = (user as Record<string, unknown>).googlePrimaryCalendarId as string | null
        || kalenders.find((k) => k.primair)?.id
        || 'primary'
      return { kalenders, primaryKalenderId: primaryId }
    } catch (e) {
      return { kalenders: [], fout: e instanceof Error ? e.message : 'Kalenders ophalen mislukt' }
    }
  })

  ipcMain.handle('agenda:maak-afspraak', async (_, data: {
    klantIds?: string[]
    locatie?: string
    startDatumTijd: string
    eindDatumTijd: string
    geheledag?: boolean
    calendarId?: string
    regels?: Array<{ omschrijving: string; aantal: number; eenheid?: string; prijs: number; btwPercentage: number }>
  }) => {
    const user = await prisma.user.findFirst()
    if (!user?.googleRefreshToken) throw new Error('Google Agenda niet gekoppeld.')
    const accessToken = await refreshTokenIfNeeded(user)
    if (!accessToken) throw new Error('Token vernieuwen mislukt.')

    const klantIds = data.klantIds ?? []
    const titelDelen: string[] = []
    if (klantIds.length > 0) {
      const klanten = await prisma.klant.findMany({ where: { id: { in: klantIds } } })
      // Preserve order from klantIds array
      const gesorteerdNamen = klantIds
        .map(id => klanten.find(k => k.id === id))
        .filter(Boolean)
        .map(k => k!.bedrijf || k!.naam)
      titelDelen.push(...gesorteerdNamen)
    }
    if (data.locatie) titelDelen.push(data.locatie)
    const titel = titelDelen.length > 0 ? titelDelen.join(' – ') : 'Afspraak'

    const calendarId = data.calendarId
      || (user as Record<string, unknown>).googlePrimaryCalendarId as string | null
      || 'primary'

    const eventId = await maakGoogleAfspraak(accessToken, calendarId, {
      titel,
      startDatumTijd: data.startDatumTijd,
      eindDatumTijd: data.eindDatumTijd,
      geheledag: data.geheledag,
      locatie: data.locatie,
    })

    const { randomUUID } = require('crypto')
    await prisma.agendaAfspraakData.create({
      data: {
        id: randomUUID(),
        eventId,
        klantId: klantIds[0] ?? null,
        klantIds: klantIds.length > 0 ? JSON.stringify(klantIds) : null,
        locatie: data.locatie ?? null,
        regels: data.regels ? JSON.stringify(data.regels) : null,
      } as Parameters<typeof prisma.agendaAfspraakData.create>[0]['data']
    })

    return { succes: true, eventId, titel }
  })

  ipcMain.handle('agenda:maak-facturen-van-afspraak', async (_, { eventId }: { eventId: string }) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')

    const afspraakData = await prisma.agendaAfspraakData.findUnique({ where: { eventId } }) as (Record<string, unknown> & { klantIds?: string; regels?: string; klantId?: string }) | null

    if (!afspraakData) return { succes: false, fout: 'Geen afspraakgegevens gevonden.' }

    // Parse klantIds — fall back to single klantId for backwards compatibility
    let klantIds: string[] = []
    if (afspraakData.klantIds) {
      try { klantIds = JSON.parse(afspraakData.klantIds as string) } catch {}
    } else if (afspraakData.klantId) {
      klantIds = [afspraakData.klantId as string]
    }

    if (klantIds.length === 0) return { succes: false, fout: 'Geen klanten gekoppeld aan deze afspraak.' }

    const regels: Array<{ omschrijving: string; aantal: number; prijs: number; btwPercentage: number; eenheid?: string }> = afspraakData.regels
      ? (() => { try { return JSON.parse(afspraakData.regels as string) } catch { return [] } })()
      : []

    const aangemaakteFacturen: Array<{ id: string; nummer: string; klantNaam: string }> = []

    for (const klantId of klantIds) {
      const klant = await prisma.klant.findUnique({ where: { id: klantId } })
      if (!klant) continue
      const effectieveBetaalTermijn = klant.betaalTermijn ?? user.standaardBetaalTermijn
      const nummer = await genereerNummer(user.factuurPrefix, 'factuur')

      let subtotaal = 0
      let btwBedrag = 0
      const berekendeRegels = regels.map((regel, index) => {
        const netto = regel.prijs * regel.aantal
        const btw = (netto * regel.btwPercentage) / 100
        subtotaal += netto
        btwBedrag += btw
        return { ...regel, kortingPercentage: 0, totaal: netto + btw, volgorde: index }
      })

      const factuur = await prisma.factuur.create({
        data: {
          nummer,
          klantId,
          datum: new Date(),
          vervaldatum: berekenVervaldatum(effectieveBetaalTermijn),
          subtotaal,
          btwBedrag,
          kortingBedrag: 0,
          totaal: subtotaal + btwBedrag,
          status: 'CONCEPT',
          regels: { create: berekendeRegels },
        },
        select: { id: true, nummer: true },
      })

      aangemaakteFacturen.push({ id: factuur.id, nummer: factuur.nummer, klantNaam: klant.bedrijf || klant.naam })
    }

    return { succes: true, facturen: aangemaakteFacturen }
  })

  ipcMain.handle('agenda:haal-afspraak-data', async (_, eventId: string) => {
    const data = await prisma.agendaAfspraakData.findUnique({ where: { eventId } }) as (Record<string, unknown> & { klantIds?: string; regels?: string; klantId?: string; locatie?: string }) | null
    if (!data) return null
    let klantIds: string[] = []
    if (data.klantIds) { try { klantIds = JSON.parse(data.klantIds) } catch {} }
    else if (data.klantId) klantIds = [data.klantId]
    const regels = data.regels ? (() => { try { return JSON.parse(data.regels as string) } catch { return [] } })() : []
    return { klantIds, regels, locatie: data.locatie ?? null }
  })

  ipcMain.handle('agenda:update-afspraak', async (_, eventId: string, data: {
    klantIds?: string[]
    locatie?: string
    regels?: Array<{ omschrijving: string; aantal: number; eenheid?: string; prijs: number; btwPercentage: number }>
    startDatumTijd?: string
    eindDatumTijd?: string
    geheledag?: boolean
    calendarId?: string
  }) => {
    const user = await prisma.user.findFirst()
    if (!user?.googleRefreshToken) throw new Error('Google Agenda niet gekoppeld.')
    const accessToken = await refreshTokenIfNeeded(user)
    if (!accessToken) throw new Error('Token vernieuwen mislukt.')

    const calendarId = data.calendarId
      || (user as Record<string, unknown>).googlePrimaryCalendarId as string | null
      || 'primary'

    const klantIds = data.klantIds ?? []
    let titel: string | undefined
    if (klantIds.length > 0) {
      const klanten = await prisma.klant.findMany({ where: { id: { in: klantIds } } })
      const namen = klantIds.map(id => klanten.find(k => k.id === id)).filter(Boolean).map(k => k!.bedrijf || k!.naam)
      const delen = [...namen]
      if (data.locatie) delen.push(data.locatie)
      titel = delen.length > 0 ? delen.join(' – ') : 'Afspraak'
    } else if (data.locatie) {
      titel = data.locatie
    }

    await wijzigGoogleAfspraak(accessToken, calendarId, eventId, {
      titel,
      startDatumTijd: data.startDatumTijd,
      eindDatumTijd: data.eindDatumTijd,
      geheledag: data.geheledag,
      locatie: data.locatie,
    })

    // Update lokale AfspraakData
    await prisma.agendaAfspraakData.upsert({
      where: { eventId },
      create: {
        id: require('crypto').randomUUID(),
        eventId,
        klantId: klantIds[0] ?? null,
        klantIds: klantIds.length > 0 ? JSON.stringify(klantIds) : null,
        locatie: data.locatie ?? null,
        regels: data.regels ? JSON.stringify(data.regels) : null,
      } as Parameters<typeof prisma.agendaAfspraakData.create>[0]['data'],
      update: {
        klantId: klantIds[0] ?? null,
        klantIds: klantIds.length > 0 ? JSON.stringify(klantIds) : null,
        locatie: data.locatie ?? null,
        regels: data.regels ? JSON.stringify(data.regels) : null,
      } as Parameters<typeof prisma.agendaAfspraakData.update>[0]['data'],
    })

    return { succes: true }
  })

  ipcMain.handle('agenda:stuur-bevestiging', async (_, eventId: string) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')
    if (!user.emailSmtpHost || !user.emailSmtpUser) throw new Error('SMTP niet geconfigureerd')

    const afspraakData = await prisma.agendaAfspraakData.findUnique({ where: { eventId } }) as (Record<string, unknown> & { klantIds?: string; klantId?: string; locatie?: string }) | null
    if (!afspraakData) throw new Error('Geen afspraakgegevens gevonden.')

    let klantIds: string[] = []
    if (afspraakData.klantIds) { try { klantIds = JSON.parse(afspraakData.klantIds) } catch {} }
    else if (afspraakData.klantId) klantIds = [afspraakData.klantId]

    if (klantIds.length === 0) throw new Error('Geen klanten gekoppeld aan deze afspraak.')

    const klanten = await prisma.klant.findMany({ where: { id: { in: klantIds }, email: { not: null } } })
    const _smtpPoort2 = user.emailSmtpPort ?? 587
    const smtpConfig = { host: user.emailSmtpHost, port: _smtpPoort2, secure: _smtpPoort2 === 465 ? true : _smtpPoort2 === 587 ? false : user.emailSmtpSecure, user: user.emailSmtpUser!, pass: user.emailSmtpPass ?? '' }

    // Haal Google Calendar event op voor details
    const accessToken = await refreshTokenIfNeeded(user)
    let afspraakDetails: { samenvatting?: string; start?: string; einde?: string; geheledag?: boolean; locatie?: string } = {}
    if (accessToken) {
      try {
        const calendarId = (user as Record<string, unknown>).googlePrimaryCalendarId as string | null || 'primary'
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        if (response.ok) {
          const ev = await response.json()
          const startObj = ev.start as Record<string, string>
          const eindObj = ev.end as Record<string, string>
          const geheledag = !!startObj?.date
          afspraakDetails = {
            samenvatting: ev.summary,
            start: startObj?.dateTime ?? startObj?.date,
            einde: eindObj?.dateTime ?? eindObj?.date,
            geheledag,
            locatie: ev.location ?? afspraakData.locatie,
          }
        }
      } catch {}
    }

    const datumStr = afspraakDetails.start
      ? afspraakDetails.geheledag
        ? new Date(afspraakDetails.start).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : `${new Date(afspraakDetails.start).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} van ${new Date(afspraakDetails.start).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} tot ${new Date(afspraakDetails.einde!).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
      : ''

    const emailBevestigingOnderwerp = (user as Record<string, unknown>).emailBevestigingOnderwerp as string | null
    const emailBevestigingTekst = (user as Record<string, unknown>).emailBevestigingTekst as string | null

    let verstuurd = 0
    for (const klant of klanten) {
      if (!klant.email) continue

      let html: string
      if (emailBevestigingTekst) {
        html = emailBevestigingTekst
          .replace(/{{naam}}/g, klant.naam)
          .replace(/{{onderwerp}}/g, afspraakDetails.samenvatting ?? '')
          .replace(/{{datum}}/g, datumStr)
          .replace(/{{locatie}}/g, afspraakDetails.locatie ?? '')
          .split('\n').map(l => `<p>${l}</p>`).join('')
      } else {
        const aanhef = (user.emailAanhef ?? 'Geachte {{naam}},').replace(/{{naam}}/g, klant.naam)
        const afsluiting = `${user.emailAfsluitingsTekst ?? 'Met vriendelijke groet,'}<br>${user.naam}${user.bedrijfsnaam ? '<br>' + user.bedrijfsnaam : ''}`
        html = `
          <p>${aanhef}</p>
          <p>Hierbij bevestigen wij uw afspraak:</p>
          <table style="border-collapse:collapse;width:100%;margin:12px 0">
            ${afspraakDetails.samenvatting ? `<tr><td style="padding:6px 10px;color:#6b7280;width:140px">Onderwerp</td><td style="padding:6px 10px"><strong>${afspraakDetails.samenvatting}</strong></td></tr>` : ''}
            ${datumStr ? `<tr><td style="padding:6px 10px;color:#6b7280">Datum &amp; tijd</td><td style="padding:6px 10px">${datumStr}</td></tr>` : ''}
            ${afspraakDetails.locatie ? `<tr><td style="padding:6px 10px;color:#6b7280">Locatie</td><td style="padding:6px 10px">${afspraakDetails.locatie}</td></tr>` : ''}
          </table>
          <p>${afsluiting}</p>
        `
      }
      if (user.logoBase64) html += `<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb"><img src="${user.logoBase64}" alt="Logo" style="max-height:60px;max-width:200px" /></div>`

      const onderwerp = emailBevestigingOnderwerp
        ? emailBevestigingOnderwerp.replace(/{{onderwerp}}/g, afspraakDetails.samenvatting ?? '').replace(/{{naam}}/g, klant.naam)
        : `Afspraakbevestiging${afspraakDetails.samenvatting ? ' – ' + afspraakDetails.samenvatting : ''}`

      // ICS bijlage aanmaken
      const icsBijlagen = afspraakDetails.start ? [{
        bestandsnaam: 'afspraak.ics',
        inhoud: maakIcsInhoud({ samenvatting: afspraakDetails.samenvatting, start: afspraakDetails.start, einde: afspraakDetails.einde, geheledag: afspraakDetails.geheledag, locatie: afspraakDetails.locatie, uid: eventId }),
        contentType: 'text/calendar; method=PUBLISH'
      }] : []

      try {
        await verstuurEmail(smtpConfig, { van: user.emailSmtpUser!, naar: klant.email, onderwerp, html, bijlagen: icsBijlagen })
        verstuurd++
      } catch {}
    }

    return { succes: true, verstuurd }
  })

  ipcMain.handle('agenda:verwijder-afspraak', async (_, eventId: string, calendarId?: string) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')

    const accessToken = await refreshTokenIfNeeded(user)
    if (!accessToken) throw new Error('Google niet gekoppeld')

    const kalId = calendarId || (user as Record<string, unknown>).googlePrimaryCalendarId as string | null || 'primary'

    await verwijderGoogleAfspraak(accessToken, kalId, eventId)

    // Remove local data as well
    await prisma.agendaAfspraakData.deleteMany({ where: { eventId } }).catch(() => {})

    return { succes: true }
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
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? mainWindow
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
      const factuur = await prisma.factuur.findUnique({
        where: { id: factuurId },
        include: { regels: true, klant: true }
      })
      if (!factuur) return { succes: false, fout: 'Factuur niet gevonden' }

      const parentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      if (!parentWindow) return { succes: false, fout: 'Geen actief venster' }

      const user = await prisma.user.findFirst({ select: { pdfMapPad: true, factuurHtmlTemplate: true, logoBase64: true, naam: true, bedrijfsnaam: true, adres: true, postcode: true, stad: true, email: true, telefoon: true, website: true, kvkNummer: true, btwNummer: true, iban: true, korActief: true } })
      const pdfPad = user?.pdfMapPad
        ? join(user.pdfMapPad, `factuur-${factuur.nummer}.pdf`)
        : `factuur-${factuur.nummer}.pdf`

      const result = await dialog.showSaveDialog(parentWindow, {
        defaultPath: pdfPad,
        filters: [{ name: 'PDF bestanden', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return { succes: false }

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

      if (user?.factuurHtmlTemplate?.trim()) {
        // Render custom HTML template met variabelen
        const f = factuur as typeof factuur & { klant: { naam: string; bedrijf?: string | null; adres?: string | null; postcode?: string | null; stad?: string | null; btwNummer?: string | null }; regels: Array<{ omschrijving: string; aantal: number; eenheid?: string | null; prijs: number; btwPercentage: number; kortingPercentage: number; totaal: number }> }
        const regelsHtml = `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ddd">Omschrijving</th><th style="text-align:center;padding:4px 8px;border-bottom:1px solid #ddd">Aantal</th><th style="text-align:right;padding:4px 8px;border-bottom:1px solid #ddd">Prijs</th><th style="text-align:right;padding:4px 8px;border-bottom:1px solid #ddd">Totaal</th></tr></thead><tbody>${f.regels.map(r => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${r.omschrijving}${r.eenheid ? ` / ${r.eenheid}` : ''}</td><td style="text-align:center;padding:4px 8px;border-bottom:1px solid #eee">${r.aantal}</td><td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">€${r.prijs.toFixed(2)}</td><td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">€${r.totaal.toFixed(2)}</td></tr>`).join('')}</tbody></table>`
        const logoHtml = user.logoBase64 ? `<img src="${user.logoBase64}" style="max-height:80px" />` : ''
        const vars: Record<string, string> = {
          bedrijfsnaam: user.bedrijfsnaam ?? user.naam ?? '',
          bedrijfAdres: user.adres ?? '',
          bedrijfPostcode: user.postcode ?? '',
          bedrijfStad: user.stad ?? '',
          bedrijfEmail: user.email ?? '',
          bedrijfTelefoon: user.telefoon ?? '',
          bedrijfWebsite: user.website ?? '',
          kvkNummer: user.kvkNummer ?? '',
          btwNummer: user.btwNummer ?? '',
          iban: user.iban ?? '',
          logo: logoHtml,
          factuurNummer: f.nummer,
          factuurDatum: f.datum.toISOString().split('T')[0],
          vervaldatum: f.vervaldatum.toISOString().split('T')[0],
          notities: f.notities ?? '',
          betalingsCondities: f.betalingsCondities ?? '',
          klantNaam: f.klant.naam,
          klantBedrijf: f.klant.bedrijf ?? '',
          klantAdres: f.klant.adres ?? '',
          klantPostcode: f.klant.postcode ?? '',
          klantStad: f.klant.stad ?? '',
          klantBtwNummer: f.klant.btwNummer ?? '',
          subtotaal: `€${f.subtotaal.toFixed(2)}`,
          kortingBedrag: `€${f.kortingBedrag.toFixed(2)}`,
          btwBedrag: `€${f.btwBedrag.toFixed(2)}`,
          totaalBedrag: `€${f.totaal.toFixed(2)}`,
          regelsHtml,
        }
        const html = user.factuurHtmlTemplate.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      } else if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        await pdfWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/facturen/${factuurId}/print`)
      } else {
        await pdfWindow.loadFile(join(__dirname, '../renderer/index.html'), {
          hash: `/facturen/${factuurId}/print`
        })
      }

      await new Promise(resolve => setTimeout(resolve, 1500))
      const pdfBuffer = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      pdfWindow.destroy()

      fs.writeFileSync(result.filePath, pdfBuffer)
      await prisma.factuur.update({ where: { id: factuurId }, data: { bronBestandPad: result.filePath } })
      return { succes: true, pad: result.filePath }
    } catch (e: unknown) {
      return { succes: false, fout: e instanceof Error ? e.message : 'Onbekende fout' }
    }
  })

  ipcMain.handle('facturen:openBronBestand', async (_, factuurId: string) => {
    const factuur = await prisma.factuur.findUnique({ where: { id: factuurId }, select: { bronBestandPad: true } })
    if (!factuur?.bronBestandPad) return { succes: false, fout: 'Geen bestand gekoppeld' }
    if (!fs.existsSync(factuur.bronBestandPad)) return { succes: false, fout: 'Bestand niet gevonden op schijf' }
    await shell.openPath(factuur.bronBestandPad)
    return { succes: true }
  })

  // ── Bank CSV import ──
  ipcMain.handle('bank:openBestandDialog', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showOpenDialog(focusedWindow!, {
      filters: [
        { name: 'Bank bestanden', extensions: ['csv', 'xml'] },
        { name: 'CSV bestanden', extensions: ['csv'] },
        { name: 'CAMT.053 XML', extensions: ['xml'] },
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('bank:importeerCsv', async (_, { bank, filePath }: { bank: 'abn' | 'ing' | 'rabobank' | 'knab' | 'camt'; filePath: string }) => {
    const inhoud = fs.readFileSync(filePath, 'utf-8')

    // ── CAMT.053 XML parser ─────────────────────────────────────────────────
    if (bank === 'camt' || filePath.toLowerCase().endsWith('.xml')) {
      try {
        const doc = new DOMParser().parseFromString(inhoud, 'text/xml')

        // Zoek directe child-element op tagnaam
        function kind(parent: Element | null, tag: string): Element | null {
          if (!parent) return null
          for (let i = 0; i < parent.children.length; i++) {
            const c = parent.children[i] as Element
            if (c.localName === tag || c.tagName === tag || c.tagName.split(':').pop() === tag) return c
          }
          return null
        }
        // Diepste descendant op tagnaam
        function zoek(node: Element | null, tag: string): Element | null {
          if (!node) return null
          const els = node.getElementsByTagName(tag)
          if (els.length > 0) return els[0] as Element
          // ook proberen met namespace-prefix
          const all = node.getElementsByTagName('*')
          for (let i = 0; i < all.length; i++) {
            const el = all[i] as Element
            if (el.localName === tag) return el
          }
          return null
        }
        function txt(node: Element | null): string {
          return node?.textContent?.trim() ?? ''
        }

        const ntryEls = doc.getElementsByTagName('Ntry')
        const transacties: Array<{
          datum: string; omschrijving: string; bedrag: number; type: 'inkomen' | 'uitgave';
          tegenrekeningNaam?: string; tegenrekening?: string; mutatiesoort?: string;
          mededelingen?: string; betalingskenmerk?: string; saldoNaBoeking?: string
        }> = []

        for (let i = 0; i < ntryEls.length; i++) {
          const ntry = ntryEls[i] as Element
          const amtEl = zoek(ntry, 'Amt')
          const bedrag = Math.abs(parseFloat(txt(amtEl).replace(',', '.')) || 0)
          if (bedrag === 0) continue

          const cdtDbt = txt(zoek(ntry, 'CdtDbtInd')).toUpperCase()
          const isDebet = cdtDbt === 'DBIT'

          // Datum: BookgDt/Dt eerst, daarna ValDt/Dt
          const bookDt = zoek(ntry, 'BookgDt')
          const valDt = zoek(ntry, 'ValDt')
          const datumRaw = txt(zoek(bookDt, 'Dt')) || txt(zoek(valDt, 'Dt')) || txt(zoek(ntry, 'Dt'))
          const datum = datumRaw.slice(0, 10)

          // Mutatiesoort: BkTxCd proprietary code of domein/familie
          const bkTxCd = zoek(ntry, 'BkTxCd')
          const prtry = zoek(bkTxCd, 'Prtry')
          const domn = zoek(bkTxCd, 'Domn')
          const fmly = zoek(domn, 'Fmly')
          const mutatiesoort = txt(zoek(prtry, 'Cd')) ||
            [txt(zoek(domn, 'Cd')), txt(zoek(fmly, 'Cd')), txt(zoek(fmly, 'SubFmlyCd'))].filter(Boolean).join('/') ||
            ''

          // TxDtls: eerste transactiedetail
          const txDtlsEls = ntry.getElementsByTagName('TxDtls')
          const txDtls = txDtlsEls.length > 0 ? txDtlsEls[0] as Element : null

          // Tegenpartij: Cdtr bij DBIT, Dbtr bij CRDT
          const rltdPties = zoek(txDtls, 'RltdPties')
          let tegenrekeningNaam = ''
          let tegenrekening = ''
          if (isDebet) {
            tegenrekeningNaam = txt(zoek(zoek(rltdPties, 'Cdtr'), 'Nm'))
            tegenrekening = txt(zoek(zoek(zoek(rltdPties, 'CdtrAcct'), 'Id'), 'IBAN'))
          } else {
            tegenrekeningNaam = txt(zoek(zoek(rltdPties, 'Dbtr'), 'Nm'))
            tegenrekening = txt(zoek(zoek(zoek(rltdPties, 'DbtrAcct'), 'Id'), 'IBAN'))
          }

          // Betalingskenmerk: EndToEndId (NOTPROVIDED = leeg laten)
          const refs = zoek(txDtls, 'Refs')
          const e2eId = txt(zoek(refs, 'EndToEndId'))
          const betalingskenmerk = (e2eId && e2eId !== 'NOTPROVIDED') ? e2eId : ''

          // Mededelingen: RmtInf/Ustrd
          const rmtInf = zoek(txDtls, 'RmtInf')
          const mededelingen = txt(zoek(rmtInf, 'Ustrd')) || txt(zoek(rmtInf, 'Strd'))

          // Omschrijving: AddtlNtryInf > mededelingen > tegenpartijnaam
          const omschrijving = txt(zoek(ntry, 'AddtlNtryInf')) || mededelingen || tegenrekeningNaam || 'Onbekend'

          transacties.push({
            datum,
            omschrijving,
            bedrag: isDebet ? -bedrag : bedrag,
            type: isDebet ? 'uitgave' : 'inkomen',
            tegenrekeningNaam: tegenrekeningNaam || undefined,
            tegenrekening: tegenrekening || undefined,
            mutatiesoort: mutatiesoort || undefined,
            mededelingen: (mededelingen && mededelingen !== omschrijving) ? mededelingen : undefined,
            betalingskenmerk: betalingskenmerk || undefined,
          })
        }

        return { transacties, autoHerkend: transacties.length > 0 }
      } catch (err) {
        return { transacties: [], autoHerkend: false, fout: String(err) }
      }
    }

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
    const transacties: Array<{ datum: string; omschrijving: string; bedrag: number; type: 'inkomen' | 'uitgave'; tegenrekeningNaam?: string; tegenrekening?: string; mutatiesoort?: string; mededelingen?: string; saldoNaBoeking?: string }> = []

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

          const tegenrekeningIdx = header.findIndex(h => h.toLowerCase().includes('tegenrekening'))
          const mutatiesoortIdx = header.findIndex(h => h.toLowerCase().includes('mutatiesoort') || h.toLowerCase().includes('code'))
          const mededelingenIdx = header.findIndex(h => h.toLowerCase().includes('mededelingen') || h.toLowerCase().includes('omschrijving') && h !== header[omschrijvingIdx])

          transacties.push({
            datum,
            omschrijving: omschrijving || 'Onbekend',
            bedrag: isDebet ? -bedragAbs : bedragAbs,
            type: isDebet ? 'uitgave' : 'inkomen',
            tegenrekening: tegenrekeningIdx >= 0 ? (velden[tegenrekeningIdx] ?? '') : '',
            mutatiesoort: mutatiesoortIdx >= 0 ? (velden[mutatiesoortIdx] ?? '') : '',
            mededelingen: mededelingenIdx >= 0 ? (velden[mededelingenIdx] ?? '') : '',
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

          const tegenpartijNaamIdx = header.findIndex(h => h.toLowerCase().includes('tegenpartij naam'))
          const tegenpartijRekeningIdx = header.findIndex(h => h.toLowerCase().includes('tegenpartij rekening') || h.toLowerCase().includes('tegenpartijrekening'))
          const saldoIdx = header.findIndex(h => h.toLowerCase().includes('saldo'))
          const kenmerkenIdx = header.findIndex(h => h.toLowerCase().includes('betalingskenmerk') || h.toLowerCase().includes('kenmerk'))

          transacties.push({
            datum,
            omschrijving: omschrijving || 'Onbekend',
            bedrag,
            type: bedrag < 0 ? 'uitgave' : 'inkomen',
            tegenrekeningNaam: tegenpartijNaamIdx >= 0 ? (velden[tegenpartijNaamIdx] ?? '') : (naam || ''),
            tegenrekening: tegenpartijRekeningIdx >= 0 ? (velden[tegenpartijRekeningIdx] ?? '') : '',
            saldoNaBoeking: saldoIdx >= 0 ? (velden[saldoIdx] ?? '') : '',
            mededelingen: kenmerkenIdx >= 0 ? (velden[kenmerkenIdx] ?? '') : '',
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

          const balansIdx = header.findIndex(h => h.toLowerCase().includes('balans'))
          const tegenpartijIdx = header.findIndex(h => h.toLowerCase().includes('tegenpartij'))
          const typeIdx = header.findIndex(h => h.toLowerCase() === 'type')

          transacties.push({
            datum,
            omschrijving: omschrijving || 'Onbekend',
            bedrag: isDebet ? -bedragAbs : bedragAbs,
            type: isDebet ? 'uitgave' : 'inkomen',
            tegenrekeningNaam: tegenpartijIdx >= 0 ? (velden[tegenpartijIdx] ?? '') : '',
            saldoNaBoeking: balansIdx >= 0 ? (velden[balansIdx] ?? '') : '',
            mutatiesoort: typeIdx >= 0 ? (velden[typeIdx] ?? '') : '',
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
    const alleRijen = regels.slice(1).map(r => parseerCsvRij(r)).filter(r => r.some(v => v))
    const preview = alleRijen.slice(0, 5)
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

    const transacties: Array<{ datum: string; omschrijving: string; bedrag: number; type: 'inkomen' | 'uitgave'; tegenrekeningNaam?: string; tegenrekening?: string; mutatiesoort?: string; mededelingen?: string; saldoNaBoeking?: string }> = []
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
    bronBestandPad?: string
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

    let opgeslagenBronPad: string | undefined
    if (payload.bronBestandPad && fs.existsSync(payload.bronBestandPad)) {
      const bijlagenMap = join(app.getPath('userData'), 'bijlagen')
      if (!fs.existsSync(bijlagenMap)) fs.mkdirSync(bijlagenMap, { recursive: true })
      const ext = extname(payload.bronBestandPad)
      const doelBestand = join(bijlagenMap, `${payload.nummer.replace(/[^a-zA-Z0-9-_]/g, '_')}${ext}`)
      fs.copyFileSync(payload.bronBestandPad, doelBestand)
      opgeslagenBronPad = doelBestand
    }

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
        bronBestandPad: opgeslagenBronPad,
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
    const venster = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showOpenDialog(venster!, {
      filters: [{ name: 'Afbeeldingen & PDF', extensions: ['jpg', 'jpeg', 'png', 'pdf', 'webp'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { succes: false }

    const bronPad = result.filePaths[0]
    const bestandsnaam = basename(bronPad)
    const bonMap = join(app.getPath('userData'), 'bonnen')
    if (!fs.existsSync(bonMap)) fs.mkdirSync(bonMap, { recursive: true })

    const doelPad = join(bonMap, `${uitgaveId}-${Date.now()}-${bestandsnaam}`)
    try {
      fs.copyFileSync(bronPad, doelPad)
    } catch (e) {
      logSchrijven(`Bon kopiëren mislukt: ${e}`)
      return { succes: false, fout: 'Bestand kon niet worden gekopieerd. Controleer of er voldoende schijfruimte is.' }
    }

    await prisma.uitgave.update({ where: { id: uitgaveId }, data: { bonBestand: doelPad } })
    return { succes: true, pad: doelPad }
  })

  ipcMain.handle('uitgaven:openBon', async (_, { pad }: { pad: string }) => {
    await shell.openPath(pad)
    return { succes: true }
  })

  // Opens a file dialog and copies the selected file to the bonnen folder.
  // Does NOT require an existing uitgaveId — used for scanning before saving.
  ipcMain.handle('uitgaven:kiesBon', async () => {
    const venster = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showOpenDialog(venster!, {
      filters: [{ name: 'Afbeeldingen & PDF', extensions: ['jpg', 'jpeg', 'png', 'pdf', 'webp'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { succes: false }

    const bronPad = result.filePaths[0]
    const bestandsnaam = basename(bronPad)
    const bonMap = join(app.getPath('userData'), 'bonnen')
    if (!fs.existsSync(bonMap)) fs.mkdirSync(bonMap, { recursive: true })

    const doelPad = join(bonMap, `tmp-${Date.now()}-${bestandsnaam}`)
    try {
      fs.copyFileSync(bronPad, doelPad)
    } catch (e) {
      logSchrijven(`Bon kopiëren mislukt: ${e}`)
      return { succes: false, fout: 'Bestand kon niet worden gekopieerd. Controleer of er voldoende schijfruimte is.' }
    }
    return { succes: true, pad: doelPad }
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
      orderBy: { aangemaakt: 'desc' },
      take: 100
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

    try {
      fs.copyFileSync(dbPath, result.filePath)
    } catch (e) {
      logSchrijven(`Database backup mislukt: ${e}`)
      return { succes: false, fout: `Backup kon niet worden opgeslagen: ${e}` }
    }
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

  // ── Crediteuren ──
  ipcMain.handle('crediteuren:list', async (_, params?: { status?: string }) => {
    return prisma.crediteur.findMany({
      where: params?.status ? { status: params.status } : undefined,
      orderBy: { vervaldatum: 'asc' }
    })
  })

  ipcMain.handle('crediteuren:create', async (_, data: Record<string, unknown>) => {
    return prisma.crediteur.create({
      data: {
        ...data,
        factuurdatum: new Date(data.factuurdatum as string),
        vervaldatum: new Date(data.vervaldatum as string),
      } as Parameters<typeof prisma.crediteur.create>[0]['data']
    })
  })

  ipcMain.handle('crediteuren:update', async (_, id: string, data: Record<string, unknown>) => {
    return prisma.crediteur.update({
      where: { id },
      data: {
        ...data,
        factuurdatum: data.factuurdatum ? new Date(data.factuurdatum as string) : undefined,
        vervaldatum: data.vervaldatum ? new Date(data.vervaldatum as string) : undefined,
        betaaldOp: data.betaaldOp ? new Date(data.betaaldOp as string) : (data.betaaldOp === null ? null : undefined),
      } as Parameters<typeof prisma.crediteur.update>[0]['data']
    })
  })

  ipcMain.handle('crediteuren:delete', async (_, id: string) => {
    await prisma.crediteur.delete({ where: { id } })
    return { succes: true }
  })

  // ── Klant Notities ──
  ipcMain.handle('klanten:notities:list', async (_, klantId: string) => {
    return prisma.klantNotitie.findMany({
      where: { klantId },
      orderBy: { aangemaakt: 'desc' }
    })
  })

  ipcMain.handle('klanten:notities:create', async (_, data: { klantId: string; tekst: string }) => {
    return prisma.klantNotitie.create({ data })
  })

  ipcMain.handle('klanten:notities:delete', async (_, id: string) => {
    await prisma.klantNotitie.delete({ where: { id } })
    return { succes: true }
  })

  // ── Ritten doorbelasten ──
  ipcMain.handle('ritten:doorbelasten', async (_, payload: { klantId: string; ritIds: string[] }) => {
    const user = await prisma.user.findFirst()
    const klant = await prisma.klant.findUnique({ where: { id: payload.klantId } })
    if (!user || !klant) throw new Error('Gebruiker of klant niet gevonden')

    const ritten = await prisma.rit.findMany({ where: { id: { in: payload.ritIds } }, orderBy: { datum: 'asc' } })
    if (!ritten.length) throw new Error('Geen ritten geselecteerd')

    const kmVergoeding = user.kmVergoeding ?? 0.23
    const regels = ritten.map(r => {
      const km = r.retour ? r.kilometers * 2 : r.kilometers
      return {
        omschrijving: `${r.van} → ${r.naar}${r.retour ? ' (retour)' : ''} — ${r.omschrijving}`,
        aantal: km,
        eenheid: 'km',
        prijs: kmVergoeding,
        btwPercentage: 0,
        kortingPercentage: 0,
        totaal: km * kmVergoeding,
        volgorde: 0,
      }
    })

    const subtotaal = regels.reduce((s, r) => s + r.totaal, 0)
    const volgNummer = user.factuurVolgNummer
    const jaar = new Date().getFullYear()
    const nummerFormaat = user.factuurNummerFormaat ?? '{PREFIX}{JAAR}-{NNNN}'
    const nummer = nummerFormaat
      .replace('{PREFIX}', user.factuurPrefix ?? 'F')
      .replace('{JAAR}', String(jaar))
      .replace('{NNNN}', String(volgNummer).padStart(4, '0'))
      .replace('{NN}', String(volgNummer).padStart(2, '0'))

    const vervaldatum = new Date()
    vervaldatum.setDate(vervaldatum.getDate() + (klant.betaalTermijn ?? user.standaardBetaalTermijn ?? 30))

    const factuur = await prisma.factuur.create({
      data: {
        nummer,
        klantId: payload.klantId,
        status: 'CONCEPT',
        datum: new Date(),
        vervaldatum,
        subtotaal,
        kortingBedrag: 0,
        kortingPercentage: 0,
        btwBedrag: 0,
        totaal: subtotaal,
        regels: { create: regels },
      }
    })

    await prisma.user.update({ where: { id: user.id }, data: { factuurVolgNummer: volgNummer + 1 } })
    await prisma.rit.updateMany({ where: { id: { in: payload.ritIds } }, data: { gefactureerd: true, factuurId: factuur.id } })

    return { factuurId: factuur.id, nummer: factuur.nummer }
  })

  // ── Offertes auto-verlopen ──
  ipcMain.handle('offertes:checkVerlopen', async () => {
    const nu = new Date()
    const resultaat = await prisma.offerte.updateMany({
      where: { status: 'VERZONDEN', geldigTot: { lt: nu } },
      data: { status: 'VERLOPEN' }
    })
    return { bijgewerkt: resultaat.count }
  })

  // ── Rapport: BTW export ──
  ipcMain.handle('rapport:exportBtw', async (_, params: { van: string; tot: string; kwartaal?: string }) => {
    const van = new Date(params.van)
    const tot = new Date(params.tot)
    tot.setHours(23, 59, 59, 999)

    const [facturen, uitgaven] = await Promise.all([
      prisma.factuur.findMany({
        where: { status: { in: ['BETAALD', 'VERZONDEN'] }, datum: { gte: van, lte: tot } },
        include: { regels: true }
      }),
      prisma.uitgave.findMany({
        where: { datum: { gte: van, lte: tot }, zakelijk: true },
        include: { categorie: true }
      })
    ])

    const bom = '﻿'
    const sep = ';'
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return s.includes(sep) || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
    }

    const factuurRijen = facturen.map(f => {
      const btwBedrag = f.btwVerlegd ? 0 : f.btwBedrag
      return [
        f.datum.toISOString().split('T')[0],
        f.nummer,
        `Omzet`,
        f.subtotaal.toFixed(2).replace('.', ','),
        btwBedrag.toFixed(2).replace('.', ','),
        f.totaal.toFixed(2).replace('.', ','),
        f.status,
      ].map(esc).join(sep)
    })

    const uitgaveRijen = uitgaven.map(u => [
      u.datum.toISOString().split('T')[0],
      u.leverancier ?? u.omschrijving,
      u.categorie?.naam ?? 'Kosten',
      (-(u.bedrag - u.btwBedrag)).toFixed(2).replace('.', ','),
      (-u.btwBedrag).toFixed(2).replace('.', ','),
      (-u.bedrag).toFixed(2).replace('.', ','),
      '',
    ].map(esc).join(sep))

    const headers = ['Datum', 'Omschrijving', 'Type', 'Bedrag excl. BTW', 'BTW bedrag', 'Bedrag incl. BTW', 'Status'].join(sep)
    const csv = bom + [headers, ...factuurRijen, ...uitgaveRijen].join('\n')

    const periode = params.kwartaal ?? `${van.toISOString().slice(0,10)}_${tot.toISOString().slice(0,10)}`
    const result = await dialog.showSaveDialog({
      defaultPath: `btw-aangifte-${periode}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return { geannuleerd: true }
    fs.writeFileSync(result.filePath, csv, 'utf8')
    return { succes: true, pad: result.filePath }
  })

  // ── Bank: koppel transactie aan factuur ──
  ipcMain.handle('bank:zoekFactuurMatch', async (_, params: {
    bedrag: number;
    datum: string;
    omschrijving?: string;
    mededelingen?: string;
    betalingskenmerk?: string;
  }) => {
    const [alleOpenRaw, alleFacturenRaw] = await Promise.all([
      prisma.factuur.findMany({
        where: { status: { in: ['VERZONDEN', 'VERLOPEN'] } },
        include: {
          klant: { select: { naam: true, bedrijf: true } },
          inkomsten: { select: { bedrag: true } },
          betalingen: { select: { bedrag: true } },
        },
        orderBy: { vervaldatum: 'asc' },
      }),
      prisma.factuur.findMany({
        where: { status: { notIn: ['CONCEPT', 'GEANNULEERD'] } },
        include: {
          klant: { select: { naam: true, bedrijf: true } },
          inkomsten: { select: { bedrag: true } },
          betalingen: { select: { bedrag: true } },
        },
        orderBy: { datum: 'desc' },
      }),
    ])

    const enricheer = (list: typeof alleOpenRaw) => list.map(f => {
      const reedsBetaald = (f as any).betalingen?.reduce((s: number, b: { bedrag: number }) => s + b.bedrag, 0)
        ?? f.inkomsten.reduce((s: number, i: { bedrag: number }) => s + i.bedrag, 0)
      const openstaand = Math.max(0, f.totaal - reedsBetaald)
      const teveel = Math.max(0, reedsBetaald - f.totaal)
      return { ...f, reedsBetaald, openstaand, teveel }
    })

    const alleOpen = enricheer(alleOpenRaw)
    const alleFacturen = enricheer(alleFacturenRaw)

    const zoekTekst = [params.omschrijving, params.mededelingen, params.betalingskenmerk]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const tol = (bedrag: number) => Math.max(bedrag * 0.02, 0.02)
    const bedragKlopt = (f: (typeof alleOpen)[0]) =>
      Math.abs(f.openstaand - params.bedrag) <= tol(f.openstaand)

    // Facturen waarvan het nummer voorkomt in de betaaltekst (niet als onderdeel van een langer nummer)
    const nummerMatches = zoekTekst
      ? alleOpen.filter(f => {
          const escaped = f.nummer.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          return new RegExp(`(?<![0-9a-z])${escaped}(?![0-9a-z])`, 'i').test(zoekTekst)
        })
      : []

    if (nummerMatches.length > 0) {
      const volledigeMatches = nummerMatches.filter(bedragKlopt)
      const alleenNummerMatches = nummerMatches.filter(f => !volledigeMatches.find(v => v.id === f.id))
      return {
        matchType: volledigeMatches.length > 0 ? 'volledig' : 'alleenNummer',
        volledigeMatches,
        alleenNummerMatches,
        bedragMatches: [],
        alleOpen,
        alleFacturen,
      }
    }

    // Geen nummermatch — kijk naar bedrag
    const bedragMatches = alleOpen.filter(bedragKlopt)
    return {
      matchType: bedragMatches.length > 0 ? 'bedrag' : 'geen',
      volledigeMatches: [],
      alleenNummerMatches: [],
      bedragMatches,
      alleOpen,
      alleFacturen,
    }
  })

  ipcMain.handle('bank:koppelAanFactuur', async (_, params: { inkomstenId: string; factuurId: string }) => {
    const inkomen = await prisma.inkomen.findUnique({ where: { id: params.inkomstenId }, select: { bedrag: true } })
    if (!inkomen) throw new Error('Niet gevonden')

    await prisma.inkomenFactuur.upsert({
      where: { inkomstenId_factuurId: { inkomstenId: params.inkomstenId, factuurId: params.factuurId } },
      create: { inkomstenId: params.inkomstenId, factuurId: params.factuurId, bedrag: inkomen.bedrag },
      update: { bedrag: inkomen.bedrag },
    })

    // Bereken groepsstatus en update ALLE facturen in de groep
    const { groepTotaal, groepOntvangen } = await berekenEnUpdateGroep(params.factuurId)
    const factuur = await prisma.factuur.findUnique({ where: { id: params.factuurId }, select: { nummer: true } })
    const volledigBetaald = groepOntvangen >= groepTotaal * 0.99
    return {
      succes: true,
      factuurNummer: factuur?.nummer ?? '',
      volledigBetaald,
      openstaand: Math.max(0, groepTotaal - groepOntvangen),
      teveel: Math.max(0, groepOntvangen - groepTotaal),
    }
  })

  ipcMain.handle('bank:koppelAanMeerdereFacturen', async (_, params: {
    inkomstenId: string;
    koppelingen: { factuurId: string; bedrag: number }[];
  }) => {
    const inkomen = await prisma.inkomen.findUnique({ where: { id: params.inkomstenId } })
    if (!inkomen) throw new Error('Inkomen niet gevonden')

    // Sla alle koppelingen op
    for (const { factuurId, bedrag } of params.koppelingen) {
      await prisma.inkomenFactuur.upsert({
        where: { inkomstenId_factuurId: { inkomstenId: params.inkomstenId, factuurId } },
        create: { inkomstenId: params.inkomstenId, factuurId, bedrag },
        update: { bedrag },
      })
    }

    // Bereken groepsstatus via eerste factuurId (alle zijn verbonden via dezelfde betaling)
    const eersteFactuurId = params.koppelingen[0]?.factuurId
    if (!eersteFactuurId) return { succes: true, resultaten: [] }

    const { groepTotaal, groepOntvangen } = await berekenEnUpdateGroep(eersteFactuurId)
    const volledigBetaald = groepOntvangen >= groepTotaal * 0.99

    const resultaten = await Promise.all(params.koppelingen.map(async ({ factuurId }) => {
      const f = await prisma.factuur.findUnique({ where: { id: factuurId }, select: { nummer: true } })
      return {
        factuurNummer: f?.nummer ?? '',
        volledigBetaald,
        openstaand: Math.max(0, groepTotaal - groepOntvangen),
        teveel: Math.max(0, groepOntvangen - groepTotaal),
      }
    }))

    return { succes: true, resultaten }
  })

  // ── Bank: ontkoppel betaling van factuur/facturen ──
  ipcMain.handle('bank:ontkoppelVanFacturen', async (_, inkomstenId: string) => {
    const koppelingen = await prisma.inkomenFactuur.findMany({
      where: { inkomstenId },
      select: { factuurId: true, bedrag: true },
    })
    await Promise.all([
      prisma.inkomenFactuur.deleteMany({ where: { inkomstenId } }),
      prisma.inkomen.update({ where: { id: inkomstenId }, data: { factuurId: null } }).catch(() => {}),
    ])
    // Herstel facturstatus via groepsberekening (respecteert handmatigBetaald)
    for (const { factuurId } of koppelingen) {
      await berekenEnUpdateGroep(factuurId)
    }
    return { succes: true }
  })

  // ── Excel export per jaar ──
  ipcMain.handle('app:exporteerExcel', async (_, jaar: number) => {
    const XLSX = require('xlsx') as typeof import('xlsx')

    const begin = new Date(jaar, 0, 1)
    const einde = new Date(jaar, 11, 31, 23, 59, 59)

    const [facturen, uitgaven, inkomen, crediteuren] = await Promise.all([
      prisma.factuur.findMany({
        where: { datum: { gte: begin, lte: einde } },
        include: { klant: { select: { naam: true, bedrijf: true } }, regels: true },
        orderBy: { datum: 'asc' }
      }),
      prisma.uitgave.findMany({
        where: { datum: { gte: begin, lte: einde } },
        include: { categorie: { select: { naam: true } } },
        orderBy: { datum: 'asc' }
      }),
      prisma.inkomen.findMany({
        where: { datum: { gte: begin, lte: einde } },
        orderBy: { datum: 'asc' }
      }),
      prisma.crediteur.findMany({
        where: { factuurdatum: { gte: begin, lte: einde } },
        orderBy: { factuurdatum: 'asc' }
      }),
    ])

    const wb = XLSX.utils.book_new()

    const factuurRijen = facturen.map(f => ({
      Nummer: f.nummer,
      Datum: f.datum.toISOString().split('T')[0],
      Vervaldatum: f.vervaldatum.toISOString().split('T')[0],
      Klant: f.klant.bedrijf ?? f.klant.naam,
      Status: f.status,
      'Subtotaal excl. BTW': f.subtotaal,
      'BTW bedrag': f.btwBedrag,
      'Totaal incl. BTW': f.totaal,
      Regels: f.regels.length,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(factuurRijen), 'Facturen')

    const uitgaveRijen = uitgaven.map(u => ({
      Datum: u.datum.toISOString().split('T')[0],
      Omschrijving: u.omschrijving,
      Leverancier: u.leverancier ?? '',
      Categorie: u.categorie?.naam ?? '',
      'Bedrag incl. BTW': u.bedrag,
      'BTW%': u.btwPercentage,
      'BTW bedrag': u.btwBedrag,
      'Zakelijk%': u.zakelijkPercent,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(uitgaveRijen), 'Uitgaven')

    const inkomenRijen = inkomen.map(i => ({
      Datum: i.datum.toISOString().split('T')[0],
      Omschrijving: i.omschrijving,
      Bedrag: i.bedrag,
      Bron: i.bron ?? '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inkomenRijen), 'Inkomen')

    const crediteurRijen = crediteuren.map(c => ({
      Leverancier: c.leverancier,
      Factuurnummer: c.factuurNummer ?? '',
      Factuurdatum: c.factuurdatum.toISOString().split('T')[0],
      Vervaldatum: c.vervaldatum.toISOString().split('T')[0],
      Bedrag: c.bedrag,
      'BTW bedrag': c.btwBedrag,
      Status: c.status,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(crediteurRijen), 'Crediteuren')

    const parentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(parentWindow!, {
      defaultPath: `boekhouding-${jaar}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { geannuleerd: true }

    XLSX.writeFile(wb, result.filePath)
    return { succes: true, pad: result.filePath }
  })

  // ── PDF-archief (alle facturen van een jaar naar map) ──
  ipcMain.handle('app:exportPdfArchief', async (_, jaar: number) => {
    const facturen = await prisma.factuur.findMany({
      where: { datum: { gte: new Date(jaar, 0, 1), lte: new Date(jaar, 11, 31, 23, 59, 59) }, status: { not: 'CONCEPT' } },
      orderBy: { datum: 'asc' },
      select: { id: true, nummer: true }
    })
    if (!facturen.length) return { fout: `Geen facturen gevonden voor ${jaar}` }

    const parentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const dirResult = await dialog.showOpenDialog(parentWindow!, {
      title: `Map kiezen voor PDF-archief ${jaar}`,
      properties: ['openDirectory', 'createDirectory']
    })
    if (dirResult.canceled || !dirResult.filePaths[0]) return { geannuleerd: true }

    const doelMap = dirResult.filePaths[0]
    const user = await prisma.user.findFirst({ select: { factuurHtmlTemplate: true, logoBase64: true, naam: true, bedrijfsnaam: true, adres: true, postcode: true, stad: true, email: true, telefoon: true, website: true, kvkNummer: true, btwNummer: true, iban: true, korActief: true } })

    let aangemaakt = 0
    for (const f of facturen) {
      let pdfWindow: BrowserWindow | null = null
      try {
        pdfWindow = new BrowserWindow({
          show: false, width: 900, height: 1200,
          webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false }
        })
        pdfWindow.setMenuBarVisibility(false)

        if (user?.factuurHtmlTemplate?.trim()) {
          const factuur = await prisma.factuur.findUnique({ where: { id: f.id }, include: { regels: true, klant: true } })
          if (factuur) {
            const regelsHtml = `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ddd">Omschrijving</th><th style="text-align:center;padding:4px 8px;border-bottom:1px solid #ddd">Aantal</th><th style="text-align:right;padding:4px 8px;border-bottom:1px solid #ddd">Prijs</th><th style="text-align:right;padding:4px 8px;border-bottom:1px solid #ddd">Totaal</th></tr></thead><tbody>${factuur.regels.map((r: { omschrijving: string; aantal: number; eenheid?: string | null; prijs: number; totaal: number }) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${r.omschrijving}${r.eenheid ? ` / ${r.eenheid}` : ''}</td><td style="text-align:center;padding:4px 8px;border-bottom:1px solid #eee">${r.aantal}</td><td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">€${r.prijs.toFixed(2)}</td><td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">€${r.totaal.toFixed(2)}</td></tr>`).join('')}</tbody></table>`
            const vars: Record<string, string> = {
              bedrijfsnaam: user.bedrijfsnaam ?? user.naam ?? '', bedrijfAdres: user.adres ?? '', bedrijfPostcode: user.postcode ?? '',
              bedrijfStad: user.stad ?? '', bedrijfEmail: user.email ?? '', bedrijfTelefoon: user.telefoon ?? '',
              bedrijfWebsite: user.website ?? '', kvkNummer: user.kvkNummer ?? '', btwNummer: user.btwNummer ?? '',
              iban: user.iban ?? '', logo: user.logoBase64 ? `<img src="${user.logoBase64}" style="max-height:80px" />` : '',
              factuurNummer: factuur.nummer, factuurDatum: factuur.datum.toISOString().split('T')[0],
              vervaldatum: factuur.vervaldatum.toISOString().split('T')[0], notities: factuur.notities ?? '',
              betalingsCondities: factuur.betalingsCondities ?? '', klantNaam: (factuur.klant as { naam: string }).naam,
              klantBedrijf: (factuur.klant as { bedrijf?: string | null }).bedrijf ?? '',
              klantAdres: (factuur.klant as { adres?: string | null }).adres ?? '',
              klantPostcode: (factuur.klant as { postcode?: string | null }).postcode ?? '',
              klantStad: (factuur.klant as { stad?: string | null }).stad ?? '',
              klantBtwNummer: (factuur.klant as { btwNummer?: string | null }).btwNummer ?? '',
              subtotaal: `€${factuur.subtotaal.toFixed(2)}`, kortingBedrag: `€${factuur.kortingBedrag.toFixed(2)}`,
              btwBedrag: `€${factuur.btwBedrag.toFixed(2)}`, totaalBedrag: `€${factuur.totaal.toFixed(2)}`, regelsHtml,
            }
            const html = user.factuurHtmlTemplate.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
            await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
          }
        } else if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
          await pdfWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/facturen/${f.id}/print`)
        } else {
          await pdfWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/facturen/${f.id}/print` })
        }

        await new Promise(resolve => setTimeout(resolve, 1200))
        const pdfBuffer = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
        const veiligNummer = f.nummer.replace(/[/\\:*?"<>|]/g, '-')
        fs.writeFileSync(join(doelMap, `${veiligNummer}.pdf`), pdfBuffer)
        aangemaakt++
      } catch {
        // sla individuele fouten over
      } finally {
        pdfWindow?.destroy()
      }
    }

    shell.openPath(doelMap)
    return { succes: true, aangemaakt, pad: doelMap }
  })

  // ── Update installeren ──
  ipcMain.handle('app:installUpdate', () => {
    autoUpdater.quitAndInstall()
  })

  // Factuur sjablonen
  ipcMain.handle('factuurSjablonen:list', async () => {
    return prisma.factuurSjabloon.findMany({ orderBy: { aangemaakt: 'desc' } })
  })

  ipcMain.handle('factuurSjablonen:create', async (_, data: { naam: string; regels: unknown[]; notities?: string; betalingsCondities?: string; btwVerlegd?: boolean }) => {
    return prisma.factuurSjabloon.create({
      data: {
        naam: data.naam,
        regels: JSON.stringify(data.regels),
        notities: data.notities,
        betalingsCondities: data.betalingsCondities,
        btwVerlegd: data.btwVerlegd ?? false,
      }
    })
  })

  ipcMain.handle('factuurSjablonen:delete', async (_, id: string) => {
    await prisma.factuurSjabloon.delete({ where: { id } })
    return { succes: true }
  })

  // Documenten
  ipcMain.handle('documenten:list', async (_, { type, referentieId }: { type: string; referentieId: string }) => {
    return prisma.document.findMany({ where: { type, referentieId }, orderBy: { aangemaakt: 'desc' } })
  })

  ipcMain.handle('documenten:upload', async (_, { type, referentieId }: { type: string; referentieId: string }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (canceled || !filePaths[0]) return { succes: false }
    const bronPad = filePaths[0]
    const documentenMap = join(app.getPath('userData'), 'documenten')
    await fs.promises.mkdir(documentenMap, { recursive: true })
    const doelNaam = `${Date.now()}-${basename(bronPad)}`
    const doelPad = join(documentenMap, doelNaam)
    await fs.promises.copyFile(bronPad, doelPad)
    const doc = await prisma.document.create({
      data: { naam: basename(bronPad), bestandsPad: doelPad, type, referentieId }
    })
    return { succes: true, id: doc.id }
  })

  ipcMain.handle('documenten:open', async (_, id: string) => {
    const doc = await prisma.document.findUnique({ where: { id } })
    if (!doc) return { succes: false }
    await shell.openPath(doc.bestandsPad)
    return { succes: true }
  })

  ipcMain.handle('documenten:delete', async (_, id: string) => {
    const doc = await prisma.document.findUnique({ where: { id } })
    if (doc) {
      try { await fs.promises.unlink(doc.bestandsPad) } catch {}
      await prisma.document.delete({ where: { id } })
    }
    return { succes: true }
  })

  // Enkele betalingsherinnering
  ipcMain.handle('facturen:stuurHerinnering', async (_, id: string) => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('Geen gebruiker')
    if (!user.emailSmtpHost || !user.emailSmtpUser) throw new Error('SMTP niet geconfigureerd')
    const factuur = await prisma.factuur.findUnique({ where: { id }, include: { klant: true } })
    if (!factuur) throw new Error('Factuur niet gevonden')
    if (!factuur.klant.email) throw new Error(`${factuur.klant.naam} heeft geen e-mailadres`)
    const nu = new Date()
    const dagenTeLasten = Math.max(0, Math.floor((nu.getTime() - new Date(factuur.vervaldatum).getTime()) / (1000 * 60 * 60 * 24)))
    const html = `<p>Geachte ${factuur.klant.naam},</p><p>Wij verzoeken u vriendelijk onderstaande factuur te voldoen.</p>
<table style="border-collapse:collapse"><tr><td style="padding:4px 8px"><strong>Factuurnummer:</strong></td><td>${factuur.nummer}</td></tr>
<tr><td style="padding:4px 8px"><strong>Openstaand bedrag:</strong></td><td><strong>€ ${factuur.totaal.toFixed(2).replace('.', ',')}</strong></td></tr>
${dagenTeLasten > 0 ? `<tr><td style="padding:4px 8px"><strong>Dagen te laat:</strong></td><td>${dagenTeLasten} dagen</td></tr>` : ''}
</table><p>Met vriendelijke groet,<br>${user.naam}${user.bedrijfsnaam ? '<br>' + user.bedrijfsnaam : ''}</p>`
    const emailBccHerinnering = (user as Record<string, unknown>).emailBcc as string | null
    const _herinneringPoort = user.emailSmtpPort ?? 587
    await verstuurEmail(
      { host: user.emailSmtpHost, port: _herinneringPoort, secure: _herinneringPoort === 465 ? true : _herinneringPoort === 587 ? false : user.emailSmtpSecure, user: user.emailSmtpUser, pass: user.emailSmtpPass ?? '' },
      { van: user.emailSmtpUser, naar: factuur.klant.email, bcc: emailBccHerinnering || undefined, onderwerp: `Betalingsherinnering - Factuur ${factuur.nummer}`, html }
    )
    await prisma.factuur.update({ where: { id }, data: { herinneringVerzondenOp: nu } })
    return { succes: true }
  })
}

app.whenReady().then(async () => {
  const dbPath = getDbPath()
  try {
    runMigratie(dbPath)
    logSchrijven('Database migratie succesvol')
  } catch (e) {
    logSchrijven(`Database migratie fout: ${e}`)
    dialog.showErrorBox(
      'Database initialisatie mislukt',
      `Er is een fout opgetreden bij het bijwerken van de database.\n\nFout: ${e}\n\nDe applicatie wordt afgesloten. Maak een back-up van uw database en probeer opnieuw.`
    )
    app.quit()
    return
  }

  initPrisma()

  const dbOk = await verifieerDbVerbinding()
  if (!dbOk) {
    dialog.showErrorBox(
      'Database niet bereikbaar',
      'De database kon niet worden bereikt na initialisatie. De applicatie wordt afgesloten.'
    )
    app.quit()
    return
  }

  setupIpcHandlers()
  createWindow()

  if (!is.dev) {
    autoUpdater.checkForUpdates().catch(e => logSchrijven(`Update check fout: ${e}`))
    autoUpdater.on('update-available', () => {
      mainWindow?.webContents.send('update:beschikbaar')
    })
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update:gedownload')
    })
  }

  // Maak terugkerende facturen aan bij opstarten
  maakTermijnFacturen().catch(e => console.error('Fout bij opstarten terugkerende facturen:', e))
  stuurHerinneringen().catch(e => console.error('Fout bij sturen herinneringen:', e))
  verstuurGeplandeFacturen().catch(e => console.error('Fout bij geplande verzending:', e))
  setInterval(() => verstuurGeplandeFacturen().catch(() => {}), 60_000)
  startBankWatcher().catch(() => {})

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
