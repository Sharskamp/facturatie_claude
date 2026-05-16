import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genereerFactuurNummer, berekenVervaldatum } from "@/lib/utils";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const offerte = await prisma.offerte.findUnique({
    where: { id },
    include: { klant: true, regels: { orderBy: { volgorde: "asc" } } },
  });

  if (!offerte) return NextResponse.json({ fout: "Niet gevonden" }, { status: 404 });
  return NextResponse.json(offerte);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();
  const { actie } = data;

  // Converteer offerte naar factuur
  if (actie === "naar-factuur") {
    const offerte = await prisma.offerte.findUnique({
      where: { id },
      include: { klant: true, regels: true },
    });
    if (!offerte) return NextResponse.json({ fout: "Niet gevonden" }, { status: 404 });

    const user = await prisma.user.findFirst();
    if (!user) return NextResponse.json({ fout: "Geen gebruiker" }, { status: 500 });

    const factuurNummer = genereerFactuurNummer(user.factuurPrefix, user.factuurVolgNummer);

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
          create: offerte.regels.map((r) => ({
            omschrijving: r.omschrijving,
            aantal: r.aantal,
            eenheid: r.eenheid,
            prijs: r.prijs,
            btwPercentage: r.btwPercentage,
            kortingPercentage: r.kortingPercentage,
            totaal: r.totaal,
            volgorde: r.volgorde,
          })),
        },
      },
      include: { klant: true, regels: true },
    });

    await prisma.user.updateMany({
      data: { factuurVolgNummer: user.factuurVolgNummer + 1 },
    });

    await prisma.offerte.update({
      where: { id },
      data: { status: "GEACCEPTEERD" },
    });

    return NextResponse.json({ factuur });
  }

  const offerte = await prisma.offerte.update({
    where: { id },
    data: {
      ...data,
      datum: data.datum ? new Date(data.datum) : undefined,
      geldigTot: data.geldigTot ? new Date(data.geldigTot) : undefined,
    },
    include: { klant: true },
  });

  return NextResponse.json(offerte);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  await prisma.offerte.delete({ where: { id } });
  return NextResponse.json({ succes: true });
}
