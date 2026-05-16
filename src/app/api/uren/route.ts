import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const gefactureerd = searchParams.get("gefactureerd");

  const uren = await prisma.uurregistratie.findMany({
    where: gefactureerd !== null ? { gefactureerd: gefactureerd === "true" } : {},
    orderBy: { startTijd: "desc" },
  });

  return NextResponse.json(uren);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const data = await req.json();

  let duur: number | null = null;
  if (data.startTijd && data.eindTijd) {
    duur = Math.floor(
      (new Date(data.eindTijd).getTime() - new Date(data.startTijd).getTime()) / 60000
    );
  }

  const uur = await prisma.uurregistratie.create({
    data: {
      ...data,
      startTijd: new Date(data.startTijd),
      eindTijd: data.eindTijd ? new Date(data.eindTijd) : null,
      duur,
    },
  });

  return NextResponse.json(uur, { status: 201 });
}
