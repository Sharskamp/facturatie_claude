-- AlterTable: BCC-adres en e-mailsjablonen
ALTER TABLE "User" ADD COLUMN "emailBcc" TEXT;
ALTER TABLE "User" ADD COLUMN "emailBevestigingOnderwerp" TEXT;
ALTER TABLE "User" ADD COLUMN "emailBevestigingTekst" TEXT;
ALTER TABLE "User" ADD COLUMN "emailFactuurTekst" TEXT;
