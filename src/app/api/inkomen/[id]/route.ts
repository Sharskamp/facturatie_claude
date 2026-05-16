import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();

  const inkomen = await prisma.inkomen.update({
    where: { id },
    data: { ...data, datum: new Date(data.datum) },
    include: { factuur: { include: { klant: true } } },
  });

  return NextResponse.json(inkomen);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  await prisma.inkomen.delete({ where: { id } });
  return NextResponse.json({ succes: true });
}
