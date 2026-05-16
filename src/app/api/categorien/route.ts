import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const categorieën = await prisma.categorie.findMany({
    orderBy: { naam: "asc" },
    include: { _count: { select: { uitgaven: true } } },
  });

  return NextResponse.json(categorieën);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const data = await req.json();
  const categorie = await prisma.categorie.create({ data });
  return NextResponse.json(categorie, { status: 201 });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id, ...data } = await req.json();
  const categorie = await prisma.categorie.update({ where: { id }, data });
  return NextResponse.json(categorie);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ fout: "ID vereist" }, { status: 400 });

  await prisma.categorie.delete({ where: { id } });
  return NextResponse.json({ succes: true });
}
