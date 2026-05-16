import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashWachtwoord } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { naam, email, wachtwoord, bedrijfsnaam } = await req.json();

    const bestaand = await prisma.user.findFirst();
    if (bestaand) {
      return NextResponse.json({ fout: "Systeem is al geconfigureerd" }, { status: 400 });
    }

    const gehashed = await hashWachtwoord(wachtwoord);

    const user = await prisma.user.create({
      data: {
        naam,
        email,
        wachtwoord: gehashed,
        bedrijfsnaam,
      },
    });

    // Standaard categorieën aanmaken
    await prisma.categorie.createMany({
      data: [
        { naam: "Kantoorbenodigdheden", kleur: "#6366f1", icoon: "📎" },
        { naam: "Reiskosten", kleur: "#f59e0b", icoon: "🚗" },
        { naam: "Software & Abonnementen", kleur: "#3b82f6", icoon: "💻" },
        { naam: "Marketing & Reclame", kleur: "#ec4899", icoon: "📣" },
        { naam: "Telefoon & Internet", kleur: "#10b981", icoon: "📱" },
        { naam: "Verzekeringen", kleur: "#8b5cf6", icoon: "🛡️" },
        { naam: "Opleidingen & Cursussen", kleur: "#f97316", icoon: "📚" },
        { naam: "Overig", kleur: "#6b7280", icoon: "📋" },
      ],
    });

    return NextResponse.json({ succes: true, userId: user.id });
  } catch {
    return NextResponse.json({ fout: "Aanmaken mislukt" }, { status: 500 });
  }
}

export async function GET() {
  const aantalUsers = await prisma.user.count();
  return NextResponse.json({ geconfigureerd: aantalUsers > 0 });
}
