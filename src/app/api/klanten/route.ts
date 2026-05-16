import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const zoek = searchParams.get("zoek") ?? "";

  const klanten = await prisma.klant.findMany({
    where: zoek
      ? {
          OR: [
            { naam: { contains: zoek } },
            { bedrijf: { contains: zoek } },
            { email: { contains: zoek } },
          ],
        }
      : undefined,
    orderBy: { naam: "asc" },
    include: {
      _count: { select: { facturen: true } },
    },
  });

  return NextResponse.json(klanten);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const data = await req.json();

  const klant = await prisma.klant.create({ data });
  return NextResponse.json(klant, { status: 201 });
}
