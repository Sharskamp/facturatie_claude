import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const formData = await req.formData();
  const bestand = formData.get("bestand") as File;

  if (!bestand) {
    return NextResponse.json({ fout: "Geen bestand" }, { status: 400 });
  }

  const bytes = await bestand.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const bestandsnaam = `${Date.now()}-${bestand.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const bestandspad = path.join(uploadDir, bestandsnaam);

  await writeFile(bestandspad, buffer);

  return NextResponse.json({
    url: `/uploads/${bestandsnaam}`,
    naam: bestand.name,
  });
}
