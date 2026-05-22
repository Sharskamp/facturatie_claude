-- AlterTable
ALTER TABLE "Categorie" ADD COLUMN "standaardBtwTarief" REAL;

-- AlterTable
ALTER TABLE "Uitgave" ADD COLUMN "tegenrekening" TEXT;

-- CreateTable
CREATE TABLE "FactuurSjabloon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "naam" TEXT NOT NULL,
    "regels" TEXT NOT NULL DEFAULT '[]',
    "notities" TEXT,
    "betalingsCondities" TEXT,
    "btwVerlegd" BOOLEAN NOT NULL DEFAULT false,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "naam" TEXT NOT NULL,
    "bestandsPad" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referentieId" TEXT NOT NULL,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Rit" (
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
    "bijgewerkt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "factuurId" TEXT,
    "actie" TEXT NOT NULL,
    "details" TEXT,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "naam" TEXT NOT NULL,
    "omschrijving" TEXT,
    "prijs" REAL NOT NULL DEFAULT 0,
    "eenheid" TEXT DEFAULT 'stuks',
    "btwPercentage" REAL NOT NULL DEFAULT 21,
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KlantNotitie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "klantId" TEXT NOT NULL,
    "tekst" TEXT NOT NULL,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KlantNotitie_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Crediteur" (
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
    "bijgewerkt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgendaAfspraakData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "klantId" TEXT,
    "klantIds" TEXT,
    "locatie" TEXT,
    "regels" TEXT,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Factuur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nummer" TEXT NOT NULL,
    "klantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONCEPT',
    "datum" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vervaldatum" DATETIME NOT NULL,
    "subtotaal" REAL NOT NULL DEFAULT 0,
    "kortingBedrag" REAL NOT NULL DEFAULT 0,
    "kortingPercentage" REAL NOT NULL DEFAULT 0,
    "btwBedrag" REAL NOT NULL DEFAULT 0,
    "totaal" REAL NOT NULL DEFAULT 0,
    "notities" TEXT,
    "betalingsCondities" TEXT,
    "btwVerlegd" BOOLEAN NOT NULL DEFAULT false,
    "terugkerend" BOOLEAN NOT NULL DEFAULT false,
    "terugkerendInterval" TEXT,
    "agendaAfspraakId" TEXT,
    "offerteId" TEXT,
    "verzondenOp" DATETIME,
    "herinneringVerzondenOp" DATETIME,
    "creditNotaVoorId" TEXT,
    "totaalKorting" REAL NOT NULL DEFAULT 0,
    "totaalKortingBedrag" REAL NOT NULL DEFAULT 0,
    "taal" TEXT NOT NULL DEFAULT 'nl',
    "mollieBetaalLink" TEXT,
    "molliePaymentLinkId" TEXT,
    "historisch" BOOLEAN NOT NULL DEFAULT false,
    "handmatigBedrag" BOOLEAN NOT NULL DEFAULT false,
    "handmatigBetaald" BOOLEAN NOT NULL DEFAULT false,
    "bronBestandPad" TEXT,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL,
    CONSTRAINT "Factuur_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Factuur_offerteId_fkey" FOREIGN KEY ("offerteId") REFERENCES "Offerte" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Factuur" ("aangemaakt", "agendaAfspraakId", "betalingsCondities", "bijgewerkt", "btwBedrag", "btwVerlegd", "datum", "herinneringVerzondenOp", "id", "klantId", "kortingBedrag", "kortingPercentage", "notities", "nummer", "offerteId", "status", "subtotaal", "terugkerend", "terugkerendInterval", "totaal", "vervaldatum", "verzondenOp") SELECT "aangemaakt", "agendaAfspraakId", "betalingsCondities", "bijgewerkt", "btwBedrag", "btwVerlegd", "datum", "herinneringVerzondenOp", "id", "klantId", "kortingBedrag", "kortingPercentage", "notities", "nummer", "offerteId", "status", "subtotaal", "terugkerend", "terugkerendInterval", "totaal", "vervaldatum", "verzondenOp" FROM "Factuur";
DROP TABLE "Factuur";
ALTER TABLE "new_Factuur" RENAME TO "Factuur";
CREATE UNIQUE INDEX "Factuur_nummer_key" ON "Factuur"("nummer");
CREATE INDEX "Factuur_klantId_idx" ON "Factuur"("klantId");
CREATE INDEX "Factuur_status_idx" ON "Factuur"("status");
CREATE INDEX "Factuur_datum_idx" ON "Factuur"("datum");
CREATE INDEX "Factuur_status_datum_idx" ON "Factuur"("status", "datum");
CREATE TABLE "new_Inkomen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datum" DATETIME NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "bedrag" REAL NOT NULL,
    "factuurId" TEXT,
    "bron" TEXT,
    "notities" TEXT,
    "geboektAlsOmzet" BOOLEAN NOT NULL DEFAULT false,
    "tegenrekeningNaam" TEXT,
    "tegenrekening" TEXT,
    "mutatiesoort" TEXT,
    "mededelingen" TEXT,
    "betalingskenmerk" TEXT,
    "saldoNaBoeking" TEXT,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL,
    CONSTRAINT "Inkomen_factuurId_fkey" FOREIGN KEY ("factuurId") REFERENCES "Factuur" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Inkomen" ("aangemaakt", "bedrag", "bijgewerkt", "bron", "datum", "factuurId", "id", "notities", "omschrijving") SELECT "aangemaakt", "bedrag", "bijgewerkt", "bron", "datum", "factuurId", "id", "notities", "omschrijving" FROM "Inkomen";
DROP TABLE "Inkomen";
ALTER TABLE "new_Inkomen" RENAME TO "Inkomen";
CREATE INDEX "Inkomen_factuurId_idx" ON "Inkomen"("factuurId");
CREATE INDEX "Inkomen_datum_idx" ON "Inkomen"("datum");
CREATE TABLE "new_Klant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "naam" TEXT NOT NULL,
    "bedrijf" TEXT,
    "email" TEXT,
    "telefoon" TEXT,
    "adres" TEXT,
    "postcode" TEXT,
    "stad" TEXT,
    "land" TEXT NOT NULL DEFAULT 'Nederland',
    "kvkNummer" TEXT,
    "btwNummer" TEXT,
    "iban" TEXT,
    "notities" TEXT,
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "betaalTermijn" INTEGER,
    "taal" TEXT NOT NULL DEFAULT 'nl',
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL
);
INSERT INTO "new_Klant" ("aangemaakt", "actief", "adres", "bedrijf", "bijgewerkt", "btwNummer", "email", "iban", "id", "kvkNummer", "land", "naam", "notities", "postcode", "stad", "telefoon") SELECT "aangemaakt", "actief", "adres", "bedrijf", "bijgewerkt", "btwNummer", "email", "iban", "id", "kvkNummer", "land", "naam", "notities", "postcode", "stad", "telefoon" FROM "Klant";
DROP TABLE "Klant";
ALTER TABLE "new_Klant" RENAME TO "Klant";
CREATE TABLE "new_Offerte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nummer" TEXT NOT NULL,
    "klantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONCEPT',
    "datum" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geldigTot" DATETIME NOT NULL,
    "subtotaal" REAL NOT NULL DEFAULT 0,
    "kortingBedrag" REAL NOT NULL DEFAULT 0,
    "kortingPercentage" REAL NOT NULL DEFAULT 0,
    "btwBedrag" REAL NOT NULL DEFAULT 0,
    "totaal" REAL NOT NULL DEFAULT 0,
    "notities" TEXT,
    "verzondenOp" DATETIME,
    "totaalKorting" REAL NOT NULL DEFAULT 0,
    "totaalKortingBedrag" REAL NOT NULL DEFAULT 0,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL,
    CONSTRAINT "Offerte_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Offerte" ("aangemaakt", "bijgewerkt", "btwBedrag", "datum", "geldigTot", "id", "klantId", "kortingBedrag", "kortingPercentage", "notities", "nummer", "status", "subtotaal", "totaal", "verzondenOp") SELECT "aangemaakt", "bijgewerkt", "btwBedrag", "datum", "geldigTot", "id", "klantId", "kortingBedrag", "kortingPercentage", "notities", "nummer", "status", "subtotaal", "totaal", "verzondenOp" FROM "Offerte";
DROP TABLE "Offerte";
ALTER TABLE "new_Offerte" RENAME TO "Offerte";
CREATE UNIQUE INDEX "Offerte_nummer_key" ON "Offerte"("nummer");
CREATE INDEX "Offerte_klantId_idx" ON "Offerte"("klantId");
CREATE INDEX "Offerte_status_idx" ON "Offerte"("status");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "wachtwoord" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "bedrijfsnaam" TEXT,
    "kvkNummer" TEXT,
    "btwNummer" TEXT,
    "iban" TEXT,
    "adres" TEXT,
    "postcode" TEXT,
    "stad" TEXT,
    "telefoon" TEXT,
    "website" TEXT,
    "logo" TEXT,
    "factuurPrefix" TEXT NOT NULL DEFAULT 'F',
    "factuurVolgNummer" INTEGER NOT NULL DEFAULT 1,
    "offertePrefix" TEXT NOT NULL DEFAULT 'O',
    "offerteVolgNummer" INTEGER NOT NULL DEFAULT 1,
    "standaardCreditnotaPrefix" TEXT NOT NULL DEFAULT 'CN',
    "emailSmtpHost" TEXT,
    "emailSmtpPort" INTEGER,
    "emailSmtpUser" TEXT,
    "emailSmtpPass" TEXT,
    "emailSmtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "googleRefreshToken" TEXT,
    "googleAccessToken" TEXT,
    "googleTokenExpiry" DATETIME,
    "korActief" BOOLEAN NOT NULL DEFAULT false,
    "korDrempel" REAL NOT NULL DEFAULT 20000,
    "standaardBetaalTermijn" INTEGER NOT NULL DEFAULT 30,
    "standaardBtwTarief" REAL NOT NULL DEFAULT 21,
    "betalingsherinneringen" BOOLEAN NOT NULL DEFAULT true,
    "herinneringDagen" INTEGER NOT NULL DEFAULT 7,
    "kmVergoeding" REAL NOT NULL DEFAULT 0.23,
    "anthropicApiKey" TEXT,
    "openaiApiKey" TEXT,
    "aiModel" TEXT NOT NULL DEFAULT 'claude',
    "donkerModus" TEXT NOT NULL DEFAULT 'systeem',
    "autoStart" BOOLEAN NOT NULL DEFAULT false,
    "pdfMapPad" TEXT,
    "mollieApiKey" TEXT,
    "emailAanhef" TEXT,
    "emailAfsluitingsTekst" TEXT,
    "logoBase64" TEXT,
    "factuurNummerFormaat" TEXT NOT NULL DEFAULT '{PREFIX}{JAAR}-{NNNN}',
    "korWaarschuwing" BOOLEAN NOT NULL DEFAULT true,
    "googleClientId" TEXT,
    "googleClientSecret" TEXT,
    "googlePrimaryCalendarId" TEXT,
    "layoutPrimairKleur" TEXT NOT NULL DEFAULT '#4f46e5',
    "layoutSecundairKleur" TEXT,
    "layoutLettertype" TEXT NOT NULL DEFAULT 'Arial, sans-serif',
    "layoutKoptekst" TEXT,
    "layoutVoettekst" TEXT,
    "layoutLogoPositie" TEXT NOT NULL DEFAULT 'links',
    "layoutToonBtwNummer" BOOLEAN NOT NULL DEFAULT true,
    "layoutToonKvkNummer" BOOLEAN NOT NULL DEFAULT true,
    "layoutToonIban" BOOLEAN NOT NULL DEFAULT true,
    "layoutToonQrCode" BOOLEAN NOT NULL DEFAULT true,
    "layoutRegelSpacing" TEXT NOT NULL DEFAULT 'normaal',
    "layoutLetterGrootte" TEXT NOT NULL DEFAULT '14',
    "layoutLogoGrootte" TEXT NOT NULL DEFAULT 'medium',
    "layoutMarges" TEXT NOT NULL DEFAULT 'normaal',
    "layoutSectieVolgorde" TEXT NOT NULL DEFAULT '[]',
    "onbetaaldeFactuurMelding" BOOLEAN NOT NULL DEFAULT true,
    "factuurHtmlTemplate" TEXT,
    "offerteGeldigheidDagen" INTEGER NOT NULL DEFAULT 30,
    "verborgenPaginas" TEXT NOT NULL DEFAULT '[]',
    "bankWeergaveVelden" TEXT NOT NULL DEFAULT '["datum","omschrijving","tegenrekeningNaam","tegenrekening","mutatiesoort","mededelingen","saldoNaBoeking","bedrag","bron","factuur"]',
    "uitgavenWeergaveVelden" TEXT NOT NULL DEFAULT '["datum","omschrijving","leverancier","categorie","bedrag","btw","totaal"]',
    "spaarrekeningen" TEXT NOT NULL DEFAULT '[]',
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("aangemaakt", "adres", "bedrijfsnaam", "betalingsherinneringen", "bijgewerkt", "btwNummer", "email", "emailSmtpHost", "emailSmtpPass", "emailSmtpPort", "emailSmtpSecure", "emailSmtpUser", "factuurPrefix", "factuurVolgNummer", "googleAccessToken", "googleRefreshToken", "googleTokenExpiry", "herinneringDagen", "iban", "id", "korActief", "korDrempel", "kvkNummer", "logo", "naam", "offertePrefix", "offerteVolgNummer", "postcode", "stad", "standaardBetaalTermijn", "standaardBtwTarief", "telefoon", "wachtwoord", "website") SELECT "aangemaakt", "adres", "bedrijfsnaam", "betalingsherinneringen", "bijgewerkt", "btwNummer", "email", "emailSmtpHost", "emailSmtpPass", "emailSmtpPort", "emailSmtpSecure", "emailSmtpUser", "factuurPrefix", "factuurVolgNummer", "googleAccessToken", "googleRefreshToken", "googleTokenExpiry", "herinneringDagen", "iban", "id", "korActief", "korDrempel", "kvkNummer", "logo", "naam", "offertePrefix", "offerteVolgNummer", "postcode", "stad", "standaardBetaalTermijn", "standaardBtwTarief", "telefoon", "wachtwoord", "website" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Document_referentieId_idx" ON "Document"("referentieId");

-- CreateIndex
CREATE INDEX "Document_type_referentieId_idx" ON "Document"("type", "referentieId");

-- CreateIndex
CREATE INDEX "Rit_datum_idx" ON "Rit"("datum");

-- CreateIndex
CREATE INDEX "Rit_gefactureerd_idx" ON "Rit"("gefactureerd");

-- CreateIndex
CREATE INDEX "KlantNotitie_klantId_idx" ON "KlantNotitie"("klantId");

-- CreateIndex
CREATE INDEX "Crediteur_status_idx" ON "Crediteur"("status");

-- CreateIndex
CREATE INDEX "Crediteur_vervaldatum_idx" ON "Crediteur"("vervaldatum");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaAfspraakData_eventId_key" ON "AgendaAfspraakData"("eventId");

-- CreateIndex
CREATE INDEX "AgendaAfspraakData_eventId_idx" ON "AgendaAfspraakData"("eventId");

-- CreateIndex
CREATE INDEX "Uitgave_datum_idx" ON "Uitgave"("datum");

-- CreateIndex
CREATE INDEX "Uitgave_categorieId_idx" ON "Uitgave"("categorieId");
