import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();

  let duur: number | null = null;
  if (data.startTijd && data.eindTijd) {
    duur = Math.floor(
      (new Date(data.eindTijd).getTime() - new Date(data.startTijd).getTime()) / 60000
    );
  }

  const uur = await prisma.uurregistratie.update({
    where: { id },
    data: {
      ...data,
      startTijd: new Date(data.startTijd),
      eindTijd: data.eindTijd ? new Date(data.eindTijd) : null,
      duur,
    },
  });

  return NextResponse.json(uur);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  await prisma.uurregistratie.delete({ where: { id } });
  return NextResponse.json({ succes: true });
}
