import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const vanDatum = searchParams.get("van");
  const totDatum = searchParams.get("tot");

  const inkomen = await prisma.inkomen.findMany({
    where: {
      ...(vanDatum ? { datum: { gte: new Date(vanDatum) } } : {}),
      ...(totDatum ? { datum: { lte: new Date(totDatum) } } : {}),
    },
    include: { factuur: { include: { klant: true } } },
    orderBy: { datum: "desc" },
  });

  return NextResponse.json(inkomen);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const data = await req.json();

  const inkomen = await prisma.inkomen.create({
    data: {
      ...data,
      datum: new Date(data.datum),
    },
    include: { factuur: { include: { klant: true } } },
  });

  // Als gekoppeld aan factuur, markeer als betaald
  if (data.factuurId) {
    await prisma.factuur.update({
      where: { id: data.factuurId },
      data: { status: "BETAALD" },
    });
  }

  return NextResponse.json(inkomen, { status: 201 });
}
