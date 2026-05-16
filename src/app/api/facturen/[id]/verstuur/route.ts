import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verstuurEmail, maakFactuurEmailHtml } from "@/lib/email";
import { maakWhatsAppLink } from "@/lib/whatsapp";
import { formatBedrag, formatDatum } from "@/lib/utils";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const { methode, naarEmail, bericht } = await req.json();

  const factuur = await prisma.factuur.findUnique({
    where: { id },
    include: { klant: true },
  });

  if (!factuur) return NextResponse.json({ fout: "Factuur niet gevonden" }, { status: 404 });

  const user = await prisma.user.findFirst();
  if (!user) return NextResponse.json({ fout: "Gebruiker niet gevonden" }, { status: 500 });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const factuurUrl = `${baseUrl}/facturen/${factuur.id}/print`;

  if (methode === "email") {
    if (!user.emailSmtpHost || !user.emailSmtpUser) {
      return NextResponse.json(
        { fout: "Email SMTP niet geconfigureerd. Ga naar Instellingen > Email." },
        { status: 400 }
      );
    }

    const emailHtml = maakFactuurEmailHtml({
      klantNaam: factuur.klant.naam,
      bedrijfsnaam: user.bedrijfsnaam ?? user.naam,
      factuurNummer: factuur.nummer,
      totaal: formatBedrag(factuur.totaal),
      vervaldatum: formatDatum(factuur.vervaldatum),
      factuurUrl,
      notities: bericht,
    });

    await verstuurEmail(
      {
        host: user.emailSmtpHost,
        port: user.emailSmtpPort ?? 587,
        secure: user.emailSmtpSecure,
        user: user.emailSmtpUser,
        pass: user.emailSmtpPass ?? "",
      },
      {
        van: `${user.bedrijfsnaam ?? user.naam} <${user.emailSmtpUser}>`,
        naar: naarEmail ?? factuur.klant.email ?? "",
        onderwerp: `Factuur ${factuur.nummer} - ${user.bedrijfsnaam ?? user.naam}`,
        html: emailHtml,
      }
    );

    await prisma.factuur.update({
      where: { id },
      data: { status: "VERZONDEN", verzondenOp: new Date() },
    });

    return NextResponse.json({ succes: true, methode: "email" });
  }

  if (methode === "whatsapp") {
    const telefoon = factuur.klant.telefoon;
    if (!telefoon) {
      return NextResponse.json(
        {
          whatsappUrl: maakWhatsAppLink({
            telefoon: "",
            klantNaam: factuur.klant.naam,
            bedrijfsnaam: user.bedrijfsnaam ?? user.naam,
            factuurNummer: factuur.nummer,
            totaal: formatBedrag(factuur.totaal),
            vervaldatum: formatDatum(factuur.vervaldatum),
            factuurUrl,
          }).replace("wa.me/", "wa.me/"),
          waarschuwing: "Geen telefoonnummer bekend voor deze klant",
        }
      );
    }

    const whatsappUrl = maakWhatsAppLink({
      telefoon,
      klantNaam: factuur.klant.naam,
      bedrijfsnaam: user.bedrijfsnaam ?? user.naam,
      factuurNummer: factuur.nummer,
      totaal: formatBedrag(factuur.totaal),
      vervaldatum: formatDatum(factuur.vervaldatum),
      factuurUrl,
    });

    await prisma.factuur.update({
      where: { id },
      data: { status: "VERZONDEN", verzondenOp: new Date() },
    });

    return NextResponse.json({ succes: true, methode: "whatsapp", whatsappUrl });
  }

  return NextResponse.json({ fout: "Onbekende methode" }, { status: 400 });
}
