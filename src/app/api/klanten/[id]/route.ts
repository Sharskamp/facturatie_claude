import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const klant = await prisma.klant.findUnique({
    where: { id },
    include: {
      facturen: {
        orderBy: { datum: "desc" },
        take: 10,
      },
      offertes: {
        orderBy: { datum: "desc" },
        take: 5,
      },
    },
  });

  if (!klant) return NextResponse.json({ fout: "Niet gevonden" }, { status: 404 });
  return NextResponse.json(klant);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();

  const klant = await prisma.klant.update({ where: { id }, data });
  return NextResponse.json(klant);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  await prisma.klant.update({ where: { id }, data: { actief: false } });
  return NextResponse.json({ succes: true });
}
