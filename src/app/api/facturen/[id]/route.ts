import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const factuur = await prisma.factuur.findUnique({
    where: { id },
    include: { klant: true, regels: { orderBy: { volgorde: "asc" } }, inkomsten: true },
  });

  if (!factuur) return NextResponse.json({ fout: "Niet gevonden" }, { status: 404 });
  return NextResponse.json(factuur);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const { regels, ...data } = await req.json();

  // Herbereken totalen als regels meegestuurd
  if (regels) {
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
      const btw = data.btwVerlegd ? 0 : (netto * regel.btwPercentage) / 100;
      subtotaal += netto;
      btwBedrag += btw;
      return { ...regel, totaal: netto + btw, volgorde: index };
    });

    const kortingBedrag = (subtotaal * (data.kortingPercentage ?? 0)) / 100;
    subtotaal -= kortingBedrag;

    await prisma.factuurRegel.deleteMany({ where: { factuurId: id } });

    const factuur = await prisma.factuur.update({
      where: { id },
      data: {
        ...data,
        subtotaal,
        btwBedrag,
        kortingBedrag,
        totaal: subtotaal + btwBedrag,
        datum: data.datum ? new Date(data.datum) : undefined,
        vervaldatum: data.vervaldatum ? new Date(data.vervaldatum) : undefined,
        regels: { create: berekendeRegels },
      },
      include: { klant: true, regels: { orderBy: { volgorde: "asc" } } },
    });

    return NextResponse.json(factuur);
  }

  const factuur = await prisma.factuur.update({
    where: { id },
    data: {
      ...data,
      datum: data.datum ? new Date(data.datum) : undefined,
      vervaldatum: data.vervaldatum ? new Date(data.vervaldatum) : undefined,
    },
    include: { klant: true, regels: { orderBy: { volgorde: "asc" } } },
  });

  return NextResponse.json(factuur);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  await prisma.factuur.delete({ where: { id } });
  return NextResponse.json({ succes: true });
}
