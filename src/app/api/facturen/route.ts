import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genereerFactuurNummer, berekenVervaldatum } from "@/lib/utils";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const klantId = searchParams.get("klantId");

  const facturen = await prisma.factuur.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(klantId ? { klantId } : {}),
    },
    include: { klant: true },
    orderBy: { datum: "desc" },
  });

  return NextResponse.json(facturen);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { regels, klantId, datum, vervaldatum, notities, betalingsCondities, btwVerlegd, kortingPercentage, ...rest } = await req.json();

  // Haal gebruikersinstellingen op voor nummering
  const user = await prisma.user.findFirst();
  if (!user) return NextResponse.json({ fout: "Geen gebruiker" }, { status: 500 });

  const nummer = genereerFactuurNummer(user.factuurPrefix, user.factuurVolgNummer);

  // Bereken totalen
  let subtotaal = 0;
  let btwBedrag = 0;
  const berekendeRegels = regels.map((regel: {
    omschrijving: string;
    aantal: number;
    prijs: number;
    btwPercentage: number;
    kortingPercentage?: number;
    eenheid?: string;
    volgorde?: number;
  }, index: number) => {
    const bruto = regel.prijs * regel.aantal;
    const korting = (bruto * (regel.kortingPercentage ?? 0)) / 100;
    const netto = bruto - korting;
    const btw = btwVerlegd ? 0 : (netto * regel.btwPercentage) / 100;
    subtotaal += netto;
    btwBedrag += btw;
    return {
      omschrijving: regel.omschrijving,
      aantal: regel.aantal,
      prijs: regel.prijs,
      btwPercentage: regel.btwPercentage,
      kortingPercentage: regel.kortingPercentage ?? 0,
      eenheid: regel.eenheid,
      totaal: netto + btw,
      volgorde: index,
    };
  });

  // Totaalkorting
  const kortingBedrag = (subtotaal * (kortingPercentage ?? 0)) / 100;
  subtotaal -= kortingBedrag;
  const totaal = subtotaal + btwBedrag;

  const factuur = await prisma.factuur.create({
    data: {
      nummer,
      klantId,
      datum: datum ? new Date(datum) : new Date(),
      vervaldatum: vervaldatum
        ? new Date(vervaldatum)
        : berekenVervaldatum(user.standaardBetaalTermijn),
      notities,
      betalingsCondities,
      btwVerlegd: btwVerlegd ?? false,
      kortingPercentage: kortingPercentage ?? 0,
      kortingBedrag,
      subtotaal,
      btwBedrag,
      totaal,
      regels: { create: berekendeRegels },
      ...rest,
    },
    include: { klant: true, regels: true },
  });

  // Verhoog volgnummer
  await prisma.user.updateMany({
    data: { factuurVolgNummer: user.factuurVolgNummer + 1 },
  });

  return NextResponse.json(factuur, { status: 201 });
}
