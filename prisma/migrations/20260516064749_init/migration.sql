-- CreateTable
CREATE TABLE "User" (
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
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Klant" (
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
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Factuur" (
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
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL,
    CONSTRAINT "Factuur_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Factuur_offerteId_fkey" FOREIGN KEY ("offerteId") REFERENCES "Offerte" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactuurRegel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "factuurId" TEXT NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "aantal" REAL NOT NULL DEFAULT 1,
    "eenheid" TEXT,
    "prijs" REAL NOT NULL,
    "btwPercentage" REAL NOT NULL DEFAULT 21,
    "kortingPercentage" REAL NOT NULL DEFAULT 0,
    "totaal" REAL NOT NULL,
    "volgorde" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FactuurRegel_factuurId_fkey" FOREIGN KEY ("factuurId") REFERENCES "Factuur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Offerte" (
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
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL,
    CONSTRAINT "Offerte_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfferteRegel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerteId" TEXT NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "aantal" REAL NOT NULL DEFAULT 1,
    "eenheid" TEXT,
    "prijs" REAL NOT NULL,
    "btwPercentage" REAL NOT NULL DEFAULT 21,
    "kortingPercentage" REAL NOT NULL DEFAULT 0,
    "totaal" REAL NOT NULL,
    "volgorde" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OfferteRegel_offerteId_fkey" FOREIGN KEY ("offerteId") REFERENCES "Offerte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inkomen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datum" DATETIME NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "bedrag" REAL NOT NULL,
    "factuurId" TEXT,
    "bron" TEXT,
    "notities" TEXT,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL,
    CONSTRAINT "Inkomen_factuurId_fkey" FOREIGN KEY ("factuurId") REFERENCES "Factuur" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Uitgave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datum" DATETIME NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "bedrag" REAL NOT NULL,
    "btwBedrag" REAL NOT NULL DEFAULT 0,
    "btwPercentage" REAL NOT NULL DEFAULT 0,
    "categorieId" TEXT,
    "leverancier" TEXT,
    "bonBestand" TEXT,
    "notities" TEXT,
    "zakelijk" BOOLEAN NOT NULL DEFAULT true,
    "zakelijkPercent" REAL NOT NULL DEFAULT 100,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL,
    CONSTRAINT "Uitgave_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Categorie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "naam" TEXT NOT NULL,
    "kleur" TEXT NOT NULL DEFAULT '#6366f1',
    "icoon" TEXT
);

-- CreateTable
CREATE TABLE "Uurregistratie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "omschrijving" TEXT NOT NULL,
    "klantId" TEXT,
    "projectNaam" TEXT,
    "startTijd" DATETIME NOT NULL,
    "eindTijd" DATETIME,
    "duur" INTEGER,
    "uurtarief" REAL,
    "gefactureerd" BOOLEAN NOT NULL DEFAULT false,
    "factuurId" TEXT,
    "notities" TEXT,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VasteActiva" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "naam" TEXT NOT NULL,
    "aanschafDatum" DATETIME NOT NULL,
    "aanschafWaarde" REAL NOT NULL,
    "afschrijvingMethode" TEXT NOT NULL DEFAULT 'lineair',
    "afschrijvingJaren" INTEGER NOT NULL,
    "restwaarde" REAL NOT NULL DEFAULT 0,
    "categorieNaam" TEXT,
    "notities" TEXT,
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Factuur_nummer_key" ON "Factuur"("nummer");

-- CreateIndex
CREATE UNIQUE INDEX "Offerte_nummer_key" ON "Offerte"("nummer");
