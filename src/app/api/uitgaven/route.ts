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
  const categorieId = searchParams.get("categorieId");

  const uitgaven = await prisma.uitgave.findMany({
    where: {
      ...(vanDatum ? { datum: { gte: new Date(vanDatum) } } : {}),
      ...(totDatum ? { datum: { lte: new Date(totDatum) } } : {}),
      ...(categorieId ? { categorieId } : {}),
    },
    include: { categorie: true },
    orderBy: { datum: "desc" },
  });

  return NextResponse.json(uitgaven);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const data = await req.json();

  const uitgave = await prisma.uitgave.create({
    data: { ...data, datum: new Date(data.datum) },
    include: { categorie: true },
  });

  return NextResponse.json(uitgave, { status: 201 });
}
