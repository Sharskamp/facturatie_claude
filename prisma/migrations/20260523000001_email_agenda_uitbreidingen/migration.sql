-- Email template uitbreidingen
ALTER TABLE "User" ADD COLUMN "emailFactuurOnderwerp" TEXT;
ALTER TABLE "User" ADD COLUMN "emailHerinneringOnderwerp" TEXT;
ALTER TABLE "User" ADD COLUMN "emailHerinneringTekst" TEXT;
-- Agenda afspraakherinneringen (globaal)
ALTER TABLE "User" ADD COLUMN "agendaHerinneringActief" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "agendaHerinneringModus" TEXT NOT NULL DEFAULT 'vooraf';
ALTER TABLE "User" ADD COLUMN "agendaHerinneringVoorafUren" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "User" ADD COLUMN "agendaHerinneringDagen" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "agendaHerinneringTijd" TEXT NOT NULL DEFAULT '09:00';
-- Per-klant afspraakherinnering overschrijving
ALTER TABLE "Klant" ADD COLUMN "afspraakHerinneringActief" BOOLEAN;
ALTER TABLE "Klant" ADD COLUMN "afspraakHerinneringModus" TEXT;
ALTER TABLE "Klant" ADD COLUMN "afspraakHerinneringVoorafUren" INTEGER;
ALTER TABLE "Klant" ADD COLUMN "afspraakHerinneringDagen" INTEGER;
ALTER TABLE "Klant" ADD COLUMN "afspraakHerinneringTijd" TEXT;
