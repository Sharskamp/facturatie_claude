-- AlterTable: voeg handmatigBetaald toe aan Factuur
ALTER TABLE "Factuur" ADD COLUMN "handmatigBetaald" BOOLEAN NOT NULL DEFAULT false;
