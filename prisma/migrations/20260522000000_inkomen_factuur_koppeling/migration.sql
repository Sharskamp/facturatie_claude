-- Maak junction-tabel voor M:M koppeling tussen betalingen en facturen
CREATE TABLE "InkomenFactuur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inkomstenId" TEXT NOT NULL,
    "factuurId" TEXT NOT NULL,
    "bedrag" REAL NOT NULL,
    "aangemaakt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InkomenFactuur_inkomstenId_fkey" FOREIGN KEY ("inkomstenId") REFERENCES "Inkomen" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InkomenFactuur_factuurId_fkey" FOREIGN KEY ("factuurId") REFERENCES "Factuur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InkomenFactuur_inkomstenId_factuurId_key" ON "InkomenFactuur"("inkomstenId", "factuurId");
CREATE INDEX "InkomenFactuur_inkomstenId_idx" ON "InkomenFactuur"("inkomstenId");
CREATE INDEX "InkomenFactuur_factuurId_idx" ON "InkomenFactuur"("factuurId");

-- Migreer bestaande Inkomen.factuurId koppelingen naar de nieuwe junction-tabel
INSERT INTO "InkomenFactuur" ("id", "inkomstenId", "factuurId", "bedrag", "aangemaakt")
SELECT
    lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
    "id",
    "factuurId",
    "bedrag",
    COALESCE("aangemaakt", CURRENT_TIMESTAMP)
FROM "Inkomen"
WHERE "factuurId" IS NOT NULL;
