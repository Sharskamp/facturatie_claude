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

  const offertes = await prisma.offerte.findMany({
    where: status ? { status } : {},
    include: { klant: true },
    orderBy: { datum: "desc" },
  });

  return NextResponse.json(offertes);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { regels, klantId, datum, geldigTot, notities, kortingPercentage, ...rest } = await req.json();

  const user = await prisma.user.findFirst();
  if (!user) return NextResponse.json({ fout: "Geen gebruiker" }, { status: 500 });

  const nummer = genereerFactuurNummer(user.offertePrefix, user.offerteVolgNummer);

  let subtotaal = 0;
  let btwBedrag = 0;
  const berekendeRegels = regels.map((regel: {
    omschrijving: string;
    aantal: number;
    prijs: number;
    btwPercentage: number;
    kortingPercentage?: number;
    eenheid?: string;
  }, index: number) => {
    const bruto = regel.prijs * regel.aantal;
    const korting = (bruto * (regel.kortingPercentage ?? 0)) / 100;
    const netto = bruto - korting;
    const btw = (netto * regel.btwPercentage) / 100;
    subtotaal += netto;
    btwBedrag += btw;
    return { ...regel, totaal: netto + btw, volgorde: index };
  });

  const kortingBedrag = (subtotaal * (kortingPercentage ?? 0)) / 100;
  subtotaal -= kortingBedrag;

  const offerte = await prisma.offerte.create({
    data: {
      nummer,
      klantId,
      datum: datum ? new Date(datum) : new Date(),
      geldigTot: geldigTot ? new Date(geldigTot) : berekenVervaldatum(30),
      notities,
      kortingPercentage: kortingPercentage ?? 0,
      kortingBedrag,
      subtotaal,
      btwBedrag,
      totaal: subtotaal + btwBedrag,
      regels: { create: berekendeRegels },
      ...rest,
    },
    include: { klant: true, regels: true },
  });

  await prisma.user.updateMany({
    data: { offerteVolgNummer: user.offerteVolgNummer + 1 },
  });

  return NextResponse.json(offerte, { status: 201 });
}
